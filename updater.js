const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { app } = require("electron");
const exec = require("child_process").exec;

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
  const baseUrl =
    "https://raw.githubusercontent.com/punitha-avrl/postbird/refs/heads/main";
  const changedFiles = data.changedFiles || [];
  const newDependencies = data.newDependencies || {};

  for (const file of changedFiles) {
    const fileUrl = baseUrl + file;
    const localFilePath = path.join(app.getAppPath(), file);
    try {
      const response = await axios.get(fileUrl, {
        responseType: "arraybuffer",
      });
      fs.writeFileSync(localFilePath, response.data);
      console.log(`Updated ${file}`);
    } catch (error) {
      console.error(`Failed to update ${file}:`, error);
    }
  }
  fs.writeFileSync(
    path.join(app.getAppPath(), "manifest.json"),
    JSON.stringify(data, null, 2),
  );

  if (Object.keys(newDependencies).length > 0) {
    console.log("Installing new dependencies...");
    const installCommand = `npm install ${Object.entries(newDependencies)
      .map(([pkg, version]) => `${pkg}@${version}`)
      .join(" ")}`;
    exec(installCommand, (error, stdout, stderr) => {
      if (error) {
        console.error("Error installing dependencies:", error);
      } else {
        console.log("Dependencies installed successfully");
      }
    });
  }
  restartApp();
}

async function checkForUpdates() {
  const localVersion = getLocalVersion();
  if (!localVersion) {
    console.log("Local version not found");
    return;
  }
  try {
    const response = await axios.get(
      "https://raw.githubusercontent.com/punitha-avrl/postbird/refs/heads/main/manifest.json",
    );
    console.log(
      `Local version: ${localVersion}, Remote version: ${response.data.version}`,
    );
    const remoteVersion = response.data.version;
    if (remoteVersion !== localVersion) {
      console.log(`Update available: ${remoteVersion}`);
      // Download and apply the update
      await downloadUpdate(response.data);
    }
  } catch (error) {
    console.error("Error checking for updates:", error);
  }
}

module.exports = { checkForUpdates };
