import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

// Run `bun run build` first to check the same script that the build executes.
const source = readFileSync("compiled/scripts/build-native.js", "utf8");

for (const platform of ["win32", "linux", "darwin"]) {
  const calls: { command: string; args: string[] }[] = [];
  runInNewContext(source, {
    exports: {},
    process: { platform },
    require(name: string) {
      if (name === "node:fs") return { mkdirSync() {} };
      if (name === "node:child_process") return {
        execFileSync(command: string, args: string[]) { calls.push({ command, args }); },
      };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  if (platform !== "darwin") {
    assert.equal(calls.length, 0, `${platform} must not run the macOS compiler`);
  } else {
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, "xcrun");
    assert.ok(calls[0].args.includes("src/native/dictionary.m"));
    const architectures = calls[0].args.filter((_, index, args) => args[index - 1] === "-arch");
    assert.equal(architectures.join(","), "x86_64,arm64");
  }
}
console.log("PASS: native dictionary builds for both Mac architectures and skips other systems");
