"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  CAS_NAMESPACE: () => CAS_NAMESPACE,
  CasClient: () => CasClient,
  CasError: () => CasError,
  DEFAULT_APPLICATION_CODE: () => DEFAULT_APPLICATION_CODE,
  DEFAULT_CQUT_PUBLIC_KEY_PEM: () => DEFAULT_CQUT_PUBLIC_KEY_PEM,
  DEFAULT_UIS_BASE_URL: () => DEFAULT_UIS_BASE_URL,
  MAX_CAS_VALIDATION_RESPONSE_BYTES: () => MAX_CAS_VALIDATION_RESPONSE_BYTES,
  MemoryCookieJar: () => MemoryCookieJar,
  assertServiceTicket: () => assertServiceTicket,
  base64ToBytes: () => base64ToBytes,
  bigIntToBytes: () => bigIntToBytes,
  bytesToBase64: () => bytesToBase64,
  bytesToBigInt: () => bytesToBigInt,
  createCasClient: () => createCasClient,
  defaultFetcher: () => defaultFetcher,
  encryptChunk: () => encryptChunk,
  extractResponseCookies: () => extractResponseCookies,
  getHeader: () => getHeader,
  getSecretParam: () => getSecretParam,
  isCasError: () => isCasError,
  isCasErrorOfKind: () => isCasErrorOfKind,
  isServiceTicket: () => isServiceTicket,
  modPow: () => modPow,
  normalizeBaseUrl: () => normalizeBaseUrl,
  parseCasValidationResponse: () => parseCasValidationResponse,
  parseRsaPublicKey: () => parseRsaPublicKey,
  resolveCasLoginUrl: () => resolveCasLoginUrl,
  rsaEncryptPkcs1: () => rsaEncryptPkcs1
});
module.exports = __toCommonJS(index_exports);

// src/polyfill.ts
if (typeof Symbol.dispose !== "symbol") {
  Object.defineProperty(Symbol, "dispose", {
    value: /* @__PURE__ */ Symbol("Symbol.dispose"),
    configurable: true,
    writable: false,
    enumerable: false
  });
}
if (typeof Symbol.asyncDispose !== "symbol") {
  Object.defineProperty(Symbol, "asyncDispose", {
    value: /* @__PURE__ */ Symbol("Symbol.asyncDispose"),
    configurable: true,
    writable: false,
    enumerable: false
  });
}

