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
    tabWidth: 2,
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
