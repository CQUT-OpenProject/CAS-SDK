import { CasError } from "../errors/cas-error.js";
export type CampusVerifyErrorCode = "invalid_input" | "invalid_credentials" | "captcha_required" | "identity_mismatch" | "rate_limited" | "upstream_unavailable" | "protocol_error" | "aborted";
/** Expected verification failure. Messages never contain credentials. */
export interface CampusVerifyError {
    readonly code: CampusVerifyErrorCode;
    readonly retryable: boolean;
    readonly message: string;
    readonly retryAfterMs?: number | undefined;
    readonly cause?: CasError | undefined;
}
export declare function campusVerifyError(code: CampusVerifyErrorCode, extra?: {
    retryAfterMs?: number | undefined;
    cause?: CasError | undefined;
}): CampusVerifyError;
/** Returns undefined for errors that must not be reported as a verification failure. */
export declare function fromCasError(error: CasError): CampusVerifyError | undefined;
/** Default Chinese message suitable for end users. */
export declare function describeCampusVerifyError(error: Pick<CampusVerifyError, "code">): string;
