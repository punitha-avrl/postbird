const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { app } = require("electron");
const exec = require("child_process").exec;
const { writeLog } = require("./app-logger.js");
const UPDATE_BASE_URL =
  "https://raw.githubusercontent.com/punitha-avrl/postbird/refs/heads/main/";

function getLocalVersion() {
  const manifestPath = path.join(app.getAppPath(), "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  return manifest.version;
}

function restartApp() {
  app.relaunch();
  app.exit(0);
}

async function downloadUpdate(data) {
  const changedFiles = data.changedFiles || [];
  const newDependencies = data.newDependencies || {};
  writeLog("info", "update", "Downloading application update.", {
    version: data.version,
    changedFiles,
  });

  for (const file of changedFiles) {
    const fileUrl = new URL(file, UPDATE_BASE_URL).href;
    const localFilePath = path.join(app.getAppPath(), file);
    try {
      const response = await axios.get(fileUrl, {
        responseType: "arraybuffer",
      });
      fs.writeFileSync(localFilePath, response.data);
      console.log(`Updated ${file}`);
      writeLog("info", "update", "Updated application file.", {
        version: data.version,
        file,
      });
    } catch (error) {
      console.error(`Failed to update ${file}:`, error);
      writeLog(
        "error",
        "update",
        `Failed to update ${file}: ${error.message}`,
        {
          version: data.version,
          file,
          fileUrl,
          stack: error.stack || "",
        },
      );
      throw error;
    }
  }
  fs.writeFileSync(
    path.join(app.getAppPath(), "manifest.json"),
    JSON.stringify(data, null, 2),
  );
  writeLog("info", "update", "Updated application manifest.", {
    version: data.version,
  });

  if (Object.keys(newDependencies).length > 0) {
    console.log("Installing new dependencies...");
    const installCommand = `npm install ${Object.entries(newDependencies)
      .map(([pkg, version]) => `${pkg}@${version}`)
      .join(" ")}`;
    await new Promise((resolve, reject) => {
      exec(installCommand, (error) => {
        if (error) {
          console.error("Error installing dependencies:", error);
          writeLog("error", "update", "Dependency installation failed.", {
            version: data.version,
            error: error.message,
          });
          reject(error);
          return;
        }
        console.log("Dependencies installed successfully");
        writeLog("info", "update", "Installed update dependencies.", {
          version: data.version,
        });
        resolve();
      });
    });
  }
  writeLog("info", "update", "Application update completed; restarting.", {
    version: data.version,
  });
  restartApp();
}

async function checkForUpdates() {
  try {
    const localVersion = getLocalVersion();
    if (!localVersion) {
      writeLog("error", "update", "Local version was not found.");
      return;
    }
    const response = await axios.get(
      "https://raw.githubusercontent.com/punitha-avrl/postbird/refs/heads/main/manifest.json",
    );
    console.log(
      `Local version: ${localVersion}, Remote version: ${response.data.version}`,
    );
    const remoteVersion = response.data.version;
    if (remoteVersion !== localVersion) {
      console.log(`Update available: ${remoteVersion}`);
      writeLog("info", "update", "Application update is available.", {
        localVersion,
        remoteVersion,
      });
      await downloadUpdate(response.data);
    } else {
      writeLog("info", "update", "Application is up to date.", {
        version: localVersion,
      });
    }
  } catch (error) {
    console.error("Error checking for updates:", error);
    writeLog("error", "update", `Update check failed: ${error.message}`, {
      stack: error.stack || "",
    });
  }
}

module.exports = { checkForUpdates };
