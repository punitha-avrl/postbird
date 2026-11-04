const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  closeLogDatabase,
  getLogs,
  getLogDatabasePath,
  initializeLogDatabase,
  writeLog,
} = require("./app-logger.js");
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

function reportUpdateCheckError(error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Error checking for updates:", error);
  try {
    writeLog("error", "update", `Unexpected update-check failure: ${message}`, {
      stack: error instanceof Error ? error.stack || "" : "",
    });
  } catch (loggingError) {
    console.error("Unable to persist update-check failure.", loggingError);
  }
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
  main.webContents.on("render-process-gone", (_event, details) => {
    writeLog("error", "application", "Renderer process exited unexpectedly.", {
      reason: details.reason,
      exitCode: details.exitCode,
    });
  });
  main.on("unresponsive", () => {
    writeLog("error", "application", "Application window became unresponsive.");
  });
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
  checkForUpdates().catch(reportUpdateCheckError);
};

setInterval(
  () => {
    checkForUpdates().catch(reportUpdateCheckError);
  },
  60 * 60 * 24 * 1000,
); // Check for updates every day (24 hours) in milliseconds

function isApplicationFrame(event) {
  return (
    event.senderFrame.url ===
    pathToFileURL(path.join(appDir, "index.html")).href
  );
}

ipcMain.handle("app:get-version", (event) => {
  if (!isApplicationFrame(event)) {
    throw new Error(
      "Application version is only available to the application window.",
    );
  }
  return app.getVersion();
});

ipcMain.handle("logs:get", (event, limit = 500) => {
  if (!isApplicationFrame(event)) {
    throw new Error("Logs are only available to the application window.");
  }
  return {
    records: getLogs(limit),
    databasePath: getLogDatabasePath(),
  };
});

ipcMain.handle("logs:renderer-error", (event, error) => {
  if (!isApplicationFrame(event)) {
    throw new Error("Errors can only be logged by the application window.");
  }
  if (
    !error ||
    typeof error.context !== "string" ||
    typeof error.message !== "string" ||
    error.context.length > 200 ||
    error.message.length > 10000 ||
    (error.stack !== undefined &&
      (typeof error.stack !== "string" || error.stack.length > 20000))
  ) {
    throw new Error("Invalid application error log entry.");
  }
  writeLog("error", "application", `${error.context}: ${error.message}`, {
    source: "renderer",
    stack: error.stack || "",
  });
});

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
  if (!window)
    throw new Error("The application window is no longer available.");
  return window.isMaximized();
});

app.whenReady().then(() => {
  try {
    initializeLogDatabase(path.join(app.getPath("userData"), "app-logs.db"));
    writeLog("info", "application", "Application started.", {
      version: app.getVersion(),
    });
  } catch (error) {
    console.error("Unable to initialize the application log database.", error);
    dialog.showErrorBox(
      "Application logging unavailable",
      `The SQLite log database could not be opened.\n\n${error.message}`,
    );
    app.quit();
    return;
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => closeLogDatabase());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

process.on("uncaughtExceptionMonitor", (error) => {
  try {
    writeLog("error", "application", `Uncaught exception: ${error.message}`, {
      stack: error.stack || "",
    });
  } catch (loggingError) {
    console.error("Unable to persist uncaught exception.", loggingError);
  }
});

process.on("unhandledRejection", (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  try {
    writeLog(
      "error",
      "application",
      `Unhandled promise rejection: ${error.message}`,
      { stack: error.stack || "" },
    );
  } catch (loggingError) {
    console.error(
      "Unable to persist unhandled promise rejection.",
      loggingError,
    );
  }
});
