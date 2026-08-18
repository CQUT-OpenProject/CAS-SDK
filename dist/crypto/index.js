// src/crypto/rsa.ts
function parseRsaPublicKey(pemOrBase64) {
  const cleanBase64 = pemOrBase64.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
  const der = base64ToBytes(cleanBase64);
  return parseDerPublicKey(der);
}
function rsaEncryptPkcs1(data, key) {
  const messageBytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const k = key.keyLength;
  if (messageBytes.length > k - 11) {
    throw new Error(
      `Message too long for RSA PKCS#1 v1.5: max length is ${k - 11} bytes, got ${messageBytes.length}`
    );
  }
  const psLength = k - messageBytes.length - 3;
  const ps = getRandomNonZeroBytes(psLength);
  const block = new Uint8Array(k);
  block[0] = 0;
  block[1] = 2;
  block.set(ps, 2);
  block[2 + psLength] = 0;
  block.set(messageBytes, 3 + psLength);
  const m = bytesToBigInt(block);
  const c = modPow(m, key.e, key.n);
  return bigIntToBytes(c, k);
}
function modPow(base, exp, mod) {
  if (mod === 1n) return 0n;
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) {
      result = result * b % mod;
    }
    e >>= 1n;
    b = b * b % mod;
  }
  return result;
}
function getRandomNonZeroBytes(length) {
  const bytes = new Uint8Array(length);
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function") {
    for (let i = 0; i < length; i++) {
      let b = 0;
      while (b === 0) {
        const buf = new Uint8Array(1);
        globalThis.crypto.getRandomValues(buf);
        b = buf[0] ?? 0;
      }
      bytes[i] = b;
    }
  } else {
    for (let i = 0; i < length; i++) {
      let b = 0;
      while (b === 0) {
        b = Math.floor(Math.random() * 255) + 1;
      }
      bytes[i] = b;
    }
  }
  return bytes;
}
function bytesToBigInt(bytes) {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  }
  return BigInt(hex ? `0x${hex}` : "0");
}
function bigIntToBytes(value, length) {
  let hex = value.toString(16);
  if (hex.length % 2 !== 0) {
    hex = "0" + hex;
  }
  const bytes = new Uint8Array(length);
  const rawBytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < rawBytes.length; i++) {
    rawBytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  const offset = length - rawBytes.length;
  if (offset >= 0) {
    bytes.set(rawBytes, offset);
  } else {
    bytes.set(rawBytes.subarray(-offset));
  }
  return bytes;
}
function base64ToBytes(base64) {
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(base64);
    const bytes2 = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes2[i] = binary.charCodeAt(i);
    }
    return bytes2;
  }
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let str = base64.replace(/[=]+$/, "");
  const len = str.length;
  const bytes = [];
  for (let i = 0; i < len; i += 4) {
    const b1 = chars.indexOf(str.charAt(i));
    const b2 = chars.indexOf(str.charAt(i + 1));
    const b3 = chars.indexOf(str.charAt(i + 2));
    const b4 = chars.indexOf(str.charAt(i + 3));
    const n = b1 << 18 | b2 << 12 | (b3 >= 0 ? b3 : 0) << 6 | (b4 >= 0 ? b4 : 0);
    bytes.push(n >> 16 & 255);
    if (b3 >= 0) bytes.push(n >> 8 & 255);
    if (b4 >= 0) bytes.push(n & 255);
  }
  return new Uint8Array(bytes);
}
function bytesToBase64(bytes) {
  if (typeof globalThis.btoa === "function") {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i] ?? 0);
    }
    return globalThis.btoa(binary);
  }
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let base64 = "";
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const byte1 = bytes[i] ?? 0;
    const byte2 = i + 1 < len ? bytes[i + 1] ?? 0 : 0;
    const byte3 = i + 2 < len ? bytes[i + 2] ?? 0 : 0;
    const n = byte1 << 16 | byte2 << 8 | byte3;
    base64 += chars.charAt(n >> 18 & 63);
    base64 += chars.charAt(n >> 12 & 63);
    base64 += i + 1 < len ? chars.charAt(n >> 6 & 63) : "=";
    base64 += i + 2 < len ? chars.charAt(n & 63) : "=";
  }
  return base64;
}
function parseDerPublicKey(der) {
  let pos = 0;
  function readLength() {
    const b = der[pos++];
    if (b === void 0) throw new Error("Unexpected EOF in DER length");
    if ((b & 128) === 0) return b;
    const numBytes = b & 127;
    let len = 0;
    for (let i = 0; i < numBytes; i++) {
      const next = der[pos++];
      if (next === void 0) throw new Error("Unexpected EOF in multi-byte length");
      len = len << 8 | next;
    }
    return len;
  }
  function readTag(expectedTag) {
    const tag = der[pos++];
    if (tag === void 0) throw new Error("Unexpected EOF in DER tag");
    if (expectedTag !== void 0 && tag !== expectedTag) {
      throw new Error(`Expected DER tag 0x${expectedTag.toString(16)}, got 0x${tag.toString(16)}`);
    }
    return tag;
  }
  readTag(48);
  readLength();
  const nextTag = der[pos];
  if (nextTag === 48) {
    readTag(48);
    const algLen = readLength();
    pos += algLen;
    readTag(3);
    readLength();
    pos++;
    readTag(48);
    readLength();
  }
  readTag(2);
  const nLen = readLength();
  let nBytes = der.subarray(pos, pos + nLen);
  pos += nLen;
  if (nBytes[0] === 0) {
    nBytes = nBytes.subarray(1);
  }
  const n = bytesToBigInt(nBytes);
  const keyLength = nBytes.length;
  readTag(2);
  const eLen = readLength();
  let eBytes = der.subarray(pos, pos + eLen);
  pos += eLen;
  if (eBytes[0] === 0) {
    eBytes = eBytes.subarray(1);
  }
  const e = bytesToBigInt(eBytes);
  return { n, e, keyLength };
}

