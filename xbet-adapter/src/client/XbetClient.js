import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { EphemeralKey } from '../crypto/p256.js';
import { RC4 } from '../crypto/rc4.js';
import { DagCborDecoder } from '../cbor/dagCborDecoder.js';
import { encodeDagCbor } from '../cbor/dagCborEncoder.js';

const DEVICE_ID_LENGTH = 21;
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';

const STATUS_SUCCESS = 0;

const OPCODES = {
  POLL: 0x1,
  ASSIGN_ACCOUNT: 0x4,
  HEARTBEAT: 0x5,
  LOGIN: 0x7,  // 正确的登录 opcode
  USER_INFO: 0x7,  // 获取用户信息也是 0x7，但 payload 不同
  EVENTS: 0xb,
  HISTORY: 0x17,
};

const UPDATE_KIND_BY_OPCODE = {
  0x3: 'odds',
  0x4: 'live',
  0x6: 'matches',
};

export class XbetClient extends EventEmitter {
  constructor(options) {
    super();
    this.endpoint = options.endpoint;
    this.auth = {
      token: options.token,
      username: options.username,
      password: options.password,
      email: options.email,
      code: options.code
    };
    this.origin = options.origin || '';
    this.wsHeaders = { ...(options.wsHeaders || {}) };
    this.userAgent = options.userAgent || this.wsHeaders['user-agent'] || DEFAULT_USER_AGENT;
    if (!this.wsHeaders['user-agent'] && this.userAgent) {
      this.wsHeaders['user-agent'] = this.userAgent;
    }
    this.ws = null;
    this.ephemeral = null;
    this.rc4In = null;   // 输入流（解密）
    this.rc4Out = null;  // 输出流（加密）
    this.deviceId = options.deviceId || null;
    const resolvedDeviceIdFile = options.deviceIdFile === null || options.deviceIdFile === false
      ? null
      : path.resolve(options.deviceIdFile || '.xbet-device-id');
    this.deviceIdFile = resolvedDeviceIdFile;
    this.deviceIdPromise = null;

    // 新协议：RPC 请求管理
    this.reqs = new Map();  // 存储待响应的请求: reqId -> [reqId, opcode, payload, resolve, timer, sent]
    this.reqId = 0;         // 自增请求 ID
    this.defaultTimeout = options.timeout || 20000;  // 默认 20 秒超时
    this.cursor = 0;        // 轮询游标（旧方案：单一 cursor，保留以兼容日志）
    this.pollState = null;  // 新方案：POLL 的多队列游标 { system, mid, ... }
    this.polling = false;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.session = null;

    // 保留旧的订阅和心跳配置（可能在新协议中不再使用）
    this.subscriptions = [...new Set(options.subscriptions || [])];
    this.heartbeatIntervalMs = options.heartbeatIntervalMs || 30_000;
    this.heartbeatTimer = null;
    this.authenticated = false;
  }

  async connect() {
    if (this.ws) {
      this.ws.close();
    }
    this.ephemeral = await new EphemeralKey().generate();
    const headers = Object.fromEntries(
      Object.entries(this.wsHeaders).filter(([, value]) => typeof value === 'string' && value.length)
    );
    const wsOptions = {
      perMessageDeflate: true,
      handshakeTimeout: 10000,
    };
    if (this.origin) {
      wsOptions.origin = this.origin;
    }
    if (Object.keys(headers).length) {
      wsOptions.headers = headers;
    }
    const url = this.#buildEndpointUrl();
    console.log('[adapter] 实际 WebSocket URL:', url);
    this.ws = new WebSocket(url, wsOptions);
    this.ws.binaryType = 'arraybuffer';
    this.ws.on('open', () => this.#handleOpen());
    this.ws.on('error', (err) => this.emit('error', err));
    this.ws.on('close', (code, reason) => {
      const closeEvent = { code, reason: this.#decodeReason(reason) };
      this.#handleClose(closeEvent);
      this.emit('close', closeEvent);
    });
    this.ws.on('message', (data) => this.#handleRawMessage(data));
  }

  #handleOpen() {
    const frame = this.ephemeral.buildClientHelloFrame();
    this.ws.send(frame);
    this.emit('handshakeSent');
  }

  #decodeReason(reason) {
    if (!reason) return '';
    if (typeof reason === 'string') return reason;
    if (reason instanceof ArrayBuffer) {
      return Buffer.from(reason).toString('utf-8');
    }
    if (ArrayBuffer.isView(reason)) {
      return Buffer.from(reason.buffer, reason.byteOffset, reason.byteLength).toString('utf-8');
    }
    if (Buffer.isBuffer(reason)) {
      return reason.toString('utf-8');
    }
    return String(reason);
  }

  async #handleRawMessage(data) {
    const payload = this.#toUint8Array(data);
    if (!this.rc4In) {
      await this.#handleServerHandshake(payload);
      return;
    }
    console.log('📥 收到消息:', payload.length, '字节');

    const decrypted = this.rc4In.process(payload);
    console.log('  解密后 (hex):', Buffer.from(decrypted).toString('hex'));

    try {
      const decoder = new DagCborDecoder(decrypted);
      const message = decoder.decode();
      console.log('  解码后:', JSON.stringify(message));

      this.#handleDecodedMessage(message);
    } catch (err) {
      console.log('  ❌ 解码失败:', err.message);
      this.emit('decodeError', { err, raw: decrypted });
    }
  }

