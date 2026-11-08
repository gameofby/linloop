const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("linloop", {
  refine: (payload) => ipcRenderer.invoke("refine", payload),
  refineStream: (payload, onEvent) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const listener = (_event, message) => {
      if (message?.requestId === requestId) onEvent(message.event);
    };
    ipcRenderer.on("refine-stream", listener);
    return ipcRenderer.invoke("refine-stream", { ...payload, requestId })
      .finally(() => ipcRenderer.removeListener("refine-stream", listener));
  },
  copyText: (text) => ipcRenderer.invoke("copy-text", text),
  speechAvailable: process.platform === "darwin",
  speak: (text) => ipcRenderer.invoke("speak", text),
  dictionaryLookup: (text) => ipcRenderer.invoke("dictionary", text),
  stopSpeaking: () => ipcRenderer.invoke("stop-speaking"),
  saveItems: (items) => ipcRenderer.invoke("save-items", items),
  listItems: () => ipcRenderer.invoke("list-items"),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  setSettings: (partial) => ipcRenderer.invoke("set-settings", partial),
  hide: () => ipcRenderer.send("hide"),
  resize: (height) => ipcRenderer.send("resize", height),
  onFocusInput: (fn) => ipcRenderer.on("focus-input", fn),
});
