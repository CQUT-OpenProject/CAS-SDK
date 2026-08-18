import "../polyfill.js";
import type { Cookie, ICookieJar } from "./types.js";

/**
 * Lightweight, zero-dependency in-memory Cookie Jar conforming to RFC 6265 basics.
 * Implements Disposable for explicit resource cleanup via `using jar = new MemoryCookieJar()`.
 */
export class MemoryCookieJar implements ICookieJar, Disposable {
  private cookies: Cookie[] = [];

  public setCookie(rawCookie: string, currentUrl: string): void {
    if (!rawCookie || !rawCookie.trim()) return;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(currentUrl);
    } catch {
      return;
    }

    const cookie = parseSetCookie(rawCookie, parsedUrl.hostname, parsedUrl.pathname);
    if (!cookie) return;

    // Remove existing cookie with same name, domain, and path
    this.cookies = this.cookies.filter(
      (c) => !(c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path),
    );

    // If Max-Age <= 0 or expired, do not add
    if (isExpired(cookie)) {
      return;
    }

    this.cookies.push(cookie);
  }

  public setCookies(rawCookies: string[], currentUrl: string): void {
    for (const raw of rawCookies) {
      this.setCookie(raw, currentUrl);
    }
  }

  public getCookies(currentUrl: string): Cookie[] {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(currentUrl);
    } catch {
      return [];
    }

    const now = Date.now();
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname || "/";
    const isSecure = parsedUrl.protocol === "https:";

    // Filter unexpired and matching cookies
    this.cookies = this.cookies.filter((c) => !isExpired(c, now));

    return this.cookies.filter((c) => {
      if (c.secure && !isSecure) return false;
      if (!matchDomain(c.domain, hostname)) return false;
      if (!matchPath(c.path, pathname)) return false;
      return true;
    });
  }

  public getCookieString(currentUrl: string): string {
    const matching = this.getCookies(currentUrl);
    return matching.map((c) => `${c.name}=${c.value}`).join("; ");
  }

  public clear(): void {
    this.cookies = [];
  }

  public [Symbol.dispose](): void {
    this.clear();
  }
}

function parseSetCookie(raw: string, defaultHost: string, defaultPath: string): Cookie | null {
  const parts = raw.split(";").map((p) => p.trim());
  const firstPart = parts[0];
  if (!firstPart) return null;

  const equalIdx = firstPart.indexOf("=");
  if (equalIdx <= 0) return null;

  const name = firstPart.slice(0, equalIdx).trim();
  const value = firstPart.slice(equalIdx + 1).trim();

  let domain = defaultHost.toLowerCase();
  let path = defaultPath.startsWith("/") ? defaultPath : "/";
  // Default path in RFC 6265: directory of pathname
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash > 0) {
    path = path.slice(0, lastSlash);
  } else if (lastSlash === 0 && path !== "/") {
    path = "/";
  }

  let expires: Date | undefined;
  let maxAge: number | undefined;
  let secure = false;
  let httpOnly = false;

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    const eq = part.indexOf("=");
    const key = (eq >= 0 ? part.slice(0, eq) : part).trim().toLowerCase();
    const val = eq >= 0 ? part.slice(eq + 1).trim() : "";

    if (key === "domain" && val) {
      domain = val.startsWith(".") ? val.slice(1).toLowerCase() : val.toLowerCase();
    } else if (key === "path" && val) {
      path = val;
    } else if (key === "expires" && val) {
      const parsed = new Date(val);
      if (!isNaN(parsed.getTime())) {
        expires = parsed;
      }
    } else if (key === "max-age" && val) {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed)) {
        maxAge = parsed;
      }
    } else if (key === "secure") {
      secure = true;
    } else if (key === "httponly") {
      httpOnly = true;
    }
  }

  return {
    name,
    value,
    domain,
    path,
    expires,
    maxAge,
    secure,
    httpOnly,
    createdAt: Date.now(),
  };
}

function isExpired(cookie: Cookie, now = Date.now()): boolean {
  if (cookie.maxAge !== undefined) {
    if (cookie.maxAge <= 0) return true;
    return now > cookie.createdAt + cookie.maxAge * 1000;
  }
  if (cookie.expires !== undefined) {
    return now > cookie.expires.getTime();
  }
  return false;
}

function matchDomain(cookieDomain?: string, requestHost?: string): boolean {
  if (!cookieDomain || !requestHost) return false;
  const cd = cookieDomain.toLowerCase();
  const rh = requestHost.toLowerCase();
  if (cd === rh) return true;
  if (rh.endsWith("." + cd)) return true;
  return false;
}

function matchPath(cookiePath?: string, requestPath?: string): boolean {
  if (!cookiePath || !requestPath) return true;
  if (cookiePath === "/" || cookiePath === requestPath) return true;
  if (requestPath.startsWith(cookiePath)) {
    if (cookiePath.endsWith("/")) return true;
    if (requestPath.charAt(cookiePath.length) === "/") return true;
  }
  return false;
}
