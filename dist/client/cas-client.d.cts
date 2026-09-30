import "../polyfill.cjs";
import { CasError } from "../errors/cas-error.cjs";
import { type CasValidationSuccess } from "../parser/cas-xml.cjs";
import { type CasClientOptions, type CasCredentials, type CasLoginOptions, type CasLoginResult, type CasTicketResult, type CasValidatedResult, type DoLoginResponse, type LoginPageResult, type RequestOptions, type Result, type ServiceTicket, type StepOptions } from "./types.cjs";
/** Configuration only; each login result owns its session. */
export declare class CasClient {
    readonly uisBaseUrl: string;
    private readonly applicationCode;
    private readonly fetcher;
    private readonly cookieJarFactory;
    private readonly publicKey;
    private readonly headers;
    constructor(options?: CasClientOptions);
    fetchLoginPage(serviceUrl: string, options: StepOptions): Promise<LoginPageResult>;
    doLogin(credentials: CasCredentials, refererUrl: string, options: StepOptions): Promise<DoLoginResponse>;
    acquireServiceTicket(casLoginUrl: string, serviceWithClientId: string, refererUrl: string, options: StepOptions): Promise<ServiceTicket>;
    validateServiceTicket(ticket: string, serviceUrl: string, options?: RequestOptions): Promise<CasValidationSuccess>;
    login(options: CasLoginOptions & {
        validate: true;
    }): Promise<CasValidatedResult>;
    login(options: CasLoginOptions & {
        validate?: false;
    }): Promise<CasTicketResult>;
    login(options: CasLoginOptions): Promise<CasLoginResult>;
    safeLogin(options: CasLoginOptions & {
        validate: true;
    }): Promise<Result<CasValidatedResult, CasError>>;
    safeLogin(options: CasLoginOptions & {
        validate?: false;
    }): Promise<Result<CasTicketResult, CasError>>;
    safeLogin(options: CasLoginOptions): Promise<Result<CasLoginResult, CasError>>;
    private checkUpstream;
    private request;
}
export declare function createCasClient(options?: CasClientOptions): CasClient;
