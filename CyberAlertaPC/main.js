/* ═══════════════════════════════════════════
   CYBERALERTA - Noticias de ciberseguridad (Electron)
   App de escritorio: trae noticias de feeds RSS de seguridad.
   ═══════════════════════════════════════════ */
const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const https = require('https');
const path = require('path');

const UPDATE_URL = 'https://offlinevideoplayer.vercel.app';

const FEEDS = [
  { name: 'The Hacker News', color: '#ff5a5a', url: 'https://feeds.feedburner.com/TheHackersNews' },
  { name: 'Bleeping Computer', color: '#3498db', url: 'https://www.bleepingcomputer.com/feed/' },
  { name: 'Krebs on Security', color: '#2ecc71', url: 'https://krebsonsecurity.com/feed/' },
  { name: 'SecurityWeek', color: '#f1c40f', url: 'https://www.securityweek.com/feed/' },
  { name: 'Threatpost', color: '#9b59b6', url: 'https://threatpost.com/feed/' },
  // En español
  { name: 'Hackplayers', color: '#e67e22', url: 'https://www.hackplayers.com/feeds/posts/default?alt=rss' },
  { name: 'Unaaldía (HispaSec)', color: '#1abc9c', url: 'https://unaaldia.hispasec.com/feed' },
  { name: 'WeLiveSecurity ES', color: '#e84393', url: 'https://www.welivesecurity.com/la-es/feed/' }
];

const REFRESH_MS = 15 * 60 * 1000; // auto-refresh cada 15 min
let mainWin = null;
let cache = { articles: [], updated: 0 };

app.setAppUserModelId('com.cyberalerta.pc');

// ─── Descarga una URL (HTTPS) ───
function httpGet(url, timeout = 12000) {
  return new Promise((resolve, reject) => {
    try {
      const req = https.get(url, { headers: { 'User-Agent': 'CyberAlerta/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          httpGet(res.headers.location, timeout).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { data += c; if (data.length > 5e6) req.destroy(); });
        res.on('end', () => resolve(data));
        res.on('error', reject);
      });
      req.setTimeout(timeout, () => { try { req.destroy(); } catch (e) {} reject(new Error('timeout')); });
      req.on('error', reject);
    } catch (e) { reject(e); }
  });
}

// ─── Parser RSS/Atom compacto ───
function parseFeed(xml) {
  const articles = [];
  if (!xml) return articles;
  const isAtom = /<feed[^>]*xmlns[^>]*atom/i.test(xml) || /<feed>/.test(xml);
  const items = isAtom
    ? xml.match(/<entry[\s\S]*?<\/entry>/g) || []
    : xml.match(/<item[\s\S]*?<\/item>/g) || [];
  for (const raw of items) {
    const g = (tag) => {
      const m = raw.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'i'));
      return m ? decodeEntities(m[1].trim()) : '';
    };
    let title = g('title');
    let link = isAtom ? g('link') : g('link');
    if (isAtom) {
      // el enlace en Atom viene en <link href="...">
      const lm = raw.match(/<link[^>]*href="([^"]+)"/i);
      if (lm) link = lm[1];
    }
    let date = g(isAtom ? 'updated' : 'pubDate') || g(isAtom ? 'published' : 'date');
    let desc = g(isAtom ? 'summary' : 'description');
    const img = extractImg(raw, desc);
    const clean = desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!title || !link) continue;
    articles.push({ title, link, date, snippet: clean.slice(0, 240), img });
  }
  return articles;
}

// Extrae la primera imagen de la noticia (media:content, enclosure o <img>)
function extractImg(raw, desc) {
  try {
    const m1 = raw.match(/<media:content[^>]*url="([^"]+)"/i) || raw.match(/<media:thumbnail[^>]*url="([^"]+)"/i);
    if (m1) return m1[1];
    const m2 = raw.match(/<enclosure[^>]*url="([^"]+)"/i);
    if (m2) return m2[1];
    const m3 = desc.match(/<img[^>]+src="([^"]+)"/i);
    if (m3) return m3[1];
  } catch (e) {}
  return '';
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&nbsp;/g, ' ');
}

// ─── Trae todas las fuentes y arma la lista ───
async function fetchAllFeeds() {
  const results = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const xml = await httpGet(f.url);
      const items = parseFeed(xml);
      return items.map((a) => ({ ...a, source: f.name, color: f.color }));
    })
  );
  const flat = [];
  results.forEach((r) => { if (r.status === 'fulfilled') flat.push(...r.value); });
  // Ordenar por fecha (las más nuevas primero), las que no tienen fecha van al final
  flat.sort((a, b) => {
    const ta = Date.parse(a.date) || 0;
    const tb = Date.parse(b.date) || 0;
    return tb - ta;
  });
  cache = { articles: flat.slice(0, 200), updated: Date.now() };
  return cache.articles;
}

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#07090e',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  mainWin.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Abrir artículos en el navegador, no dentro de la app
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWin.on('closed', () => { mainWin = null; });
}

