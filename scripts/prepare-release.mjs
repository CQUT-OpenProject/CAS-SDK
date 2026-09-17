import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const destination = process.argv[2];
if (!destination)
  throw new Error("Usage: node scripts/prepare-release.mjs <empty-directory> [release-X.Y.Z]");
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const sourceTag = process.argv[3];
if (sourceTag && sourceTag !== `release-${pkg.version}`)
  throw new Error("Source release tag must match package.json version");
await mkdir(destination, { recursive: true });
for (const name of ["dist", "README.md", "LICENSE"]) {
  await cp(name, resolve(destination, name), { recursive: true });
}
delete pkg.scripts;
delete pkg.devDependencies;
await writeFile(resolve(destination, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
console.log(`v${pkg.version}`);
