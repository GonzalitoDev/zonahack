const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");

const URL = "https://5fae371f-39e5-4c16-9b04-658e273c947c.clouding.host/asistente.html";
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 600,
    minHeight: 620,
    title: "Asistente ZonaHack",
    icon: path.join(__dirname, "build", "icon.ico"),
    autoHideMenuBar: true,
    backgroundColor: "#07090e",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      zoomFactor: 1.0
    }
  });
  win.loadURL(URL);
  win.webContents.on("did-finish-load", function () {
    win.webContents.setZoomFactor(1.0);
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(function ({ url }) {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// ─── AUTO-ACTUALIZACIÓN ───
autoUpdater.setFeedURL({ provider: "generic", url: "https://5fae371f-39e5-4c16-9b04-658e273c947c.clouding.host" });
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on("update-downloaded", function () {
  autoUpdater.quitAndInstall(false, true);
});

app.whenReady().then(function () {
  createWindow();
  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  // buscar actualizaciones apenas abre (la app se actualiza sola)
  setTimeout(function () { autoUpdater.checkForUpdates().catch(function () {}); }, 4000);
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});