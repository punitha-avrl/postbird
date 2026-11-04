const { app, BrowserWindow, ipcMain } = require("electron");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const appDir = app.getAppPath();

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
    },
  });

  mainWindow = main;
  main.once("ready-to-show", () => main.show());
  main.loadFile(path.join(appDir, "index.html"));
  main.maximize();
};

function performRequest({ method, url: requestUrl, headers, body }) {
  const parsedUrl = new URL(requestUrl);
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs are supported.");
  }

  const transport = parsedUrl.protocol === "https:" ? https : http;
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const request = transport.request(
      parsedUrl,
      { method, headers, timeout: 30000 },
      (response) => {
        const chunks = [];
        let totalBytes = 0;
        const maxResponseBytes = 10 * 1024 * 1024;

        response.on("data", (chunk) => {
          totalBytes += chunk.length;
          if (totalBytes > maxResponseBytes) {
            request.destroy(
              new Error("Response is larger than the 10 MB limit."),
            );
            return;
          }
          chunks.push(chunk);
        });

        response.on("end", () => {
          resolve({
            status: response.statusCode || 0,
            statusText: response.statusMessage || "",
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
            duration: Date.now() - startedAt,
          });
        });
      },
    );

    request.on("timeout", () =>
      request.destroy(new Error("Request timed out after 30 seconds.")),
    );
    request.on("error", reject);
    if (body && !["GET", "HEAD"].includes(method)) request.write(body);
    request.end();
  });
}

function isApplicationFrame(event) {
  return (
    event.senderFrame.url ===
    pathToFileURL(path.join(appDir, "index.html")).href
  );
}

ipcMain.handle("http:request", (event, request) => {
  if (!isApplicationFrame(event)) {
    throw new Error("Requests can only be sent from the application window.");
  }
  if (
    !request ||
    typeof request !== "object" ||
    typeof request.url !== "string"
  ) {
    throw new Error("Provide a request URL.");
  }
  if (request.url.length > 8192) {
    throw new Error("The request URL is too long.");
  }

  const method = String(request.method || "").toUpperCase();
  if (
    !["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(
      method,
    )
  ) {
    throw new Error("Choose a supported HTTP method.");
  }
  if (
    request.headers &&
    (typeof request.headers !== "object" || Array.isArray(request.headers))
  ) {
    throw new Error("Request headers must be a key/value object.");
  }

  return performRequest({ ...request, method });
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

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