// IPC: la web pide las noticias
ipcMain.handle('ca:news', async (e, force) => {
  if (force || cache.articles.length === 0) {
    try { await fetchAllFeeds(); } catch (err) {}
  }
  return cache;
});

ipcMain.handle('ca:open', (e, url) => {
  if (typeof url === 'string' && url.startsWith('http')) shell.openExternal(url);
});

// ─── IA (Gemini API gratuita o /api/ia del servidor) ───
const AI_SYSTEM = 'Sos CyberAlerta, un experto en ciberseguridad que responde en español. ' +
  'Dás respuestas breves, claras y prácticas. Si algo no lo sabés, lo decís directamente.';

function callGemini(key, system, messages) {
  return new Promise((resolve, reject) => {
    try {
      const contents = (messages || []).map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content || '') }] }));
      const body = JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents });
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=' + encodeURIComponent(key);
      const req = https.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            const d = JSON.parse(data);
            const txt = (d.candidates && d.candidates[0] && d.candidates[0].content &&
              d.candidates[0].content.parts && d.candidates[0].content.parts[0] && d.candidates[0].content.parts[0].text) || '';
            if (txt) resolve(txt.trim());
            else reject(new Error((d.error && d.error.message) || 'Sin respuesta de la IA'));
          } catch (err) { reject(new Error('Respuesta inválida')); }
        });
      });
      req.setTimeout(45000, () => { try { req.destroy(); } catch (e) {} reject(new Error('timeout')); });
      req.on('error', reject);
      req.write(body);
      req.end();
    } catch (e) { reject(e); }
  });
}

ipcMain.handle('ca:ai', async (e, payload) => {
  const system = (payload && payload.system) || AI_SYSTEM;
  const messages = (payload && payload.messages) || [];
  const key = (payload && payload.key) || '';
  if (key) {
    return callGemini(key, system, messages);
  }
  // Sin clave: usar la IA del servidor (GEMINI_API_KEY/HF_TOKEN en Vercel)
  const last = messages.length ? messages[messages.length - 1].content : '';
  const url = 'https://offlinevideoplayer.vercel.app/api/ia?q=' + encodeURIComponent(last) +
    '&system=' + encodeURIComponent(system);
  const txt = await httpGet(url);
  const d = JSON.parse(txt);
  if (d && d.ok) return d.respuesta;
  throw new Error((d && d.error) || 'IA no configurada');
});

// ─── AUTO-ACTUALIZACIÓN ───
// La app se actualiza sola: chequea novedades al abrir y cada hora.
function setupAutoUpdater() {
  if (!app.isPackaged) return; // no en desarrollo
  autoUpdater.setFeedURL({ provider: 'generic', url: UPDATE_URL });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  let notificado = false;
  autoUpdater.on('update-available', () => {
    console.log('CyberAlerta: actualización disponible, descargando…');
  });
  autoUpdater.on('update-not-available', () => {
    console.log('CyberAlerta: sin actualizaciones.');
  });
  autoUpdater.on('error', (e) => {
    console.log('CyberAlerta: error de actualización', e && e.message);
  });
  autoUpdater.on('update-downloaded', () => {
    console.log('CyberAlerta: actualización descargada.');
    if (notificado || !mainWin) return;
    notificado = true;
    dialog.showMessageBox(mainWin, {
      type: 'info',
      title: 'CyberAlerta',
      message: 'Actualización lista',
      detail: 'Se descargó una nueva versión. Reiniciar ahora para aplicarla.',
      buttons: ['Reiniciar ahora', 'Más tarde'],
      defaultId: 0,
      cancelId: 1
    }).then((r) => {
      if (r.response === 0) {
        setImmediate(() => { autoUpdater.quitAndInstall(); });
      }
    }).catch(() => {});
  });

  try { autoUpdater.checkForUpdates(); } catch (e) {}
}

app.whenReady().then(() => {
  // Pre-cargar noticias en segundo plano apenas abre
  fetchAllFeeds().catch(() => {});
  setInterval(() => { if (mainWin && !mainWin.isDestroyed()) fetchAllFeeds().catch(() => {}); }, REFRESH_MS);
  createWindow();
  setupAutoUpdater();
  // Chequear actualizaciones cada hora
  setInterval(() => {
    try { autoUpdater.checkForUpdates(); } catch (e) {}
  }, 60 * 60 * 1000);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});