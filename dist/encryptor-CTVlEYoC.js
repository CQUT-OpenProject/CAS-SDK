//#region src/errors/cas-error.ts
var CasError = class extends Error {
	kind;
	status;
	step;
	constructor(kind, message, options) {
		super(message);
		this.name = "CasError";
		this.kind = kind;
		this.status = options?.status;
		this.step = options?.step;
		if (options?.cause !== void 0) this.cause = options.cause;
		Object.setPrototypeOf(this, new.target.prototype);
	}
};
/**
* Type guard to check if an unknown error is a CasError.
*/
function isCasError(error) {
	return error instanceof CasError;
}
/**
* Type guard to check if an unknown error is a CasError of a specific kind.
*/
function isCasErrorOfKind(error, kind) {
	return isCasError(error) && error.kind === kind;
}
//#endregion
//#region src/crypto/rsa.ts
/**
* Parses an RSA Public Key from PEM (PKCS#1 or PKCS#8/SPKI) or DER base64 string.
*/
function parseRsaPublicKey(pemOrBase64) {
	const cleanBase64 = pemOrBase64.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
	try {
		const key = parseDerPublicKey(base64ToBytes(cleanBase64));
		if (key.keyLength < 12 || key.n <= 0n || key.e < 3n || key.e % 2n === 0n) throw new Error("Invalid RSA key");
		return key;
	} catch (cause) {
		throw new CasError("CRYPTO_ERROR", "Invalid RSA public key", { cause });
	}
}
/**
* Encrypts a chunk of string or bytes using RSA PKCS#1 v1.5 padding.
*/
function rsaEncryptPkcs1(data, key) {
	const messageBytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
	const k = key.keyLength;
	if (messageBytes.length > k - 11) throw new CasError("CRYPTO_ERROR", `Message too long for RSA PKCS#1 v1.5: max length is ${k - 11} bytes, got ${messageBytes.length}`);
	const psLength = k - messageBytes.length - 3;
	const ps = getRandomNonZeroBytes(psLength);
	const block = new Uint8Array(k);
	block[0] = 0;
	block[1] = 2;
	block.set(ps, 2);
	block[2 + psLength] = 0;
	block.set(messageBytes, 3 + psLength);
	return bigIntToBytes(modPow(bytesToBigInt(block), key.e, key.n), k);
}
/**
* Modular exponentiation: (base ^ exp) % mod
*/
function modPow(base, exp, mod) {
	if (mod === 1n) return 0n;
	let result = 1n;
	let b = base % mod;
	let e = exp;
	while (e > 0n) {
		if (e & 1n) result = result * b % mod;
		e >>= 1n;
		b = b * b % mod;
	}
	return result;
}
function getRandomNonZeroBytes(length) {
	if (typeof globalThis.crypto?.getRandomValues !== "function") throw new CasError("CONFIGURATION_ERROR", "A secure Web Crypto random source is required");
	const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
	for (let i = 0; i < bytes.length; i++) while (bytes[i] === 0) globalThis.crypto.getRandomValues(bytes.subarray(i, i + 1));
	return bytes;
}
function bytesToBigInt(bytes) {
	let hex = "";
	for (let i = 0; i < bytes.length; i++) hex += (bytes[i] ?? 0).toString(16).padStart(2, "0");
	return BigInt(hex ? `0x${hex}` : "0");
}
function bigIntToBytes(value, length) {
	let hex = value.toString(16);
	if (hex.length % 2 !== 0) hex = "0" + hex;
	const bytes = new Uint8Array(length);
	const rawBytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < rawBytes.length; i++) rawBytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	const offset = length - rawBytes.length;
	if (offset >= 0) bytes.set(rawBytes, offset);
	else bytes.set(rawBytes.subarray(-offset));
	return bytes;
}
function base64ToBytes(base64) {
	return Uint8Array.from(globalThis.atob(base64), (char) => char.charCodeAt(0));
}
function bytesToBase64(bytes) {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return globalThis.btoa(binary);
}
/**
* Minimal ASN.1 DER Parser for SPKI / PKCS#1 RSA Public Keys
*/
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
		if (expectedTag !== void 0 && tag !== expectedTag) throw new Error(`Expected DER tag 0x${expectedTag.toString(16)}, got 0x${tag.toString(16)}`);
		return tag;
	}
	readTag(48);
	readLength();
	if (der[pos] === 48) {
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
	if (nBytes[0] === 0) nBytes = nBytes.subarray(1);
	const n = bytesToBigInt(nBytes);
	const keyLength = nBytes.length;
	readTag(2);
	const eLen = readLength();
	if (eLen === 0 || pos + eLen !== der.length) throw new Error("Invalid DER exponent length");
	let eBytes = der.subarray(pos, pos + eLen);
	pos += eLen;
	if (eBytes[0] === 0) eBytes = eBytes.subarray(1);
	return {
		n,
		e: bytesToBigInt(eBytes),
		keyLength
	};
}
//#endregion
//#region src/crypto/encryptor.ts
const DEFAULT_CQUT_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDACwPDxYycdCiNeblZa9LjvDzb
iZU1vc9gKRcG/pGjZ/DJkI4HmoUE2r/o6SfB5az3s+H5JDzmOMVQ63hD7LZQGR4k
3iYWnCg3UpQZkZEtFtXBXsQHjKVJqCiEtK+gtxz4WnriDjf+e/CxJ7OD03e7sy5N
Y/akVmYNtghKZzz6jwIDAQAB
-----END PUBLIC KEY-----`;
let cachedDefaultKey = null;
function getDefaultKey() {
	if (!cachedDefaultKey) cachedDefaultKey = parseRsaPublicKey(DEFAULT_CQUT_PUBLIC_KEY_PEM);
	return cachedDefaultKey;
}
/**
* Encrypts a single chunk using the specified or default RSA public key.
*/
function encryptChunk(chunk, publicKey = getDefaultKey()) {
	return bytesToBase64(rsaEncryptPkcs1(chunk, typeof publicKey === "string" ? parseRsaPublicKey(publicKey) : publicKey));
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
function getSecretParam(password, publicKey) {
	if (!password.trim()) return "";
	const key = publicKey ? typeof publicKey === "string" ? parseRsaPublicKey(publicKey) : publicKey : getDefaultKey();
	const segments = [];
	for (let i = 0; i < password.length; i += 30) segments.push(encryptChunk(password.slice(i, i + 30), key));
	return encodeURIComponent(JSON.stringify(segments));
}
//#endregion
export { rsaEncryptPkcs1 as a, isCasErrorOfKind as c, parseRsaPublicKey as i, encryptChunk as n, CasError as o, getSecretParam as r, isCasError as s, DEFAULT_CQUT_PUBLIC_KEY_PEM as t };

//# sourceMappingURL=encryptor-CTVlEYoC.js.map