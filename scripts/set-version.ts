import { readFileSync, writeFileSync } from "node:fs";

const raw = process.argv[2];
if (!raw) {
  console.error("Usage: bun scripts/set-version.ts <version>");
  process.exit(1);
}

const version = raw.replace(/^v/i, "");
if (!/^\d+\.\d+\.\d+([.-][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid version: ${raw}`);
  process.exit(1);
}

const path = "package.json";
const pkg = JSON.parse(readFileSync(path, "utf8")) as { version: string };
pkg.version = version;
writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`package.json version set to ${version}`);
