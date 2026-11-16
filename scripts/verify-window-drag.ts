import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

// Run the real main-process IPC handler with a simulated desktop. This also
// checks display layouts that are not connected to the test machine.
async function run() {
  const source = readFileSync("src/main/main.ts", "utf8");
  const handlers = new Map();
  const events = new Map();
  const webContents = {};
  let cursor = { x: 0, y: 0 };
  let bounds = { x: 300, y: 200, width: 720, height: 108 };
  const area = { x: 0, y: 0, width: 1920, height: 1080 };
  const window = {
    webContents,
    setAlwaysOnTop() {},
    setVisibleOnAllWorkspaces() {},
    loadFile() {},
    on: (name, handler) => events.set(name, handler),
    getBounds: () => ({ ...bounds }),
    setPosition: (x, y) => { bounds = { ...bounds, x, y }; },
  };
  const electron = {
    app: {
      whenReady: () => Promise.resolve(),
      dock: { hide() {} },
      on() {},
    },
    BrowserWindow: function () { return window; },
    globalShortcut: { register: () => true },
    ipcMain: {
      handle() {},
      on: (name, handler) => handlers.set(name, handler),
    },
    screen: {
      getPrimaryDisplay: () => ({ workAreaSize: area }),
      getDisplayMatching: () => ({ workArea: area }),
      getCursorScreenPoint: () => ({ ...cursor }),
    },
  };
  runInNewContext(source, {
    require: (name) => {
      if (name === "electron") return electron;
      if (name === "path") return require("node:path");
      if (name === "./store") return {
        init: async () => {},
        getSettings: () => ({ hotkey: "CommandOrControl+Shift+L" }),
      };
      if (name === "./speech") return { stop() {} };
      return {};
    },
    __dirname: "/test/main",
    process: { platform: "darwin", env: {} },
    console,
    exports: {},
  });
  // Wait for store initialization and window creation.
  await new Promise((resolve) => setImmediate(resolve));
  const drag = (phase, sender = webContents) =>
    handlers.get("window-drag")({ sender }, phase);

  for (const [layout, x, y] of [
    ["right display", 2100, 240],
    ["left display", -1300, 240],
    ["upper display", 340, -800],
    ["lower display", 340, 1300],
    ["display boundary", 1800, 240],
  ] as const) {
    bounds = { x: 300, y: 200, width: 720, height: 108 };
    cursor = { x: 340, y: 220 };
    drag("start");
    cursor = { x: x + 40, y: y + 20 };
    drag("move");
    assert.equal(bounds.x, x, `${layout}: window must follow the pointer horizontally`);
    assert.equal(bounds.y, y, `${layout}: window must follow the pointer vertically`);
    drag("end");
    cursor.x += 100;
    drag("move");
    assert.equal(bounds.x, x, "Pointer release must stop the drag");
  }

  const before = { ...bounds };
  drag("start", {});
  cursor.x += 100;
  drag("move", {});
  assert.deepEqual(bounds, before, "Other senders must not move the window");
  drag("start");
  events.get("hide")();
  cursor.x += 100;
  drag("move");
  assert.deepEqual(bounds, before, "Hiding the window must stop the drag");
  console.log("PASS: drag across all display edges, negative coordinates, pointer offset, release, sender, and hide");
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
