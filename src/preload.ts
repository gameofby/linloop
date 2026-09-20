const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("linloop", {
  refine: (payload) => ipcRenderer.invoke("refine", payload),
  copyText: (text) => ipcRenderer.invoke("copy-text", text),
  saveItems: (items) => ipcRenderer.invoke("save-items", items),
  listItems: () => ipcRenderer.invoke("list-items"),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  setSettings: (partial) => ipcRenderer.invoke("set-settings", partial),
  hide: () => ipcRenderer.send("hide"),
  resize: (height) => ipcRenderer.send("resize", height),
  onFocusInput: (fn) => ipcRenderer.on("focus-input", fn),
});
