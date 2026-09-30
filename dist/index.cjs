Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const require_encryptor = require("./encryptor-CJKb8T6t.cjs");
//#region src/polyfill.ts
if (typeof Symbol.dispose !== "symbol") Object.defineProperty(Symbol, "dispose", {
	value: Symbol("Symbol.dispose"),
	configurable: true,
	writable: false,
	enumerable: false
});
if (typeof Symbol.asyncDispose !== "symbol") Object.defineProperty(Symbol, "asyncDispose", {
	value: Symbol("Symbol.asyncDispose"),
	configurable: true,
	writable: false,
	enumerable: false
});
//#endregion
//#region src/cookie/cookie-jar.ts
/**
* Lightweight, zero-dependency in-memory Cookie Jar for server-side authentication sessions.
* Implements Disposable for explicit resource cleanup via `using jar = new MemoryCookieJar()`.
*/
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
		this.cookies = this.cookies.filter((c) => !(c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path));
		if (isExpired(cookie)) return;
		this.cookies.push(cookie);
	}
	setCookies(rawCookies, currentUrl) {
		for (const raw of rawCookies) this.setCookie(raw, currentUrl);
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
		return this.getCookies(currentUrl).map((c) => `${c.name}=${c.value}`).join("; ");
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
	let hostOnly = true;
	let path = defaultPath.startsWith("/") ? defaultPath : "/";
	const lastSlash = path.lastIndexOf("/");
	if (lastSlash > 0) path = path.slice(0, lastSlash);
	else if (lastSlash === 0 && path !== "/") path = "/";
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
		} else if (key === "path" && val) path = val;
		else if (key === "expires" && val) {
			const parsed = new Date(val);
			if (!isNaN(parsed.getTime())) expires = parsed;
		} else if (key === "max-age" && val) {
			const parsed = parseInt(val, 10);
			if (!isNaN(parsed)) maxAge = parsed;
		} else if (key === "secure") secure = true;
		else if (key === "httponly") httpOnly = true;
	}
	return {
		hostOnly,
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
		return now >= cookie.createdAt + cookie.maxAge * 1e3;
	}
	if (cookie.expires !== void 0) return now >= cookie.expires.getTime();
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
//#endregion
//#region src/http/default-fetcher.ts
/**
* Default Fetcher implementation using globalThis.fetch.
*/
const defaultFetcher = async (request) => {
	if (typeof globalThis.fetch !== "function") throw new require_encryptor.CasError("CONFIGURATION_ERROR", "globalThis.fetch is required; provide a server-side Fetcher");
	const init = {
		method: request.method ?? "GET",
		redirect: "manual"
	};
	if (request.headers !== void 0) init.headers = request.headers;
	if (request.body !== void 0) init.body = request.body;
	if (request.signal !== void 0) init.signal = request.signal;
	return globalThis.fetch(request.url, init);
};
/**
* Extracts all Set-Cookie header strings from Response headers.
* Supports Fetch API Headers (including headers.getSetCookie()), Node http incoming headers, and plain objects.
*/
function extractResponseCookies(headers) {
	if (!headers) return [];
	if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
	if (typeof headers.get === "function") {
		const raw = headers.get("set-cookie");
		return raw ? [raw] : [];
	}
	const rawHeaders = headers;
	const key = Object.keys(rawHeaders).find((name) => name.toLowerCase() === "set-cookie");
	const setCookie = key ? rawHeaders[key] : void 0;
	if (Array.isArray(setCookie)) return setCookie.filter((v) => typeof v === "string");
	if (typeof setCookie === "string") return [setCookie];
	return [];
}
/**
* Case-insensitively gets a single header value from HttpResponse headers.
*/
function getHeader(headers, name) {
	if (!headers) return void 0;
	if (typeof headers.get === "function") return headers.get(name) ?? void 0;
	const rawHeaders = headers;
	const targetLower = name.toLowerCase();
	for (const key of Object.keys(rawHeaders)) if (key.toLowerCase() === targetLower) {
		const val = rawHeaders[key];
		if (Array.isArray(val)) return val[0];
		return val;
	}
}
function abortError(signal, step) {
	return new require_encryptor.CasError(signal.reason?.name === "TimeoutError" ? "TIMEOUT" : "ABORTED", `${step}: request cancelled`, {
		step,
		cause: signal.reason
	});
}
function deadline(signal, timeoutMs = 3e4) {
	if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647) throw new require_encryptor.CasError("CONFIGURATION_ERROR", "timeoutMs must be a positive 32-bit integer");
	const timeout = AbortSignal.timeout(timeoutMs);
	return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
