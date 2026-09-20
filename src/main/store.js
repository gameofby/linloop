const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

const DEFAULTS = {
  hotkey: "CommandOrControl+Shift+L",
  ollamaHost: "http://127.0.0.1:11434",
  ollamaModel: "llama3.2",
};

let db;
let dbPath;

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function run(sql, params = []) {
  db.run(sql, params);
}

async function init(userDataDir) {
  const dir = userDataDir || require("electron").app.getPath("userData");
  dbPath = path.join(dir, "linloop.sqlite");
  const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
  const SQL = await initSqlJs({ locateFile: () => wasmPath });

  db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      term TEXT NOT NULL,
      note TEXT,
      example TEXT,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_items_kind_term ON items(kind, term);
  `);

  for (const [key, value] of Object.entries(DEFAULTS)) {
    run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [key, value]);
  }
  persist();
}

function persist() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

function getSetting(key) {
  const rows = all("SELECT value FROM settings WHERE key = ?", [key]);
  return rows.length ? rows[0].value : DEFAULTS[key] ?? "";
}

function setSetting(key, value) {
  run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, String(value)]
  );
  persist();
}

function getSettings() {
  return {
    hotkey: getSetting("hotkey"),
    ollamaHost: getSetting("ollamaHost"),
    ollamaModel: getSetting("ollamaModel"),
  };
}

function setSettings(partial) {
  for (const [key, value] of Object.entries(partial)) {
    if (value != null && Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
      setSetting(key, value);
    }
  }
  return getSettings();
}

function listItems() {
  return all("SELECT id, kind, term, note, example, created_at FROM items ORDER BY created_at DESC");
}

function itemsByKind() {
  const grouped = { word: [], pattern: [], collocation: [] };
  for (const item of listItems()) {
    if (grouped[item.kind]) grouped[item.kind].push(item);
  }
  return grouped;
}

function saveItems(items) {
  const now = new Date().toISOString();
  const saved = [];
  for (const item of items) {
    const kind = item.kind;
    const term = String(item.term || "").trim();
    if (!["word", "pattern", "collocation"].includes(kind) || !term) continue;
    run(
      `INSERT INTO items (kind, term, note, example, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(kind, term) DO UPDATE SET
         note = COALESCE(excluded.note, items.note),
         example = COALESCE(excluded.example, items.example)`,
      [kind, term, item.note || "", item.example || "", now]
    );
    saved.push({ kind, term, note: item.note || "", example: item.example || "" });
  }
  persist();
  return saved;
}

module.exports = { init, getSettings, setSettings, listItems, itemsByKind, saveItems };
