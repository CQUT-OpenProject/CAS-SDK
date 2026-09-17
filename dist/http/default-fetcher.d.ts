import type { Fetcher, HttpResponse } from "./types.js";
/**
 * Default Fetcher implementation using globalThis.fetch.
 */
export declare const defaultFetcher: Fetcher;
/**
 * Extracts all Set-Cookie header strings from Response headers.
 * Supports Fetch API Headers (including headers.getSetCookie()), Node http incoming headers, and plain objects.
 */
export declare function extractResponseCookies(headers: HttpResponse["headers"]): string[];
/**
 * Case-insensitively gets a single header value from HttpResponse headers.
 */
export declare function getHeader(headers: HttpResponse["headers"], name: string): string | undefined;
