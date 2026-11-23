const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const net = require("node:net");
const { spawn } = require("node:child_process");

const DEFAULT_OLLAMA_MODEL = "qwen2.5:0.5b";
const DEFAULT_MLX_MODEL = "mlx-community/Qwen2.5-0.5B-Instruct-4bit";
const DEFAULT_MODEL = process.arch === "arm64" ? DEFAULT_MLX_MODEL : DEFAULT_OLLAMA_MODEL;
const OLLAMA_HOST = "http://127.0.0.1:11434";
const RELEASES = {
  uv: {
    url: "https://api.github.com/repos/astral-sh/uv/releases/assets/758513631",
    fallbackUrl: "https://github.com/astral-sh/uv/releases/download/0.13.9/uv-aarch64-apple-darwin.tar.gz",
    sha256: "5aeca67f2283f75235de40d0bd9c0a5bbc5fce23b6d48b3bf9fa1b2db08382ca",
  },
  ollama: {
    url: "https://api.github.com/repos/ollama/ollama/releases/assets/774304881",
    fallbackUrl: "https://github.com/ollama/ollama/releases/download/v0.40.17/ollama-darwin.tgz",
    sha256: "4b9db20d077c5a1e52fb4a6f2e6791f76ae945fd07c9b1a5647c82e927826653",
  },
};

