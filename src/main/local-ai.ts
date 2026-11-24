const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const DEFAULT_MODEL = "qwen2.5:0.5b";
const OLLAMA_HOST = "http://127.0.0.1:11434";
const OLLAMA_RELEASE = {
  url: "https://api.github.com/repos/ollama/ollama/releases/assets/774304881",
  fallbackUrl: "https://github.com/ollama/ollama/releases/download/v0.40.17/ollama-darwin.tgz",
  sha256: "4b9db20d077c5a1e52fb4a6f2e6791f76ae945fd07c9b1a5647c82e927826653",
};

function parseModel(value) {
  const model = String(value || "").trim();
  if (model.length > 160 || !/^[a-zA-Z0-9_][\w.-]*(?::[a-zA-Z0-9_][\w.-]*)?$/.test(model) || model.includes("..")) {
    throw new Error("Use a model from the Ollama library, such as qwen2.5:0.5b.");
  }
  return { provider: "ollama", model };
}
function hasModel(names, model) {
  return Boolean(names?.includes(model) || (!model.includes(":") && names?.includes(`${model}:latest`)));
}

function transferSize(completed, total) {
  const scale = total >= 1048576 ? 1048576 : total >= 1024 ? 1024 : 1;
  const unit = scale === 1048576 ? "MiB" : scale === 1024 ? "KiB" : "B";
  const digits = scale === 1 ? 0 : 1;
  return `${(completed / scale).toFixed(digits)} / ${(total / scale).toFixed(digits)} ${unit}`;
}

function findExecutable(candidates) {
  return candidates.find(file => {
    try { fs.accessSync(file, fs.constants.X_OK); return true; } catch { return false; }
  });
}

