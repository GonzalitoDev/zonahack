/* ═══════════════════════════════════════════
   CYBERALERTA - Renderer
   ═══════════════════════════════════════════ */
const $ = (id) => document.getElementById(id);
let articles = [];
let filtro = 'Todas';
let q = '';

function showState(id) {
  ['stateLoading', 'stateEmpty', 'stateError'].forEach((s) => $(s).classList.toggle('show', s === id));
  const visible = id === null;
  $('grid').style.display = visible ? 'grid' : 'none';
  $('feat').style.display = visible ? 'block' : 'none';
}

function relTime(dateStr) {
  const t = Date.parse(dateStr);
  if (!t) return '';
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function safeImg(u) {
  u = String(u || '').replace(/["'<>\\]/g, '');
  return u.indexOf('http') === 0 ? u : '';
}

function srcBadge(a) {
  return '<span class="src" style="color:' + a.color + ';background:' + a.color + '1f;border:1px solid ' + a.color + '45">' +
    '<span class="dot"></span>' + esc(a.source) + '</span>';
}

function render() {
  const list = articles.filter((a) => {
    const okFiltro = filtro === 'Todas' || a.source === filtro;
    const okQ = !q || (a.title + ' ' + a.snippet).toLowerCase().includes(q);
    return okFiltro && okQ;
  });

  if (!articles.length) { showState('stateLoading'); return; }
  if (!list.length) { showState('stateEmpty'); return; }

  showState(null);

  // Noticia destacada
  const f = list[0];
  const fimg = safeImg(f.img);
  $('feat').innerHTML = '<div class="fbg"' + (fimg ? " style='background-image:url(" + fimg + ")'" : '') + '></div>' +
    '<div class="fg"></div>' +
    '<div class="fc">' + srcBadge(f) + '<h3>' + esc(f.title) + '</h3>' +
    '<div class="f-meta">' + relTime(f.date) + ' · ' + esc(f.source) + '</div></div>';
  $('feat').onclick = () => { if (f.link) window.cyberalerta.openExternal(f.link); };

  // Resto de noticias
  $('grid').innerHTML = list.slice(1).map((a, i) => {
    const img = safeImg(a.img);
    return `<div class="card" style="animation:fadeIn .35s ${Math.min(i * 30, 420)}ms both">
      <div class="thumb" ${img ? "style=\"background-image:url('" + img + "')\"" : ''}>
        ${img ? '' : '<div class="ph">🖥️</div>'}
        ${srcBadge(a)}
      </div>
      <div class="cbody">
        <h3>${esc(a.title)}</h3>
        <p>${esc(a.snippet)}</p>
        <div class="meta"><span>${relTime(a.date)}</span><b>Abrir →</b></div>
      </div>
    </div>`;
  }).join('');

  $('grid').querySelectorAll('.card').forEach((c, i) => {
    c.addEventListener('click', () => {
      const url = list[i + 1].link;
      if (url && window.cyberalerta) window.cyberalerta.openExternal(url);
    });
  });
}

function buildChips() {
  const names = ['Todas', ...new Set(articles.map((a) => a.source))];
  $('chips').innerHTML = names.map((n) =>
    `<button class="chip ${n === filtro ? 'on' : ''}" data-f="${esc(n)}">${esc(n)}</button>`
  ).join('');
  $('chips').querySelectorAll('.chip').forEach((c) => {
    c.addEventListener('click', () => {
      filtro = c.dataset.f;
      $('chips').querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c));
      render();
    });
  });
}

async function cargar(force) {
  const btn = $('refresh');
  btn.classList.add('spin');
  showState('stateLoading');
  try {
    const res = await window.cyberalerta.getNews(force);
    articles = res.articles || [];
    $('updated').textContent = res.updated
      ? 'Actualizado ' + new Date(res.updated).toLocaleTimeString()
      : '—';
    // Estadísticas del hero
    const esFuentes = ['Hackplayers', 'Unaaldía (HispaSec)', 'WeLiveSecurity ES'];
    $('statNews').textContent = articles.length;
    $('statFeeds').textContent = new Set(articles.map((a) => a.source)).size;
    $('statLang').textContent = articles.filter((a) => esFuentes.includes(a.source)).length;
    buildChips();
    render();
    if (!articles.length) showState('stateError');
  } catch (e) {
    showState('stateError');
  } finally {
    btn.classList.remove('spin');
  }
}

$('refresh').addEventListener('click', () => cargar(true));
$('retry').addEventListener('click', () => cargar(true));
$('q').addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); render(); });

