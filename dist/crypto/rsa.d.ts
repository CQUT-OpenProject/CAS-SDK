/**
 * Pure TypeScript RSA PKCS#1 v1.5 encryption implementation using native BigInt.
 * Cross-runtime: Works in Node.js, Cloudflare Workers, Edge, Deno, Bun, and Browsers with zero external dependencies.
 */
export interface RsaPublicKey {
    n: bigint;
    e: bigint;
    keyLength: number;
}
/**
 * Parses an RSA Public Key from PEM (PKCS#1 or PKCS#8/SPKI) or DER base64 string.
 */
export declare function parseRsaPublicKey(pemOrBase64: string): RsaPublicKey;
/**
 * Encrypts a chunk of string or bytes using RSA PKCS#1 v1.5 padding.
 */
export declare function rsaEncryptPkcs1(data: string | Uint8Array, key: RsaPublicKey): Uint8Array;
/**
 * Modular exponentiation: (base ^ exp) % mod
 */
export declare function modPow(base: bigint, exp: bigint, mod: bigint): bigint;
export declare function bytesToBigInt(bytes: Uint8Array): bigint;
export declare function bigIntToBytes(value: bigint, length: number): Uint8Array;
export declare function base64ToBytes(base64: string): Uint8Array;
export declare function bytesToBase64(bytes: Uint8Array): string;
