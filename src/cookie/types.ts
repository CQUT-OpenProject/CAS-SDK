export interface Cookie {
  name: string;
  value: string;
  domain?: string | undefined;
  path?: string | undefined;
  expires?: Date | undefined;
  maxAge?: number | undefined;
  secure?: boolean | undefined;
  httpOnly?: boolean | undefined;
  createdAt: number;
}

export interface ICookieJar {
  setCookie(rawCookie: string, currentUrl: string): void;
  setCookies(rawCookies: string[], currentUrl: string): void;
  getCookieString(currentUrl: string): string;
  getCookies(currentUrl: string): Cookie[];
  clear(): void;
}