// src/crypto/encryptor.ts
var DEFAULT_CQUT_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDACwPDxYycdCiNeblZa9LjvDzb
iZU1vc9gKRcG/pGjZ/DJkI4HmoUE2r/o6SfB5az3s+H5JDzmOMVQ63hD7LZQGR4k
3iYWnCg3UpQZkZEtFtXBXsQHjKVJqCiEtK+gtxz4WnriDjf+e/CxJ7OD03e7sy5N
Y/akVmYNtghKZzz6jwIDAQAB
-----END PUBLIC KEY-----`;
var cachedDefaultKey = null;
function getDefaultKey() {
  if (!cachedDefaultKey) {
    cachedDefaultKey = parseRsaPublicKey(DEFAULT_CQUT_PUBLIC_KEY_PEM);
  }
  return cachedDefaultKey;
}
function encryptChunk(chunk, publicKey = getDefaultKey()) {
  const key = typeof publicKey === "string" ? parseRsaPublicKey(publicKey) : publicKey;
  const encryptedBytes = rsaEncryptPkcs1(chunk, key);
  return bytesToBase64(encryptedBytes);
}
function getSecretParam(password, publicKey) {
  if (!password.trim()) {
    return "";
  }
  const key = publicKey ? typeof publicKey === "string" ? parseRsaPublicKey(publicKey) : publicKey : getDefaultKey();
  const segments = [];
  for (let i = 0; i < password.length; i += 30) {
    segments.push(encryptChunk(password.slice(i, i + 30), key));
  }
  return encodeURIComponent(JSON.stringify(segments));
}
export {
  DEFAULT_CQUT_PUBLIC_KEY_PEM,
  base64ToBytes,
  bigIntToBytes,
  bytesToBase64,
  bytesToBigInt,
  encryptChunk,
  getSecretParam,
  modPow,
  parseRsaPublicKey,
  rsaEncryptPkcs1
};
//# sourceMappingURL=index.js.map