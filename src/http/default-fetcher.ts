import type { Fetcher, HttpRequest, HttpResponse } from "./types.js";

/**
 * Default Fetcher implementation using globalThis.fetch.
 */
export const defaultFetcher: Fetcher = async (request: HttpRequest): Promise<HttpResponse> => {
  if (typeof globalThis.fetch !== "function") {
    throw new Error("globalThis.fetch is not available in the current runtime environment");
  }

  const init: RequestInit = {
    method: request.method ?? "GET",
    redirect: request.redirect ?? "follow",
  };
  if (request.headers !== undefined) {
    init.headers = request.headers;
  }
  if (request.body !== undefined) {
    init.body = request.body as BodyInit;
  }
  if (request.signal !== undefined) {
    init.signal = request.signal;
  }

  const response = await globalThis.fetch(request.url, init);

  return {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    url: response.url,
    text: () => response.text(),
    json: <T = unknown>() => response.json() as Promise<T>,
  };
};

/**
 * Extracts all Set-Cookie header strings from Response headers.
 * Supports Fetch API Headers (including headers.getSetCookie()), Node http incoming headers, and plain objects.
 */
export function extractResponseCookies(headers: HttpResponse["headers"]): string[] {
  if (!headers) return [];

  // Web Standard Headers object
  if (typeof (headers as Headers).getSetCookie === "function") {
    return (headers as Headers).getSetCookie();
  }

  if (typeof (headers as Headers).get === "function") {
    const raw = (headers as Headers).get("set-cookie");
    return raw ? [raw] : [];
  }

  // Plain Record object (e.g. from Axios or Node IncomingMessage)
  const rawHeaders = headers as Record<string, string | string[] | undefined>;
  const setCookie =
    rawHeaders["set-cookie"] ?? rawHeaders["Set-Cookie"] ?? rawHeaders["SET-COOKIE"];

  if (Array.isArray(setCookie)) {
    return setCookie.filter((v): v is string => typeof v === "string");
  }

  if (typeof setCookie === "string") {
    return [setCookie];
  }

  return [];
}

/**
 * Case-insensitively gets a single header value from HttpResponse headers.
 */
export function getHeader(headers: HttpResponse["headers"], name: string): string | undefined {
  if (!headers) return undefined;

  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? undefined;
  }

  const rawHeaders = headers as Record<string, string | string[] | undefined>;
  const targetLower = name.toLowerCase();

  for (const key of Object.keys(rawHeaders)) {
    if (key.toLowerCase() === targetLower) {
      const val = rawHeaders[key];
      if (Array.isArray(val)) {
        return val[0];
      }
      return val;
    }
  }

  return undefined;
}
