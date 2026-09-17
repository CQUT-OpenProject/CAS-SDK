import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/crypto/index.ts"],
  format: ["esm", "cjs"],
  tsconfig: "tsconfig.build.json",
  dts: false,
  clean: true,
  sourcemap: true,
  target: "es2022",
  splitting: false,
});
