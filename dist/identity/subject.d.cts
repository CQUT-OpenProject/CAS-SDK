export declare const MIN_SUBJECT_SECRET_BYTES = 32;
export interface SubjectOptions {
    /** At least 32 bytes. Rotating it changes every subject. */
    readonly secret: string | Uint8Array;
    /** Use a distinct namespace per application to prevent cross-application correlation. */
    readonly namespace?: string | undefined;
}
export type SubjectDeriver = (schoolUid: string) => Promise<string>;
/** Derives base64url(HMAC-SHA256(secret, JSON ["namespace", "cqut", schoolUid])). */
export declare function createSubjectDeriver(options: SubjectOptions): SubjectDeriver;