async function downloadVerified(release, target, progress, fetcher = fetch) {
  const partial = `${target}.partial`;
  const matches = file => fs.existsSync(file) && crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") === release.sha256;
  if (matches(target)) { progress("Runtime download complete"); return; }
  // A complete download can remain here if the app stopped before rename.
  if (matches(partial)) { fs.renameSync(partial, target); return; }
  let offset = fs.existsSync(partial) ? fs.statSync(partial).size : 0;
  const options = { headers: { Accept: "application/octet-stream", "User-Agent": "Linloop", ...(offset ? { Range: `bytes=${offset}-` } : {}) }, signal: AbortSignal.timeout(15 * 60 * 1000) };
  let response;
  try { response = await fetcher(release.url, options); }
  catch (error) {
    if (!release.fallbackUrl) throw error;
    response = await fetcher(release.fallbackUrl, options);
  }
  if (!response.ok && release.fallbackUrl) response = await fetcher(release.fallbackUrl, options);
  if (response.status === 416 && offset) {
    fs.rmSync(partial, { force: true });
    return downloadVerified(release, target, progress, fetcher);
  }
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}). Retry to continue setup.`);
  let total = Number(response.headers.get("content-length"));
  if (response.status === 206) {
    const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") || "");
    if (!range || Number(range[1]) !== offset) throw new Error("Invalid download range. Retry setup.");
    total = Number(range[3]);
  } else offset = 0; // Servers may ignore Range. Replace, never append, a full response.
  const file = fs.openSync(partial, offset ? "a" : "w");
  let received = offset, lastUpdate = 0;
  try {
    for await (const chunk of response.body) {
      let written = 0;
      while (written < chunk.length) written += fs.writeSync(file, chunk, written, chunk.length - written);
      received += chunk.length;
      if (Date.now() - lastUpdate >= 150 || received === total) {
        lastUpdate = Date.now();
        progress(`Downloading runtime… ${total ? Math.min(100, Math.floor(received / total * 100)) + "% · " : ""}${(received / 1048576).toFixed(1)}${total ? " / " + (total / 1048576).toFixed(1) : ""} MiB`);
      }
    }
  } finally { fs.closeSync(file); } // Keep bytes after network failure or app exit.
  if (!matches(partial)) {
    fs.rmSync(partial, { force: true });
    throw new Error("The runtime checksum did not match. Retry the download.");
  }
  fs.renameSync(partial, target);
}

class LocalAI {
  root;
  busy = null;
  installingModel = "";
  starting = null;
  server = null;
  closed = false;
  children = new Set<any>();
  message = "";
  host;
  localOnly;
  release;
  constructor(root, options: any = {}) {
    this.root = root;
    this.host = options.host || OLLAMA_HOST;
    this.localOnly = Boolean(options.localOnly);
    this.release = options.release || OLLAMA_RELEASE;
  }
  ollamaBinary() {
    return findExecutable([
      ...(fs.existsSync(path.join(this.root, "ollama/.complete")) ? [path.join(this.root, "ollama/ollama"), path.join(this.root, "ollama/bin/ollama")] : []),
      ...(this.localOnly ? [] : [
      "/Applications/Ollama.app/Contents/Resources/ollama", path.join(os.homedir(), "Applications/Ollama.app/Contents/Resources/ollama"),
      "/opt/homebrew/bin/ollama", "/usr/local/bin/ollama", path.join(os.homedir(), ".local/bin/ollama"), ]),
    ]);
  }
  environment() {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    return env;
  }
  async models() {
    try {
      const response = await fetch(`${this.host}/api/tags`, { signal: AbortSignal.timeout(1200) });
      if (!response.ok) return null;
      const data = await response.json();
      return Array.isArray(data.models) ? data.models.map(item => item.name) : null;
    } catch { return null; }
  }
  async status(value = DEFAULT_MODEL) {
    const selected = parseModel(value);
    let names = await this.models();
    if (names === null && !this.ollamaBinary()) {
      await this.reuseLegacyRuntime();
      names = await this.models();
    }
    const installed = Boolean(this.ollamaBinary()) || names !== null;
    // Start an existing runtime to inspect its local models. Never download here.
    if (names === null && installed) {
      await this.startRuntime();
      names = await this.models();
    }
    let pendingKey = "";
    try { pendingKey = JSON.parse(fs.readFileSync(path.join(this.root, "pending.json"), "utf8")).key || ""; } catch {}
    const models = (names || []).filter(name => {
      try { parseModel(name); return true; } catch { return false; }
    });
    return { ...selected, installed, ready: hasModel(models, selected.model),
      defaultReady: hasModel(models, DEFAULT_MODEL), models, busy: Boolean(this.busy),
      resumable: pendingKey === "initialize", pendingModel: pendingKey && pendingKey !== "initialize" ? pendingKey : "", operation: this.installingModel,
      message: this.busy ? this.message : !installed ? "Not installed" : hasModel(models, DEFAULT_MODEL) ? "Ready" : "Default model needed" };
  }

  run(executable, args, progress, timeout = 20 * 60 * 1000) {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(executable, args, { env: this.environment(), stdio: ["ignore", "pipe", "pipe"] });
      this.children.add(child);
      let output = "";
      const timer = setTimeout(() => { child.kill(); reject(new Error("Installation timed out. Check the connection and retry.")); }, timeout);
      const read = data => {
        output = (output + data.toString()).slice(-6000);
        const matches = [...data.toString().matchAll(/\b(\d{1,3})%/g)];
        if (matches.length && progress) progress(`Downloading model… ${matches.at(-1)[1]}%`);
      };
      child.stdout.on("data", read); child.stderr.on("data", read);
      child.on("error", error => { clearTimeout(timer); this.children.delete(child); reject(error); });
      child.on("close", code => {
        clearTimeout(timer); this.children.delete(child);
        if (code === 0) resolve(output);
        else {
          fs.mkdirSync(this.root, { recursive: true });
          fs.writeFileSync(path.join(this.root, "last-setup.log"), output);
          reject(new Error("Local AI setup failed. Check the connection and retry."));
        }
      });
    });
  }
  async reuseLegacyRuntime() {
    const marker = path.join(this.root, "ollama/.complete");
    if (fs.existsSync(marker)) return;
    const binary = findExecutable([path.join(this.root, "ollama/ollama"), path.join(this.root, "ollama/bin/ollama")]);
    if (!binary) return;
    // Older versions had no completion marker. Reuse them only after a health check.
    const server = this.launch(binary, ["serve"], { OLLAMA_HOST: this.host, OLLAMA_MODELS: path.join(this.root, "models/ollama") });
    try {
      await this.waitFor(server, async () => await this.models() !== null, 15_000);
      fs.writeFileSync(marker, "legacy-health-checked");
      this.server = server;
    } catch { server.child.kill(); }
  }
  async installRuntime(progress) {
    if (this.ollamaBinary() || await this.models() !== null) return;
    await this.reuseLegacyRuntime();
    if (this.ollamaBinary()) return;
    fs.mkdirSync(this.root, { recursive: true });
    const archive = path.join(this.root, "ollama.tgz");
    await downloadVerified(this.release, archive, progress);
    const destination = path.join(this.root, "ollama");
    const staging = path.join(this.root, "ollama.installing");
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });
    progress("Extracting runtime…");
    await this.run("/usr/bin/tar", ["-xzf", archive, "-C", staging], progress);
    const binary = findExecutable([path.join(staging, "ollama"), path.join(staging, "bin/ollama")]);
    if (!binary) throw new Error("Ollama was not found after installation. Retry setup.");
    await this.run(binary, ["--version"], null, 30_000);
    fs.writeFileSync(path.join(staging, ".complete"), this.release.sha256);
    fs.rmSync(destination, { recursive: true, force: true });
    fs.renameSync(staging, destination);
    fs.rmSync(archive, { force: true });
  }

  launch(executable, args, extraEnv = {}) {
    const child = spawn(executable, args, { env: { ...this.environment(), ...extraEnv }, stdio: ["ignore", "ignore", "pipe"] });
    this.children.add(child);
    const server = { child, error: "", exited: false, host: "", model: "", provider: "" };
    child.stderr.on("data", data => { server.error = (server.error + data.toString()).slice(-2000); });
    child.on("error", error => { server.error = error.message; server.exited = true; });
    child.on("exit", () => { server.exited = true; this.children.delete(child); });
    return server;
  }
  async start() {
    if (this.closed) throw new Error("Linloop is closing.");
    if (await this.models() !== null) return;
    const binary = this.ollamaBinary();
    if (!binary) throw new Error("Open Settings and set up Ollama first.");
    const privateBinary = binary.startsWith(this.root + path.sep);
    const server = this.launch(binary, ["serve"], { OLLAMA_HOST: this.host,
      ...(privateBinary ? { OLLAMA_MODELS: path.join(this.root, "models/ollama") } : {}) });
    this.server = server;
    await this.waitFor(server, async () => await this.models() !== null);
  }
  async startRuntime() {
    const operation = (this.starting || Promise.resolve()).catch(() => {}).then(() => this.start());
    this.starting = operation;
    try { await operation; } finally { if (this.starting === operation) this.starting = null; }
  }

  async waitFor(server, check, timeout = 90_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline && !this.closed) {
      if (server.exited) throw new Error(`Local AI could not start. ${server.error.slice(-800)}`);
      if (await check()) return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    server.child.kill();
    throw new Error("Local AI did not start in time. Open Settings and retry setup.");
  }
  async requireModel(value) {
    const selected = parseModel(value);
    await this.startRuntime();
    if (!hasModel(await this.models(), selected.model)) throw new Error("Download this model in Settings before selecting it.");
    return selected.model;
  }
  async connection(value) {
    if (this.busy) throw new Error("A download is in progress. Wait for it to finish.");
    const model = await this.requireModel(value);
    return { provider: "ollama", host: this.host, model };
  }
  operation(key, task, onProgress = (_message: string) => {}) {
    if (this.busy) {
      if (this.installingModel !== key) throw new Error("Another download is in progress.");
      return this.busy;
    }
    this.installingModel = key;
    fs.mkdirSync(this.root, { recursive: true });
    const pending = path.join(this.root, "pending.json");
    fs.writeFileSync(pending, JSON.stringify({ key }));
    const progress = message => { this.message = message; onProgress(message); };
    const operation = Promise.resolve().then(() => task(progress)).then(result => {
      fs.rmSync(pending, { force: true });
      return result;
    }).finally(() => {
      this.busy = null; this.installingModel = "";
    });
    this.busy = operation;
    return operation;
  }
  async pullIfMissing(value, progress) {
    const selected = parseModel(value);
    if (hasModel(await this.models(), selected.model)) { progress("Already installed"); return; }
    // Fully qualify the official namespace. No third-party registries or namespaces.
    const name = `registry.ollama.ai/library/${selected.model}`;
    const response = await fetch(`${this.host}/api/pull`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: name, stream: true }), signal: AbortSignal.timeout(20 * 60 * 1000) });
    if (!response.ok || !response.body) throw new Error(`Model download failed (${response.status}). Retry the download.`);
    let pending = "", lastProgress = 0;
    const decoder = new TextDecoder();
    const consume = line => {
      if (!line.trim()) return;
      const event = JSON.parse(line);
      if (event.error) throw new Error(String(event.error));
      if (event.total && event.completed < event.total && Date.now() - lastProgress < 150) return;
      lastProgress = Date.now();
      progress(event.total ? `Downloading… ${Math.floor((event.completed || 0) / event.total * 100)}% · ${transferSize(event.completed || 0, event.total)}` : String(event.status || "Downloading…"));
    };
    for await (const chunk of response.body) {
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split("\n"); pending = lines.pop(); lines.forEach(consume);
    }
    pending += decoder.decode(); if (pending.trim()) consume(pending);
    if (!hasModel(await this.models(), selected.model)) throw new Error("The model download did not finish. Retry the download.");
    progress("Downloaded");
  }
  // Initial setup always prepares Ollama and the default model only.
  setup(value = DEFAULT_MODEL, onProgress = (_message: string) => {}) {
    if (value !== DEFAULT_MODEL) throw new Error("Initial setup uses the default model. Download other models separately.");
    return this.operation("initialize", async progress => {
      progress("Checking Ollama…");
      await this.installRuntime(progress);
      progress("Starting Ollama…");
      await this.startRuntime();
      await this.pullIfMissing(DEFAULT_MODEL, progress);
      progress("Ready");
    }, onProgress);
  }
  downloadModel(value, onProgress = (_message: string) => {}) {
    const selected = parseModel(value);
    return this.operation(selected.model, async progress => {
      // This path never installs or updates the runtime, and never selects a model.
      await this.startRuntime();
      await this.pullIfMissing(selected.model, progress);
    }, onProgress);
  }

  stop() { this.closed = true; for (const child of this.children) child.kill(); this.children.clear(); }
}

let instance;
function manager() {
  if (!instance) instance = new LocalAI(path.join(require("electron").app.getPath("userData"), "local-ai"));
  return instance;
}
module.exports = { DEFAULT_MODEL, DEFAULT_OLLAMA_MODEL: DEFAULT_MODEL, parseModel, LocalAI, downloadVerified,
  status: model => manager().status(model), initialize: progress => manager().setup(DEFAULT_MODEL, progress),
  downloadModel: (model, progress) => manager().downloadModel(model, progress),
  requireModel: model => manager().requireModel(model), connection: model => manager().connection(model),
  stop: () => instance?.stop() };
