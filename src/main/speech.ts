const { spawn, execFileSync } = require("node:child_process");

let active;

function stop() {
  if (active) {
    active.kill();
    active = undefined;
  }
}

let frenchVoice;

function speak(text, language = "en") {
  if (process.platform !== "darwin") {
    return Promise.reject(new Error("Pronunciation is available on macOS."));
  }
  if (typeof text !== "string" || !text.trim()) {
    return Promise.reject(new Error("Type a sentence first."));
  }
  if (text.length > 20000) {
    return Promise.reject(new Error("Pronunciation supports up to 20,000 characters."));
  }
  let args = [];
  if (language === "fr") {
    if (!frenchVoice) {
      const voices = execFileSync("/usr/bin/say", ["-v", "?"], { encoding: "utf8" });
      const entries = [...voices.matchAll(/^(.+?)\s+fr_([A-Z]+)\s+#/gm)];
      frenchVoice = (entries.find((entry) => entry[2] === "FR") || entries[0])?.[1].trim();
    }
    if (!frenchVoice) return Promise.reject(new Error("Install a French voice in macOS System Settings to use French pronunciation."));
    args = ["-v", frenchVoice];
  }
  stop();
  return new Promise((resolve, reject) => {
    // say uses the macOS Speech Synthesis Manager and the system voice.
    // Send text over stdin so sentences can never become command options.
    const child = spawn("/usr/bin/say", args, { stdio: ["pipe", "ignore", "pipe"] });
    active = child;
    let error = "";
    child.stderr.on("data", (data) => { error = (error + data).slice(-2000); });
    child.on("error", reject);
    child.stdin.on("error", (err) => {
      if (err.code !== "EPIPE") reject(err);
    });
    child.on("close", (code, signal) => {
      if (active === child) active = undefined;
      if (signal === "SIGTERM") resolve({ stopped: true });
      else if (code === 0) resolve({ stopped: false });
      else reject(new Error(error.trim() || "macOS could not pronounce this text."));
    });
    child.stdin.end(text.trim());
  });
}

module.exports = { speak, stop };
