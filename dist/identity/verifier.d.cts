import { CasClient } from "../client/cas-client.cjs";
import type { CasClientOptions, Result } from "../client/types.cjs";
import { type CampusVerifyError } from "./errors.cjs";
import { type RateLimiter } from "./rate-limiter.cjs";
import { type SubjectOptions } from "./subject.cjs";
export declare const DEFAULT_CAS_SERVICE_URL = "https://uis.cqut.edu.cn/ump/common/login/authSourceAuth/auth?applicationCode=officeHallApplicationCode";
export declare const DEFAULT_VERIFY_TIMEOUT_MS = 20000;
export declare const MAX_ACCOUNT_LENGTH = 128;
export declare const MAX_PASSWORD_LENGTH = 256;
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
export declare class CampusVerifier {
    private readonly client;
    private readonly serviceUrl;
    private readonly applicationCode;
    private readonly timeoutMs;
    private readonly deriveSubject;
    private readonly rateLimiter;
    constructor(options?: CampusVerifierOptions);
    /**
     * Resolves expected failures as `{ ok: false }`. Configuration errors, rate limiter failures
     * and unknown exceptions are thrown.
     */
    verify(input: VerifyInput): Promise<VerifyResult>;
}
export declare function createCampusVerifier(options?: CampusVerifierOptions): CampusVerifier;
