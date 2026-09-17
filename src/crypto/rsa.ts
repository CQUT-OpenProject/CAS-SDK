import { CasError } from "../errors/cas-error.js";
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

  try {
    const key = parseDerPublicKey(base64ToBytes(cleanBase64));
    if (key.keyLength < 12 || key.n <= 0n || key.e < 3n || key.e % 2n === 0n)
      throw new Error("Invalid RSA key");
    return key;
  } catch (cause) {
    throw new CasError("CRYPTO_ERROR", "Invalid RSA public key", { cause });
  }
}

/**
 * Encrypts a chunk of string or bytes using RSA PKCS#1 v1.5 padding.
 */
export function rsaEncryptPkcs1(data: string | Uint8Array, key: RsaPublicKey): Uint8Array {
  const messageBytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const k = key.keyLength;

  if (messageBytes.length > k - 11) {
    throw new CasError(
      "CRYPTO_ERROR",
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
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new CasError("CONFIGURATION_ERROR", "A secure Web Crypto random source is required");
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
  for (let i = 0; i < bytes.length; i++) {
    while (bytes[i] === 0) globalThis.crypto.getRandomValues(bytes.subarray(i, i + 1));
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
  return Uint8Array.from(globalThis.atob(base64), (char) => char.charCodeAt(0));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
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
  if (eLen === 0 || pos + eLen !== der.length) throw new Error("Invalid DER exponent length");
  let eBytes = der.subarray(pos, pos + eLen);
  pos += eLen;
  if (eBytes[0] === 0x00) {
    eBytes = eBytes.subarray(1);
  }
  const e = bytesToBigInt(eBytes);

  return { n, e, keyLength };
}
