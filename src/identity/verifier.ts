import { CasClient } from "../client/cas-client.js";
import { DEFAULT_APPLICATION_CODE } from "../client/endpoints.js";
import type { CasClientOptions, CasValidatedResult, Result } from "../client/types.js";
import { CasError } from "../errors/cas-error.js";
import { campusVerifyError, fromCasError, type CampusVerifyError } from "./errors.js";
import { MemoryRateLimiter, type RateLimiter, type RateLimitScope } from "./rate-limiter.js";
import { createSubjectDeriver, type SubjectDeriver, type SubjectOptions } from "./subject.js";

export const DEFAULT_CAS_SERVICE_URL =
  "https://uis.cqut.edu.cn/ump/common/login/authSourceAuth/auth?applicationCode=officeHallApplicationCode";
export const DEFAULT_VERIFY_TIMEOUT_MS = 20_000;
export const MAX_ACCOUNT_LENGTH = 128;
export const MAX_PASSWORD_LENGTH = 256;

export interface CampusVerifierOptions {
  /** Reuse a client or pass its configuration; defaults to `new CasClient()`. */
  readonly client?: CasClient | CasClientOptions | undefined;
  readonly serviceUrl?: string | undefined;
  readonly applicationCode?: string | undefined;
  /** Total time limit for one verification. */
  readonly timeoutMs?: number | undefined;
  /** Enables a stable pseudonymous `sub` without storage. */
  readonly subject?: SubjectOptions | undefined;
  /** Defaults to an in-process `MemoryRateLimiter`; pass `false` to disable. */
  readonly rateLimiter?: RateLimiter | false | undefined;
}

export interface VerifyInput {
  readonly account: string;
  readonly password: string;
  /** Caller identity for rate limiting, such as the client IP. */
  readonly clientKey?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface CampusIdentity {
  /** Normalized (trimmed, lower-case) campus account. */
  readonly schoolUid: string;
  readonly school: "cqut";
  /** Present only when `subject` is configured. */
  readonly sub?: string | undefined;
  /** Only means UIS accepted the account; not proof of current enrollment. */
  readonly studentStatus: "active";
}

export type VerifyResult = Result<CampusIdentity, CampusVerifyError>;

/** Verifies campus credentials and returns a minimal identity; sessions are left to the caller. */
export class CampusVerifier {
  private readonly client: CasClient;
  private readonly serviceUrl: string;
  private readonly applicationCode: string;
  private readonly timeoutMs: number;
  private readonly deriveSubject: SubjectDeriver | undefined;
  private readonly rateLimiter: RateLimiter | undefined;

  constructor(options: CampusVerifierOptions = {}) {
    this.client =
      options.client instanceof CasClient ? options.client : new CasClient(options.client);
    this.serviceUrl = options.serviceUrl ?? DEFAULT_CAS_SERVICE_URL;
    this.applicationCode = options.applicationCode ?? DEFAULT_APPLICATION_CODE;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_VERIFY_TIMEOUT_MS;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 2_147_483_647)
      throw new CasError("CONFIGURATION_ERROR", "timeoutMs must be a positive 32-bit integer");
    this.deriveSubject = options.subject ? createSubjectDeriver(options.subject) : undefined;
    this.rateLimiter =
      options.rateLimiter === false ? undefined : (options.rateLimiter ?? new MemoryRateLimiter());
  }

  /**
   * Resolves expected failures as `{ ok: false }`. Configuration errors, rate limiter failures
   * and unknown exceptions are thrown.
   */
  public async verify(input: VerifyInput): Promise<VerifyResult> {
    const { account: rawAccount, password } = input;
    if (
      typeof rawAccount !== "string" ||
      typeof password !== "string" ||
      rawAccount.length > MAX_ACCOUNT_LENGTH ||
      password.length > MAX_PASSWORD_LENGTH ||
      !rawAccount.trim() ||
      !password
    )
      return { ok: false, error: campusVerifyError("invalid_input") };
    const account = rawAccount.trim();
    const normalized = normalize(account);

    const clientKey = input.clientKey?.trim();
    const keys: Array<[RateLimitScope, string]> = [["account", normalized]];
    if (clientKey) keys.push(["client", clientKey]);
    if (this.rateLimiter) {
      for (const [scope, id] of keys) {
        const decision = await this.rateLimiter.consume(scope, id);
        if (!decision.allowed)
          return {
            ok: false,
            error: campusVerifyError("rate_limited", { retryAfterMs: decision.retryAfterMs }),
          };
      }
    }

    let login: CasValidatedResult;
    try {
      login = await this.client.login({
        account,
        password,
        serviceUrl: this.serviceUrl,
        applicationCode: this.applicationCode,
        timeoutMs: this.timeoutMs,
        signal: input.signal,
        validate: true,
      });
    } catch (error) {
      const mapped = error instanceof CasError ? fromCasError(error) : undefined;
      if (mapped) return { ok: false, error: mapped };
      throw error;
    }

    let schoolUid: string;
    try {
      schoolUid = normalize(login.validation.user);
    } finally {
      login.dispose();
    }
    if (schoolUid !== normalized)
      return { ok: false, error: campusVerifyError("identity_mismatch") };

    await this.rateLimiter?.reset?.("account", normalized);
    const sub = this.deriveSubject ? await this.deriveSubject(schoolUid) : undefined;
    return {
      ok: true,
      data: { schoolUid, school: "cqut", studentStatus: "active", ...(sub ? { sub } : {}) },
    };
  }
}

export function createCampusVerifier(options?: CampusVerifierOptions): CampusVerifier {
  return new CampusVerifier(options);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
