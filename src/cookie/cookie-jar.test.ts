import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { MemoryCookieJar } from "./index.js";

test("MemoryCookieJar stores and retrieves cookies for matching domain and path", () => {
  const jar = new MemoryCookieJar();
  jar.setCookie(
    "CASTGC=TGT-123456; Path=/center-auth-server; HttpOnly",
    "https://uis.cqut.edu.cn/center-auth-server/cas/login",
  );
  jar.setCookie(
    "SESSION=sess-999; Domain=cqut.edu.cn; Path=/",
    "https://uis.cqut.edu.cn/center-auth-server/cas/login",
  );

  const match1 = jar.getCookieString("https://uis.cqut.edu.cn/center-auth-server/sso/doLogin");
  assert.ok(match1.includes("CASTGC=TGT-123456"));
  assert.ok(match1.includes("SESSION=sess-999"));

  const matchSubdomain = jar.getCookieString("https://other.cqut.edu.cn/api");
  assert.ok(matchSubdomain.includes("SESSION=sess-999"));
  assert.ok(!matchSubdomain.includes("CASTGC=TGT-123456")); // different path/host

  const matchOtherDomain = jar.getCookieString("https://example.com/");
  assert.equal(matchOtherDomain, "");
});

test("MemoryCookieJar overwrites cookie with same name and path", () => {
  const jar = new MemoryCookieJar();
  jar.setCookie("token=v1; Path=/", "https://uis.cqut.edu.cn/");
  jar.setCookie("token=v2; Path=/", "https://uis.cqut.edu.cn/");

  assert.equal(jar.getCookieString("https://uis.cqut.edu.cn/test"), "token=v2");
});

test("MemoryCookieJar handles max-age expiration", async () => {
  const jar = new MemoryCookieJar();
  jar.setCookie("temp=val; Max-Age=0", "https://uis.cqut.edu.cn/");
  assert.equal(jar.getCookieString("https://uis.cqut.edu.cn/"), "");
});

test("MemoryCookieJar supports Disposable with using statement", () => {
  let jarRef: MemoryCookieJar;
  {
    using jar = new MemoryCookieJar();
    jarRef = jar;
    jar.setCookie("secret=token; Path=/", "https://uis.cqut.edu.cn/");
    assert.equal(jar.getCookies("https://uis.cqut.edu.cn/").length, 1);
  }
  // Exiting block scope triggers [Symbol.dispose]() which wipes cookies
  assert.equal(jarRef.getCookies("https://uis.cqut.edu.cn/").length, 0);
});

test("host-only cookies do not reach subdomains; foreign Domain is rejected", () => {
  const jar = new MemoryCookieJar();
  jar.setCookie("sid=secret; Path=/", "https://auth.example.com/");
  assert.equal(jar.getCookieString("https://child.auth.example.com/"), "");
  jar.setCookie("other=secret; Domain=foreign.test; Path=/", "https://auth.example.com/");
  assert.equal(jar.getCookieString("https://foreign.test/"), "");
});

test("secure, path and deletion rules remain effective", () => {
  const jar = new MemoryCookieJar();
  jar.setCookie("sid=one; Secure; Path=/auth", "https://auth.example.com/auth/login");
  assert.equal(jar.getCookieString("http://auth.example.com/auth"), "");
  assert.equal(jar.getCookieString("https://auth.example.com/auth-other"), "");
  assert.equal(jar.getCookieString("https://auth.example.com/auth/next"), "sid=one");
  jar.setCookie("sid=gone; Secure; Path=/auth; Max-Age=0", "https://auth.example.com/auth/login");
  assert.equal(jar.getCookieString("https://auth.example.com/auth/next"), "");
  jar.setCookie(
    "past=yes; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/",
    "https://auth.example.com/",
  );
  assert.equal(jar.getCookieString("https://auth.example.com/"), "");
});
