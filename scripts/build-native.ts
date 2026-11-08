import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

mkdirSync("compiled/native", { recursive: true });
execFileSync("xcrun", [
  "clang", "-fobjc-arc", "-fvisibility=hidden", "-Os",
  "-framework", "Foundation", "-framework", "CoreServices",
  "src/native/dictionary.m", "-o", "compiled/native/linloop-dictionary",
], { stdio: "inherit" });
