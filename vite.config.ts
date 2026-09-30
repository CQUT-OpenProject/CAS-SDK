import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    deps: { resolveDepSubpath: true },
    entry: ["src/index.ts", "src/crypto/index.ts"],
    format: ["esm", "cjs"],
    tsconfig: "tsconfig.build.json",
    dts: false,
    clean: true,
    sourcemap: true,
    target: "es2022",
    fixedExtension: false,
  },
  test: {
    // Preserve Vitest v4 mock-call history behavior on Vitest v5.
    // Remove after tests no longer rely on calls from setup or earlier tests.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
    clearMocks: false,
    include: ["src/**/*.test.ts"],
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    semi: true,
    singleQuote: false,
    useTabs: false,
    tabWidth: 2,
    endOfLine: "lf",
    insertFinalNewline: true,
    trailingComma: "all",
    printWidth: 100,
    sortPackageJson: false,
    ignorePatterns: ["node_modules/", "dist/", "coverage/", "pnpm-lock.yaml"],
  },
  staged: {
    "*.{js,mjs,cjs,ts}": "vp check --fix",
    "*.{json,md,yml,yaml}": "vp fmt",
  },
});
