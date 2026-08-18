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
    rawXml: string;
}
/**
 * Parses and validates CAS 2.0 XML service validation responses safely.
 * Features:
 * - Zero external dependencies (pure TypeScript)
 * - Strict XXE / Doctype rejection
 * - 64KB response size safety limit
 * - Strict single-result and identifier consistency verification
 */
export declare function parseCasValidationResponse(xml: string): CasValidationSuccess;
