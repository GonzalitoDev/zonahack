/* ═══════════════════════════════════════════
   CYBERALERTA - Preload (puente web ↔ Electron)
   ═══════════════════════════════════════════ */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cyberalerta', {
  // Devuelve { articles, updated }
  getNews: (force) => ipcRenderer.invoke('ca:news', !!force),
  // Abre un artículo en el navegador
  openExternal: (url) => ipcRenderer.invoke('ca:open', url),
  // IA: { system, messages:[{role,content}], key } → texto
  ai: (payload) => ipcRenderer.invoke('ca:ai', payload)
});