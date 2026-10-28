import { CasError, type CasErrorKind } from "../errors/cas-error.js";

export type CampusVerifyErrorCode =
  | "invalid_input"
  | "invalid_credentials"
  | "captcha_required"
  | "identity_mismatch"
  | "rate_limited"
  | "upstream_unavailable"
  | "protocol_error"
  | "aborted";

/** Expected verification failure. Messages never contain credentials. */
export interface CampusVerifyError {
  readonly code: CampusVerifyErrorCode;
  readonly retryable: boolean;
  readonly message: string;
  readonly retryAfterMs?: number | undefined;
  readonly cause?: CasError | undefined;
}

const RETRYABLE = new Set<CampusVerifyErrorCode>([
  "rate_limited",
  "upstream_unavailable",
  "protocol_error",
]);

const MESSAGES: Record<CampusVerifyErrorCode, string> = {
  invalid_input: "Missing or oversized account or password",
  invalid_credentials: "Campus credentials rejected",
  captcha_required: "Campus login requires a captcha",
  identity_mismatch: "Campus identity does not match requested account",
  rate_limited: "Too many verification attempts",
  upstream_unavailable: "Campus authentication service unavailable",
  protocol_error: "Unexpected campus authentication response",
  aborted: "Verification cancelled",
};

const DESCRIPTIONS: Record<CampusVerifyErrorCode, string> = {
  invalid_input: "请输入账号和密码",
  invalid_credentials: "账号或密码错误",
  captcha_required: "学校认证要求验证码，请先在统一身份认证页面登录一次后重试",
  identity_mismatch: "身份校验失败",
  rate_limited: "尝试次数过多，请稍后再试",
  upstream_unavailable: "学校认证服务暂时不可用，请稍后再试",
  protocol_error: "学校认证服务响应异常，请稍后再试",
  aborted: "认证已取消",
};

// CONFIGURATION_ERROR and CRYPTO_ERROR are deployment or program faults and stay thrown.
const FROM_CAS: Partial<Record<CasErrorKind, CampusVerifyErrorCode>> = {
  AUTH_FAILED: "invalid_credentials",
  CAPTCHA_REQUIRED: "captcha_required",
  UPSTREAM_ERROR: "upstream_unavailable",
  NETWORK_ERROR: "upstream_unavailable",
  TIMEOUT: "upstream_unavailable",
  PROTOCOL_ERROR: "protocol_error",
  VALIDATION_FAILED: "protocol_error",
  ABORTED: "aborted",
};

export function campusVerifyError(
  code: CampusVerifyErrorCode,
  extra: { retryAfterMs?: number | undefined; cause?: CasError | undefined } = {},
): CampusVerifyError {
  return { code, retryable: RETRYABLE.has(code), message: MESSAGES[code], ...extra };
}

/** Returns undefined for errors that must not be reported as a verification failure. */
export function fromCasError(error: CasError): CampusVerifyError | undefined {
  const code = FROM_CAS[error.kind];
  return code ? campusVerifyError(code, { cause: error }) : undefined;
}

/** Default Chinese message suitable for end users. */
export function describeCampusVerifyError(error: Pick<CampusVerifyError, "code">): string {
  return DESCRIPTIONS[error.code];
}
