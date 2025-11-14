import { TextDecoder } from 'node:util';

const textDecoder = new TextDecoder('utf-8');

export class DagCborDecoder {
  constructor(buffer) {
    this.buffer = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    this.view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
    this.offset = 0;
  }

  decode() {
    return this.#decodeItem();
  }

  #readValue(additionalInfo, majorType) {
    if (additionalInfo < 24) {
      return additionalInfo;
    }
    let bytes = 0;
    switch (additionalInfo) {
      case 24:
        bytes = 1;
        const val8 = this.view.getUint8(this.offset);
        this.offset += 1;
        return val8;
      case 25:
        bytes = 2;
        const val16 = this.view.getUint16(this.offset, false);
        this.offset += 2;
        return majorType === 7 ? this.view.getUint16(this.offset - 2, false) : val16;
      case 26:
        bytes = 4;
        if (majorType === 7) {
          const float32 = this.view.getFloat32(this.offset, false);
          this.offset += 4;
          return float32;
        }
        const val32 = this.view.getUint32(this.offset, false);
        this.offset += 4;
        return val32;
      case 27:
        bytes = 8;
        if (majorType === 7) {
          const float64 = this.view.getFloat64(this.offset, false);
          this.offset += 8;
          return float64;
        }
        const big = this.view.getBigUint64(this.offset, false);
        this.offset += 8;
        return big <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(big) : big;
      case 31:
        return Infinity; // streaming
      default:
        throw new Error(`Unsupported additional info: ${additionalInfo}`);
    }
  }

  #decodeItem() {
    if (this.offset >= this.buffer.length) {
      throw new Error('Unexpected end of buffer');
    }
    const first = this.buffer[this.offset++];
    const majorType = first >> 5;
    const additionalInfo = first & 31;
    const value = this.#readValue(additionalInfo, majorType);

    switch (majorType) {
      case 0:
        return value;
      case 1:
        return typeof value === 'bigint' ? -1n - value : -1 - value;
      case 2:
        if (value === Infinity) {
          return this.#readChunks(() => this.#decodeItem());
        }
        return this.#readBytes(value);
      case 3:
        if (value === Infinity) {
          return this.#readChunks(() => this.#decodeItem()).map(chunk => textDecoder.decode(chunk)).join('');
        }
        return textDecoder.decode(this.#readBytes(value));
      case 4:
        if (value === Infinity) {
          const items = [];
          while (this.buffer[this.offset] !== 0xff) {
            items.push(this.#decodeItem());
          }
          this.offset++; // consume break
          return items;
        }
        return Array.from({ length: Number(value) }, () => this.#decodeItem());
      case 5: {
        if (value === Infinity) {
          const obj = {};
          while (this.buffer[this.offset] !== 0xff) {
            const key = this.#decodeItem();
            obj[key] = this.#decodeItem();
          }
          this.offset++;
          return obj;
        }
        const entries = Number(value);
        const obj = {};
        for (let i = 0; i < entries; i++) {
          const key = this.#decodeItem();
          obj[key] = this.#decodeItem();
        }
        return obj;
      }
      case 6:
        return { tag: value, value: this.#decodeItem() };
      case 7:
        return this.#decodeSimple(additionalInfo, value);
      default:
        throw new Error(`Unsupported major type: ${majorType}`);
    }
  }

  #decodeSimple(additionalInfo, rawValue) {
    switch (additionalInfo) {
      case 20:
        return false;
      case 21:
        return true;
      case 22:
        return null;
      case 23:
        return undefined;
      case 25:
      case 26:
      case 27:
        return rawValue;
      case 31:
        return Symbol.for('CBOR_BREAK');
      default:
        return rawValue;
    }
  }

  #readBytes(length) {
    const bytes = this.buffer.slice(this.offset, this.offset + length);
    this.offset += length;
    return bytes;
  }

  #readChunks(fn) {
    const chunks = [];
    while (true) {
      const byte = this.buffer[this.offset];
      if (byte === 0xff) {
        this.offset++;
        break;
      }
      chunks.push(fn());
    }
    return chunks;
  }
}
