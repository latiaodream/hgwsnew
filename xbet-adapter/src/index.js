import { config } from './config.js';
import { XbetClient } from './client/XbetClient.js';
import { DataStore } from './services/DataStore.js';
import { RedisStore } from './services/RedisStore.js';
import { InternalWSServer } from './server/InternalWSServer.js';
import { DashboardServer } from './server/DashboardServer.js';

async function main() {
  console.log('[adapter] 启动，目标地址:', config.endpoint);
  if (config.token) {
    console.log('[adapter] 当前 token 前 16 位:', `${config.token.slice(0, 16)}...`);
  } else {
    console.log('[adapter] 当前没有配置 token');
  }
  const client = new XbetClient(config);
  let redisStore = null;
  if (config.redis?.enabled) {
    redisStore = new RedisStore(config.redis);
    redisStore.connect().catch((err) => {
      console.error('[adapter] Redis 连接失败，将仅使用内存:', err.message);
      redisStore = null;
    });
  }
  const store = new DataStore({ redisStore });
  let wsServer = null;
  let dashboard = null;
  if (config.internalWs?.enabled) {
    wsServer = new InternalWSServer({ port: config.internalWs.port, store });
    wsServer.start().then(() => {
      console.log(`[adapter] 内部 WebSocket 服务已启动，端口 ${config.internalWs.port}`);
    }).catch((err) => {
      console.error('[adapter] 启动内部 WS 失败:', err.message);
    });
  }
  if (config.dashboard?.enabled) {
    dashboard = new DashboardServer({
      port: config.dashboard.port,
      store,
      title: config.dashboard.title,
      publicDir: config.dashboard.publicDir,
      meta: {
        internalWsPort: config.internalWs?.enabled ? config.internalWs.port : null,
        redisEnabled: Boolean(redisStore),
      },
    });
    dashboard.start().then(() => {
      console.log(`[adapter] Dashboard 可访问: http://127.0.0.1:${config.dashboard.port}`);
    }).catch((err) => {
      console.error('[adapter] 启动 Dashboard 失败:', err.message);
    });
  }

  client.on('handshakeSent', () => console.log('[adapter] 已发送握手帧'));
  client.on('raw', (message) => {
    try {
      console.log('[adapter] 收到原始消息:', JSON.stringify(message));
    } catch {
      console.log('[adapter] 收到原始消息(无法序列化):', message);
    }
  });
  client.on('sessionReady', () => console.log('[adapter] 会话密钥就绪，开始认证'));
  client.on('authenticated', (info) => {
    console.log('[adapter] 登录成功:', info);
  });
  client.on('subscribed', (info) => {
    console.log('[adapter] 已订阅:', JSON.stringify(info));
  });
  client.on('heartbeat', (payload) => {
    console.log('[adapter] 心跳', payload?.ts ?? Date.now());
  });
  client.on('requestSent', ({ reqId, opcode }) => {
    console.log('[adapter] -> opcode 0x%s reqId=%d', opcode.toString(16), reqId);
  });
  client.on('response', ({ reqId, opcode, status }) => {
    console.log('[adapter] <- opcode 0x%s reqId=%d status=%s', opcode?.toString(16), reqId, status);
  });
  client.on('unmatchedResponse', ({ reqId, status, payload }) => {
    console.warn('[adapter] 未匹配响应 reqId=%d status=%s payload=%j', reqId, status, payload);
  });
  client.on('decodeError', ({ err }) => {
    console.warn('[adapter] 解码失败:', err.message);
  });
  client.on('warn', (msg) => {
    console.warn('[adapter] Warn:', msg);
  });
  client.on('error', (err) => {
    console.error('[adapter] WebSocket 错误:', err?.stack || err?.message || err);
  });
  client.on('errorMessage', (msg) => {
    try {
      console.error('[adapter] XBet 错误消息:', JSON.stringify(msg));
    } catch (e) {
      console.error('[adapter] XBet 错误消息:', msg);
    }
  });
  client.on('close', (ev) => {
    const code = ev?.code;
    let reason = ev?.reason;
    if (reason instanceof ArrayBuffer) {
      reason = Buffer.from(reason).toString();
    }
    console.log('[adapter] 连接已关闭', code ? `code=${code}` : '', reason ? `reason=${reason}` : '');
  });
  client.on('data', (message) => {
    store.handleMessage(message);
  });

  store.on('update:matches', (payload) => {
    console.log('[store] 赛事更新 id=%s', payload?.id ?? payload?.gid ?? payload?.bid ?? payload?.uid);
  });
  store.on('update:odds', (payload) => {
    console.log('[store] 赔率更新 id=%s odd=%s', payload?.id ?? payload?.gid ?? payload?.bid ?? payload?.uid, payload?.odd ?? payload?.handicap);
  });
  store.on('update:live', (payload) => {
    console.log('[store] 实时比分 id=%s score=%j', payload?.id ?? payload?.gid ?? payload?.bid ?? payload?.uid, payload?.score);
  });

  await client.connect();

  process.on('SIGINT', () => {
    console.log('\n[adapter] 收到 SIGINT, 即将退出');
    client.stop();
    redisStore?.close();
    wsServer?.stop();
    dashboard?.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[adapter] Fatal:', err);
  process.exit(1);
});
