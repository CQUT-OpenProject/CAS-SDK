import { t as CasClient } from "../cas-client-DjY5FF_6.js";
import { o as CasError } from "../encryptor-BVjJ_XEB.js";
// src/identity/errors.ts
const RETRYABLE = /* @__PURE__ */ new Set([
	"rate_limited",
	"upstream_unavailable",
	"protocol_error"
]);
const MESSAGES = {
	invalid_input: "Missing or oversized account or password",
	invalid_credentials: "Campus credentials rejected",
	captcha_required: "Campus login requires a captcha",
	identity_mismatch: "Campus identity does not match requested account",
	rate_limited: "Too many verification attempts",
	upstream_unavailable: "Campus authentication service unavailable",
	protocol_error: "Unexpected campus authentication response",
	aborted: "Verification cancelled"
};
const DESCRIPTIONS = {
	invalid_input: "请输入账号和密码",
	invalid_credentials: "账号或密码错误",
	captcha_required: "学校认证要求验证码，请先在统一身份认证页面登录一次后重试",
	identity_mismatch: "身份校验失败",
	rate_limited: "尝试次数过多，请稍后再试",
	upstream_unavailable: "学校认证服务暂时不可用，请稍后再试",
	protocol_error: "学校认证服务响应异常，请稍后再试",
	aborted: "认证已取消"
};
const FROM_CAS = {
	AUTH_FAILED: "invalid_credentials",
	CAPTCHA_REQUIRED: "captcha_required",
	UPSTREAM_ERROR: "upstream_unavailable",
	NETWORK_ERROR: "upstream_unavailable",
	TIMEOUT: "upstream_unavailable",
	PROTOCOL_ERROR: "protocol_error",
	VALIDATION_FAILED: "protocol_error",
	ABORTED: "aborted"
};
function campusVerifyError(code, extra = {}) {
	return {
		code,
		retryable: RETRYABLE.has(code),
		message: MESSAGES[code],
		...extra
	};
}
/** Returns undefined for errors that must not be reported as a verification failure. */
function fromCasError(error) {
	const code = FROM_CAS[error.kind];
	return code ? campusVerifyError(code, { cause: error }) : void 0;
}
/** Default Chinese message suitable for end users. */
function describeCampusVerifyError(error) {
	return DESCRIPTIONS[error.code];
}
// src/identity/rate-limiter.ts
const SWEEP_THRESHOLD = 1e4;
/** Fixed-window limiter for a single process; use a shared store for multiple instances. */
var MemoryRateLimiter = class {
	windowMs;
	limits;
	now;
	windows = /* @__PURE__ */ new Map();
	constructor(options = {}) {
		this.windowMs = positiveInteger(options.windowMs ?? 9e5, "windowMs");
		this.limits = {
			account: positiveInteger(options.maxPerAccount ?? 5, "maxPerAccount"),
			client: positiveInteger(options.maxPerClient ?? 20, "maxPerClient")
		};
		this.now = options.now ?? Date.now;
	}
	async consume(scope, id) {
		const now = this.now();
		if (this.windows.size >= SWEEP_THRESHOLD) this.sweep(now);
		const key = `${scope}:${id}`;
		let window = this.windows.get(key);
		if (!window || window.resetAt <= now) {
			window = {
				count: 0,
				resetAt: now + this.windowMs
			};
			this.windows.set(key, window);
		}
		if (window.count >= this.limits[scope]) return {
			allowed: false,
			retryAfterMs: window.resetAt - now
		};
		window.count++;
		return { allowed: true };
	}
	async reset(scope, id) {
		this.windows.delete(`${scope}:${id}`);
	}
	sweep(now) {
		for (const [key, window] of this.windows) if (window.resetAt <= now) this.windows.delete(key);
	}
};
function positiveInteger(value, name) {
	if (!Number.isSafeInteger(value) || value <= 0) throw new CasError("CONFIGURATION_ERROR", `${name} must be a positive integer`);
	return value;
}
// src/identity/subject.ts
const MIN_SUBJECT_SECRET_BYTES = 32;
/** Derives base64url(HMAC-SHA256(secret, JSON ["namespace", "cqut", schoolUid])). */
function createSubjectDeriver(options) {
	const secret = typeof options.secret === "string" ? new TextEncoder().encode(options.secret) : options.secret;
	if (!(secret instanceof Uint8Array) || secret.byteLength < 32) throw new CasError("CONFIGURATION_ERROR", `subject secret must be at least 32 bytes`);
	const namespace = options.namespace ?? "default";
	const subtle = globalThis.crypto?.subtle;
	if (!subtle) throw new CasError("CONFIGURATION_ERROR", "WebCrypto is not available");
	const key = subtle.importKey("raw", secret.slice(), {
		name: "HMAC",
		hash: "SHA-256"
	}, false, ["sign"]);
	key.catch(() => {});
	return async (schoolUid) => {
		const message = new TextEncoder().encode(JSON.stringify([
			namespace,
			"cqut",
			schoolUid
		]));
		return base64Url(new Uint8Array(await subtle.sign("HMAC", await key, message)));
	};
}
function base64Url(bytes) {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// src/identity/verifier.ts
const DEFAULT_CAS_SERVICE_URL = "https://uis.cqut.edu.cn/ump/common/login/authSourceAuth/auth?applicationCode=officeHallApplicationCode";
const DEFAULT_VERIFY_TIMEOUT_MS = 2e4;
const MAX_ACCOUNT_LENGTH = 128;
const MAX_PASSWORD_LENGTH = 256;
/** Verifies campus credentials and returns a minimal identity; sessions are left to the caller. */
var CampusVerifier = class {
	client;
	serviceUrl;
	applicationCode;
	timeoutMs;
	deriveSubject;
	rateLimiter;
	constructor(options = {}) {
		this.client = options.client instanceof CasClient ? options.client : new CasClient(options.client);
		this.serviceUrl = options.serviceUrl ?? "https://uis.cqut.edu.cn/ump/common/login/authSourceAuth/auth?applicationCode=officeHallApplicationCode";
		this.applicationCode = options.applicationCode ?? "officeHallApplicationCode";
		this.timeoutMs = options.timeoutMs ?? 2e4;
		if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 2147483647) throw new CasError("CONFIGURATION_ERROR", "timeoutMs must be a positive 32-bit integer");
		this.deriveSubject = options.subject ? createSubjectDeriver(options.subject) : void 0;
		this.rateLimiter = options.rateLimiter === false ? void 0 : options.rateLimiter ?? new MemoryRateLimiter();
	}
	/**
	* Resolves expected failures as `{ ok: false }`. Configuration errors, rate limiter failures
	* and unknown exceptions are thrown.
	*/
	async verify(input) {
		const { account: rawAccount, password } = input;
		if (typeof rawAccount !== "string" || typeof password !== "string" || rawAccount.length > 128 || password.length > 256 || !rawAccount.trim() || !password) return {
			ok: false,
			error: campusVerifyError("invalid_input")
		};
		const account = rawAccount.trim();
		const normalized = normalize(account);
		const clientKey = input.clientKey?.trim();
		const keys = [["account", normalized]];
		if (clientKey) keys.push(["client", clientKey]);
		if (this.rateLimiter) for (const [scope, id] of keys) {
			const decision = await this.rateLimiter.consume(scope, id);
			if (!decision.allowed) return {
				ok: false,
				error: campusVerifyError("rate_limited", { retryAfterMs: decision.retryAfterMs })
			};
		}
		let login;
		try {
			login = await this.client.login({
				account,
				password,
				serviceUrl: this.serviceUrl,
				applicationCode: this.applicationCode,
				timeoutMs: this.timeoutMs,
				signal: input.signal,
				validate: true
			});
		} catch (error) {
			const mapped = error instanceof CasError ? fromCasError(error) : void 0;
			if (mapped) return {
				ok: false,
				error: mapped
			};
			throw error;
		}
		let schoolUid;
		try {
			schoolUid = normalize(login.validation.user);
		} finally {
			login.dispose();
		}
		if (schoolUid !== normalized) return {
			ok: false,
			error: campusVerifyError("identity_mismatch")
		};
		await this.rateLimiter?.reset?.("account", normalized);
		const sub = this.deriveSubject ? await this.deriveSubject(schoolUid) : void 0;
		return {
			ok: true,
			data: {
				schoolUid,
				school: "cqut",
				studentStatus: "active",
				...sub ? { sub } : {}
			}
		};
	}
};
function createCampusVerifier(options) {
	return new CampusVerifier(options);
}
function normalize(value) {
	return value.trim().toLowerCase();
}
export { CampusVerifier, DEFAULT_CAS_SERVICE_URL, DEFAULT_VERIFY_TIMEOUT_MS, MAX_ACCOUNT_LENGTH, MAX_PASSWORD_LENGTH, MIN_SUBJECT_SECRET_BYTES, MemoryRateLimiter, createCampusVerifier, createSubjectDeriver, describeCampusVerifyError };

//# sourceMappingURL=index.js.map