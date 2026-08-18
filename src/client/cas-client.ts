import "../polyfill.js";
import { MemoryCookieJar } from "../cookie/cookie-jar.js";
import type { ICookieJar } from "../cookie/types.js";
import { getSecretParam } from "../crypto/encryptor.js";
import { CasError } from "../errors/cas-error.js";
import { defaultFetcher, extractResponseCookies, getHeader } from "../http/default-fetcher.js";
import type { Fetcher, HttpRequest, HttpResponse } from "../http/types.js";
import { parseCasValidationResponse, type CasValidationSuccess } from "../parser/cas-xml.js";
import {
  DEFAULT_APPLICATION_CODE,
  DEFAULT_UIS_BASE_URL,
  normalizeBaseUrl,
  resolveCasLoginUrl,
} from "./endpoints.js";
import {
  assertServiceTicket,
  type CasClientOptions,
  type CasCredentials,
  type CasLoginOptions,
  type CasLoginResult,
  type DoLoginResponse,
  type EncryptedPassword,
  type LoginPageResult,
  type Result,
  type ServiceTicket,
  type StepOptions,
} from "./types.js";

const DEFAULT_HEADERS = {
  "User-Agent": "CQUT-Auth-Service/1.0",
  "Accept-Language": "zh-CN",
} as const satisfies Record<string, string>;

export class CasClient implements AsyncDisposable {
  public readonly uisBaseUrl: string;
  public readonly defaultApplicationCode: string;
  public readonly fetcher: Fetcher;
  public readonly defaultCookieJar: ICookieJar;
  public readonly publicKey: string | undefined;
  public readonly defaultHeaders: Readonly<Record<string, string>>;

  constructor(options: CasClientOptions = {}) {
    this.uisBaseUrl = normalizeBaseUrl(options.uisBaseUrl ?? DEFAULT_UIS_BASE_URL);
    this.defaultApplicationCode = options.applicationCode ?? DEFAULT_APPLICATION_CODE;
    this.fetcher = options.fetcher ?? defaultFetcher;
    this.defaultCookieJar = options.cookieJar ?? new MemoryCookieJar();
    this.publicKey = options.publicKey;
    this.defaultHeaders = options.defaultHeaders ?? DEFAULT_HEADERS;
  }

  /**
   * Static helper to encrypt a password.
   */
  public static encryptPassword(password: string, publicKey?: string): EncryptedPassword {
    return getSecretParam(password, publicKey);
  }

  /**
   * Instance method to encrypt a password using the client's configured public key.
   */
  public encryptPassword(password: string): EncryptedPassword {
    return getSecretParam(password, this.publicKey);
  }

  /**
   * Step 1: Fetches initial login page and establishes session cookies.
   */
  public async fetchLoginPage(
    serviceUrl: string,
    options: StepOptions = {},
  ): Promise<LoginPageResult> {
    const jar = options.cookieJar ?? this.defaultCookieJar;
    const appCode = options.applicationCode ?? this.defaultApplicationCode;
    const url = `${this.uisBaseUrl}/center-auth-server/${appCode}/cas/login?service=${encodeURIComponent(serviceUrl)}&applicationCode=${encodeURIComponent(appCode)}`;

    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Referer: serviceUrl,
      ...(options.headers ?? {}),
    };

    const res = await this.fetchWithRetry(
      {
        url,
        method: "GET",
        headers,
        signal: options.signal,
      },
      jar,
    );

    if (res.status >= 500) {
      throw new CasError("UPSTREAM_ERROR", `UIS login service unavailable (status ${res.status})`, {
        status: res.status,
      });
    }

    const finalUrl = res.url || url;
    let serviceWithClientId = serviceUrl;
    try {
      const parsed = new URL(finalUrl);
      serviceWithClientId = parsed.searchParams.get("service") ?? serviceUrl;
    } catch {
      // noop
    }

    const casLoginUrl = resolveCasLoginUrl(this.uisBaseUrl, finalUrl, appCode);

