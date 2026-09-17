import "../polyfill.js";
import { MemoryCookieJar } from "../cookie/cookie-jar.js";
import type { ICookieJar } from "../cookie/types.js";
import { getSecretParam } from "../crypto/encryptor.js";
import { CasError } from "../errors/cas-error.js";
import { defaultFetcher, extractResponseCookies, getHeader } from "../http/default-fetcher.js";
import {
  abortable,
  abortError,
  deadline,
  discard,
  readResponse,
  retryDelay,
} from "../http/response.js";
import type { Fetcher, HttpRequest, HttpResponse } from "../http/types.js";
import { parseCasValidationResponse, type CasValidationSuccess } from "../parser/cas-xml.js";
import {
  DEFAULT_APPLICATION_CODE,
  DEFAULT_UIS_BASE_URL,
  normalizeBaseUrl,
  resolveCasLoginUrl,
} from "./endpoints.js";
import {
  isServiceTicket,
  type CasClientOptions,
  type CasCredentials,
  type CasLoginOptions,
  type CasLoginResult,
  type CasTicketResult,
  type CasValidatedResult,
  type DoLoginResponse,
  type LoginPageResult,
  type RequestOptions,
  type Result,
  type ServiceTicket,
  type StepOptions,
} from "./types.js";

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const DEFAULT_HEADERS = { "User-Agent": "CQUT-Auth-Service/2.0", "Accept-Language": "zh-CN" };

/** Configuration only; each login result owns its session. */
export class CasClient {
  public readonly uisBaseUrl: string;
  private readonly applicationCode: string;
  private readonly fetcher: Fetcher;
  private readonly cookieJarFactory: () => ICookieJar;
  private readonly publicKey: string | undefined;
  private readonly headers: Readonly<Record<string, string>>;

  constructor(options: CasClientOptions = {}) {
    this.uisBaseUrl = normalizeBaseUrl(options.uisBaseUrl ?? DEFAULT_UIS_BASE_URL);
    try {
      const url = new URL(this.uisBaseUrl);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported protocol");
    } catch (cause) {
      throw new CasError("CONFIGURATION_ERROR", "Invalid UIS base URL", { cause });
    }
    this.applicationCode = options.applicationCode ?? DEFAULT_APPLICATION_CODE;
    this.fetcher = options.fetcher ?? defaultFetcher;
    this.cookieJarFactory = options.cookieJarFactory ?? (() => new MemoryCookieJar());
    this.publicKey = options.publicKey;
    this.headers = { ...DEFAULT_HEADERS, ...options.defaultHeaders };
  }

