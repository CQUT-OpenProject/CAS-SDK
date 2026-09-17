import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const temporary = await mkdtemp(join(tmpdir(), "cas-sdk-package-"));
const run = (command, args, cwd = root) =>
  execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const node = process.execPath;
const pkg = JSON.parse(await readFile("package.json", "utf8"));

async function checkConsumer(name, source, types = false) {
  const dir = join(temporary, name);
  await mkdir(dir);
  await writeFile(join(dir, "package.json"), JSON.stringify({ private: true, type: "module" }));
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", source], dir);
  await writeFile(
    join(dir, "smoke.mjs"),
    `import assert from 'node:assert/strict'; import { createCasClient } from '${pkg.name}'; import { getSecretParam } from '${pkg.name}/crypto'; assert.equal(typeof createCasClient().login,'function'); assert.ok(getSecretParam('synthetic'));`,
  );
  await writeFile(
    join(dir, "smoke.cjs"),
    `const assert=require('node:assert/strict'); const {createCasClient}=require('${pkg.name}'); const {getSecretParam}=require('${pkg.name}/crypto'); assert.equal(typeof createCasClient().login,'function'); assert.ok(getSecretParam('synthetic'));`,
  );
  run(node, ["smoke.mjs"], dir);
  run(node, ["smoke.cjs"], dir);
  if (types) {
    const common = `const opts = {account:'a',password:'b',serviceUrl:'https://service.test'};
async function check(flag: boolean) {
  using ticket = await sdk.createCasClient().login(opts);
  ticket.ticket;
  // @ts-expect-error ticket results do not claim a verified identity
  ticket.validation;
  using validated = await sdk.createCasClient().login({...opts,validate:true});
  validated.validation.user;
  // @ts-expect-error consumed tickets cannot be returned for redemption
  validated.ticket;
  using either = await sdk.createCasClient().login({...opts,validate:flag});
  if (either.kind === 'ticket') either.ticket; else either.validation;
  const safe = await sdk.createCasClient().safeLogin({...opts,validate:true});
  if (safe.ok) safe.data.validation;
  getSecretParam('synthetic');
}
`;
    await writeFile(
      join(dir, "consumer.mts"),
      `import * as sdk from '${pkg.name}'; import {getSecretParam} from '${pkg.name}/crypto';\n` +
        common,
    );
    await writeFile(
      join(dir, "consumer.cts"),
      `import sdk = require('${pkg.name}'); import crypto = require('${pkg.name}/crypto'); const {getSecretParam}=crypto;\n` +
        common,
    );
    await writeFile(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          lib: ["ES2022", "DOM", "DOM.Iterable", "ESNext.Disposable"],
          types: [],
          noEmit: true,
        },
        include: ["consumer.mts", "consumer.cts"],
      }),
    );
    run(resolve(root, "node_modules/.bin/tsc"), ["-p", "tsconfig.json"], dir);
  }
  console.log(`PASS ${name}: ESM/CJS${types ? " and NodeNext declarations" : ""}`);
}

try {
  const packed = JSON.parse(
    run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", temporary]),
  );
  assert.ok(
    !packed[0].files.some((file) => /\.test\.|fixtures\//.test(file.path)),
    "test declarations must not ship",
  );
  await checkConsumer("tarball", join(temporary, packed[0].filename), true);
  const artifact = join(temporary, "artifact");
  assert.equal(
    run(node, ["scripts/prepare-release.mjs", artifact, `release-${pkg.version}`]),
    `v${pkg.version}`,
  );
  assert.throws(() =>
    run(node, ["scripts/prepare-release.mjs", join(temporary, "mismatch"), "release-0.0.0"]),
  );
  run("git", ["init", "-b", "release"], artifact);
  run("git", ["config", "user.name", "SDK package test"], artifact);
  run("git", ["config", "user.email", "sdk-test@example.invalid"], artifact);
  run("git", ["add", "."], artifact);
  run("git", ["commit", "-m", "Synthetic release artifact"], artifact);
  run("git", ["tag", `v${pkg.version}`], artifact);
  assert.throws(() => run("git", ["tag", `v${pkg.version}`], artifact));
  const url = `git+${pathToFileURL(artifact).href}`;
  await checkConsumer("git-branch", `${url}#release`);
  await checkConsumer("git-tag", `${url}#v${pkg.version}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
