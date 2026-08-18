## Quick Overview

CAS-SDK (`@cqut-openproject/cas-sdk`) is a zero-dependency, cross-runtime TypeScript client SDK for CQUT UIS / CAS authentication, supporting Node.js, Cloudflare Workers, Vercel Edge, Bun, and modern browsers.

- **Stack**: Node.js 18+, TypeScript 7+ (ESM + CJS, strict, `verbatimModuleSyntax`, `erasableSyntaxOnly`), `tsup`, `tsx`
- **Package Manager**: `pnpm` (10+)
- **Structure**:
  - `src/client/`: High-level CAS client (`cas-client.ts`), endpoint resolvers (`endpoints.ts`), branded types & result types (`types.ts`)
  - `src/cookie/`: RFC 6265 disposable in-memory cookie jar (`cookie-jar.ts`)
  - `src/crypto/`: Zero-dependency RSA PKCS#1 v1.5 with native `BigInt` (`rsa.ts`), password chunk encryptor (`encryptor.ts`)
  - `src/errors/`: Strongly-typed `CasError` and type guards (`cas-error.ts`)
  - `src/http/`: IoC fetcher abstraction & Web Standard Fetch adapter (`default-fetcher.ts`)
  - `src/parser/`: Safe XML ticket parser with anti-XXE & Doctype defenses (`cas-xml.ts`)
  - `src/polyfill.ts`: Polyfill for `Symbol.dispose` and `Symbol.asyncDispose`
  - `src/index.ts`: Unified SDK exports
  - `src/**/*.test.ts`: Modular unit tests located near source
  - `.github/workflows/`: CI testing (`ci.yml`) and package/release distribution (`publish.yml`)

## Commands & Workflow

- `pnpm install`: Install dependencies
- `pnpm dev`: Start build in watch mode (`tsup --watch`)
- `pnpm test`: Run all unit tests via Node test runner (`tsx --test src/**/*.test.ts`); run a single test: `npx tsx --test <path-to-test.ts>`
- `pnpm lint`: Run TypeScript type check (`tsc --noEmit`)
- `pnpm build`: Build dual ESM/CJS bundles and emit `.d.ts` declaration files (`dist/`)
- `pnpm format`: Format codebase with Prettier

## Write Code

- Plan first; do NOT rush to code.
- Zero external production dependencies: SDK runtime logic must rely purely on standard ECMAScript / TypeScript.
- Strict TypeScript 7+ & ES Modules with 2-space indentation.
- Adhere to `erasableSyntaxOnly` (no `enum`, no parameter properties, no runtime `namespace`) for 100% Type Stripping compliance.
- Keep domain logic isolated in its corresponding module (`client/`, `cookie/`, `crypto/`, `errors/`, `http/`, `parser/`).
- Implement `Disposable` / `AsyncDisposable` on resource-holding entities to prevent sensitive credential retention in memory.
- Never commit build artifacts (`dist/`).
- Add regression tests for changes touching auth flows, XML parsing, crypto, or cookie management. All tests must pass locally before completing tasks.

## Response Format

Be concise. Do not write unsolicited "WHY" explanations.

## Commit Convention

Use Gitmoji format: `<emoji> <concise Chinese>` (no `feat:`/`fix:` prefix). e.g., `✨ 新增 Result 模式安全登录` or `🐛 修复 XML 标签解析边界`.
