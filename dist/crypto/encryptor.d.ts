import type { EncryptedPassword } from "../client/types.js";
import { type RsaPublicKey } from "./rsa.js";
export declare const DEFAULT_CQUT_PUBLIC_KEY_PEM = "-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDACwPDxYycdCiNeblZa9LjvDzb\niZU1vc9gKRcG/pGjZ/DJkI4HmoUE2r/o6SfB5az3s+H5JDzmOMVQ63hD7LZQGR4k\n3iYWnCg3UpQZkZEtFtXBXsQHjKVJqCiEtK+gtxz4WnriDjf+e/CxJ7OD03e7sy5N\nY/akVmYNtghKZzz6jwIDAQAB\n-----END PUBLIC KEY-----";
/**
 * Encrypts a single chunk using the specified or default RSA public key.
 */
export declare function encryptChunk(chunk: string, publicKey?: RsaPublicKey | string): string;
/**
 * Encrypts the password for CQUT UIS/CAS login.
 * Splits into 30-character segments, encrypts each with RSA PKCS#1 v1.5,
 * and encodes the JSON array as a URL parameter.
 *
 * @param password The plaintext password to encrypt.
 * @param publicKey Optional custom RSA public key PEM string or parsed key.
 * @returns Encrypted secret parameter string suitable for `pwd` payload field.
 */
export declare function getSecretParam(password: string, publicKey?: RsaPublicKey | string): EncryptedPassword;