// src/cookie/cookie-jar.ts
var MemoryCookieJar = class {
  cookies = [];
  setCookie(rawCookie, currentUrl) {
    if (!rawCookie || !rawCookie.trim()) return;
    let parsedUrl;
    try {
      parsedUrl = new URL(currentUrl);
    } catch {
      return;
    }
    const cookie = parseSetCookie(rawCookie, parsedUrl.hostname, parsedUrl.pathname);
    if (!cookie) return;
    this.cookies = this.cookies.filter(
      (c) => !(c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path)
    );
    if (isExpired(cookie)) {
      return;
    }
    this.cookies.push(cookie);
  }
  setCookies(rawCookies, currentUrl) {
    for (const raw of rawCookies) {
      this.setCookie(raw, currentUrl);
    }
  }
  getCookies(currentUrl) {
    let parsedUrl;
    try {
      parsedUrl = new URL(currentUrl);
    } catch {
      return [];
    }
    const now = Date.now();
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname || "/";
    const isSecure = parsedUrl.protocol === "https:";
    this.cookies = this.cookies.filter((c) => !isExpired(c, now));
    return this.cookies.filter((c) => {
      if (c.secure && !isSecure) return false;
      if (!matchDomain(c.domain, hostname)) return false;
      if (!matchPath(c.path, pathname)) return false;
      return true;
    });
  }
  getCookieString(currentUrl) {
    const matching = this.getCookies(currentUrl);
    return matching.map((c) => `${c.name}=${c.value}`).join("; ");
  }
  clear() {
    this.cookies = [];
  }
  [Symbol.dispose]() {
    this.clear();
  }
};
function parseSetCookie(raw, defaultHost, defaultPath) {
  const parts = raw.split(";").map((p) => p.trim());
  const firstPart = parts[0];
  if (!firstPart) return null;
  const equalIdx = firstPart.indexOf("=");
  if (equalIdx <= 0) return null;
  const name = firstPart.slice(0, equalIdx).trim();
  const value = firstPart.slice(equalIdx + 1).trim();
  let domain = defaultHost.toLowerCase();
  let path = defaultPath.startsWith("/") ? defaultPath : "/";
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash > 0) {
    path = path.slice(0, lastSlash);
  } else if (lastSlash === 0 && path !== "/") {
    path = "/";
  }
  let expires;
  let maxAge;
  let secure = false;
  let httpOnly = false;
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    const eq = part.indexOf("=");
    const key = (eq >= 0 ? part.slice(0, eq) : part).trim().toLowerCase();
    const val = eq >= 0 ? part.slice(eq + 1).trim() : "";
    if (key === "domain" && val) {
      domain = val.startsWith(".") ? val.slice(1).toLowerCase() : val.toLowerCase();
    } else if (key === "path" && val) {
      path = val;
    } else if (key === "expires" && val) {
      const parsed = new Date(val);
      if (!isNaN(parsed.getTime())) {
        expires = parsed;
      }
    } else if (key === "max-age" && val) {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed)) {
        maxAge = parsed;
      }
    } else if (key === "secure") {
      secure = true;
    } else if (key === "httponly") {
      httpOnly = true;
    }
  }
  return {
    name,
    value,
    domain,
    path,
    expires,
    maxAge,
    secure,
    httpOnly,
    createdAt: Date.now()
  };
}
function isExpired(cookie, now = Date.now()) {
  if (cookie.maxAge !== void 0) {
    if (cookie.maxAge <= 0) return true;
    return now > cookie.createdAt + cookie.maxAge * 1e3;
  }
  if (cookie.expires !== void 0) {
    return now > cookie.expires.getTime();
  }
  return false;
}
function matchDomain(cookieDomain, requestHost) {
  if (!cookieDomain || !requestHost) return false;
  const cd = cookieDomain.toLowerCase();
  const rh = requestHost.toLowerCase();
  if (cd === rh) return true;
  if (rh.endsWith("." + cd)) return true;
  return false;
}
function matchPath(cookiePath, requestPath) {
  if (!cookiePath || !requestPath) return true;
  if (cookiePath === "/" || cookiePath === requestPath) return true;
  if (requestPath.startsWith(cookiePath)) {
    if (cookiePath.endsWith("/")) return true;
    if (requestPath.charAt(cookiePath.length) === "/") return true;
  }
  return false;
}

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

