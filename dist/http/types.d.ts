export interface HttpRequest {
    url: string;
    method?: "GET" | "POST" | "PUT" | "DELETE" | "HEAD" | undefined;
    headers?: Record<string, string> | undefined;
    body?: string | Uint8Array | undefined;
    redirect?: "follow" | "manual" | undefined;
    signal?: AbortSignal | undefined;
}
export interface HttpResponse {
    status: number;
    statusText?: string | undefined;
    headers: Headers | Record<string, string | string[] | undefined>;
    url?: string | undefined;
    text(): Promise<string>;
    json<T = unknown>(): Promise<T>;
}
export type Fetcher = (request: HttpRequest) => Promise<HttpResponse>;
