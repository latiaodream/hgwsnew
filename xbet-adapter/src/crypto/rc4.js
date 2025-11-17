export class RC4 {
  constructor(keyBytes) {
    if (!keyBytes || !keyBytes.length) {
      throw new Error('RC4 key is required');
    }
    this.S = new Uint8Array(256);
    this.i = 0;
    this.j = 0;

    // KSA：与前端 Ge() 实现保持一致，初始 S[i] = ~i & 0xff
    for (let idx = 0; idx < 256; idx++) {
      this.S[idx] = (~idx) & 0xff;
    }
    let j = 0;
    for (let idx = 0; idx < 256; idx++) {
      j = (j + this.S[idx] + keyBytes[idx % keyBytes.length]) & 0xff;
      [this.S[idx], this.S[j]] = [this.S[j], this.S[idx]];
    }
  }

  /**
   * 加密/解密（RC4 是对称的）
   * @param {Uint8Array} data
   */
  process(data) {
    const output = new Uint8Array(data.length);
    for (let k = 0; k < data.length; k++) {
      this.i = (this.i + 1) & 0xff;
      this.j = (this.j + this.S[this.i]) & 0xff;
      [this.S[this.i], this.S[this.j]] = [this.S[this.j], this.S[this.i]];
      const t = (this.S[this.i] + this.S[this.j]) & 0xff;
      output[k] = data[k] ^ this.S[t];
    }
    return output;
  }
}
