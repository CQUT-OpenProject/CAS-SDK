import "../polyfill.js";
import type { Cookie, ICookieJar } from "./types.js";
/**
 * Lightweight, zero-dependency in-memory Cookie Jar conforming to RFC 6265 basics.
 * Implements Disposable for explicit resource cleanup via `using jar = new MemoryCookieJar()`.
 */
export declare class MemoryCookieJar implements ICookieJar, Disposable {
    private cookies;
    setCookie(rawCookie: string, currentUrl: string): void;
    setCookies(rawCookies: string[], currentUrl: string): void;
    getCookies(currentUrl: string): Cookie[];
    getCookieString(currentUrl: string): string;
    clear(): void;
    [Symbol.dispose](): void;
}
