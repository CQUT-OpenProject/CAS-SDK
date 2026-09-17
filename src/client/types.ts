import type { ICookieJar } from "../cookie/types.js";
import type { CasError } from "../errors/cas-error.js";
import type { Fetcher } from "../http/types.js";
import type { CasValidationSuccess } from "../parser/cas-xml.js";

declare const __brand: unique symbol;

/**
 * Nominal / Branded type helper.
 */
export type Brand<B, T = string> = T & { readonly [__brand]: B };

/**
 * Branded CAS Service Ticket (starts with "ST-").
 */
export type ServiceTicket = Brand<"ServiceTicket", string>;

/**
 * Branded encrypted password payload suitable for `pwd` field.
 */
export type EncryptedPassword = Brand<"EncryptedPassword", string>;

/**
 * Result pattern discriminated union for functional error handling.
 */
export type Result<T, E = CasError> =
  | { readonly ok: true; readonly data: T; readonly error?: undefined }
  | { readonly ok: false; readonly error: E; readonly data?: undefined };

/**
 * Checks if a given value is a valid CAS Service Ticket string format.
 */
export function isServiceTicket(value: unknown): value is ServiceTicket {
  return typeof value === "string" && value.startsWith("ST-") && value.length > 3;
}

/**
 * Asserts that a value is a valid CAS Service Ticket.
 */
export function assertServiceTicket(value: unknown): asserts value is ServiceTicket {
  if (!isServiceTicket(value)) {
    throw new TypeError("Value is not a valid CAS ServiceTicket");
  }
}

export interface CasClientOptions {
  readonly uisBaseUrl?: string | undefined;
  readonly applicationCode?: string | undefined;
  readonly fetcher?: Fetcher | undefined;
  readonly cookieJarFactory?: (() => ICookieJar) | undefined;
  readonly publicKey?: string | undefined;
  readonly defaultHeaders?: Readonly<Record<string, string>> | undefined;
}

export interface RequestOptions {
  readonly applicationCode?: string | undefined;
  readonly cookieJar?: ICookieJar | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly timeoutMs?: number | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
}

export interface StepOptions extends RequestOptions {
  readonly cookieJar: ICookieJar;
}

export interface CasCredentials {
  readonly account: string;
  readonly password: string;
  readonly universityId?: string | undefined;
  readonly verifyCode?: string | null | undefined;
  readonly loginType?: string | undefined;
}

export interface LoginPageResult {
  readonly finalUrl: string;
  readonly serviceWithClientId: string;
  readonly casLoginUrl: string;
}

export interface DoLoginResponse {
  readonly code: 200;
}

export interface CasLoginOptions extends CasCredentials {
  readonly serviceUrl: string;
  readonly applicationCode?: string | undefined;
  readonly validate?: boolean | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly timeoutMs?: number | undefined;
}

export interface CasSession extends Disposable {
  readonly serviceWithClientId: string;
  readonly cookieJar: ICookieJar;
  dispose(): void;
}

export interface CasTicketResult extends CasSession {
  readonly kind: "ticket";
  readonly ticket: ServiceTicket;
}

export interface CasValidatedResult extends CasSession {
  readonly kind: "validated";
  readonly validation: CasValidationSuccess;
}

export type CasLoginResult = CasTicketResult | CasValidatedResult;