function parseModel(value, arch = process.arch) {
  const model = String(value || "").trim();
  if (model.length > 200 || !model || model.includes("..") || model.startsWith("-")) {
    throw new Error("Enter a valid model name.");
  }
  if (/^[\w.-]+\/[\w.-]+$/.test(model)) {
    if (arch !== "arm64") throw new Error("MLX models require an Apple Silicon Mac. Use an Ollama model name on Intel.");
    return { provider: "mlx", model };
  }
  if (!/^[\w.-]+(?::[\w.-]+)?$/.test(model)) {
    throw new Error("Use an Ollama model name or an MLX repository name, such as mlx-community/Qwen2.5-0.5B-Instruct-4bit.");
  }
  return { provider: "ollama", model };
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
  arch;
  busy = null;
  installingModel = "";
  starting = null;
  server = null;
  closed = false;
  children = new Set<any>();
  message = "";
  constructor(root, arch = process.arch) { this.root = root; this.arch = arch; }
  get python() { return path.join(this.root, "mlx-env/bin/python"); }
  modelDir(model) { return path.join(this.root, "models", crypto.createHash("sha256").update(model).digest("hex").slice(0, 20)); }
  ollamaBinary() {
    return findExecutable([
      path.join(this.root, "ollama/ollama"), path.join(this.root, "ollama/bin/ollama"),
      "/Applications/Ollama.app/Contents/Resources/ollama", path.join(os.homedir(), "Applications/Ollama.app/Contents/Resources/ollama"),
      "/opt/homebrew/bin/ollama", "/usr/local/bin/ollama", path.join(os.homedir(), ".local/bin/ollama"),
    ]);
  }
  environment() {
    const env: Record<string, string> = { ...process.env, UV_PYTHON_INSTALL_DIR: path.join(this.root, "python"),
      UV_CACHE_DIR: path.join(this.root, "cache/uv"), HF_HOME: path.join(this.root, "cache/huggingface"),
      PYTHONUNBUFFERED: "1", TOKENIZERS_PARALLELISM: "false", HF_HUB_DISABLE_TELEMETRY: "1", HF_HUB_DISABLE_XET: "1", HF_HUB_ETAG_TIMEOUT: "8", HF_HUB_DOWNLOAD_TIMEOUT: "30" };
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
  async status(value) {
    const selected = parseModel(value, this.arch);
    const installed = selected.provider === "mlx"
      ? fs.existsSync(this.python) && fs.existsSync(path.join(this.root, "mlx-ready.json"))
      : Boolean(this.ollamaBinary());
    const names = selected.provider === "ollama" ? await this.models() : null;
    const ready = selected.provider === "mlx"
      ? installed && fs.existsSync(path.join(this.modelDir(selected.model), ".linloop-ready"))
      : Boolean(names?.includes(selected.model) || names?.includes(`${selected.model}:latest`));
    return { ...selected, installed: installed || names !== null, ready, busy: Boolean(this.busy),
      message: this.busy ? this.message : ready ? "Ready" : installed ? "Download the selected model to start." : "Install local AI and download the selected model." };
  }
  run(executable, args, progress, timeout = 20 * 60 * 1000) {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(executable, args, { env: this.environment(), stdio: ["ignore", "pipe", "pipe"] });
      this.children.add(child);
      let output = "";
      const timer = setTimeout(() => { child.kill(); reject(new Error("Installation timed out. Check the connection and retry.")); }, timeout);
      const read = data => {
        output = (output + data.toString()).slice(-6000);
        if (data.toString().includes("ModelScope")) progress("Downloading default model from ModelScope…");
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
  async installRuntime(provider, progress) {
    fs.mkdirSync(this.root, { recursive: true });
    if (provider === "ollama") {
      if (this.ollamaBinary() || await this.models()) return;
      const archive = path.join(this.root, "ollama.tgz");
      await downloadVerified(RELEASES.ollama, archive, progress);
      const destination = path.join(this.root, "ollama");
      fs.mkdirSync(destination, { recursive: true });
      await this.run("/usr/bin/tar", ["-xzf", archive, "-C", destination], progress);
      if (!this.ollamaBinary()) throw new Error("The Ollama runtime was not found after installation. Retry setup.");
      fs.rmSync(archive, { force: true });
      return;
    }
    if (fs.existsSync(path.join(this.root, "mlx-ready.json")) && fs.existsSync(this.python)) return;
    const privateUV = path.join(this.root, "uv/uv");
    const uv = findExecutable([privateUV, path.join(os.homedir(), ".local/bin/uv"), "/opt/homebrew/bin/uv", "/usr/local/bin/uv"]) || privateUV;
    if (!fs.existsSync(uv)) {
      progress("Downloading Python installer…");
      const archive = path.join(this.root, "uv.tgz");
      await downloadVerified(RELEASES.uv, archive, progress);
      fs.mkdirSync(path.dirname(uv), { recursive: true });
      await this.run("/usr/bin/tar", ["-xzf", archive, "--strip-components=1", "-C", path.dirname(uv)], progress);
      fs.rmSync(archive, { force: true });
    }
    progress("Installing a private Python environment…");
    if (!fs.existsSync(this.python)) await this.run(uv, ["venv", "--python", "3.12", "--managed-python", path.join(this.root, "mlx-env")], progress);
    progress("Installing MLX…");
    await this.run(uv, ["pip", "install", "--python", this.python, "mlx-lm==0.32.2"], progress);
    await this.run(this.python, ["-c", "import mlx_lm"], progress);
    fs.writeFileSync(path.join(this.root, "mlx-ready.json"), JSON.stringify({ version: "0.32.2" }));
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
  async start(selected) {
    if (this.closed) throw new Error("Linloop is closing.");
    if (selected.provider === "ollama") {
      if (await this.models()) return { provider: "ollama", host: OLLAMA_HOST, model: selected.model };
      const binary = this.ollamaBinary();
      if (!binary) throw new Error("Open Settings and select Install and download to set up local AI.");
      const privateBinary = binary.startsWith(this.root + path.sep);
      const server = this.launch(binary, ["serve"], { OLLAMA_HOST: "127.0.0.1:11434",
        ...(privateBinary ? { OLLAMA_MODELS: path.join(this.root, "models/ollama") } : {}) });
      Object.assign(server, { provider: "ollama" });
      this.server = server;
      await this.waitFor(server, async () => await this.models() !== null);
      return { provider: "ollama", host: OLLAMA_HOST, model: selected.model };
    }
    const info = await this.status(selected.model);
    if (!info.ready) throw new Error("Open Settings and select Install and download to set up the selected model.");
    if (this.server && !this.server.exited && this.server.provider === "mlx" && this.server.model === selected.model) {
      return { provider: "mlx", host: this.server.host, model: "default_model", displayModel: selected.model };
    }
    if (this.server?.provider === "mlx") this.server.child.kill();
    const port = await new Promise<number>((resolve, reject) => {
      const socket = net.createServer();
      socket.on("error", reject);
      socket.listen(0, "127.0.0.1", () => { const port = socket.address().port; socket.close(() => resolve(port)); });
    });
    const server = this.launch(this.python, ["-m", "mlx_lm.server", "--model", this.modelDir(selected.model),
      "--host", "127.0.0.1", "--port", String(port), "--allowed-origins", "http://127.0.0.1"],
      { HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1" });
    Object.assign(server, { provider: "mlx", host: `http://127.0.0.1:${port}`, model: selected.model });
    this.server = server;
    await this.waitFor(server, async () => {
      try { return (await fetch(`${server.host}/v1/models`, { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; }
    });
    return { provider: "mlx", host: server.host, model: "default_model", displayModel: selected.model };
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
  async connection(value) {
    if (this.busy) throw new Error("Local AI setup is in progress. Wait for it to finish.");
    const selected = parseModel(value, this.arch);
    const operation = (this.starting || Promise.resolve()).catch(() => {}).then(() => this.start(selected));
    this.starting = operation;
    try { return await operation; } finally { if (this.starting === operation) this.starting = null; }
  }
  setup(value, onProgress = (_message: string) => {}) {
    const selected = parseModel(value, this.arch);
    if (this.busy) {
      if (this.installingModel !== selected.model) throw new Error("Another model is being installed. Wait for setup to finish.");
      return this.busy;
    }
    this.installingModel = selected.model;
    const progress = message => { this.message = message; onProgress(message); };
    this.busy = (async () => {
      try {
        progress("Preparing local AI…");
        await this.installRuntime(selected.provider, progress);
        progress("Downloading model…");
        if (selected.provider === "mlx") {
          const destination = this.modelDir(selected.model);
          const helper = path.join(path.dirname(require("./dictionary").nativeHelperPath()), "download-model.py");
          await this.run(this.python, [helper, selected.model, destination], progress);
          fs.writeFileSync(path.join(destination, ".linloop-ready"), selected.model);
        } else {
          await this.start(selected);
          const response = await fetch(`${OLLAMA_HOST}/api/pull`, { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: selected.model, stream: true }), signal: AbortSignal.timeout(20 * 60 * 1000) });
          if (!response.ok || !response.body) throw new Error(`Model download failed (${response.status}). Retry setup.`);
          let pending = "";
          const decoder = new TextDecoder();
          const consume = line => {
            if (!line.trim()) return;
            const event = JSON.parse(line);
            if (event.error) throw new Error(String(event.error));
            progress(event.total ? `Downloading model… ${Math.floor(event.completed / event.total * 100)}%` : String(event.status || "Downloading model…"));
          };
          for await (const chunk of response.body) {
            pending += decoder.decode(chunk, { stream: true });
            const lines = pending.split("\n"); pending = lines.pop(); lines.forEach(consume);
          }
          pending += decoder.decode(); if (pending.trim()) consume(pending);
          const names = await this.models();
          if (!names?.includes(selected.model) && !names?.includes(`${selected.model}:latest`)) throw new Error("The model download did not finish. Retry setup.");
        }
        progress("Starting local AI…");
        const connection = await this.start(selected);
        if (selected.provider === "mlx") {
          const response = await fetch(`${connection.host}/v1/chat/completions`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: "default_model", messages: [{ role: "user", content: "Hello" }], max_tokens: 1 }),
            signal: AbortSignal.timeout(90_000),
          });
          if (!response.ok) throw new Error("The selected MLX model could not load. Choose a compatible model and retry setup.");
          await response.json();
        }
        progress("Ready");
      } catch (error) {
        if (selected.provider === "mlx") {
          fs.rmSync(path.join(this.modelDir(selected.model), ".linloop-ready"), { force: true });
          if (this.server?.provider === "mlx") { this.server.child.kill(); this.server = null; }
        }
        throw error;
      }
    })().finally(() => { this.busy = null; this.installingModel = ""; });
    return this.busy;
  }
  stop() { this.closed = true; for (const child of this.children) child.kill(); this.children.clear(); }
}

let instance;
function manager() {
  if (!instance) instance = new LocalAI(path.join(require("electron").app.getPath("userData"), "local-ai"));
  return instance;
}
module.exports = { DEFAULT_MODEL, DEFAULT_OLLAMA_MODEL, DEFAULT_MLX_MODEL, parseModel, LocalAI, downloadVerified,
  status: model => manager().status(model), setup: (model, progress) => manager().setup(model, progress),
  connection: model => manager().connection(model), stop: () => instance?.stop() };
