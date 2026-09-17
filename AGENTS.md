## Quick Overview

CAS-SDK (`@cqut-openproject/cas-sdk`) is a zero-dependency, cross-runtime TypeScript client SDK for CQUT UIS / CAS authentication, verified on Node.js 22/24. Browser support is limited to independent crypto; Edge/Bun authentication is unverified.

- **Stack**: Node.js 22+, TypeScript 7+ (ESM + CJS, strict, `verbatimModuleSyntax`, `erasableSyntaxOnly`), `tsup`, `tsx`
- **Package Manager**: `pnpm` (10+)
- **Structure**:
  - `src/client/`: High-level CAS client (`cas-client.ts`), endpoint resolvers (`endpoints.ts`), branded types & result types (`types.ts`)
  - `src/cookie/`: RFC 6265 disposable in-memory cookie jar (`cookie-jar.ts`)
  - `src/crypto/`: Zero-dependency RSA PKCS#1 v1.5 with native `BigInt` (`rsa.ts`), password chunk encryptor (`encryptor.ts`)
  - `src/errors/`: Strongly-typed `CasError` and type guards (`cas-error.ts`)
  - `src/http/`: IoC fetcher abstraction & Web Standard Fetch adapter (`default-fetcher.ts`)
  - `src/parser/`: Strict CAS XML subset parser (no DTD/custom entities) (`cas-xml.ts`)
  - `src/polyfill.ts`: Polyfill for `Symbol.dispose` and `Symbol.asyncDispose`
  - `src/index.ts`: Unified SDK exports
  - `src/**/*.test.ts`: Modular unit tests located near source
  - `.github/workflows/`: CI testing (`ci.yml`) and package/release distribution (`publish.yml`)

## Commands & Workflow

- `pnpm install`: Install dependencies
- `pnpm dev`: Start build in watch mode (`tsup --watch`)
- `pnpm test`: Run all unit tests via Node test runner (`tsx --test src/**/*.test.ts`); run a single test: `npx tsx --test <path-to-test.ts>`
- `pnpm lint`: Run TypeScript type check (`tsc --noEmit`)
- `pnpm build`: Build dual ESM/CJS bundles and emit `.d.ts` / `.d.cts` declaration graphs (`dist/`)
- `pnpm format`: Format codebase with Prettier

## Write Code

- Plan first; do NOT rush to code.
- Zero external production dependencies: SDK runtime logic must rely purely on standard ECMAScript / TypeScript.
- Strict TypeScript 7+ & ES Modules with 2-space indentation.
- Adhere to `erasableSyntaxOnly` (no `enum`, no parameter properties, no runtime `namespace`) for 100% Type Stripping compliance.
- Keep domain logic isolated in its corresponding module (`client/`, `cookie/`, `crypto/`, `errors/`, `http/`, `parser/`).
- Login results own session jars and implement `Disposable`; the client holds configuration only. Cleanup releases local references, not remote sessions or guaranteed memory erasure.
- Never commit build artifacts (`dist/`).
- Add regression tests for changes touching auth flows, XML parsing, crypto, or cookie management. All tests must pass locally before completing tasks.

## Response Format

Be concise. Do not write unsolicited "WHY" explanations.

## Commit Convention

Use Gitmoji format: `<emoji> <concise Chinese>` (no `feat:`/`fix:` prefix). e.g., `✨ 新增 Result 模式安全登录` or `🐛 修复 XML 标签解析边界`.

## Validation and publishing

- Run `pnpm format:check`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm check:package`, and `git diff --check`.
- The HTTP adapter returns a single-hop streamed response; credential submission and ticket operations are never retried.
- Fixtures are synthetic reconstructions. Never store credentials, cookies, or real tickets in source or CI.
- Source tags use `release-X.Y.Z`; installable artifacts use immutable `vX.Y.Z`. Do not overwrite version tags or suppress publishing failures.