/** Also bounds custom adapters that cannot promptly cancel their own work. */
async function abortable(work, signal, step) {
	let onAbort = () => {};
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
	response.body?.cancel().catch(() => {});
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
			if (size > 65536) throw new require_encryptor.CasError(kind, `${step}: response exceeds 64 KiB`, {
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
		reader.cancel().catch(() => {});
		if (cause instanceof require_encryptor.CasError) throw cause;
		throw new require_encryptor.CasError("NETWORK_ERROR", `${step}: response read failed`, {
			step,
			cause
		});
	} finally {
		reader.releaseLock();
	}
}
async function retryDelay(signal) {
	let timer;
	try {
		await abortable(new Promise((resolve) => {
			timer = setTimeout(resolve, 250);
		}), signal, "fetchLoginPage");
	} finally {
		clearTimeout(timer);
	}
}
//#endregion
//#region src/parser/xml.ts
function invalid() {
	throw new require_encryptor.CasError("VALIDATION_FAILED", "Invalid or unsupported CAS XML structure");
}
const XML_NS = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";
const namePattern = /^[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?/;
function validChar(code) {
	return code === 9 || code === 10 || code === 13 || code >= 32 && code <= 55295 || code >= 57344 && code <= 65533 || code >= 65536 && code <= 1114111;
}
function decode(text) {
	let result = "";
	for (let i = 0; i < text.length;) {
		if (text[i] !== "&") {
			result += text[i++];
			continue;
		}
		const end = text.indexOf(";", i);
		if (end < 0) invalid();
		const entity = text.slice(i + 1, end);
		const predefined = {
			amp: "&",
			lt: "<",
			gt: ">",
			apos: "'",
			quot: "\""
		};
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
/** Deliberately limited XML 1.0 subset for CAS; no DTDs or external entity resolution. */
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
		const value = xml.slice(pos).match(namePattern)?.[0];
		if (!value) invalid();
		pos += value.length;
		return value;
	};
	if (xml.startsWith("<?xml")) {
		const declaration = xml.match(/^<\?xml\s+version\s*=\s*(?:"1\.0"|'1\.0')(?:\s+encoding\s*=\s*(?:"[Uu][Tt][Ff]-8"|'[Uu][Tt][Ff]-8'))?(?:\s+standalone\s*=\s*(?:"(?:yes|no)"|'(?:yes|no)'))?\s*\?>/)?.[0];
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
		const attributes = Object.create(null);
		let separated = whitespace();
		while (xml[pos] !== ">" && !xml.startsWith("/>", pos)) {
			if (!separated || pos >= xml.length) invalid();
			const key = name();
			whitespace();
			if (xml[pos++] !== "=") invalid();
			whitespace();
			const quote = xml[pos++];
			if (quote !== "\"" && quote !== "'") invalid();
			const end = xml.indexOf(quote, pos);
			if (end < 0 || Object.hasOwn(attributes, key)) invalid();
			const raw = xml.slice(pos, end);
			if (raw.includes("<")) invalid();
			attributes[key] = decode(raw.replace(/[\t\n\r]/g, " "));
			pos = end + 1;
			separated = whitespace();
		}
		const namespaces = Object.assign(Object.create(null), parent?.namespaces ?? { xml: XML_NS });
		for (const [key, value] of Object.entries(attributes)) if (key === "xmlns") {
			if (value === XML_NS || value === XMLNS_NS) invalid();
			namespaces[""] = value;
		} else if (key.startsWith("xmlns:")) {
			const prefix = key.slice(6);
			if (!value || prefix === "xmlns" || value === XMLNS_NS || (prefix === "xml" ? value !== XML_NS : value === XML_NS)) invalid();
			namespaces[prefix] = value;
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
		const node = {
			name: localName,
			namespace,
			attributes,
			children: [],
			text: ""
		};
		if (parent) parent.node.children.push(node);
		else {
			if (root) invalid();
			root = node;
		}
		if (xml.startsWith("/>", pos)) pos += 2;
		else {
			pos++;
			stack.push({
				node,
				qname,
				namespaces
			});
		}
	}
	if (!root || stack.length) invalid();
	return root;
}
function fail(message) {
	throw new require_encryptor.CasError("VALIDATION_FAILED", message);
}
function children(node, name) {
	return node.children.filter((child) => child.namespace === "http://www.yale.edu/tp/cas" && child.name === name);
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
	if (new TextEncoder().encode(xml).length > 65536) fail("CAS validation response exceeds maximum allowed size (64KB)");
	const root = parseXml(xml);
	if (root.name !== "serviceResponse" || root.namespace !== "http://www.yale.edu/tp/cas" || root.text.trim()) fail("Invalid CAS serviceResponse root");
	const results = root.children.filter((child) => child.namespace === "http://www.yale.edu/tp/cas" && ["authenticationSuccess", "authenticationFailure"].includes(child.name));
	if (results.length !== 1 || root.children.length !== 1) fail("CAS response must contain exactly one authentication result");
	const result = results[0];
	if (result.name === "authenticationFailure") fail("CAS ticket validation failed");
	if (result.text.trim()) fail("Invalid CAS authenticationSuccess content");
	const userNode = single(result, "user");
	const user = userNode ? value(userNode) : "";
	if (!user) fail("CAS validation response missing or empty user");
	const uidNode = single(result, "uid");
	const uid = uidNode ? value(uidNode) : void 0;
	if (uid !== void 0 && uid !== user) fail("CAS validation response contains conflicting user and uid identifiers");
	const attributes = Object.create(null);
	const block = single(result, "attributes");
	if (block) {
		if (block.text.trim()) fail("Invalid CAS attributes content");
		for (const child of block.children) {
			if (child.namespace !== "http://www.yale.edu/tp/cas") continue;
			if (Object.hasOwn(attributes, child.name)) fail("CAS validation contains duplicate attributes");
			attributes[child.name] = value(child);
		}
	}
	const userCode = attributes["user_code"];
	if (userCode !== void 0 && userCode !== user) fail("CAS validation response contains conflicting user and user_code identifiers");
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
function normalizeBaseUrl(value) {
	return value.replace(/\/+$/, "");
}
function resolveCasLoginUrl(uisBaseUrl, finalUrl, fallbackApplicationCode) {
	try {
		const match = new URL(finalUrl).pathname.match(/^\/center-auth-server\/([^/]+)\/cas\/login$/);
		if (match?.[1]) return `${uisBaseUrl}/center-auth-server/${match[1]}/cas/login`;
	} catch {}
	return `${uisBaseUrl}/center-auth-server/${fallbackApplicationCode}/cas/login`;
}
//#endregion
//#region src/client/types.ts
/**
* Checks if a given value is a valid CAS Service Ticket string format.
*/
function isServiceTicket(value) {
	return typeof value === "string" && value.startsWith("ST-") && value.length > 3;
}
/**
* Asserts that a value is a valid CAS Service Ticket.
*/
function assertServiceTicket(value) {
	if (!isServiceTicket(value)) throw new TypeError("Value is not a valid CAS ServiceTicket");
}
//#endregion
//#region src/client/cas-client.ts
const REDIRECTS = /* @__PURE__ */ new Set([
	301,
	302,
	303,
	307,
	308
]);
const DEFAULT_HEADERS = {
	"User-Agent": "CQUT-Auth-Service/2.0",
	"Accept-Language": "zh-CN"
};
/** Configuration only; each login result owns its session. */
var CasClient = class {
	uisBaseUrl;
	applicationCode;
	fetcher;
	cookieJarFactory;
	publicKey;
	headers;
	constructor(options = {}) {
		this.uisBaseUrl = normalizeBaseUrl(options.uisBaseUrl ?? "https://uis.cqut.edu.cn");
		try {
			const url = new URL(this.uisBaseUrl);
			if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported protocol");
		} catch (cause) {
			throw new require_encryptor.CasError("CONFIGURATION_ERROR", "Invalid UIS base URL", { cause });
		}
		this.applicationCode = options.applicationCode ?? "officeHallApplicationCode";
		this.fetcher = options.fetcher ?? defaultFetcher;
		this.cookieJarFactory = options.cookieJarFactory ?? (() => new MemoryCookieJar());
		this.publicKey = options.publicKey;
		this.headers = {
			...DEFAULT_HEADERS,
			...options.defaultHeaders
		};
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
		for (let redirects = 0;; redirects++) {
			let res;
			for (let attempt = 0; attempt < 2; attempt++) {
				try {
					res = await this.request({
						url,
						headers,
						method: "GET",
						signal,
						redirect: "manual"
					}, options.cookieJar, step);
					if (res.status < 500 || attempt === 1) break;
					discard(res);
				} catch (error) {
					if (attempt === 1 || !(error instanceof require_encryptor.CasError) || error.kind !== "NETWORK_ERROR") throw error;
				}
				await retryDelay(signal);
			}
			if (!res) throw new require_encryptor.CasError("NETWORK_ERROR", "fetchLoginPage: request failed", { step });
			discard(res);
			this.checkUpstream(res, step);
			const finalUrl = res.url || url;
			serviceWithClientId = new URL(finalUrl).searchParams.get("service") ?? serviceWithClientId;
			if (!REDIRECTS.has(res.status)) {
				if (res.status !== 200) throw new require_encryptor.CasError("PROTOCOL_ERROR", "fetchLoginPage: unexpected HTTP status", {
					step,
					status: res.status
				});
				return {
					finalUrl,
					serviceWithClientId,
					casLoginUrl: resolveCasLoginUrl(this.uisBaseUrl, finalUrl, appCode)
				};
			}
			if (redirects === 5) throw new require_encryptor.CasError("PROTOCOL_ERROR", "fetchLoginPage: too many redirects", { step });
			const location = getHeader(res.headers, "location");
			let next;
			try {
				if (!location) throw new Error("Missing Location");
				next = new URL(location, finalUrl);
				if (!["http:", "https:"].includes(next.protocol)) throw new Error("Unsupported redirect protocol");
			} catch (cause) {
				throw new require_encryptor.CasError("PROTOCOL_ERROR", "fetchLoginPage: invalid redirect", {
					step,
					cause
				});
			}
			if (next.origin !== new URL(finalUrl).origin) {
				for (const key of Object.keys(headers)) if (["cookie", "authorization"].includes(key.toLowerCase())) delete headers[key];
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
			pwd: require_encryptor.getSecretParam(credentials.password, this.publicKey),
			universityId: credentials.universityId ?? "100005",
			verifyCode: credentials.verifyCode ?? null
		});
		const res = await this.request({
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
		}, options.cookieJar, step);
		this.checkUpstream(res, step);
		const text = await readResponse(res, signal, step, "PROTOCOL_ERROR");
		let data;
		try {
			data = JSON.parse(text);
		} catch {
			throw new require_encryptor.CasError("PROTOCOL_ERROR", "doLogin: invalid JSON response", {
				step,
				status: res.status
			});
		}
		if (!data || typeof data !== "object" || !("code" in data) || !["number", "string"].includes(typeof data.code) || !Number.isFinite(Number(data.code))) throw new require_encryptor.CasError("PROTOCOL_ERROR", "doLogin: missing response code", {
			step,
			status: res.status
		});
		if (res.status >= 300 && res.status < 400) throw new require_encryptor.CasError("PROTOCOL_ERROR", "doLogin: unexpected redirect", {
			step,
			status: res.status
		});
		if (res.status >= 400 || Number(data.code) !== 200) {
			const captcha = "msg" in data && typeof data.msg === "string" && /验证码|captcha/i.test(data.msg);
			throw new require_encryptor.CasError(captcha ? "CAPTCHA_REQUIRED" : "AUTH_FAILED", captcha ? "Captcha required" : "Campus credentials rejected", {
				step,
				status: res.status
			});
		}
		return { code: 200 };
	}
	async acquireServiceTicket(casLoginUrl, serviceWithClientId, refererUrl, options) {
		const step = "acquireServiceTicket";
		const signal = deadline(options.signal, options.timeoutMs);
		const url = new URL(casLoginUrl);
		url.searchParams.set("service", serviceWithClientId);
		const res = await this.request({
			url: url.href,
			method: "GET",
			headers: {
				...this.headers,
				Referer: refererUrl,
				...options.headers
			},
			redirect: "manual",
			signal
		}, options.cookieJar, step);
		discard(res);
		this.checkUpstream(res, step);
		const location = getHeader(res.headers, "location");
		let ticket = null;
		if (REDIRECTS.has(res.status) && location) try {
			ticket = new URL(location, casLoginUrl).searchParams.get("ticket");
		} catch {}
		if (!isServiceTicket(ticket)) throw new require_encryptor.CasError("PROTOCOL_ERROR", "acquireServiceTicket: ticket was not issued", {
			step,
			status: res.status
		});
		return ticket;
	}
	async validateServiceTicket(ticket, serviceUrl, options = {}) {
		const step = "validateServiceTicket";
		const signal = deadline(options.signal, options.timeoutMs);
		const res = await this.request({
			url: `${this.uisBaseUrl}/center-auth-server/cas/serviceValidate?service=${encodeURIComponent(serviceUrl)}&ticket=${encodeURIComponent(ticket)}`,
			method: "GET",
			headers: {
				...this.headers,
				Accept: "application/xml",
				...options.headers
			},
			redirect: "manual",
			signal
		}, options.cookieJar, step);
		this.checkUpstream(res, step);
		if (res.status !== 200) {
			discard(res);
			throw new require_encryptor.CasError("VALIDATION_FAILED", "validateServiceTicket: unexpected HTTP status", {
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
			const ticket = await this.acquireServiceTicket(page.casLoginUrl, page.serviceWithClientId, page.finalUrl, steps);
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
			if (options.validate) return {
				...session,
				kind: "validated",
				validation: await this.validateServiceTicket(ticket, page.serviceWithClientId, steps)
			};
			return {
				...session,
				kind: "ticket",
				ticket
			};
		} catch (error) {
			jar.clear();
			throw error;
		}
	}
	async safeLogin(options) {
		try {
			return {
				ok: true,
				data: await this.login(options)
			};
		} catch (error) {
			if (error instanceof require_encryptor.CasError) return {
				ok: false,
				error
			};
			throw error;
		}
	}
	checkUpstream(res, step) {
		if (res.status >= 500) {
			discard(res);
			throw new require_encryptor.CasError("UPSTREAM_ERROR", `${step}: UIS service unavailable`, {
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
			for (const key of Object.keys(headers)) if (key.toLowerCase() === "cookie") delete headers[key];
			headers.Cookie = cookie;
		}
		let res;
		try {
			res = await abortable(this.fetcher({
				...req,
				headers
			}).then((response) => {
				if (req.signal.aborted) {
					discard(response);
					throw abortError(req.signal, step);
				}
				return response;
			}), req.signal, step);
		} catch (cause) {
			if (req.signal.aborted) throw abortError(req.signal, step);
			if (cause instanceof require_encryptor.CasError) throw cause;
			throw new require_encryptor.CasError("NETWORK_ERROR", `${step}: request failed`, {
				step,
				cause
			});
		}
		jar?.setCookies(extractResponseCookies(res.headers), res.url || req.url);
		return res;
	}
};
function createCasClient(options) {
	return new CasClient(options);
}
//#endregion
exports.CasClient = CasClient;
exports.CasError = require_encryptor.CasError;
exports.MemoryCookieJar = MemoryCookieJar;
exports.assertServiceTicket = assertServiceTicket;
exports.createCasClient = createCasClient;
exports.defaultFetcher = defaultFetcher;
exports.isCasError = require_encryptor.isCasError;
exports.isCasErrorOfKind = require_encryptor.isCasErrorOfKind;
exports.isServiceTicket = isServiceTicket;
exports.parseCasValidationResponse = parseCasValidationResponse;

//# sourceMappingURL=index.cjs.map