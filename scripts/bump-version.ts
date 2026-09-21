import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

type Bump = "major" | "minor" | "patch";

const bump = (process.argv[2] ?? "patch") as Bump;
if (!["major", "minor", "patch"].includes(bump)) {
  console.error("Usage: bun scripts/bump-version.ts [major|minor|patch]");
  process.exit(1);
}

const path = "package.json";
const pkg = JSON.parse(readFileSync(path, "utf8")) as { version: string };
const match = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(pkg.version);
if (!match) {
  console.error(`Cannot parse package.json version: ${pkg.version}`);
  process.exit(1);
}

let [major, minor, patch] = match.slice(1, 4).map(Number);
if (bump === "major") {
  major += 1;
  minor = 0;
  patch = 0;
} else if (bump === "minor") {
  minor += 1;
  patch = 0;
} else {
  patch += 1;
}

const version = `${major}.${minor}.${patch}`;
const tag = `v${version}`;
pkg.version = version;
writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);

execFileSync("git", ["add", "package.json"], { stdio: "inherit" });
execFileSync("git", ["commit", "-m", `Release ${tag}`], { stdio: "inherit" });
execFileSync("git", ["tag", "-a", tag, "-m", `Release ${tag}`], { stdio: "inherit" });

console.log(`\nCreated commit and tag ${tag}.`);
console.log("Push the release with:");
console.log(`  git push origin HEAD ${tag}`);
