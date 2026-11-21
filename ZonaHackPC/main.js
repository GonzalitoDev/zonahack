/* ═══════════════════════════════════════════
   ZONAHACK - App de escritorio (Electron)
   Ventana conectada a offlinevideoplayer.vercel.app
   - PWA / Service Worker (carga rápida y offline)
   - Pantalla completa (F11) y atajos
   - Splash de carga
   - Videos en pantalla completa
   - Notificaciones en tiempo real
   ═══════════════════════════════════════════ */
const { app, BrowserWindow, shell, session, ipcMain } = require('electron');
const path = require('path');

const APP_URL = 'https://offlinevideoplayer.vercel.app';
const APP_HOST = 'offlinevideoplayer.vercel.app';

let mainWin = null;
let splashWin = null;

// Reproducción automática de video sin tocar nada
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Aceleración por hardware
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-native-gpu-memory-buffers');

app.setAppUserModelId('com.zonahack.pc');

function createSplash() {
  splashWin = new BrowserWindow({
    width: 520,
    height: 360,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    backgroundColor: '#0a0a0a',
    webPreferences: { contextIsolation: true }
  });
  splashWin.loadFile(path.join(__dirname, 'splash.html'));
  splashWin.on('closed', () => { splashWin = null; });
}

function closeSplash() {
  if (splashWin && !splashWin.isDestroyed()) {
    try { splashWin.close(); } catch (e) {}
  }
}

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0a0a0a',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  });

  // Cargar la app (usa el Service Worker de la PWA → cachea y carga rápido)
  mainWin.loadURL(APP_URL);

  // Abrir enlaces externos en el navegador, no dentro de la app
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Permitir navegación solo dentro del sitio
  mainWin.webContents.on('will-navigate', (e, url) => {
    try {
      const host = new URL(url).hostname;
      if (!host.endsWith(APP_HOST) && !host.endsWith('.vercel.app')) {
        e.preventDefault();
        shell.openExternal(url);
      }
    } catch (err) {}
  });

  mainWin.webContents.on('did-finish-load', () => {
    closeSplash();
    mainWin.show();
  });

  mainWin.webContents.on('did-fail-load', (e, code, desc) => {
    // Error de red: mostrar aviso en la app (el service worker sirve la copia cacheada)
    if (code === -106 || code === -105) {
      closeSplash();
      mainWin.show();
      mainWin.webContents.executeJavaScript(
        "try{window.toast&&window.toast('Sin conexión, mostrando copia guardada…','#e74c3c')}catch(e){}"
      );
    }
  });

  // Enlaces: todo lo que sea externo va al navegador
  mainWin.webContents.on('will-redirect', (e, url) => {
    try {
      const host = new URL(url).hostname;
      if (!host.endsWith(APP_HOST) && !host.endsWith('.vercel.app')) {
        e.preventDefault();
        shell.openExternal(url);
      }
    } catch (err) {}
  });

  // Video en pantalla completa → ocultar menú/barras
  mainWin.webContents.on('enter-html-full-screen', () => {
    mainWin.setMenuBarVisibility(false);
  });
  mainWin.webContents.on('leave-html-full-screen', () => {
    mainWin.setMenuBarVisibility(false);
  });

  // Avisar si la página crashea
  mainWin.webContents.on('render-process-gone', (e, details) => {
    closeSplash();
    mainWin.show();
  });

  // Atajos de teclado (solo cuando la app está enfocada)
  mainWin.webContents.on('before-input-event', (event, input) => {
    if (!input || input.type !== 'keyDown') return;
    const key = input.key;
    const ctrl = input.control;
    const alt = input.alt;

    // F5: recargar
    if (key === 'F5') { mainWin.reload(); event.preventDefault(); }
    // F11: pantalla completa
    else if (key === 'F11') {
      mainWin.setFullScreen(!mainWin.isFullScreen());
      event.preventDefault();
    }
    // F12: herramientas de desarrollo
    else if (key === 'F12') { mainWin.webContents.toggleDevTools(); event.preventDefault(); }
    // Ctrl+Q: salir
    else if (ctrl && (key === 'q' || key === 'Q')) { app.quit(); event.preventDefault(); }
    // Ctrl+Home: volver al inicio
    else if (ctrl && key === 'Home') { mainWin.loadURL(APP_URL); event.preventDefault(); }
    // Alt+Left: atrás
    else if (alt && key === 'ArrowLeft') {
      if (mainWin.webContents.canGoBack()) mainWin.webContents.goBack();
      event.preventDefault();
    }
    // Alt+Right: adelante
    else if (alt && key === 'ArrowRight') {
      if (mainWin.webContents.canGoForward()) mainWin.webContents.goForward();
      event.preventDefault();
    }
  });

  mainWin.on('closed', () => { mainWin = null; });
}

app.whenReady().then(() => {
  createSplash();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Comandos desde la web (preload) vía IPC si hiciera falta
ipcMain.handle('zh:version', () => 'ZonaHack-PC/1.0.0');