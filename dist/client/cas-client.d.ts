import "../polyfill.js";
import type { ICookieJar } from "../cookie/types.js";
import { CasError } from "../errors/cas-error.js";
import type { Fetcher } from "../http/types.js";
import { type CasValidationSuccess } from "../parser/cas-xml.js";
import { type CasClientOptions, type CasCredentials, type CasLoginOptions, type CasLoginResult, type DoLoginResponse, type EncryptedPassword, type LoginPageResult, type Result, type ServiceTicket, type StepOptions } from "./types.js";
export declare class CasClient implements AsyncDisposable {
    readonly uisBaseUrl: string;
    readonly defaultApplicationCode: string;
    readonly fetcher: Fetcher;
    readonly defaultCookieJar: ICookieJar;
    readonly publicKey: string | undefined;
    readonly defaultHeaders: Readonly<Record<string, string>>;
    constructor(options?: CasClientOptions);
    /**
     * Static helper to encrypt a password.
     */
    static encryptPassword(password: string, publicKey?: string): EncryptedPassword;
    /**
     * Instance method to encrypt a password using the client's configured public key.
     */
    encryptPassword(password: string): EncryptedPassword;
    /**
     * Step 1: Fetches initial login page and establishes session cookies.
     */
    fetchLoginPage(serviceUrl: string, options?: StepOptions): Promise<LoginPageResult>;
    /**
     * Step 2: Posts credentials to /sso/doLogin.
     */
    doLogin(credentials: CasCredentials, refererUrl: string, options?: StepOptions): Promise<DoLoginResponse>;
    /**
     * Step 3: Follows CAS login with session to obtain the service ticket.
     */
    acquireServiceTicket(casLoginUrl: string, serviceWithClientId: string, refererUrl: string, options?: StepOptions): Promise<ServiceTicket>;
    /**
     * Step 4: Validates service ticket against /cas/serviceValidate.
     */
    validateServiceTicket(ticket: string, serviceUrl: string, options?: StepOptions): Promise<CasValidationSuccess>;
    /**
     * High-level complete flow: fetches login page, executes doLogin, obtains ticket, and optionally validates ticket.
     */
    login(options: CasLoginOptions): Promise<CasLoginResult>;
    /**
     * Functional Result-based login flow. Does not throw on expected authentication or network errors.
     */
    safeLogin(options: CasLoginOptions): Promise<Result<CasLoginResult, CasError>>;
    /**
     * Asynchronous resource disposal for `await using` statements.
     */
    [Symbol.asyncDispose](): Promise<void>;
    private executeRequest;
    private fetchWithRetry;
}
/**
 * Factory function with const type parameter for ergonomic client creation.
 */
export declare function createCasClient<const T extends CasClientOptions>(options?: T): CasClient;
