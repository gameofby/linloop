import { execFileSync } from "node:child_process";
import { cpSync, rmSync } from "node:fs";

rmSync("compiled", { force: true, recursive: true });
execFileSync("bunx", ["tsc", "--project", "tsconfig.build.json"], { stdio: "inherit" });
cpSync("src/renderer/index.html", "compiled/src/renderer/index.html");
cpSync("src/renderer/styles.css", "compiled/src/renderer/styles.css");
