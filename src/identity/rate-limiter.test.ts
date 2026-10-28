import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { CasError } from "../errors/cas-error.js";
import { MemoryRateLimiter } from "./rate-limiter.js";

test("applies separate limits per scope within a fixed window", async () => {
  let now = 0;
  const limiter = new MemoryRateLimiter({
    windowMs: 1000,
    maxPerAccount: 2,
    maxPerClient: 3,
    now: () => now,
  });
  assert.equal((await limiter.consume("account", "a")).allowed, true);
  assert.equal((await limiter.consume("account", "a")).allowed, true);
  now = 400;
  assert.deepEqual(await limiter.consume("account", "a"), { allowed: false, retryAfterMs: 600 });
  assert.equal((await limiter.consume("account", "b")).allowed, true, "keys are independent");
  for (let i = 0; i < 3; i++) assert.equal((await limiter.consume("client", "a")).allowed, true);
  assert.equal((await limiter.consume("client", "a")).allowed, false, "scopes are independent");
  now = 1000;
  assert.equal((await limiter.consume("account", "a")).allowed, true, "window expires");
});

test("reset clears a key", async () => {
  const limiter = new MemoryRateLimiter({ maxPerAccount: 1 });
  await limiter.consume("account", "a");
  assert.equal((await limiter.consume("account", "a")).allowed, false);
  await limiter.reset("account", "a");
  assert.equal((await limiter.consume("account", "a")).allowed, true);
});

test("rejects invalid configuration", () => {
  for (const options of [{ windowMs: 0 }, { maxPerAccount: 1.5 }, { maxPerClient: -1 }])
    assert.throws(
      () => new MemoryRateLimiter(options),
      (error) => error instanceof CasError && error.kind === "CONFIGURATION_ERROR",
    );
});
