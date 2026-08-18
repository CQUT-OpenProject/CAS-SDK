import assert from "node:assert/strict";
import { generateKeyPairSync, privateDecrypt, publicEncrypt, constants } from "node:crypto";
import test from "node:test";
import {
  DEFAULT_CQUT_PUBLIC_KEY_PEM,
  getSecretParam,
  parseRsaPublicKey,
  rsaEncryptPkcs1,
} from "./index.js";

test("parseRsaPublicKey parses 1024-bit CQUT public key correctly", () => {
  const parsed = parseRsaPublicKey(DEFAULT_CQUT_PUBLIC_KEY_PEM);
  assert.equal(parsed.keyLength, 128);
  assert.equal(parsed.e, 65537n);
  assert.ok(parsed.n > 0n);
});

test("rsaEncryptPkcs1 encrypts data decryptable by node:crypto private key", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 1024,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const parsedKey = parseRsaPublicKey(publicKey);
  const plaintext = "hello-world-cqut-cas-123456";

  const ciphertextBytes = rsaEncryptPkcs1(plaintext, parsedKey);
  assert.equal(ciphertextBytes.length, 128);

  const decrypted = privateDecrypt(
    {
      key: privateKey,
      padding: constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(ciphertextBytes),
  );

  assert.equal(decrypted.toString("utf8"), plaintext);
});

test("getSecretParam returns valid encoded RSA chunk payload", () => {
  const sampleSecret = "sample-password-01";
  const result = getSecretParam(sampleSecret);
  const parsed = JSON.parse(decodeURIComponent(result)) as string[];

  assert.equal(Array.isArray(parsed), true);
  assert.equal(parsed.length, 1);
  assert.match(parsed[0] ?? "", /^[A-Za-z0-9+/=]+$/);
  assert.notEqual(result, encodeURIComponent(sampleSecret));
});

test("getSecretParam splits long passwords into 30-char encrypted chunks correctly", () => {
  const p30 = getSecretParam("a".repeat(30));
  const parsed30 = JSON.parse(decodeURIComponent(p30)) as string[];
  assert.equal(parsed30.length, 1);

  const p60 = getSecretParam("a".repeat(60));
  const parsed60 = JSON.parse(decodeURIComponent(p60)) as string[];
  assert.equal(parsed60.length, 2);

  const p61 = getSecretParam("a".repeat(61));
  const parsed61 = JSON.parse(decodeURIComponent(p61)) as string[];
  assert.equal(parsed61.length, 3);
});

test("getSecretParam returns empty string for empty password", () => {
  assert.equal(getSecretParam(""), "");
  assert.equal(getSecretParam("   "), "");
});
