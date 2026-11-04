const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("apiClient", {
  sendRequest: (request) => ipcRenderer.invoke("http:request", request),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
});
