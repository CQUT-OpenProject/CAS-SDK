export type CasErrorKind =
  | "AUTH_FAILED"
  | "CAPTCHA_REQUIRED"
  | "NETWORK_ERROR"
  | "UPSTREAM_ERROR"
  | "PROTOCOL_ERROR"
  | "VALIDATION_FAILED";

export interface CasErrorOptions {
  status?: number | undefined;
  cause?: unknown;
  rawResponse?: unknown;
}

export class CasError extends Error {
  public readonly kind: CasErrorKind;
  public readonly status: number | undefined;
  public readonly rawResponse: unknown;

  constructor(kind: CasErrorKind, message: string, options?: CasErrorOptions) {
    super(message);
    this.name = "CasError";
    this.kind = kind;
    this.status = options?.status;
    this.rawResponse = options?.rawResponse;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Type guard to check if an unknown error is a CasError.
 */
export function isCasError(error: unknown): error is CasError {
  return error instanceof CasError;
}

/**
 * Type guard to check if an unknown error is a CasError of a specific kind.
 */
export function isCasErrorOfKind<const K extends CasErrorKind>(
  error: unknown,
  kind: K,
): error is CasError & { readonly kind: K } {
  return isCasError(error) && error.kind === kind;
}