    return {
      finalUrl,
      serviceWithClientId,
      casLoginUrl,
    };
  }

  /**
   * Step 2: Posts credentials to /sso/doLogin.
   */
  public async doLogin(
    credentials: CasCredentials,
    refererUrl: string,
    options: StepOptions = {},
  ): Promise<DoLoginResponse> {
    const jar = options.cookieJar ?? this.defaultCookieJar;
    const url = `${this.uisBaseUrl}/center-auth-server/sso/doLogin`;

    const payload = JSON.stringify({
      loginType: credentials.loginType ?? "login",
      name: credentials.account,
      pwd: this.encryptPassword(credentials.password),
      universityId: credentials.universityId ?? "100005",
      verifyCode: credentials.verifyCode ?? null,
    });

    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      "Content-Type": "application/json, application/json;charset=UTF-8",
      Referer: refererUrl,
      ...(options.headers ?? {}),
    };

    const res = await this.executeRequest(
      {
        url,
        method: "POST",
        headers,
        body: payload,
        signal: options.signal,
      },
      jar,
    );

    if (res.status >= 500) {
      throw new CasError(
        "UPSTREAM_ERROR",
        `UIS doLogin service unavailable (status ${res.status})`,
        {
          status: res.status,
        },
      );
    }

    let data: Record<string, unknown> | null = null;
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      try {
        const text = await res.text();
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new CasError("UPSTREAM_ERROR", "Invalid response from UIS doLogin", {
          status: res.status,
        });
      }
    }

    const code = Number(data?.["code"]);
    const rawMsg = data?.["msg"];
    const msg = typeof rawMsg === "string" ? rawMsg : undefined;

    if (res.status >= 400 || code !== 200) {
      const errMsg = msg ?? "campus credentials rejected";
      if (/验证码|captcha/i.test(errMsg)) {
        throw new CasError("CAPTCHA_REQUIRED", errMsg, {
          status: res.status,
          rawResponse: data,
        });
      }
      throw new CasError("AUTH_FAILED", errMsg, {
        status: res.status,
        rawResponse: data,
      });
    }

    return {
      code,
      msg,
      raw: data,
    };
  }

  /**
   * Step 3: Follows CAS login with session to obtain the service ticket.
   */
  public async acquireServiceTicket(
    casLoginUrl: string,
    serviceWithClientId: string,
    refererUrl: string,
    options: StepOptions = {},
  ): Promise<ServiceTicket> {
    const jar = options.cookieJar ?? this.defaultCookieJar;
    const url = `${casLoginUrl}?service=${encodeURIComponent(serviceWithClientId)}`;

    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      Referer: refererUrl,
      ...(options.headers ?? {}),
    };

    const res = await this.fetchWithRetry(
      {
        url,
        method: "GET",
        headers,
        redirect: "manual",
        signal: options.signal,
      },
      jar,
    );

    if (res.status >= 500) {
      throw new CasError(
        "UPSTREAM_ERROR",
        `UIS CAS login service unavailable (status ${res.status})`,
        {
          status: res.status,
        },
      );
    }

    const location = getHeader(res.headers, "location");
    let ticket: string | null = null;
    if (res.status >= 300 && res.status < 400 && typeof location === "string") {
      try {
        ticket = new URL(location, casLoginUrl).searchParams.get("ticket");
      } catch {
        // invalid redirect
      }
    }

    if (!ticket || !ticket.startsWith("ST-")) {
      throw new CasError("PROTOCOL_ERROR", "campus cas service ticket was not issued", {
        status: res.status,
        rawResponse: { location, status: res.status },
      });
    }

    assertServiceTicket(ticket);
    return ticket;
  }

  /**
   * Step 4: Validates service ticket against /cas/serviceValidate.
   */
  public async validateServiceTicket(
    ticket: string,
    serviceUrl: string,
    options: StepOptions = {},
  ): Promise<CasValidationSuccess> {
    const jar = options.cookieJar ?? this.defaultCookieJar;
    const url = `${this.uisBaseUrl}/center-auth-server/cas/serviceValidate?service=${encodeURIComponent(serviceUrl)}&ticket=${encodeURIComponent(ticket)}`;

    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      Accept: "application/xml",
      ...(options.headers ?? {}),
    };

    const res = await this.executeRequest(
      {
        url,
        method: "GET",
        headers,
        redirect: "manual",
        signal: options.signal,
      },
      jar,
    );

    if (res.status >= 500) {
      throw new CasError(
        "UPSTREAM_ERROR",
        `UIS CAS serviceValidate unavailable (status ${res.status})`,
        {
          status: res.status,
        },
      );
    }

    if (res.status !== 200) {
      throw new CasError("VALIDATION_FAILED", `CAS validation returned HTTP status ${res.status}`, {
        status: res.status,
      });
    }

    const text = await res.text();
    return parseCasValidationResponse(text);
  }

  /**
   * High-level complete flow: fetches login page, executes doLogin, obtains ticket, and optionally validates ticket.
   */
  public async login(options: CasLoginOptions): Promise<CasLoginResult> {
    const jar = new MemoryCookieJar(); // isolated session jar per login flow
    const stepOpts: StepOptions = {
      applicationCode: options.applicationCode,
      cookieJar: jar,
      signal: options.signal,
    };

    // 1. Initial login page
    const pageResult = await this.fetchLoginPage(options.serviceUrl, stepOpts);

    // 2. Do login
    await this.doLogin(
      {
        account: options.account,
        password: options.password,
      },
      pageResult.finalUrl,
      stepOpts,
    );

    // 3. Acquire service ticket
    const ticket = await this.acquireServiceTicket(
      pageResult.casLoginUrl,
      pageResult.serviceWithClientId,
      pageResult.finalUrl,
      stepOpts,
    );

    // 4. Optional validate
    let validation: CasValidationSuccess | undefined;
    if (options.validate) {
      validation = await this.validateServiceTicket(
        ticket,
        pageResult.serviceWithClientId,
        stepOpts,
      );
    }

    return {
      ticket,
      serviceWithClientId: pageResult.serviceWithClientId,
      cookieJar: jar,
      ...(validation ? { validation } : {}),
    };
  }

  /**
   * Functional Result-based login flow. Does not throw on expected authentication or network errors.
   */
  public async safeLogin(options: CasLoginOptions): Promise<Result<CasLoginResult, CasError>> {
    try {
      const data = await this.login(options);
      return { ok: true, data };
    } catch (err: unknown) {
      if (err instanceof CasError) {
        return { ok: false, error: err };
      }
      const wrapped = new CasError(
        "NETWORK_ERROR",
        err instanceof Error ? err.message : "Unknown error during CAS login",
        { cause: err },
      );
      return { ok: false, error: wrapped };
    }
  }

  /**
   * Asynchronous resource disposal for `await using` statements.
   */
  public async [Symbol.asyncDispose](): Promise<void> {
    this.defaultCookieJar.clear();
  }

  private async executeRequest(req: HttpRequest, jar: ICookieJar): Promise<HttpResponse> {
    const cookieHeader = jar.getCookieString(req.url);
    const headers: Record<string, string> = {
      ...(req.headers ?? {}),
    };
    if (cookieHeader) {
      headers["Cookie"] = cookieHeader;
    }

    try {
      const res = await this.fetcher({
        ...req,
        headers,
      });

      // Save returned cookies
      const cookies = extractResponseCookies(res.headers);
      if (cookies.length > 0) {
        jar.setCookies(cookies, req.url);
      }

      return res;
    } catch (err: unknown) {
      if (err instanceof CasError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : "Network request failed";
      throw new CasError("NETWORK_ERROR", `Network error requesting ${req.url}: ${message}`, {
        cause: err,
      });
    }
  }

  private async fetchWithRetry(req: HttpRequest, jar: ICookieJar): Promise<HttpResponse> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await this.executeRequest(req, jar);
        if (res.status < 500 || attempt === 2) {
          return res;
        }
      } catch (err: unknown) {
        if (attempt === 2) {
          throw err;
        }
        // Transient network error retry
        if (err instanceof CasError && err.kind === "NETWORK_ERROR") {
          // allow retry
        } else {
          throw err;
        }
      }
      await sleep(250);
    }

    throw new CasError("UPSTREAM_ERROR", `Request failed after retries: ${req.url}`);
  }
}

/**
 * Factory function with const type parameter for ergonomic client creation.
 */
export function createCasClient<const T extends CasClientOptions>(options?: T): CasClient {
  return new CasClient(options);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
