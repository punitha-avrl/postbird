const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const appDir = app.getAppPath();
const { checkForUpdates } = require("./updater.js");

let mainWindow;
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

const createWindow = () => {
  const main = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 850,
    minHeight: 650,
    autoHideMenuBar: true,
    show: false,
    frame: false,
    backgroundColor: "#ffffff",
    icon: path.join(
      appDir,
      "assets",
      process.platform === "win32" ? "icon.ico" : "icon.png",
    ),
    webPreferences: {
      preload: path.join(appDir, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: true,
    },
  });

  mainWindow = main;
  main.webContents.on("before-input-event", (event, input) => {
    if (
      input.type === "keyDown" &&
      input.shift &&
      (input.control || input.meta) &&
      input.key.toLowerCase() === "i"
    ) {
      event.preventDefault();
      if (main.webContents.isDevToolsOpened()) {
        main.webContents.closeDevTools();
      } else {
        main.webContents.openDevTools({ mode: "detach" });
      }
    }
  });
  main.once("ready-to-show", () => main.show());
  main.webContents.once("did-finish-load", () => {
    if (!app.isPackaged) {
      // main.webContents.openDevTools({ mode: "detach" });
    }
  });
  main.loadFile(path.join(appDir, "index.html"));
  main.maximize();
  checkForUpdates().catch((error) => {
    console.error("Error checking for updates:", error);
  });
};

setInterval(
  () => {
    checkForUpdates().catch((error) => {
      console.error("Error checking for updates:", error);
    });
  },
  60 * 60 * 24 * 1000,
); // Check for updates every day (24 hours) in milliseconds

function isApplicationFrame(event) {
  return (
    event.senderFrame.url ===
    pathToFileURL(path.join(appDir, "index.html")).href
  );
}

for (const [channel, action] of [
  ["window:minimize", (window) => window.minimize()],
  [
    "window:toggle-maximize",
    (window) =>
      window.isMaximized() ? window.unmaximize() : window.maximize(),
  ],
  ["window:close", (window) => window.close()],
]) {
  ipcMain.handle(channel, (event) => {
    if (!isApplicationFrame(event))
      throw new Error(
        "Window controls are only available to the application window.",
      );
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window)
      throw new Error("The application window is no longer available.");
    action(window);
    return window.isMaximized();
  });
}

ipcMain.handle("window:is-maximized", (event) => {
  if (!isApplicationFrame(event)) {
    throw new Error(
      "Window state is only available to the application window.",
    );
  }
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) throw new Error("The application window is no longer available.");
  return window.isMaximized();
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
