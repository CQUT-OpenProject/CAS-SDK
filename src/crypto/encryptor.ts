import type { EncryptedPassword } from "../client/types.js";
import { bytesToBase64, parseRsaPublicKey, rsaEncryptPkcs1, type RsaPublicKey } from "./rsa.js";

export const DEFAULT_CQUT_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDACwPDxYycdCiNeblZa9LjvDzb
iZU1vc9gKRcG/pGjZ/DJkI4HmoUE2r/o6SfB5az3s+H5JDzmOMVQ63hD7LZQGR4k
3iYWnCg3UpQZkZEtFtXBXsQHjKVJqCiEtK+gtxz4WnriDjf+e/CxJ7OD03e7sy5N
Y/akVmYNtghKZzz6jwIDAQAB
-----END PUBLIC KEY-----`;

let cachedDefaultKey: RsaPublicKey | null = null;

function getDefaultKey(): RsaPublicKey {
  if (!cachedDefaultKey) {
    cachedDefaultKey = parseRsaPublicKey(DEFAULT_CQUT_PUBLIC_KEY_PEM);
  }
  return cachedDefaultKey;
}

/**
 * Encrypts a single chunk using the specified or default RSA public key.
 */
export function encryptChunk(
  chunk: string,
  publicKey: RsaPublicKey | string = getDefaultKey(),
): string {
  const key = typeof publicKey === "string" ? parseRsaPublicKey(publicKey) : publicKey;
  const encryptedBytes = rsaEncryptPkcs1(chunk, key);
  return bytesToBase64(encryptedBytes);
}

/**
 * Encrypts the password for CQUT UIS/CAS login.
 * Splits into 30-character segments, encrypts each with RSA PKCS#1 v1.5,
 * and encodes the JSON array as a URL parameter.
 *
 * @param password The plaintext password to encrypt.
 * @param publicKey Optional custom RSA public key PEM string or parsed key.
 * @returns Encrypted secret parameter string suitable for `pwd` payload field.
 */
export function getSecretParam(
  password: string,
  publicKey?: RsaPublicKey | string,
): EncryptedPassword {
  if (!password.trim()) {
    return "" as EncryptedPassword;
  }

  const key = publicKey
    ? typeof publicKey === "string"
      ? parseRsaPublicKey(publicKey)
      : publicKey
    : getDefaultKey();

  const segments: string[] = [];
  for (let i = 0; i < password.length; i += 30) {
    segments.push(encryptChunk(password.slice(i, i + 30), key));
  }

  return encodeURIComponent(JSON.stringify(segments)) as EncryptedPassword;
}
