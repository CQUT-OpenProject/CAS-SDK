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
  CasClient: () => CasClient,
  CasError: () => CasError,
  MemoryCookieJar: () => MemoryCookieJar,
  assertServiceTicket: () => assertServiceTicket,
  createCasClient: () => createCasClient,
  defaultFetcher: () => defaultFetcher,
  isCasError: () => isCasError,
  isCasErrorOfKind: () => isCasErrorOfKind,
  isServiceTicket: () => isServiceTicket,
  parseCasValidationResponse: () => parseCasValidationResponse
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
      if (c.hostOnly ? c.domain !== hostname : !matchDomain(c.domain, hostname)) return false;
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
  const value2 = firstPart.slice(equalIdx + 1).trim();
  let domain = defaultHost.toLowerCase();
  let hostOnly = true;
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
      hostOnly = false;
      if (!matchDomain(domain, defaultHost)) return null;
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
    hostOnly,
    name,
    value: value2,
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
    return now >= cookie.createdAt + cookie.maxAge * 1e3;
  }
  if (cookie.expires !== void 0) {
    return now >= cookie.expires.getTime();
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

// src/errors/cas-error.ts
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

// src/crypto/rsa.ts
function parseRsaPublicKey(pemOrBase64) {
  const cleanBase64 = pemOrBase64.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
  try {
    const key = parseDerPublicKey(base64ToBytes(cleanBase64));
    if (key.keyLength < 12 || key.n <= 0n || key.e < 3n || key.e % 2n === 0n)
      throw new Error("Invalid RSA key");
    return key;
  } catch (cause) {
    throw new CasError("CRYPTO_ERROR", "Invalid RSA public key", { cause });
  }
}
function rsaEncryptPkcs1(data, key) {
  const messageBytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const k = key.keyLength;
  if (messageBytes.length > k - 11) {
    throw new CasError(
      "CRYPTO_ERROR",
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
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new CasError("CONFIGURATION_ERROR", "A secure Web Crypto random source is required");
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
  for (let i = 0; i < bytes.length; i++) {
    while (bytes[i] === 0) globalThis.crypto.getRandomValues(bytes.subarray(i, i + 1));
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
function bigIntToBytes(value2, length) {
  let hex = value2.toString(16);
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
  return Uint8Array.from(globalThis.atob(base64), (char) => char.charCodeAt(0));
}
function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
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
  if (eLen === 0 || pos + eLen !== der.length) throw new Error("Invalid DER exponent length");
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

// src/http/default-fetcher.ts
var defaultFetcher = async (request) => {
  if (typeof globalThis.fetch !== "function") {
    throw new CasError(
      "CONFIGURATION_ERROR",
      "globalThis.fetch is required; provide a server-side Fetcher"
    );
  }
  const init = {
    method: request.method ?? "GET",
    redirect: "manual"
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
  return globalThis.fetch(request.url, init);
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
  const key = Object.keys(rawHeaders).find((name) => name.toLowerCase() === "set-cookie");
  const setCookie = key ? rawHeaders[key] : void 0;
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

// src/http/response.ts
var MAX_RESPONSE_BYTES = 64 * 1024;
function abortError(signal, step) {
  return new CasError(
    signal.reason?.name === "TimeoutError" ? "TIMEOUT" : "ABORTED",
    `${step}: request cancelled`,
    { step, cause: signal.reason }
  );
}
function deadline(signal, timeoutMs = 3e4) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647) {
    throw new CasError("CONFIGURATION_ERROR", "timeoutMs must be a positive 32-bit integer");
  }
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
async function abortable(work, signal, step) {
  let onAbort = () => {
  };
  const cancelled = new Promise((_, reject) => {
    onAbort = () => reject(abortError(signal, step));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    return await Promise.race([work, cancelled]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
function discard(response) {
  void response.body?.cancel().catch(() => {
  });
}
async function readResponse(response, signal, step, kind) {
  if (signal.aborted) {
    discard(response);
    throw abortError(signal, step);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await abortable(reader.read(), signal, step);
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_RESPONSE_BYTES)
        throw new CasError(kind, `${step}: response exceeds 64 KiB`, {
          step,
          status: response.status
        });
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder().decode(bytes);
  } catch (cause) {
    void reader.cancel().catch(() => {
    });
    if (cause instanceof CasError) throw cause;
    throw new CasError("NETWORK_ERROR", `${step}: response read failed`, { step, cause });
  } finally {
    reader.releaseLock();
  }
}
async function retryDelay(signal) {
  let timer;
  try {
    await abortable(
      new Promise((resolve) => {
        timer = setTimeout(resolve, 250);
      }),
      signal,
      "fetchLoginPage"
    );
  } finally {
    clearTimeout(timer);
  }
}

// src/parser/xml.ts
function invalid() {
  throw new CasError("VALIDATION_FAILED", "Invalid or unsupported CAS XML structure");
}
var XML_NS = "http://www.w3.org/XML/1998/namespace";
var XMLNS_NS = "http://www.w3.org/2000/xmlns/";
var namePattern = /^[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?/;
function validChar(code) {
  return code === 9 || code === 10 || code === 13 || code >= 32 && code <= 55295 || code >= 57344 && code <= 65533 || code >= 65536 && code <= 1114111;
}
function decode(text) {
  let result = "";
  for (let i = 0; i < text.length; ) {
    if (text[i] !== "&") {
      result += text[i++];
      continue;
    }
    const end = text.indexOf(";", i);
    if (end < 0) invalid();
    const entity = text.slice(i + 1, end);
    const predefined = { amp: "&", lt: "<", gt: ">", apos: "'", quot: '"' };
    if (Object.hasOwn(predefined, entity)) result += predefined[entity];
    else {
      if (!/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(entity)) invalid();
      const code = entity.startsWith("#x") ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      if (!validChar(code)) invalid();
      result += String.fromCodePoint(code);
    }
    i = end + 1;
  }
  return result;
}
function parseXml(input) {
  const xml = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  for (const char of xml) if (!validChar(char.codePointAt(0))) invalid();
  let pos = 0;
  let root;
  const stack = [];
  const whitespace = () => {
    const start = pos;
    while (/[\t\n\r ]/.test(xml[pos] ?? "") && pos < xml.length) pos++;
    return pos > start;
  };
  const name = () => {
    const value2 = xml.slice(pos).match(namePattern)?.[0];
    if (!value2) invalid();
    pos += value2.length;
    return value2;
  };
  if (xml.startsWith("<?xml")) {
    const declaration = xml.match(
      /^<\?xml\s+version\s*=\s*(?:"1\.0"|'1\.0')(?:\s+encoding\s*=\s*(?:"[Uu][Tt][Ff]-8"|'[Uu][Tt][Ff]-8'))?(?:\s+standalone\s*=\s*(?:"(?:yes|no)"|'(?:yes|no)'))?\s*\?>/
    )?.[0];
    if (!declaration || !declaration.startsWith("<?xml")) invalid();
    pos = declaration.length;
  }
  while (pos < xml.length) {
    const parent = stack.at(-1);
    if (xml.startsWith("<!--", pos)) {
      const end = xml.indexOf("-->", pos + 4);
      const comment = xml.slice(pos + 4, end);
      if (end < 0 || comment.includes("--") || comment.endsWith("-")) invalid();
      pos = end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", pos)) {
      const end = xml.indexOf("]]>", pos + 9);
      if (!parent || end < 0) invalid();
      parent.node.text += xml.slice(pos + 9, end);
      pos = end + 3;
      continue;
    }
    if (xml.startsWith("</", pos)) {
      pos += 2;
      const closing = name();
      whitespace();
      if (xml[pos++] !== ">" || !parent || closing !== parent.qname) invalid();
      stack.pop();
      continue;
    }
    if (xml[pos] !== "<") {
      let end = xml.indexOf("<", pos);
      if (end < 0) end = xml.length;
      const raw = xml.slice(pos, end);
      if (raw.includes("]]>")) invalid();
      if (parent) parent.node.text += decode(raw);
      else if (!/^[\t\n\r ]*$/.test(raw)) invalid();
      pos = end;
      continue;
    }
    if (xml.startsWith("<!", pos) || xml.startsWith("<?", pos)) invalid();
    pos++;
    const qname = name();
    const attributes = /* @__PURE__ */ Object.create(null);
    let separated = whitespace();
    while (xml[pos] !== ">" && !xml.startsWith("/>", pos)) {
      if (!separated || pos >= xml.length) invalid();
      const key = name();
      whitespace();
      if (xml[pos++] !== "=") invalid();
      whitespace();
      const quote = xml[pos++];
      if (quote !== '"' && quote !== "'") invalid();
      const end = xml.indexOf(quote, pos);
      if (end < 0 || Object.hasOwn(attributes, key)) invalid();
      const raw = xml.slice(pos, end);
      if (raw.includes("<")) invalid();
      attributes[key] = decode(raw.replace(/[\t\n\r]/g, " "));
      pos = end + 1;
      separated = whitespace();
    }
    const namespaces = Object.assign(
      /* @__PURE__ */ Object.create(null),
      parent?.namespaces ?? { xml: XML_NS }
    );
    for (const [key, value2] of Object.entries(attributes)) {
      if (key === "xmlns") {
        if (value2 === XML_NS || value2 === XMLNS_NS) invalid();
        namespaces[""] = value2;
      } else if (key.startsWith("xmlns:")) {
        const prefix = key.slice(6);
        if (!value2 || prefix === "xmlns" || value2 === XMLNS_NS || (prefix === "xml" ? value2 !== XML_NS : value2 === XML_NS))
          invalid();
        namespaces[prefix] = value2;
      }
    }
    const expanded = (qualified, attribute = false) => {
      const parts = qualified.split(":");
      if (parts.length === 1) return [qualified, attribute ? "" : namespaces[""] ?? ""];
      const prefix = parts[0];
      const ns = namespaces[prefix];
      if (!ns || prefix === "xmlns") invalid();
      return [parts[1], ns];
    };
    const [localName, namespace] = expanded(qname);
    const seen = /* @__PURE__ */ new Set();
    for (const key of Object.keys(attributes)) {
      if (key === "xmlns" || key.startsWith("xmlns:")) continue;
      const [local, ns] = expanded(key, true);
      const id = `${ns}\0${local}`;
      if (seen.has(id)) invalid();
      seen.add(id);
    }
    const node = { name: localName, namespace, attributes, children: [], text: "" };
    if (parent) parent.node.children.push(node);
    else {
      if (root) invalid();
      root = node;
    }
    if (xml.startsWith("/>", pos)) pos += 2;
    else {
      pos++;
      stack.push({ node, qname, namespaces });
    }
  }
  if (!root || stack.length) invalid();
  return root;
}

// src/parser/cas-xml.ts
var CAS_NAMESPACE = "http://www.yale.edu/tp/cas";
var MAX_CAS_VALIDATION_RESPONSE_BYTES = 64 * 1024;
function fail(message) {
  throw new CasError("VALIDATION_FAILED", message);
}
function children(node, name) {
  return node.children.filter((child) => child.namespace === CAS_NAMESPACE && child.name === name);
}
function single(node, name) {
  const matches = children(node, name);
  if (matches.length > 1) fail(`CAS validation contains multiple ${name} elements`);
  return matches[0];
}
function value(node) {
  if (node.children.length) fail("CAS scalar field contains nested elements");
  return node.text.trim();
}
function parseCasValidationResponse(xml) {
  if (!xml || typeof xml !== "string") fail("CAS validation response is empty or non-string");
  if (new TextEncoder().encode(xml).length > MAX_CAS_VALIDATION_RESPONSE_BYTES)
    fail("CAS validation response exceeds maximum allowed size (64KB)");
  const root = parseXml(xml);
  if (root.name !== "serviceResponse" || root.namespace !== CAS_NAMESPACE || root.text.trim())
    fail("Invalid CAS serviceResponse root");
  const results = root.children.filter(
    (child) => child.namespace === CAS_NAMESPACE && ["authenticationSuccess", "authenticationFailure"].includes(child.name)
  );
  if (results.length !== 1 || root.children.length !== 1)
    fail("CAS response must contain exactly one authentication result");
  const result = results[0];
  if (result.name === "authenticationFailure") fail("CAS ticket validation failed");
  if (result.text.trim()) fail("Invalid CAS authenticationSuccess content");
  const userNode = single(result, "user");
  const user = userNode ? value(userNode) : "";
  if (!user) fail("CAS validation response missing or empty user");
  const uidNode = single(result, "uid");
  const uid = uidNode ? value(uidNode) : void 0;
  if (uid !== void 0 && uid !== user)
    fail("CAS validation response contains conflicting user and uid identifiers");
  const attributes = /* @__PURE__ */ Object.create(null);
  const block = single(result, "attributes");
  if (block) {
    if (block.text.trim()) fail("Invalid CAS attributes content");
    for (const child of block.children) {
      if (child.namespace !== CAS_NAMESPACE) continue;
      if (Object.hasOwn(attributes, child.name))
        fail("CAS validation contains duplicate attributes");
      attributes[child.name] = value(child);
    }
  }
  const userCode = attributes["user_code"];
  if (userCode !== void 0 && userCode !== user)
    fail("CAS validation response contains conflicting user and user_code identifiers");
  const token = single(result, "authServerToken");
  return {
    success: true,
    user,
    uid,
    userCode,
    userName: attributes["user_name"],
    userType: attributes["user_user_type"],
    authServerToken: token ? value(token) : void 0,
    attributes
  };
}

// src/client/endpoints.ts
var DEFAULT_UIS_BASE_URL = "https://uis.cqut.edu.cn";
var DEFAULT_APPLICATION_CODE = "officeHallApplicationCode";
function normalizeBaseUrl(value2) {
  return value2.replace(/\/+$/, "");
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
function isServiceTicket(value2) {
  return typeof value2 === "string" && value2.startsWith("ST-") && value2.length > 3;
}
function assertServiceTicket(value2) {
  if (!isServiceTicket(value2)) {
    throw new TypeError("Value is not a valid CAS ServiceTicket");
  }
}

// src/client/cas-client.ts
var REDIRECTS = /* @__PURE__ */ new Set([301, 302, 303, 307, 308]);
var DEFAULT_HEADERS = { "User-Agent": "CQUT-Auth-Service/2.0", "Accept-Language": "zh-CN" };
var CasClient = class {
  uisBaseUrl;
  applicationCode;
  fetcher;
  cookieJarFactory;
  publicKey;
  headers;
  constructor(options = {}) {
    this.uisBaseUrl = normalizeBaseUrl(options.uisBaseUrl ?? DEFAULT_UIS_BASE_URL);
    try {
      const url = new URL(this.uisBaseUrl);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported protocol");
    } catch (cause) {
      throw new CasError("CONFIGURATION_ERROR", "Invalid UIS base URL", { cause });
    }
    this.applicationCode = options.applicationCode ?? DEFAULT_APPLICATION_CODE;
    this.fetcher = options.fetcher ?? defaultFetcher;
    this.cookieJarFactory = options.cookieJarFactory ?? (() => new MemoryCookieJar());
    this.publicKey = options.publicKey;
    this.headers = { ...DEFAULT_HEADERS, ...options.defaultHeaders };
  }
  async fetchLoginPage(serviceUrl, options) {
    const step = "fetchLoginPage";
    const signal = deadline(options.signal, options.timeoutMs);
    const appCode = options.applicationCode ?? this.applicationCode;
    let url = `${this.uisBaseUrl}/center-auth-server/${encodeURIComponent(appCode)}/cas/login?service=${encodeURIComponent(serviceUrl)}&applicationCode=${encodeURIComponent(appCode)}`;
    const headers = {
      ...this.headers,
      Accept: "text/html,application/xml",
      Referer: serviceUrl,
      ...options.headers
    };
    let serviceWithClientId = serviceUrl;
    for (let redirects = 0; ; redirects++) {
      let res;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          res = await this.request(
            { url, headers, method: "GET", signal, redirect: "manual" },
            options.cookieJar,
            step
          );
          if (res.status < 500 || attempt === 1) break;
          discard(res);
        } catch (error) {
          if (attempt === 1 || !(error instanceof CasError) || error.kind !== "NETWORK_ERROR")
            throw error;
        }
        await retryDelay(signal);
      }
      if (!res) throw new CasError("NETWORK_ERROR", "fetchLoginPage: request failed", { step });
      discard(res);
      this.checkUpstream(res, step);
      const finalUrl = res.url || url;
      serviceWithClientId = new URL(finalUrl).searchParams.get("service") ?? serviceWithClientId;
      if (!REDIRECTS.has(res.status)) {
        if (res.status !== 200)
          throw new CasError("PROTOCOL_ERROR", "fetchLoginPage: unexpected HTTP status", {
            step,
            status: res.status
          });
        return {
          finalUrl,
          serviceWithClientId,
          casLoginUrl: resolveCasLoginUrl(this.uisBaseUrl, finalUrl, appCode)
        };
      }
      if (redirects === 5)
        throw new CasError("PROTOCOL_ERROR", "fetchLoginPage: too many redirects", { step });
      const location = getHeader(res.headers, "location");
      let next;
      try {
        if (!location) throw new Error("Missing Location");
        next = new URL(location, finalUrl);
        if (!["http:", "https:"].includes(next.protocol))
          throw new Error("Unsupported redirect protocol");
      } catch (cause) {
        throw new CasError("PROTOCOL_ERROR", "fetchLoginPage: invalid redirect", { step, cause });
      }
      if (next.origin !== new URL(finalUrl).origin) {
        for (const key of Object.keys(headers))
          if (["cookie", "authorization"].includes(key.toLowerCase()))
            delete headers[key];
      }
      url = next.href;
    }
  }
  async doLogin(credentials, refererUrl, options) {
    const step = "doLogin";
    const signal = deadline(options.signal, options.timeoutMs);
    const body = JSON.stringify({
      loginType: credentials.loginType ?? "login",
      name: credentials.account,
      pwd: getSecretParam(credentials.password, this.publicKey),
      universityId: credentials.universityId ?? "100005",
      verifyCode: credentials.verifyCode ?? null
    });
    const res = await this.request(
      {
        url: `${this.uisBaseUrl}/center-auth-server/sso/doLogin`,
        method: "POST",
        headers: {
          ...this.headers,
          "Content-Type": "application/json;charset=UTF-8",
          Referer: refererUrl,
          ...options.headers
        },
        body,
        signal,
        redirect: "manual"
      },
      options.cookieJar,
      step
    );
    this.checkUpstream(res, step);
    const text = await readResponse(res, signal, step, "PROTOCOL_ERROR");
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new CasError("PROTOCOL_ERROR", "doLogin: invalid JSON response", {
        step,
        status: res.status
      });
    }
    if (!data || typeof data !== "object" || !("code" in data) || !["number", "string"].includes(typeof data.code) || !Number.isFinite(Number(data.code)))
      throw new CasError("PROTOCOL_ERROR", "doLogin: missing response code", {
        step,
        status: res.status
      });
    if (res.status >= 300 && res.status < 400)
      throw new CasError("PROTOCOL_ERROR", "doLogin: unexpected redirect", {
        step,
        status: res.status
      });
    if (res.status >= 400 || Number(data.code) !== 200) {
      const captcha = "msg" in data && typeof data.msg === "string" && /验证码|captcha/i.test(data.msg);
      throw new CasError(
        captcha ? "CAPTCHA_REQUIRED" : "AUTH_FAILED",
        captcha ? "Captcha required" : "Campus credentials rejected",
        { step, status: res.status }
      );
    }
    return { code: 200 };
  }
  async acquireServiceTicket(casLoginUrl, serviceWithClientId, refererUrl, options) {
    const step = "acquireServiceTicket";
    const signal = deadline(options.signal, options.timeoutMs);
    const url = new URL(casLoginUrl);
    url.searchParams.set("service", serviceWithClientId);
    const res = await this.request(
      {
        url: url.href,
        method: "GET",
        headers: { ...this.headers, Referer: refererUrl, ...options.headers },
        redirect: "manual",
        signal
      },
      options.cookieJar,
      step
    );
    discard(res);
    this.checkUpstream(res, step);
    const location = getHeader(res.headers, "location");
    let ticket = null;
    if (REDIRECTS.has(res.status) && location) {
      try {
        ticket = new URL(location, casLoginUrl).searchParams.get("ticket");
      } catch {
      }
    }
    if (!isServiceTicket(ticket))
      throw new CasError("PROTOCOL_ERROR", "acquireServiceTicket: ticket was not issued", {
        step,
        status: res.status
      });
    return ticket;
  }
  async validateServiceTicket(ticket, serviceUrl, options = {}) {
    const step = "validateServiceTicket";
    const signal = deadline(options.signal, options.timeoutMs);
    const res = await this.request(
      {
        url: `${this.uisBaseUrl}/center-auth-server/cas/serviceValidate?service=${encodeURIComponent(serviceUrl)}&ticket=${encodeURIComponent(ticket)}`,
        method: "GET",
        headers: { ...this.headers, Accept: "application/xml", ...options.headers },
        redirect: "manual",
        signal
      },
      options.cookieJar,
      step
    );
    this.checkUpstream(res, step);
    if (res.status !== 200) {
      discard(res);
      throw new CasError("VALIDATION_FAILED", "validateServiceTicket: unexpected HTTP status", {
        step,
        status: res.status
      });
    }
    return parseCasValidationResponse(await readResponse(res, signal, step, "VALIDATION_FAILED"));
  }
  async login(options) {
    const signal = deadline(options.signal, options.timeoutMs);
    const jar = this.cookieJarFactory();
    const steps = {
      cookieJar: jar,
      signal,
      timeoutMs: options.timeoutMs,
      applicationCode: options.applicationCode
    };
    try {
      const page = await this.fetchLoginPage(options.serviceUrl, steps);
      await this.doLogin(options, page.finalUrl, steps);
      const ticket = await this.acquireServiceTicket(
        page.casLoginUrl,
        page.serviceWithClientId,
        page.finalUrl,
        steps
      );
      let disposed = false;
      const dispose = () => {
        if (!disposed) {
          disposed = true;
          jar.clear();
        }
      };
      const session = {
        serviceWithClientId: page.serviceWithClientId,
        cookieJar: jar,
        dispose,
        [Symbol.dispose]: dispose
      };
      if (options.validate)
        return {
          ...session,
          kind: "validated",
          validation: await this.validateServiceTicket(ticket, page.serviceWithClientId, steps)
        };
      return { ...session, kind: "ticket", ticket };
    } catch (error) {
      jar.clear();
      throw error;
    }
  }
  async safeLogin(options) {
    try {
      return { ok: true, data: await this.login(options) };
    } catch (error) {
      if (error instanceof CasError) return { ok: false, error };
      throw error;
    }
  }
  checkUpstream(res, step) {
    if (res.status >= 500) {
      discard(res);
      throw new CasError("UPSTREAM_ERROR", `${step}: UIS service unavailable`, {
        step,
        status: res.status
      });
    }
  }
  async request(req, jar, step) {
    if (req.signal.aborted) throw abortError(req.signal, step);
    const headers = { ...req.headers };
    const cookie = jar?.getCookieString(req.url);
    if (cookie) {
      for (const key of Object.keys(headers))
        if (key.toLowerCase() === "cookie") delete headers[key];
      headers.Cookie = cookie;
    }
    let res;
    try {
      const pending = this.fetcher({ ...req, headers }).then((response) => {
        if (req.signal.aborted) {
          discard(response);
          throw abortError(req.signal, step);
        }
        return response;
      });
      res = await abortable(pending, req.signal, step);
    } catch (cause) {
      if (req.signal.aborted) throw abortError(req.signal, step);
      if (cause instanceof CasError) throw cause;
      throw new CasError("NETWORK_ERROR", `${step}: request failed`, { step, cause });
    }
    jar?.setCookies(extractResponseCookies(res.headers), res.url || req.url);
    return res;
  }
};
function createCasClient(options) {
  return new CasClient(options);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CasClient,
  CasError,
  MemoryCookieJar,
  assertServiceTicket,
  createCasClient,
  defaultFetcher,
  isCasError,
  isCasErrorOfKind,
  isServiceTicket,
  parseCasValidationResponse
});
//# sourceMappingURL=index.cjs.map