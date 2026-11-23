import { execFileSync } from "node:child_process";
import { cpSync, readFileSync, rmSync, mkdirSync } from "node:fs";

rmSync("compiled", { force: true, recursive: true });
execFileSync("bunx", ["tsc", "--project", "tsconfig.build.json"], { stdio: "inherit" });
execFileSync("bunx", ["tsc", "--project", "tsconfig.renderer.json"], { stdio: "inherit" });
execFileSync("bun", ["scripts/build-native.ts"], { stdio: "inherit" });
mkdirSync("compiled/native", { recursive: true });
const renderer = readFileSync("compiled/src/renderer/app.js", "utf8");
if (renderer.includes("Object.defineProperty(exports")) {
  throw new Error("Renderer was compiled as CommonJS instead of a browser script");
}
cpSync("src/renderer/index.html", "compiled/src/renderer/index.html");
cpSync("src/renderer/styles.css", "compiled/src/renderer/styles.css");

execFileSync("bun", ["build", "src/renderer/markdown.ts", "--target=browser", "--format=iife", "--outfile=compiled/src/renderer/markdown.js"], { stdio: "inherit" });
