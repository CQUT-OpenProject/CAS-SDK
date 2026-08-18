export declare const DEFAULT_UIS_BASE_URL = "https://uis.cqut.edu.cn";
export declare const DEFAULT_APPLICATION_CODE = "officeHallApplicationCode";
export declare function normalizeBaseUrl(value: string): string;
export declare function resolveCasLoginUrl(uisBaseUrl: string, finalUrl: string, fallbackApplicationCode: string): string;
