import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

if (process.platform === "darwin") {
  mkdirSync("compiled/native", { recursive: true });
  execFileSync("xcrun", [
    "clang", "-arch", "x86_64", "-arch", "arm64",
    "-fobjc-arc", "-fvisibility=hidden", "-Os",
    "-framework", "Foundation", "-framework", "CoreServices",
    "src/native/dictionary.m", "-o", "compiled/native/linloop-dictionary",
  ], { stdio: "inherit" });
}