// src/errors/cas-error.ts
var CasError = class extends Error {
  kind;
  status;
  rawResponse;
  constructor(kind, message, options) {
    super(message);
    this.name = "CasError";
    this.kind = kind;
    this.status = options?.status;
    this.rawResponse = options?.rawResponse;
    if (options?.cause !== void 0) {
      this.cause = options.cause;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
};
function isCasError(error) {
  return error instanceof CasError;
}
function isCasErrorOfKind(error, kind) {
  return isCasError(error) && error.kind === kind;
}

// src/http/default-fetcher.ts
var defaultFetcher = async (request) => {
  if (typeof globalThis.fetch !== "function") {
    throw new Error("globalThis.fetch is not available in the current runtime environment");
  }
  const init = {
    method: request.method ?? "GET",
    redirect: request.redirect ?? "follow"
  };
  if (request.headers !== void 0) {
    init.headers = request.headers;
  }
  if (request.body !== void 0) {
    init.body = request.body;
  }
  if (request.signal !== void 0) {
    init.signal = request.signal;
  }
  const response = await globalThis.fetch(request.url, init);
  return {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    url: response.url,
    text: () => response.text(),
    json: () => response.json()
  };
};
function extractResponseCookies(headers) {
  if (!headers) return [];
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  if (typeof headers.get === "function") {
    const raw = headers.get("set-cookie");
    return raw ? [raw] : [];
  }
  const rawHeaders = headers;
  const setCookie = rawHeaders["set-cookie"] ?? rawHeaders["Set-Cookie"] ?? rawHeaders["SET-COOKIE"];
  if (Array.isArray(setCookie)) {
    return setCookie.filter((v) => typeof v === "string");
  }
  if (typeof setCookie === "string") {
    return [setCookie];
  }
  return [];
}
function getHeader(headers, name) {
  if (!headers) return void 0;
  if (typeof headers.get === "function") {
    return headers.get(name) ?? void 0;
  }
  const rawHeaders = headers;
  const targetLower = name.toLowerCase();
  for (const key of Object.keys(rawHeaders)) {
    if (key.toLowerCase() === targetLower) {
      const val = rawHeaders[key];
      if (Array.isArray(val)) {
        return val[0];
      }
      return val;
    }
  }
  return void 0;
}

// src/parser/cas-xml.ts
var CAS_NAMESPACE = "http://www.yale.edu/tp/cas";
var MAX_CAS_VALIDATION_RESPONSE_BYTES = 64 * 1024;
function parseCasValidationResponse(xml) {
  if (!xml || typeof xml !== "string") {
    throw new CasError("VALIDATION_FAILED", "CAS validation response is empty or non-string");
  }
  const byteLength = new TextEncoder().encode(xml).length;
  if (byteLength > MAX_CAS_VALIDATION_RESPONSE_BYTES) {
    throw new CasError(
      "VALIDATION_FAILED",
      "CAS validation response exceeds maximum allowed size (64KB)"
    );
  }
  if (/<!DOCTYPE/i.test(xml)) {
    throw new CasError("VALIDATION_FAILED", "CAS validation response must not contain a doctype");
  }
  const failureMatch = xml.match(
    /<(?:[a-zA-Z0-9_]+:)?authenticationFailure(?:\s+code="([^"]*)")?[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?authenticationFailure>/i
  );
  if (failureMatch) {
    const code = failureMatch[1]?.trim();
    const msg = failureMatch[2]?.trim() || "Authentication failure";
    throw new CasError(
      "VALIDATION_FAILED",
      `CAS ticket validation failed: ${code ?? "UNKNOWN"} - ${msg}`,
      {
        rawResponse: xml
      }
    );
  }
  const successMatches = xml.match(/<(?:[a-zA-Z0-9_]+:)?authenticationSuccess[\s>]/gi);
  if (!successMatches || successMatches.length !== 1) {
    throw new CasError(
      "VALIDATION_FAILED",
      "CAS validation response does not contain a unique authenticationSuccess block",
      { rawResponse: xml }
    );
  }
  const userMatches = [
    ...xml.matchAll(/<(?:[a-zA-Z0-9_]+:)?user[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?user>/gi)
  ];
  if (userMatches.length !== 1 || !userMatches[0]?.[1]?.trim()) {
    throw new CasError(
      "VALIDATION_FAILED",
      "CAS validation response missing or multiple <user> elements",
      { rawResponse: xml }
    );
  }
  const user = normalizeCasIdentifier(userMatches[0][1]);
  const uidMatches = [
    ...xml.matchAll(/<(?:[a-zA-Z0-9_]+:)?uid[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?uid>/gi)
  ];
  if (uidMatches.length > 1) {
    throw new CasError(
      "VALIDATION_FAILED",
      "CAS validation response contains multiple <uid> elements"
    );
  }
  let uid;
  if (uidMatches.length === 1 && uidMatches[0]?.[1]?.trim()) {
    uid = normalizeCasIdentifier(uidMatches[0][1]);
    if (uid !== user) {
      throw new CasError(
        "VALIDATION_FAILED",
        "CAS validation response contains conflicting user and uid identifiers"
      );
    }
  }
  const attributes = {};
  const attrBlockMatch = xml.match(
    /<(?:[a-zA-Z0-9_]+:)?attributes[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?attributes>/i
  );
  if (attrBlockMatch?.[1]) {
    const attrInner = attrBlockMatch[1];
    const tagRegex = /<(?:[a-zA-Z0-9_]+:)?([a-zA-Z0-9_-]+)[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?\1>/g;
    let match;
    while ((match = tagRegex.exec(attrInner)) !== null) {
      const key = match[1];
      const val = match[2]?.trim() ?? "";
      if (key) {
        attributes[key] = val;
      }
    }
  }
  const userCode = attributes["user_code"];
  if (userCode) {
    const normalizedUserCode = normalizeCasIdentifier(userCode);
    if (normalizedUserCode !== user) {
      throw new CasError(
        "VALIDATION_FAILED",
        "CAS validation response contains conflicting user and user_code identifiers"
      );
    }
  }
  const tokenMatch = xml.match(
    /<(?:[a-zA-Z0-9_]+:)?authServerToken[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?authServerToken>/i
  );
  const authServerToken = tokenMatch?.[1]?.trim();
  return {
    success: true,
    user,
    uid,
    userCode,
    userName: attributes["user_name"],
    userType: attributes["user_user_type"],
    authServerToken,
    attributes,
    rawXml: xml
  };
}
function normalizeCasIdentifier(value) {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) {
    throw new CasError("VALIDATION_FAILED", "CAS validation response contains an empty identifier");
  }
  return normalized;
}

// src/client/endpoints.ts
var DEFAULT_UIS_BASE_URL = "https://uis.cqut.edu.cn";
var DEFAULT_APPLICATION_CODE = "officeHallApplicationCode";
function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}
function resolveCasLoginUrl(uisBaseUrl, finalUrl, fallbackApplicationCode) {
  try {
    const parsed = new URL(finalUrl);
    const match = parsed.pathname.match(/^\/center-auth-server\/([^/]+)\/cas\/login$/);
    if (match?.[1]) {
      return `${uisBaseUrl}/center-auth-server/${match[1]}/cas/login`;
    }
  } catch {
  }
  return `${uisBaseUrl}/center-auth-server/${fallbackApplicationCode}/cas/login`;
}

// src/client/types.ts
function isServiceTicket(value) {
  return typeof value === "string" && value.startsWith("ST-") && value.length > 3;
}
function assertServiceTicket(value) {
  if (!isServiceTicket(value)) {
    throw new TypeError(`Value is not a valid CAS ServiceTicket: ${String(value)}`);
  }
}

// src/client/cas-client.ts
var DEFAULT_HEADERS = {
  "User-Agent": "CQUT-Auth-Service/1.0",
  "Accept-Language": "zh-CN"
};
var CasClient = class {
  uisBaseUrl;
  defaultApplicationCode;
  fetcher;
  defaultCookieJar;
  publicKey;
  defaultHeaders;
  constructor(options = {}) {
    this.uisBaseUrl = normalizeBaseUrl(options.uisBaseUrl ?? DEFAULT_UIS_BASE_URL);
    this.defaultApplicationCode = options.applicationCode ?? DEFAULT_APPLICATION_CODE;
    this.fetcher = options.fetcher ?? defaultFetcher;
    this.defaultCookieJar = options.cookieJar ?? new MemoryCookieJar();
    this.publicKey = options.publicKey;
    this.defaultHeaders = options.defaultHeaders ?? DEFAULT_HEADERS;
  }
  /**
   * Static helper to encrypt a password.
   */
  static encryptPassword(password, publicKey) {
    return getSecretParam(password, publicKey);
  }
  /**
   * Instance method to encrypt a password using the client's configured public key.
   */
  encryptPassword(password) {
    return getSecretParam(password, this.publicKey);
  }
  /**
   * Step 1: Fetches initial login page and establishes session cookies.
   */
  async fetchLoginPage(serviceUrl, options = {}) {
    const jar = options.cookieJar ?? this.defaultCookieJar;
    const appCode = options.applicationCode ?? this.defaultApplicationCode;
    const url = `${this.uisBaseUrl}/center-auth-server/${appCode}/cas/login?service=${encodeURIComponent(serviceUrl)}&applicationCode=${encodeURIComponent(appCode)}`;
    const headers = {
      ...this.defaultHeaders,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Referer: serviceUrl,
      ...options.headers ?? {}
    };
    const res = await this.fetchWithRetry(
      {
        url,
        method: "GET",
        headers,
        signal: options.signal
      },
      jar
    );
    if (res.status >= 500) {
      throw new CasError("UPSTREAM_ERROR", `UIS login service unavailable (status ${res.status})`, {
        status: res.status
      });
    }
    const finalUrl = res.url || url;
    let serviceWithClientId = serviceUrl;
    try {
      const parsed = new URL(finalUrl);
      serviceWithClientId = parsed.searchParams.get("service") ?? serviceUrl;
    } catch {
    }
    const casLoginUrl = resolveCasLoginUrl(this.uisBaseUrl, finalUrl, appCode);
    return {
      finalUrl,
      serviceWithClientId,
      casLoginUrl
    };
  }
  /**
   * Step 2: Posts credentials to /sso/doLogin.
   */
  async doLogin(credentials, refererUrl, options = {}) {
    const jar = options.cookieJar ?? this.defaultCookieJar;
    const url = `${this.uisBaseUrl}/center-auth-server/sso/doLogin`;
    const payload = JSON.stringify({
      loginType: credentials.loginType ?? "login",
      name: credentials.account,
      pwd: this.encryptPassword(credentials.password),
      universityId: credentials.universityId ?? "100005",
      verifyCode: credentials.verifyCode ?? null
    });
    const headers = {
      ...this.defaultHeaders,
      "Content-Type": "application/json, application/json;charset=UTF-8",
      Referer: refererUrl,
      ...options.headers ?? {}
    };
    const res = await this.executeRequest(
      {
        url,
        method: "POST",
        headers,
        body: payload,
        signal: options.signal
      },
      jar
    );
    if (res.status >= 500) {
      throw new CasError(
        "UPSTREAM_ERROR",
        `UIS doLogin service unavailable (status ${res.status})`,
        {
          status: res.status
        }
      );
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      try {
        const text = await res.text();
        data = JSON.parse(text);
      } catch {
        throw new CasError("UPSTREAM_ERROR", "Invalid response from UIS doLogin", {
          status: res.status
        });
      }
    }
    const code = Number(data?.["code"]);
    const rawMsg = data?.["msg"];
    const msg = typeof rawMsg === "string" ? rawMsg : void 0;
    if (res.status >= 400 || code !== 200) {
      const errMsg = msg ?? "campus credentials rejected";
      if (/验证码|captcha/i.test(errMsg)) {
        throw new CasError("CAPTCHA_REQUIRED", errMsg, {
          status: res.status,
          rawResponse: data
        });
      }
      throw new CasError("AUTH_FAILED", errMsg, {
        status: res.status,
        rawResponse: data
      });
    }
    return {
      code,
      msg,
      raw: data
    };
  }
  /**
   * Step 3: Follows CAS login with session to obtain the service ticket.
   */
  async acquireServiceTicket(casLoginUrl, serviceWithClientId, refererUrl, options = {}) {
    const jar = options.cookieJar ?? this.defaultCookieJar;
    const url = `${casLoginUrl}?service=${encodeURIComponent(serviceWithClientId)}`;
    const headers = {
      ...this.defaultHeaders,
      Referer: refererUrl,
      ...options.headers ?? {}
    };
    const res = await this.fetchWithRetry(
      {
        url,
        method: "GET",
        headers,
        redirect: "manual",
        signal: options.signal
      },
      jar
    );
    if (res.status >= 500) {
      throw new CasError(
        "UPSTREAM_ERROR",
        `UIS CAS login service unavailable (status ${res.status})`,
        {
          status: res.status
        }
      );
    }
    const location = getHeader(res.headers, "location");
    let ticket = null;
    if (res.status >= 300 && res.status < 400 && typeof location === "string") {
      try {
        ticket = new URL(location, casLoginUrl).searchParams.get("ticket");
      } catch {
      }
    }
    if (!ticket || !ticket.startsWith("ST-")) {
      throw new CasError("PROTOCOL_ERROR", "campus cas service ticket was not issued", {
        status: res.status,
        rawResponse: { location, status: res.status }
      });
    }
    assertServiceTicket(ticket);
    return ticket;
  }
  /**
   * Step 4: Validates service ticket against /cas/serviceValidate.
   */
  async validateServiceTicket(ticket, serviceUrl, options = {}) {
    const jar = options.cookieJar ?? this.defaultCookieJar;
    const url = `${this.uisBaseUrl}/center-auth-server/cas/serviceValidate?service=${encodeURIComponent(serviceUrl)}&ticket=${encodeURIComponent(ticket)}`;
    const headers = {
      ...this.defaultHeaders,
      Accept: "application/xml",
      ...options.headers ?? {}
    };
    const res = await this.executeRequest(
      {
        url,
        method: "GET",
        headers,
        redirect: "manual",
        signal: options.signal
      },
      jar
    );
    if (res.status >= 500) {
      throw new CasError(
        "UPSTREAM_ERROR",
        `UIS CAS serviceValidate unavailable (status ${res.status})`,
        {
          status: res.status
        }
      );
    }
    if (res.status !== 200) {
      throw new CasError("VALIDATION_FAILED", `CAS validation returned HTTP status ${res.status}`, {
        status: res.status
      });
    }
    const text = await res.text();
    return parseCasValidationResponse(text);
  }
  /**
   * High-level complete flow: fetches login page, executes doLogin, obtains ticket, and optionally validates ticket.
   */
  async login(options) {
    const jar = new MemoryCookieJar();
    const stepOpts = {
      applicationCode: options.applicationCode,
      cookieJar: jar,
      signal: options.signal
    };
    const pageResult = await this.fetchLoginPage(options.serviceUrl, stepOpts);
    await this.doLogin(
      {
        account: options.account,
        password: options.password
      },
      pageResult.finalUrl,
      stepOpts
    );
    const ticket = await this.acquireServiceTicket(
      pageResult.casLoginUrl,
      pageResult.serviceWithClientId,
      pageResult.finalUrl,
      stepOpts
    );
    let validation;
    if (options.validate) {
      validation = await this.validateServiceTicket(
        ticket,
        pageResult.serviceWithClientId,
        stepOpts
      );
    }
    return {
      ticket,
      serviceWithClientId: pageResult.serviceWithClientId,
      cookieJar: jar,
      ...validation ? { validation } : {}
    };
  }
  /**
   * Functional Result-based login flow. Does not throw on expected authentication or network errors.
   */
  async safeLogin(options) {
    try {
      const data = await this.login(options);
      return { ok: true, data };
    } catch (err) {
      if (err instanceof CasError) {
        return { ok: false, error: err };
      }
      const wrapped = new CasError(
        "NETWORK_ERROR",
        err instanceof Error ? err.message : "Unknown error during CAS login",
        { cause: err }
      );
      return { ok: false, error: wrapped };
    }
  }
  /**
   * Asynchronous resource disposal for `await using` statements.
   */
  async [Symbol.asyncDispose]() {
    this.defaultCookieJar.clear();
  }
  async executeRequest(req, jar) {
    const cookieHeader = jar.getCookieString(req.url);
    const headers = {
      ...req.headers ?? {}
    };
    if (cookieHeader) {
      headers["Cookie"] = cookieHeader;
    }
    try {
      const res = await this.fetcher({
        ...req,
        headers
      });
      const cookies = extractResponseCookies(res.headers);
      if (cookies.length > 0) {
        jar.setCookies(cookies, req.url);
      }
      return res;
    } catch (err) {
      if (err instanceof CasError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : "Network request failed";
      throw new CasError("NETWORK_ERROR", `Network error requesting ${req.url}: ${message}`, {
        cause: err
      });
    }
  }
  async fetchWithRetry(req, jar) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await this.executeRequest(req, jar);
        if (res.status < 500 || attempt === 2) {
          return res;
        }
      } catch (err) {
        if (attempt === 2) {
          throw err;
        }
        if (err instanceof CasError && err.kind === "NETWORK_ERROR") {
        } else {
          throw err;
        }
      }
      await sleep(250);
    }
    throw new CasError("UPSTREAM_ERROR", `Request failed after retries: ${req.url}`);
  }
};
function createCasClient(options) {
  return new CasClient(options);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CAS_NAMESPACE,
  CasClient,
  CasError,
  DEFAULT_APPLICATION_CODE,
  DEFAULT_CQUT_PUBLIC_KEY_PEM,
  DEFAULT_UIS_BASE_URL,
  MAX_CAS_VALIDATION_RESPONSE_BYTES,
  MemoryCookieJar,
  assertServiceTicket,
  base64ToBytes,
  bigIntToBytes,
  bytesToBase64,
  bytesToBigInt,
  createCasClient,
  defaultFetcher,
  encryptChunk,
  extractResponseCookies,
  getHeader,
  getSecretParam,
  isCasError,
  isCasErrorOfKind,
  isServiceTicket,
  modPow,
  normalizeBaseUrl,
  parseCasValidationResponse,
  parseRsaPublicKey,
  resolveCasLoginUrl,
  rsaEncryptPkcs1
});
//# sourceMappingURL=index.cjs.map