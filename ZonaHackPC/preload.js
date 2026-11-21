/* ═══════════════════════════════════════════
   ZONAHACK - Preload (puente entre la web y Electron)
   - Expone AndroidApp.showNotification → Notificación de Windows
   - Indica a la web que corre dentro de la app de escritorio
   ═══════════════════════════════════════════ */
const { contextBridge, ipcRenderer } = require('electron');

// Compatibilidad con el puente que usa la web para la app móvil,
// así las notificaciones en tiempo real funcionan también en PC.
contextBridge.exposeInMainWorld('AndroidApp', {
  showNotification: (json) => {
    try {
      const o = JSON.parse(String(json || '{}'));
      const title = String(o.title || 'ZonaHack').slice(0, 100);
      const body = String(o.body || '').slice(0, 300);
      if (typeof Notification !== 'undefined') {
        new Notification(title, { body: body, icon: 'icon.png' });
      }
    } catch (e) {}
  },
  toast: (msg) => {
    try { console.log('[ZonaHack]', msg); } catch (e) {}
  },
  setScreenOn: () => {},
  setFullscreen: () => {},
  getVersion: () => 'ZonaHack-PC/1.0.0'
});

contextBridge.exposeInMainWorld('zhDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: '1.0.0',
  getVersion: () => ipcRenderer.invoke('zh:version')
});