  async #handleServerHandshake(data) {
    if (data.length < 65) {
      throw new Error('服务器握手数据异常');
    }
    console.log('🤝 处理服务器握手...');
    console.log('  服务器握手数据长度:', data.length);

    const serverKey = data.slice(0, 65);
    console.log('  服务器公钥 (前10字节):', Buffer.from(serverKey.slice(0, 10)).toString('hex'));

    const sharedSecret = await this.ephemeral.deriveSharedSecret(serverKey);
    console.log('  共享密钥 (前10字节):', Buffer.from(sharedSecret.slice(0, 10)).toString('hex'));

    this.rc4In = new RC4(sharedSecret);
    this.rc4Out = new RC4(sharedSecret);
    this.#flushPendingRequests();
    this.emit('sessionReady');

    const rest = data.slice(65);
    console.log('  握手后剩余数据长度:', rest.length);
    if (rest.length) {
      console.log('  握手剩余 raw (hex):', Buffer.from(rest).toString('hex'));

      // 实验：如果长度为 4，则按大端 uint32 解析为初始 cursor
      if (rest.length === 4) {
        const view = new DataView(rest.buffer, rest.byteOffset, rest.byteLength);
        const serverCursor = view.getUint32(0, false);
        console.log('  🧭 将握手剩余 4 字节视为初始 cursor:', serverCursor);
        if (Number.isFinite(serverCursor)) {
          this.cursor = serverCursor;
        }
      } else {
        try {
          const decoder = new DagCborDecoder(rest);
          const message = decoder.decode();
          console.log('  解码后消息:', JSON.stringify(message));

          // 🎯 如果服务器发送空数组 []，响应一个空数组
          if (Array.isArray(message) && message.length === 0) {
            console.log('  📤 服务器发送了 []，响应一个空数组...');
            const response = [];
            const encoded = encodeDagCbor(response);
            const encrypted = this.rc4Out.process(encoded);
            this.ws.send(encrypted);
            console.log('  ✅ 已响应 []');
          } else {
            this.#handleDecodedMessage(message);
          }
        } catch (err) {
          console.log('  ❌ 解码失败:', err.message);
          this.emit('decodeError', { err, raw: rest });
        }
      }
    }

    // 🎯 测试：在认证之前发送初始化消息
    if (this.initMessages && this.initMessages.length > 0) {
      console.log('🔍 发送初始化消息:', this.initMessages.length, '条');
      for (const [opcode, payload] of this.initMessages) {
        const message = [this.reqId++, opcode, payload];
        const encoded = encodeDagCbor(message);
        const encrypted = this.rc4Out.process(encoded);
        console.log(`  发送: opcode=0x${opcode.toString(16)}, ${encoded.length} 字节`);
        this.ws.send(encrypted);
      }
    }

