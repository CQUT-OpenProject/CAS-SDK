export interface HttpRequest {
  url: string;
  method?: "GET" | "POST" | undefined;
  headers?: Record<string, string> | undefined;
  body?: string | undefined;
  redirect: "manual";
  signal: AbortSignal;
}

/** A single-hop response. Preserve separate Set-Cookie values and expose the body as a stream. */
export interface HttpResponse {
  status: number;
  headers: Headers | Record<string, string | string[] | undefined>;
  url?: string | undefined;
  body: ReadableStream<Uint8Array> | null;
}

/** Reject transport failures; honor signal and never follow redirects. */
export type Fetcher = (request: HttpRequest) => Promise<HttpResponse>;
