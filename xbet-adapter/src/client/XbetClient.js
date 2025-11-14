import { EventEmitter } from 'node:events';
import { EphemeralKey } from '../crypto/p256.js';
import { RC4 } from '../crypto/rc4.js';
import { DagCborDecoder } from '../cbor/dagCborDecoder.js';

function ensureWebSocket() {
  if (typeof globalThis.WebSocket === 'function') {
    return globalThis.WebSocket;
  }
  throw new Error('当前 Node.js 版本未内置 WebSocket，请安装 ws/undici 再试');
}

export class XbetClient extends EventEmitter {
  constructor(options) {
    super();
    this.endpoint = options.endpoint;
    this.auth = {
      token: options.token,
      username: options.username,
      password: options.password
    };
    this.ws = null;
    this.ephemeral = null;
    this.rc4 = null;
  }

  async connect() {
    if (this.ws) {
      this.ws.close();
    }
    this.ephemeral = await new EphemeralKey().generate();
    const WS = ensureWebSocket();
    this.ws = new WS(this.endpoint);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => this.#handleOpen();
    this.ws.onerror = (err) => this.emit('error', err);
    this.ws.onclose = () => this.emit('close');
    this.ws.onmessage = (event) => this.#handleRawMessage(event.data);
  }

  #handleOpen() {
    const frame = this.ephemeral.buildClientHelloFrame();
    this.ws.send(frame);
    this.emit('handshakeSent');
  }

  async #handleRawMessage(data) {
    const payload = new Uint8Array(data);
    if (!this.rc4) {
      await this.#handleServerHandshake(payload);
      return;
    }
    const decrypted = this.rc4.process(payload);
    try {
      const decoder = new DagCborDecoder(decrypted);
      const message = decoder.decode();
      this.emit('message', message);
    } catch (err) {
      this.emit('decodeError', { err, raw: decrypted });
    }
  }

  async #handleServerHandshake(data) {
    if (data.length < 65) {
      throw new Error('服务器握手数据异常');
    }
    const serverKey = data.slice(0, 65);
    const sharedSecret = await this.ephemeral.deriveSharedSecret(serverKey);
    this.rc4 = new RC4(sharedSecret);
    this.emit('sessionReady');
    const rest = data.slice(65);
    if (rest.length) {
      try {
        const decoder = new DagCborDecoder(rest);
        const message = decoder.decode();
        this.emit('message', message);
      } catch (err) {
        this.emit('decodeError', { err, raw: rest });
      }
    }
    await this.#authenticate();
  }

  async #authenticate() {
    if (this.auth.token) {
      await this.send({ typ: 0, data: { token: this.auth.token } });
    } else if (this.auth.username && this.auth.password) {
      await this.send({ typ: 0, data: { username: this.auth.username, password: this.auth.password } });
    } else {
      console.warn('未配置凭证，仅建立握手。');
    }
  }

  async send(obj) {
    if (!this.rc4) {
      throw new Error('RC4 尚未初始化');
    }
    const encoded = this.#encodeSimpleCbor(obj);
    const encrypted = this.rc4.process(encoded);
    this.ws.send(encrypted);
  }

  #encodeSimpleCbor(obj) {
    const json = Buffer.from(JSON.stringify(obj), 'utf-8');
    if (json.length > 255) {
      throw new Error('示例编码仅支持长度 < 256 的 JSON');
    }
    const buf = new Uint8Array(2 + json.length);
    buf[0] = 0x78; // text string + 1 byte length
    buf[1] = json.length;
    buf.set(json, 2);
    return buf;
  }
}
