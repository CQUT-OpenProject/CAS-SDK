import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/crypto/index.ts"],
  format: ["esm", "cjs"],
  dts: false,
  clean: false,
  sourcemap: true,
  target: "es2022",
  splitting: false,
});
