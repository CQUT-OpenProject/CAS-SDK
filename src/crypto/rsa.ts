/**
 * Pure TypeScript RSA PKCS#1 v1.5 encryption implementation using native BigInt.
 * Cross-runtime: Works in Node.js, Cloudflare Workers, Edge, Deno, Bun, and Browsers with zero external dependencies.
 */

export interface RsaPublicKey {
  n: bigint; // Modulus
  e: bigint; // Exponent (typically 65537n)
  keyLength: number; // in bytes (e.g. 128 for 1024-bit RSA)
}

/**
 * Parses an RSA Public Key from PEM (PKCS#1 or PKCS#8/SPKI) or DER base64 string.
 */
export function parseRsaPublicKey(pemOrBase64: string): RsaPublicKey {
  const cleanBase64 = pemOrBase64
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");

  const der = base64ToBytes(cleanBase64);
  return parseDerPublicKey(der);
}

/**
 * Encrypts a chunk of string or bytes using RSA PKCS#1 v1.5 padding.
 */
export function rsaEncryptPkcs1(data: string | Uint8Array, key: RsaPublicKey): Uint8Array {
  const messageBytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const k = key.keyLength;

  if (messageBytes.length > k - 11) {
    throw new Error(
      `Message too long for RSA PKCS#1 v1.5: max length is ${k - 11} bytes, got ${messageBytes.length}`,
    );
  }

  // PKCS#1 v1.5 padding: 0x00 || 0x02 || PS (non-zero bytes) || 0x00 || M
  const psLength = k - messageBytes.length - 3;
  const ps = getRandomNonZeroBytes(psLength);

  const block = new Uint8Array(k);
  block[0] = 0x00;
  block[1] = 0x02;
  block.set(ps, 2);
  block[2 + psLength] = 0x00;
  block.set(messageBytes, 3 + psLength);

  // Convert block to BigInt
  const m = bytesToBigInt(block);

  // Modular exponentiation: c = m^e mod n
  const c = modPow(m, key.e, key.n);

  // Convert ciphertext BigInt to fixed-length bytes
  return bigIntToBytes(c, k);
}

/**
 * Modular exponentiation: (base ^ exp) % mod
 */
export function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  if (mod === 1n) return 0n;
  let result = 1n;
  let b = base % mod;
  let e = exp;

  while (e > 0n) {
    if (e & 1n) {
      result = (result * b) % mod;
    }
    e >>= 1n;
    b = (b * b) % mod;
  }
  return result;
}

function getRandomNonZeroBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.getRandomValues === "function"
  ) {
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

export function bytesToBigInt(bytes: Uint8Array): bigint {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  }
  return BigInt(hex ? `0x${hex}` : "0");
}

export function bigIntToBytes(value: bigint, length: number): Uint8Array {
  let hex = value.toString(16);
  if (hex.length % 2 !== 0) {
    hex = "0" + hex;
  }
  const bytes = new Uint8Array(length);
  const rawBytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < rawBytes.length; i++) {
    rawBytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  // Right-align into length bytes (big-endian)
  const offset = length - rawBytes.length;
  if (offset >= 0) {
    bytes.set(rawBytes, offset);
  } else {
    // If larger than length (should not happen with valid mod), take the last length bytes
    bytes.set(rawBytes.subarray(-offset));
  }
  return bytes;
}

export function base64ToBytes(base64: string): Uint8Array {
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // Fallback for environments where atob is not available
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let str = base64.replace(/[=]+$/, "");
  const len = str.length;
  const bytes: number[] = [];

  for (let i = 0; i < len; i += 4) {
    const b1 = chars.indexOf(str.charAt(i));
    const b2 = chars.indexOf(str.charAt(i + 1));
    const b3 = chars.indexOf(str.charAt(i + 2));
    const b4 = chars.indexOf(str.charAt(i + 3));

    const n = (b1 << 18) | (b2 << 12) | ((b3 >= 0 ? b3 : 0) << 6) | (b4 >= 0 ? b4 : 0);

    bytes.push((n >> 16) & 0xff);
    if (b3 >= 0) bytes.push((n >> 8) & 0xff);
    if (b4 >= 0) bytes.push(n & 0xff);
  }
  return new Uint8Array(bytes);
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof globalThis.btoa === "function") {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i] ?? 0);
    }
    return globalThis.btoa(binary);
  }

  // Fallback
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let base64 = "";
  const len = bytes.length;

  for (let i = 0; i < len; i += 3) {
    const byte1 = bytes[i] ?? 0;
    const byte2 = i + 1 < len ? (bytes[i + 1] ?? 0) : 0;
    const byte3 = i + 2 < len ? (bytes[i + 2] ?? 0) : 0;

    const n = (byte1 << 16) | (byte2 << 8) | byte3;

    base64 += chars.charAt((n >> 18) & 63);
    base64 += chars.charAt((n >> 12) & 63);
    base64 += i + 1 < len ? chars.charAt((n >> 6) & 63) : "=";
    base64 += i + 2 < len ? chars.charAt(n & 63) : "=";
  }
  return base64;
}

/**
 * Minimal ASN.1 DER Parser for SPKI / PKCS#1 RSA Public Keys
 */
function parseDerPublicKey(der: Uint8Array): RsaPublicKey {
  let pos = 0;

  function readLength(): number {
    const b = der[pos++];
    if (b === undefined) throw new Error("Unexpected EOF in DER length");
    if ((b & 0x80) === 0) return b;
    const numBytes = b & 0x7f;
    let len = 0;
    for (let i = 0; i < numBytes; i++) {
      const next = der[pos++];
      if (next === undefined) throw new Error("Unexpected EOF in multi-byte length");
      len = (len << 8) | next;
    }
    return len;
  }

  function readTag(expectedTag?: number): number {
    const tag = der[pos++];
    if (tag === undefined) throw new Error("Unexpected EOF in DER tag");
    if (expectedTag !== undefined && tag !== expectedTag) {
      throw new Error(`Expected DER tag 0x${expectedTag.toString(16)}, got 0x${tag.toString(16)}`);
    }
    return tag;
  }

  // Top level SEQUENCE (0x30)
  readTag(0x30);
  readLength();

  // Next tag: could be SEQUENCE (SPKI AlgorithmIdentifier) or INTEGER (PKCS#1 Modulus)
  const nextTag = der[pos];
  if (nextTag === 0x30) {
    // SPKI format: SEQUENCE { AlgorithmIdentifier, BIT STRING containing PKCS#1 RSAPublicKey }
    readTag(0x30); // AlgorithmIdentifier sequence
    const algLen = readLength();
    pos += algLen; // skip algorithm identifier

    readTag(0x03); // BIT STRING
    readLength();
    pos++; // skip unused bits count byte (usually 0x00)

    // Inner PKCS#1 RSAPublicKey sequence
    readTag(0x30);
    readLength();
  }

  // Read modulus (INTEGER 0x02)
  readTag(0x02);
  const nLen = readLength();
  let nBytes = der.subarray(pos, pos + nLen);
  pos += nLen;
  if (nBytes[0] === 0x00) {
    nBytes = nBytes.subarray(1); // remove leading zero from ASN.1 signed int
  }
  const n = bytesToBigInt(nBytes);
  const keyLength = nBytes.length;

  // Read exponent (INTEGER 0x02)
  readTag(0x02);
  const eLen = readLength();
  let eBytes = der.subarray(pos, pos + eLen);
  pos += eLen;
  if (eBytes[0] === 0x00) {
    eBytes = eBytes.subarray(1);
  }
  const e = bytesToBigInt(eBytes);

  return { n, e, keyLength };
}
