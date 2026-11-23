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

function findExecutable(candidates) {
  return candidates.find(file => {
    try { fs.accessSync(file, fs.constants.X_OK); return true; } catch { return false; }
  });
}

async function downloadVerified(release, target, progress, fetcher = fetch) {
  const options = { headers: { Accept: "application/octet-stream", "User-Agent": "Linloop" }, signal: AbortSignal.timeout(15 * 60 * 1000) };
  let response;
  try { response = await fetcher(release.url, options); }
  catch (error) {
    if (!release.fallbackUrl) throw error;
    response = await fetcher(release.fallbackUrl, options);
  }
  if (!response.ok && release.fallbackUrl) response = await fetcher(release.fallbackUrl, options);
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}). Check the connection and retry.`);
  const partial = `${target}.partial`;
  const hash = crypto.createHash("sha256");
  const file = fs.openSync(partial, "w");
  const total = Number(response.headers.get("content-length"));
  let received = 0, lastPercent = -1;
  try {
    for await (const chunk of response.body) {
      hash.update(chunk);
      fs.writeSync(file, chunk);
      received += chunk.length;
      const percent = total ? Math.floor(received / total * 100) : -1;
      if (percent !== lastPercent) { lastPercent = percent; progress(`Downloading runtime… ${percent}%`); }
    }
    if (hash.digest("hex") !== release.sha256) throw new Error("The runtime checksum did not match. Retry the download.");
  } catch (error) {
    fs.closeSync(file);
    fs.rmSync(partial, { force: true });
    throw error;
  }
  fs.closeSync(file);
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
  constructor(root) { this.root = root; }
  ollamaBinary() {
    return findExecutable([
      path.join(this.root, "ollama/ollama"), path.join(this.root, "ollama/bin/ollama"),
      "/Applications/Ollama.app/Contents/Resources/ollama", path.join(os.homedir(), "Applications/Ollama.app/Contents/Resources/ollama"),
      "/opt/homebrew/bin/ollama", "/usr/local/bin/ollama", path.join(os.homedir(), ".local/bin/ollama"),
    ]);
  }
  environment() {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    return env;
  }
  async models() {
    try {
      const response = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(1200) });
      if (!response.ok) return null;
      const data = await response.json();
      return Array.isArray(data.models) ? data.models.map(item => item.name) : null;
    } catch { return null; }
  }
  async status(value = DEFAULT_MODEL) {
    const selected = parseModel(value);
    let names = await this.models();
    const installed = Boolean(this.ollamaBinary()) || names !== null;
    // Start an existing runtime to inspect its local models. Never download here.
    if (names === null && installed) {
      await this.startRuntime();
      names = await this.models();
    }
    const models = (names || []).filter(name => {
      try { parseModel(name); return true; } catch { return false; }
    });
    return { ...selected, installed, ready: hasModel(models, selected.model),
      defaultReady: hasModel(models, DEFAULT_MODEL), models, busy: Boolean(this.busy),
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
  async installRuntime(progress) {
    if (this.ollamaBinary() || await this.models() !== null) return;
    fs.mkdirSync(this.root, { recursive: true });
    const archive = path.join(this.root, "ollama.tgz");
    await downloadVerified(OLLAMA_RELEASE, archive, progress);
    const destination = path.join(this.root, "ollama");
    fs.mkdirSync(destination, { recursive: true });
    await this.run("/usr/bin/tar", ["-xzf", archive, "-C", destination], progress);
    if (!this.ollamaBinary()) throw new Error("Ollama was not found after installation. Retry setup.");
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
    const server = this.launch(binary, ["serve"], { OLLAMA_HOST: "127.0.0.1:11434",
      ...(privateBinary ? { OLLAMA_MODELS: path.join(this.root, "models/ollama") } : {}) });
    this.server = server;
    await this.waitFor(server, async () => await this.models() !== null);
  }
  async startRuntime() {
    const operation = (this.starting || Promise.resolve()).catch(() => {}).then(() => this.start());
    this.starting = operation;
    try { await operation; } finally { if (this.starting === operation) this.starting = null; }
  }

  async waitFor(server, check) {
    const deadline = Date.now() + 90_000;
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
    return { provider: "ollama", host: OLLAMA_HOST, model };
  }
  operation(key, task, onProgress = (_message: string) => {}) {
    if (this.busy) {
      if (this.installingModel !== key) throw new Error("Another download is in progress.");
      return this.busy;
    }
    this.installingModel = key;
    const progress = message => { this.message = message; onProgress(message); };
    const operation = Promise.resolve().then(() => task(progress)).finally(() => {
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
    const response = await fetch(`${OLLAMA_HOST}/api/pull`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: name, stream: true }), signal: AbortSignal.timeout(20 * 60 * 1000) });
    if (!response.ok || !response.body) throw new Error(`Model download failed (${response.status}). Retry the download.`);
    let pending = "";
    const decoder = new TextDecoder();
    const consume = line => {
      if (!line.trim()) return;
      const event = JSON.parse(line);
      if (event.error) throw new Error(String(event.error));
      progress(event.total ? `Downloading… ${Math.floor((event.completed || 0) / event.total * 100)}%` : String(event.status || "Downloading…"));
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
