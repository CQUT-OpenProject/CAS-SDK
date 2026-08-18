export type CasErrorKind = "AUTH_FAILED" | "CAPTCHA_REQUIRED" | "NETWORK_ERROR" | "UPSTREAM_ERROR" | "PROTOCOL_ERROR" | "VALIDATION_FAILED";
export interface CasErrorOptions {
    status?: number | undefined;
    cause?: unknown;
    rawResponse?: unknown;
}
export declare class CasError extends Error {
    readonly kind: CasErrorKind;
    readonly status: number | undefined;
    readonly rawResponse: unknown;
    constructor(kind: CasErrorKind, message: string, options?: CasErrorOptions);
}
/**
 * Type guard to check if an unknown error is a CasError.
 */
export declare function isCasError(error: unknown): error is CasError;
/**
 * Type guard to check if an unknown error is a CasError of a specific kind.
 */
export declare function isCasErrorOfKind<const K extends CasErrorKind>(error: unknown, kind: K): error is CasError & {
    readonly kind: K;
};
