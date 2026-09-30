import { CasError, type CasErrorKind } from "../errors/cas-error.js";
import type { HttpResponse } from "./types.js";
export declare const MAX_RESPONSE_BYTES: number;
export declare function abortError(signal: AbortSignal, step: string): CasError;
export declare function deadline(signal?: AbortSignal, timeoutMs?: number): AbortSignal;
/** Also bounds custom adapters that cannot promptly cancel their own work. */
export declare function abortable<T>(work: Promise<T>, signal: AbortSignal, step: string): Promise<T>;
export declare function discard(response: HttpResponse): void;
export declare function readResponse(response: HttpResponse, signal: AbortSignal, step: string, kind: CasErrorKind): Promise<string>;
export declare function retryDelay(signal: AbortSignal): Promise<void>;