    // 如果使用 URL token 连接：
    // - 配置了 username/password：首条发送 LOGIN({ usr, pwd })，成功后直接进入已认证状态并启动预取/心跳/轮询
    // - 未配置 username/password：直接调用 USER_INFO({}) 获取当前用户信息
    if (this.auth?.token) {
      if (this.auth.username && this.auth.password) {
        console.log('🔑 已通过 URL token 连接，使用用户名/密码登录 (LOGIN, opcode=0x7)');
        try {
          const loginPayload = await this.#buildLoginPayload();
          console.log('  LOGIN payload:', loginPayload);
          const [status, data] = await this.request(OPCODES.LOGIN, loginPayload, 10000);
          console.log('  LOGIN 响应:', { status, data });
          if (status === STATUS_SUCCESS) {
            this.session = data;
            this.authenticated = true;
            this.emit('authenticated', data || { code: 0, via: 'login' });
            await this.#prefetchInitialData();
            this.startHeartbeat();
            this.#startPolling();
          } else {
            this.emit('errorMessage', { opcode: OPCODES.LOGIN, status, data });
          }
        } catch (err) {
          console.log('  🔴 LOGIN 请求失败:', err.message);
          this.emit('error', err);
          this.stop();
        }
      } else {
        console.log('🔑 已通过 URL token 连接，尝试通过 USER_INFO (opcode 0x7) 获取用户信息');
        try {
          const [status, data] = await this.request(OPCODES.USER_INFO, {}, 10000);
          console.log('  USER_INFO 响应:', { status, data });
          if (status === STATUS_SUCCESS) {
            this.session = data;
            this.authenticated = true;
            this.emit('authenticated', data || { code: 0, via: 'token' });
            await this.#prefetchInitialData();
            this.startHeartbeat();
            this.#startPolling();
          } else if (data === 'err_unauth') {
            console.log('  ⚠️ USER_INFO 返回 err_unauth，跳过用户信息，仅使用公共赛事数据继续初始化');
            this.session = {};
            this.authenticated = true;
            this.emit('authenticated', { code: 0, via: 'token-unauth' });
            await this.#prefetchInitialData();
            this.startHeartbeat();
            this.#startPolling();
          } else {
            this.emit('errorMessage', { opcode: OPCODES.USER_INFO, status, data });
          }
        } catch (err) {
          console.log('  🔴 USER_INFO 请求失败:', err.message);
          this.emit('error', err);
          this.stop();
        }
      }
    } else {
      await this.#authenticate();
    }
  }

  #toUint8Array(data) {
    if (!data) {
      return new Uint8Array();
    }
    if (data instanceof Uint8Array) {
      return data;
    }
    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    }
    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    if (typeof data === 'string') {
      return new TextEncoder().encode(data);
    }
    return new Uint8Array(data);
  }

  async #authenticate() {
    try {
      console.log('🔐 获取用户信息 (opcode 0x7)...');

      const [status, data] = await this.request(OPCODES.USER_INFO, {});
      console.log('✅ 用户信息响应收到:', { status, data });

      if (status === STATUS_SUCCESS) {
        this.session = data;
        this.authenticated = true;

        this.emit('authenticated', data || { code: 0, via: 'login' });
        await this.#prefetchInitialData();
        this.startHeartbeat();
        this.#startPolling();
        return;
      }

      if (data === 'err_unauth') {
        console.log('  ⚠️ USER_INFO 返回 err_unauth，作为访客模式继续初始化');
        this.session = {};
        this.authenticated = true;

        this.emit('authenticated', { code: 0, via: 'unauth-guest' });
        await this.#prefetchInitialData();
        this.startHeartbeat();
        this.#startPolling();
        return;
      }

      throw new Error(`获取用户信息失败: ${data}`);
    } catch (err) {
      this.emit('error', err);
      this.stop();
    }
  }

  /**
   * 新协议：RPC 请求方法
   * @param {number} opcode - 操作码 (0x1, 0x5, 0x7, 0xb, 0x17 等)
   * @param {object} payload - 请求参数
   * @param {number} timeout - 超时时间（毫秒），0 表示不超时
   * @returns {Promise<[number, any]>} - [status, data]，status: 0=成功, 1=失败
   */
  async request(opcode, payload = {}, timeout = this.defaultTimeout) {
    return new Promise((resolve) => {
      const reqId = ++this.reqId & 0xffffffff;  // 32 位循环

      let timer = null;
      if (timeout > 0) {
        timer = setTimeout(() => {
          this.reqs.delete(reqId);
          resolve([1, 'err_timeout']);
        }, timeout);
      }

      // 存储请求上下文: [reqId, opcode, payload, resolve, timer, sent]
      const req = [reqId, opcode, payload, resolve, timer, false];
      this.reqs.set(reqId, req);

      // 如果 RC4 输出流已就绪，立即发送
      if (this.rc4Out && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.#sendRequest(req);
      }
    });
  }

  /**
   * 发送 RPC 请求
   * @private
   */
  #sendRequest(req) {
    const [reqId, opcode, payload] = req;

    // 新协议消息格式: [reqId, opcode, payload]
    const message = [reqId, opcode, payload];

    try {
      const encoded = encodeDagCbor(message);
      const encrypted = this.rc4Out.process(encoded);

      console.log(`📤 发送请求: reqId=${reqId}, opcode=0x${opcode.toString(16)}, payload=`, JSON.stringify(payload));
      console.log(`  编码后: ${encoded.length} 字节, 加密后: ${encrypted.length} 字节`);
      console.log(`  编码内容 (hex):`, Buffer.from(encoded).toString('hex'));

      this.ws.send(encrypted);
      req[5] = true;  // 标记为已发送

      this.emit('requestSent', { reqId, opcode, payload });
    } catch (err) {
      // 发送失败，清理请求
      const [, , , resolve, timer] = req;
      if (timer) clearTimeout(timer);
      this.reqs.delete(reqId);
      resolve([1, err.message]);
    }
  }

  #flushPendingRequests() {
    if (!this.rc4Out || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    for (const req of this.reqs.values()) {
      if (!req[5]) {
        this.#sendRequest(req);
      }
    }
  }

  #resolveRequest(reqId, status, payload) {
    const req = this.reqs.get(reqId);
    if (!req) {
      this.emit('unmatchedResponse', { reqId, status, payload });
      return;
    }
    const [, opcode, , resolve, timer] = req;
    if (timer) clearTimeout(timer);
    this.reqs.delete(reqId);
    resolve([status, this.#normalizePayload(payload)]);
    this.emit('response', { reqId, opcode, status });
  }

  #rejectAllRequests(reason = 'err_closed') {
    for (const [reqId, req] of this.reqs.entries()) {
      const [, , , resolve, timer] = req;
      if (timer) clearTimeout(timer);
      resolve([1, reason]);
      this.emit('response', { reqId, status: 1, reason });
    }
    this.reqs.clear();
  }

  /**
   * 旧协议兼容：直接发送对象（已废弃，建议使用 request）
   * @deprecated
   */
  async send(obj) {
    if (!this.rc4Out) {
      throw new Error('RC4 尚未初始化');
    }
    const encoded = encodeDagCbor(obj);
    const encrypted = this.rc4Out.process(encoded);
    this.ws.send(encrypted);
  }

  /**
   * 旧协议兼容：订阅（新协议可能不再使用）
   * @deprecated
   */
  async subscribe(subscriptions = this.subscriptions) {
    const unique = [...new Set(subscriptions)].filter(Boolean);
    this.subscriptions = unique;
    if (!unique.length) return;
    // 旧协议: { typ: 1, data: [...] }
    // 新协议可能需要改为 request(OPCODE_SUBSCRIBE, { topics: [...] })
    await this.send({ typ: 1, data: unique });
  }

  /**
   * 启动心跳（新协议使用 opcode 0x5）
   */
  startHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    if (this.heartbeatIntervalMs <= 0) return;

    this.heartbeatTimer = setInterval(() => {
      // 新协议：使用 opcode 0x5 发送心跳
      this.request(0x5, {}, 5000).catch((err) => {
        this.emit('error', err);
      });
    }, this.heartbeatIntervalMs);
  }

  stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.polling = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  async #call(opcode, payload = {}, timeout) {
    const [status, raw] = await this.request(opcode, payload, timeout);
    const data = this.#normalizePayload(raw);
    if (status !== STATUS_SUCCESS) {
      const reason = typeof data === 'string' ? data : JSON.stringify(data);
      throw new Error(`Opcode 0x${opcode.toString(16)} failed: ${reason}`);
    }
    return data;
  }

  #normalizePayload(payload) {
    if (typeof payload === 'string') {
      try {
        return JSON.parse(payload);
      } catch {
        return payload;
      }
    }
    return payload;
  }

  async #ensureDeviceId() {
    if (!this.deviceIdPromise) {
      this.deviceIdPromise = this.#loadDeviceId().catch((err) => {
        this.deviceIdPromise = null;
        throw err;
      });
    }
    return this.deviceIdPromise;
  }

  async #loadDeviceId() {
    if (this.deviceId && this.#isValidDeviceId(this.deviceId)) {
      return this.deviceId;
    }
    if (this.deviceIdFile) {
      try {
        const stored = (await fs.readFile(this.deviceIdFile, 'utf-8')).trim();
        if (this.#isValidDeviceId(stored)) {
          this.deviceId = stored;
          return stored;
        }
      } catch (err) {
        if (err.code !== 'ENOENT') {
          this.emit('warn', `读取 deviceId 失败: ${err.message}`);
        }
      }
    }
    const generated = this.#generateDeviceId();
    if (this.deviceIdFile) {
      try {
        await fs.writeFile(this.deviceIdFile, generated, 'utf-8');
      } catch (err) {
        this.emit('warn', `保存 deviceId 失败: ${err.message}`);
      }
    }
    this.deviceId = generated;
    return generated;
  }

  #generateDeviceId() {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let output = '';
    while (output.length < DEVICE_ID_LENGTH) {
      const bytes = randomBytes(DEVICE_ID_LENGTH);
      for (const byte of bytes) {
        if (output.length >= DEVICE_ID_LENGTH) break;
        output += alphabet[byte % alphabet.length];
      }
    }
    return output;
  }

  #isValidDeviceId(value) {
    return typeof value === 'string' && value.length === DEVICE_ID_LENGTH && /^[a-z0-9]+$/i.test(value);
  }

  async #buildLoginPayload() {
    // 登录请求 payload 与浏览器保持一致，仅包含 usr/pwd
    return {
      usr: this.auth.username,
      pwd: this.auth.password
    };
  }

  async #prefetchInitialData() {
    try {
      const matches = await this.#call(OPCODES.EVENTS, {});
      this.#ingestDataset('matches', matches);
    } catch (err) {
      this.emit('warn', `Prefetch events failed: ${err.message}`);
    }
  }

  #ingestDataset(kind, payload) {
    if (!payload) return;
    if (Array.isArray(payload)) {
      for (const item of payload) {
        this.#emitData(kind, item);
      }
      return;
    }
    if (typeof payload === 'object') {
      this.#emitData(kind, payload);
    }
  }

  #emitData(kind, data) {
    if (!data) return;
    this.emit('data', { typ: 3, kind, data });
    this.emit(`data:${kind}`, data);
  }

  async #startPolling() {
    if (this.polling) return;
    this.polling = true;

    if (!this.pollState) {
      const seed = Date.now();
      this.pollState = { system: seed };
      const mid = this.session && (this.session.mid || this.session.uid);
      if (mid) {
        this.pollState[mid] = seed;
      }
      if (!Number.isFinite(this.cursor) || this.cursor <= 0) {
        this.cursor = seed;
      }
    }

    while (this.polling) {
      try {
        const payload = { ...this.pollState };
        const [status, updates] = await this.request(OPCODES.POLL, payload, 0);
        if (status === STATUS_SUCCESS && Array.isArray(updates)) {
          this.#processPollUpdates(updates);
        } else if (status !== STATUS_SUCCESS) {
          console.log('  POLL 请求失败:', status, updates);
        }
      } catch (err) {
        this.emit('error', err);
        await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      }
    }
  }

  #processPollUpdates(updates) {
    if (!Array.isArray(updates)) return;
    for (const entry of updates) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const [queueKey, items] = entry;
      if (!Array.isArray(items)) continue;
      let lastCursor = null;

      for (const record of items) {
        if (!Array.isArray(record) || record.length < 2) continue;
        const [cursor, payload] = record;
        const cursorNum = Number(cursor);
        if (Number.isFinite(cursorNum)) {
          lastCursor = cursorNum;
          if (!Number.isFinite(this.cursor) || cursorNum > this.cursor) {
            this.cursor = cursorNum;
          }
        }

        let message = null;
        if (Array.isArray(payload) && payload.length >= 2 && typeof payload[1] === 'string') {
          try {
            message = JSON.parse(payload[1]);
          } catch {
            message = null;
          }
        } else if (typeof payload === 'string') {
          try {
            message = JSON.parse(payload);
          } catch {
            message = null;
          }
        } else if (Array.isArray(payload) || (payload && typeof payload === 'object')) {
          message = payload;
        }

        if (!message) {
          this.#emitData('unknown', this.#normalizePayload(payload));
          continue;
        }

        if (Array.isArray(message) && message.length >= 2 && typeof message[0] === 'number') {
          const opcode = message[0];
          const data = message[1];
          const kind = UPDATE_KIND_BY_OPCODE[opcode] || 'unknown';
          this.#emitData(kind, this.#normalizePayload(data));
          continue;
        }

        if (typeof message === 'object' && message !== null) {
          const kind = message.kind || 'unknown';
          const data = message.data ?? message;
          this.#emitData(kind, this.#normalizePayload(data));
        }
      }

      if (lastCursor != null && (typeof queueKey === 'string' || typeof queueKey === 'number')) {
        if (!this.pollState) this.pollState = {};
        this.pollState[queueKey] = lastCursor;
      }
    }
  }

  #handleClose() {
    this.polling = false;
    this.rc4In = null;
    this.rc4Out = null;
    this.cursor = 0;
    this.pollState = null;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.#rejectAllRequests('err_closed');
  }

  #buildEndpointUrl() {
    try {
      const url = new URL(this.endpoint);
      if (this.auth?.token) {
        url.searchParams.set('token', this.auth.token);
      }
      return url.toString();
    } catch {
      if (this.auth?.token && !this.endpoint.includes('token=')) {
        const joiner = this.endpoint.includes('?') ? '&' : '?';
        return `${this.endpoint}${joiner}token=${encodeURIComponent(this.auth.token)}`;
      }
      return this.endpoint;
    }
  }

  #handleDecodedMessage(message) {
    this.emit('raw', message);
    if (Array.isArray(message)) {
      const [reqId, status, payload] = message;
      this.#resolveRequest(reqId, status, payload);
      return;
    }

    if (!message || typeof message !== 'object') {
      if (message === 0 && !this.authenticated) {
        this.authenticated = true;
        this.emit('authenticated', { code: 0 });
        return;
      }
      this.emit('message', message);
      return;
    }

    if (typeof message.typ !== 'undefined') {
      switch (message.typ) {
        case 0:
          this.authenticated = true;
          this.emit('authenticated', message.data || {});
          if (this.subscriptions.length) {
            this.subscribe().catch((err) => this.emit('error', err));
          }
          this.startHeartbeat();
          break;
        case 1:
          this.emit('subscribed', message.data || {});
          break;
        case 2:
          this.emit('heartbeat', message.data || {});
          break;
        case 3:
          this.emit('data', message);
          if (message.kind) {
            this.emit(`data:${message.kind}`, message.data);
          }
          break;
        case 5:
          this.emit('errorMessage', message);
          break;
        default:
          this.emit('message', message);
      }
      return;
    }

    this.emit('message', message);
  }

  /**
   * 分配账号给用户
   * @param {string} accountId - 账号ID (uid)
   * @param {string} username - 用户名 (usr)
   * @param {string} password - 密码 (pwd)
   * @param {object} options - 可选参数
   * @param {string} options.email - 邮箱
   * @param {string} options.remark - 备注
   * @param {number} options.attr - 属性 (默认: 1)
   * @param {number} options.share - 分享标志 (默认: 0)
   * @param {number} timeout - 超时时间（毫秒）
   * @returns {Promise<any>} - 分配结果
   */
  async assignAccount(accountId, username, password, options = {}, timeout) {
    const payload = {
      uid: accountId,
      usr: username,
      pwd: password,
      attr: options.attr ?? 1,
      remark: options.remark ?? '',
      share: options.share ?? 0,
    };

    // 如果提供了 email，添加到 payload
    if (options.email) {
      payload.email = options.email;
    }

    return await this.#call(OPCODES.ASSIGN_ACCOUNT, payload, timeout);
  }
}
