export type RateLimitScope = "account" | "client";
export type RateLimitDecision = {
    readonly allowed: true;
} | {
    readonly allowed: false;
    readonly retryAfterMs: number;
};
/** Counts every attempt before UIS is contacted. Thrown errors propagate (fail closed). */
export interface RateLimiter {
    consume(scope: RateLimitScope, id: string): Promise<RateLimitDecision>;
    reset?(scope: RateLimitScope, id: string): Promise<void>;
}
export interface MemoryRateLimiterOptions {
    readonly windowMs?: number | undefined;
    readonly maxPerAccount?: number | undefined;
    readonly maxPerClient?: number | undefined;
    readonly now?: (() => number) | undefined;
}
/** Fixed-window limiter for a single process; use a shared store for multiple instances. */
export declare class MemoryRateLimiter implements RateLimiter {
    private readonly windowMs;
    private readonly limits;
    private readonly now;
    private readonly windows;
    constructor(options?: MemoryRateLimiterOptions);
    consume(scope: RateLimitScope, id: string): Promise<RateLimitDecision>;
    reset(scope: RateLimitScope, id: string): Promise<void>;
    private sweep;
}
