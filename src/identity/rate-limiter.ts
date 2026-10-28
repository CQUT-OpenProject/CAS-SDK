import { CasError } from "../errors/cas-error.js";

export type RateLimitScope = "account" | "client";

export type RateLimitDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterMs: number };

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

const SWEEP_THRESHOLD = 10_000;

/** Fixed-window limiter for a single process; use a shared store for multiple instances. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly windowMs: number;
  private readonly limits: Readonly<Record<RateLimitScope, number>>;
  private readonly now: () => number;
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(options: MemoryRateLimiterOptions = {}) {
    this.windowMs = positiveInteger(options.windowMs ?? 15 * 60_000, "windowMs");
    this.limits = {
      account: positiveInteger(options.maxPerAccount ?? 5, "maxPerAccount"),
      client: positiveInteger(options.maxPerClient ?? 20, "maxPerClient"),
    };
    this.now = options.now ?? Date.now;
  }

  public async consume(scope: RateLimitScope, id: string): Promise<RateLimitDecision> {
    const now = this.now();
    if (this.windows.size >= SWEEP_THRESHOLD) this.sweep(now);
    const key = `${scope}:${id}`;
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, window);
    }
    if (window.count >= this.limits[scope])
      return { allowed: false, retryAfterMs: window.resetAt - now };
    window.count++;
    return { allowed: true };
  }

  public async reset(scope: RateLimitScope, id: string): Promise<void> {
    this.windows.delete(`${scope}:${id}`);
  }

  private sweep(now: number): void {
    for (const [key, window] of this.windows) if (window.resetAt <= now) this.windows.delete(key);
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new CasError("CONFIGURATION_ERROR", `${name} must be a positive integer`);
  return value;
}
