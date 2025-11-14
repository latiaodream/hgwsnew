import { config } from './config.js';
import { XbetClient } from './client/XbetClient.js';

async function main() {
  console.log('[adapter] 启动，目标地址:', config.endpoint);
  const client = new XbetClient(config);

  client.on('handshakeSent', () => console.log('[adapter] 已发送握手帧'));
  client.on('sessionReady', () => console.log('[adapter] 会话密钥就绪，开始认证'));
  client.on('message', (msg) => {
    console.log('[adapter] 收到消息:', JSON.stringify(msg, null, 2));
  });
  client.on('decodeError', ({ err }) => {
    console.warn('[adapter] 解码失败:', err.message);
  });
  client.on('error', (err) => {
    console.error('[adapter] WebSocket 错误:', err.message || err);
  });
  client.on('close', () => console.log('[adapter] 连接已关闭'));

  await client.connect();
}

main().catch((err) => {
  console.error('[adapter] Fatal:', err);
  process.exit(1);
});
