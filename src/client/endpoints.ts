export const DEFAULT_UIS_BASE_URL = "https://uis.cqut.edu.cn";
export const DEFAULT_APPLICATION_CODE = "officeHallApplicationCode";

export function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function resolveCasLoginUrl(
  uisBaseUrl: string,
  finalUrl: string,
  fallbackApplicationCode: string,
): string {
  try {
    const parsed = new URL(finalUrl);
    const match = parsed.pathname.match(/^\/center-auth-server\/([^/]+)\/cas\/login$/);
    if (match?.[1]) {
      return `${uisBaseUrl}/center-auth-server/${match[1]}/cas/login`;
    }
  } catch {
    // noop; fallback
  }
  return `${uisBaseUrl}/center-auth-server/${fallbackApplicationCode}/cas/login`;
}