  public async fetchLoginPage(serviceUrl: string, options: StepOptions): Promise<LoginPageResult> {
    const step = "fetchLoginPage";
    const signal = deadline(options.signal, options.timeoutMs);
    const appCode = options.applicationCode ?? this.applicationCode;
    let url = `${this.uisBaseUrl}/center-auth-server/${encodeURIComponent(appCode)}/cas/login?service=${encodeURIComponent(serviceUrl)}&applicationCode=${encodeURIComponent(appCode)}`;
    const headers = {
      ...this.headers,
      Accept: "text/html,application/xml",
      Referer: serviceUrl,
      ...options.headers,
    };
    let serviceWithClientId = serviceUrl;
    for (let redirects = 0; ; redirects++) {
      let res: HttpResponse | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          res = await this.request(
            { url, headers, method: "GET", signal, redirect: "manual" },
            options.cookieJar,
            step,
          );
          if (res.status < 500 || attempt === 1) break;
          discard(res);
        } catch (error) {
          if (attempt === 1 || !(error instanceof CasError) || error.kind !== "NETWORK_ERROR")
            throw error;
        }
        await retryDelay(signal);
      }
      if (!res) throw new CasError("NETWORK_ERROR", "fetchLoginPage: request failed", { step });
      discard(res);
      this.checkUpstream(res, step);
      const finalUrl = res.url || url;
      serviceWithClientId = new URL(finalUrl).searchParams.get("service") ?? serviceWithClientId;
      if (!REDIRECTS.has(res.status)) {
        if (res.status !== 200)
          throw new CasError("PROTOCOL_ERROR", "fetchLoginPage: unexpected HTTP status", {
            step,
            status: res.status,
          });
        return {
          finalUrl,
          serviceWithClientId,
          casLoginUrl: resolveCasLoginUrl(this.uisBaseUrl, finalUrl, appCode),
        };
      }
      if (redirects === 5)
        throw new CasError("PROTOCOL_ERROR", "fetchLoginPage: too many redirects", { step });
      const location = getHeader(res.headers, "location");
      let next: URL;
      try {
        if (!location) throw new Error("Missing Location");
        next = new URL(location, finalUrl);
        if (!["http:", "https:"].includes(next.protocol))
          throw new Error("Unsupported redirect protocol");
      } catch (cause) {
        throw new CasError("PROTOCOL_ERROR", "fetchLoginPage: invalid redirect", { step, cause });
      }
      if (next.origin !== new URL(finalUrl).origin) {
        for (const key of Object.keys(headers))
          if (["cookie", "authorization"].includes(key.toLowerCase()))
            delete (headers as Record<string, string>)[key];
      }
      url = next.href;
    }
  }

  public async doLogin(
    credentials: CasCredentials,
    refererUrl: string,
    options: StepOptions,
  ): Promise<DoLoginResponse> {
    const step = "doLogin";
    const signal = deadline(options.signal, options.timeoutMs);
    const body = JSON.stringify({
      loginType: credentials.loginType ?? "login",
      name: credentials.account,
      pwd: getSecretParam(credentials.password, this.publicKey),
      universityId: credentials.universityId ?? "100005",
      verifyCode: credentials.verifyCode ?? null,
    });
    const res = await this.request(
      {
        url: `${this.uisBaseUrl}/center-auth-server/sso/doLogin`,
        method: "POST",
        headers: {
          ...this.headers,
          "Content-Type": "application/json;charset=UTF-8",
          Referer: refererUrl,
          ...options.headers,
        },
        body,
        signal,
        redirect: "manual",
      },
      options.cookieJar,
      step,
    );
    this.checkUpstream(res, step);
    const text = await readResponse(res, signal, step, "PROTOCOL_ERROR");
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new CasError("PROTOCOL_ERROR", "doLogin: invalid JSON response", {
        step,
        status: res.status,
      });
    }
    if (
      !data ||
      typeof data !== "object" ||
      !("code" in data) ||
      !["number", "string"].includes(typeof data.code) ||
      !Number.isFinite(Number(data.code))
    )
      throw new CasError("PROTOCOL_ERROR", "doLogin: missing response code", {
        step,
        status: res.status,
      });
    if (res.status >= 300 && res.status < 400)
      throw new CasError("PROTOCOL_ERROR", "doLogin: unexpected redirect", {
        step,
        status: res.status,
      });
    if (res.status >= 400 || Number(data.code) !== 200) {
      const captcha =
        "msg" in data && typeof data.msg === "string" && /验证码|captcha/i.test(data.msg);
      throw new CasError(
        captcha ? "CAPTCHA_REQUIRED" : "AUTH_FAILED",
        captcha ? "Captcha required" : "Campus credentials rejected",
        { step, status: res.status },
      );
    }
    return { code: 200 };
  }

  public async acquireServiceTicket(
    casLoginUrl: string,
    serviceWithClientId: string,
    refererUrl: string,
    options: StepOptions,
  ): Promise<ServiceTicket> {
    const step = "acquireServiceTicket";
    const signal = deadline(options.signal, options.timeoutMs);
    const url = new URL(casLoginUrl);
    url.searchParams.set("service", serviceWithClientId);
    const res = await this.request(
      {
        url: url.href,
        method: "GET",
        headers: { ...this.headers, Referer: refererUrl, ...options.headers },
        redirect: "manual",
        signal,
      },
      options.cookieJar,
      step,
    );
    discard(res);
    this.checkUpstream(res, step);
    const location = getHeader(res.headers, "location");
    let ticket: string | null = null;
    if (REDIRECTS.has(res.status) && location) {
      try {
        ticket = new URL(location, casLoginUrl).searchParams.get("ticket");
      } catch {
        /* handled below */
      }
    }
    if (!isServiceTicket(ticket))
      throw new CasError("PROTOCOL_ERROR", "acquireServiceTicket: ticket was not issued", {
        step,
        status: res.status,
      });
    return ticket;
  }

  public async validateServiceTicket(
    ticket: string,
    serviceUrl: string,
    options: RequestOptions = {},
  ): Promise<CasValidationSuccess> {
    const step = "validateServiceTicket";
    const signal = deadline(options.signal, options.timeoutMs);
    const res = await this.request(
      {
        url: `${this.uisBaseUrl}/center-auth-server/cas/serviceValidate?service=${encodeURIComponent(serviceUrl)}&ticket=${encodeURIComponent(ticket)}`,
        method: "GET",
        headers: { ...this.headers, Accept: "application/xml", ...options.headers },
        redirect: "manual",
        signal,
      },
      options.cookieJar,
      step,
    );
    this.checkUpstream(res, step);
    if (res.status !== 200) {
      discard(res);
      throw new CasError("VALIDATION_FAILED", "validateServiceTicket: unexpected HTTP status", {
        step,
        status: res.status,
      });
    }
    return parseCasValidationResponse(await readResponse(res, signal, step, "VALIDATION_FAILED"));
  }

  public login(options: CasLoginOptions & { validate: true }): Promise<CasValidatedResult>;
  public login(options: CasLoginOptions & { validate?: false }): Promise<CasTicketResult>;
  public login(options: CasLoginOptions): Promise<CasLoginResult>;
  public async login(options: CasLoginOptions): Promise<CasLoginResult> {
    const signal = deadline(options.signal, options.timeoutMs);
    const jar = this.cookieJarFactory();
    const steps: StepOptions = {
      cookieJar: jar,
      signal,
      timeoutMs: options.timeoutMs,
      applicationCode: options.applicationCode,
    };
    try {
      const page = await this.fetchLoginPage(options.serviceUrl, steps);
      await this.doLogin(options, page.finalUrl, steps);
      const ticket = await this.acquireServiceTicket(
        page.casLoginUrl,
        page.serviceWithClientId,
        page.finalUrl,
        steps,
      );
      let disposed = false;
      const dispose = () => {
        if (!disposed) {
          disposed = true;
          jar.clear();
        }
      };
      const session = {
        serviceWithClientId: page.serviceWithClientId,
        cookieJar: jar,
        dispose,
        [Symbol.dispose]: dispose,
      };
      if (options.validate)
        return {
          ...session,
          kind: "validated",
          validation: await this.validateServiceTicket(ticket, page.serviceWithClientId, steps),
        };
      return { ...session, kind: "ticket", ticket };
    } catch (error) {
      jar.clear();
      throw error;
    }
  }

  public safeLogin(
    options: CasLoginOptions & { validate: true },
  ): Promise<Result<CasValidatedResult, CasError>>;
  public safeLogin(
    options: CasLoginOptions & { validate?: false },
  ): Promise<Result<CasTicketResult, CasError>>;
  public safeLogin(options: CasLoginOptions): Promise<Result<CasLoginResult, CasError>>;
  public async safeLogin(options: CasLoginOptions): Promise<Result<CasLoginResult, CasError>> {
    try {
      return { ok: true, data: await this.login(options) };
    } catch (error) {
      if (error instanceof CasError) return { ok: false, error };
      throw error;
    }
  }

  private checkUpstream(res: HttpResponse, step: string): void {
    if (res.status >= 500) {
      discard(res);
      throw new CasError("UPSTREAM_ERROR", `${step}: UIS service unavailable`, {
        step,
        status: res.status,
      });
    }
  }

  private async request(
    req: HttpRequest,
    jar: ICookieJar | undefined,
    step: string,
  ): Promise<HttpResponse> {
    if (req.signal.aborted) throw abortError(req.signal, step);
    const headers = { ...req.headers };
    const cookie = jar?.getCookieString(req.url);
    if (cookie) {
      for (const key of Object.keys(headers))
        if (key.toLowerCase() === "cookie") delete headers[key];
      headers.Cookie = cookie;
    }
    let res: HttpResponse;
    try {
      const pending = this.fetcher({ ...req, headers }).then((response) => {
        if (req.signal.aborted) {
          discard(response);
          throw abortError(req.signal, step);
        }
        return response;
      });
      res = await abortable(pending, req.signal, step);
    } catch (cause) {
      if (req.signal.aborted) throw abortError(req.signal, step);
      if (cause instanceof CasError) throw cause;
      throw new CasError("NETWORK_ERROR", `${step}: request failed`, { step, cause });
    }
    jar?.setCookies(extractResponseCookies(res.headers), res.url || req.url);
    return res;
  }
}

export function createCasClient(options?: CasClientOptions): CasClient {
  return new CasClient(options);
}