cargar(false);

/* ═══════════════════════════════════════════
   ASISTENTE DE IA (Gemini gratis)
   ═══════════════════════════════════════════ */
const AI_SYSTEM = 'Sos CyberAlerta, un experto en ciberseguridad que responde en español. ' +
  'Dás respuestas breves, claras y prácticas. Si algo no lo sabés, lo decís directamente.';
const SUGS = [
  '¿Qué es el phishing?',
  '¿Cómo crear una contraseña segura?',
  '¿Qué es un firewall?',
  'Cómo saber si mi PC tiene un virus',
  'Buenas prácticas de ciberseguridad'
];
let aiHistory = [];

function aiOpen() {
  $('aiPanel').classList.add('open');
  $('aiKey').value = localStorage.getItem('ca_ai_key') || '';
  $('aiMode').textContent = $('aiKey').value ? 'modo: clave propia' : 'modo: servidor';
  renderSugs();
  if (!$('aiMsgs').children.length) {
    addMsg('bot', 'Hola 👋 Soy el asistente de ciberseguridad de CyberAlerta. Preguntame lo que quieras.');
  }
  $('aiInput').focus();
}
function aiClose() { $('aiPanel').classList.remove('open'); }

function renderSugs() {
  $('aiSug').innerHTML = SUGS.map((s) => `<button class="sug">${esc(s)}</button>`).join('');
  $('aiSug').querySelectorAll('.sug').forEach((b) => {
    b.addEventListener('click', () => { $('aiInput').value = b.textContent; aiSend(); });
  });
}

function addMsg(role, text) {
  const d = document.createElement('div');
  d.className = 'msg ' + role;
  d.textContent = text;
  $('aiMsgs').appendChild(d);
  $('aiMsgs').scrollTop = $('aiMsgs').scrollHeight;
  return d;
}

async function aiSend() {
  const txt = $('aiInput').value.trim();
  if (!txt) return;
  $('aiInput').value = '';
  aiHistory.push({ role: 'user', content: txt });
  addMsg('user', txt);
  const typing = addMsg('bot', 'Pensando…');
  typing.classList.add('typing');
  try {
    const key = (localStorage.getItem('ca_ai_key') || '').trim();
    const respuesta = await window.cyberalerta.ai({
      system: AI_SYSTEM,
      messages: aiHistory.slice(-10),
      key: key
    });
    typing.classList.remove('typing');
    typing.textContent = respuesta;
    aiHistory.push({ role: 'assistant', content: respuesta });
  } catch (e) {
    typing.classList.remove('typing');
    typing.classList.add('err');
    typing.textContent = 'No pude responder. ' + (e && e.message ? e.message : '') +
      '\n\nPara usar la IA gratis: pegá tu clave de Gemini en el panel o configurá GEMINI_API_KEY en el servidor.';
  }
  $('aiMsgs').scrollTop = $('aiMsgs').scrollHeight;
}

$('aiBtn').addEventListener('click', aiOpen);
$('aiClose').addEventListener('click', aiClose);
$('aiSend').addEventListener('click', aiSend);
$('aiInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') aiSend(); });
$('aiKeySave').addEventListener('click', () => {
  const k = $('aiKey').value.trim();
  localStorage.setItem('ca_ai_key', k);
  $('aiMode').textContent = k ? 'modo: clave propia' : 'modo: servidor';
});
$('aiKeyLink').addEventListener('click', (e) => {
  e.preventDefault();
  window.cyberalerta.openExternal('https://aistudio.google.com/apikey');
});