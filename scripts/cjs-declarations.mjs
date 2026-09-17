import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// TS 7 emits declarations; tsup's declaration bundler still expects the old TS JS API.
// Mirror the declaration graph with CJS extensions so NodeNext resolves both entrypoints.
async function mirror(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await mirror(path);
    else if (entry.name.endsWith(".d.ts")) {
      const text = await readFile(path, "utf8");
      await writeFile(
        path.replace(/\.d\.ts$/, ".d.cts"),
        text.replace(/(from\s+|import\s*)(["'])(\.[^"']*)\.js\2/g, "$1$2$3.cjs$2"),
      );
    }
  }
}
await mirror("dist");
