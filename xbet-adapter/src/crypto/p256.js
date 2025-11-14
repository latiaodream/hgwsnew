import { webcrypto } from 'node:crypto';

const { subtle } = webcrypto;
const PUBLIC_KEY_LENGTH = 65; // 0x04 + 64 字节坐标
const TIMESTAMP_OFFSET = PUBLIC_KEY_LENGTH;
const HANDSHAKE_FRAME_LENGTH = PUBLIC_KEY_LENGTH + 8; // 73 字节

export class EphemeralKey {
  constructor() {
    this.keyPair = null;
    this.publicKeyRaw = null;
  }

  /** 生成 P-256 临时密钥 */
  async generate() {
    this.keyPair = await subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );
    this.publicKeyRaw = new Uint8Array(await subtle.exportKey('raw', this.keyPair.publicKey));
    if (this.publicKeyRaw.length !== PUBLIC_KEY_LENGTH) {
      throw new Error(`Unexpected public key size: ${this.publicKeyRaw.length}`);
    }
    return this;
  }

  /** 构造 73 字节握手帧：65 字节公钥 + 8 字节时间戳 */
  buildClientHelloFrame(timestamp = Date.now()) {
    if (!this.publicKeyRaw) {
      throw new Error('Call generate() before building handshake frame');
    }
    const frame = new Uint8Array(HANDSHAKE_FRAME_LENGTH);
    frame.set(this.publicKeyRaw, 0);
    const view = new DataView(frame.buffer);
    view.setBigUint64(TIMESTAMP_OFFSET, BigInt(timestamp), false);
    return frame;
  }

  /** 根据服务器公钥导出共享密钥 */
  async deriveSharedSecret(serverRawKey) {
    if (!this.keyPair) {
      throw new Error('Missing key pair');
    }
    const serverKey = await subtle.importKey(
      'raw',
      serverRawKey,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );
    const bits = await subtle.deriveBits({ name: 'ECDH', public: serverKey }, this.keyPair.privateKey, 256);
    return new Uint8Array(bits);
  }
}
