export declare const CAS_NAMESPACE = "http://www.yale.edu/tp/cas";
export declare const MAX_CAS_VALIDATION_RESPONSE_BYTES: number;
export interface CasValidationSuccess {
    success: true;
    user: string;
    uid?: string | undefined;
    userCode?: string | undefined;
    userName?: string | undefined;
    userType?: string | undefined;
    authServerToken?: string | undefined;
    attributes: Record<string, string>;
}
export declare function parseCasValidationResponse(xml: string): CasValidationSuccess;
