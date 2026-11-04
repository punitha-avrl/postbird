const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("apiClient", {
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggle-maximize"),
  isWindowMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  getAppVersion: () => ipcRenderer.invoke("app:get-version"),
  getAppLogs: (limit) => ipcRenderer.invoke("logs:get", limit),
  logAppError: (context, message, stack) =>
    ipcRenderer.invoke("logs:renderer-error", { context, message, stack }),
});
