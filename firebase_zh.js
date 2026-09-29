/* ═══════════════════════════════════════════════
   ZONAHACK - MÓDULO FIREBASE (Firestore REST)
   Sin SDK: usa la API REST de Cloud Firestore.
   → No carga scripts de terceros (sin CSP ni
     Tracking Prevention).
   → Tiempo real por polling liviano (cada 2s).
   Reglas (modo test) requeridas en Firestore:
     match /{document=**} { allow read, write: if true; }
   Rutas:
     1 segmento = colección (lista)   ej: 'chat'
     2 segmentos = documento          ej: 'demo/contador'
   Uso:
     ZHFirebase.init(function(){
        get('chat').then(obj=>...)      // {id: dato}
        set('demo/contador', valor)
        update('demo/contador', {campo:valor})
        push('chat', objeto).then(id=>...)
        remove('chat')                  // vacía la colección
        remove('demo/contador')
        on('chat', function(obj){...})  // tiempo real
     });
   ═══════════════════════════════════════════════ */
// Si el Service Worker se actualiza mientras esta pestaña está abierta, avisar
// con un cartelito en vez de recargar de golpe (para no cortar lo que se está
// haciendo: escribiendo un mensaje, viendo un video, etc). El usuario decide cuándo.
(function(){
  if(window.__zhSwAutoReload) return;
  window.__zhSwAutoReload = true;
  if(!('serviceWorker' in navigator)) return;

  function mostrarAvisoActualizacion(){
    if(document.getElementById('__zh_update_toast')) return;
    var css = document.createElement('style');
    css.textContent =
      '#__zh_update_toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%) translateY(0);' +
      'z-index:2147483647;background:#0d0d0d;border:1px solid rgba(0,255,65,.25);border-radius:10px;' +
      'padding:10px 12px 10px 14px;display:flex;align-items:center;gap:10px;box-shadow:0 6px 24px rgba(0,0,0,.5);' +
      'font-family:"Courier New",Courier,monospace;color:#c8d6e5;font-size:.82em;max-width:92vw;' +
      'opacity:0;transition:opacity .3s,transform .3s}' +
      '#__zh_update_toast.on{opacity:1;transform:translateX(-50%) translateY(-4px)}' +
      '#__zh_update_toast .msg{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '#__zh_update_toast b{color:#00ff41}' +
      '#__zh_update_toast button{font-family:inherit;font-size:.92em;border-radius:6px;padding:6px 12px;cursor:pointer;flex-shrink:0}' +
      '#__zh_update_toast .btn-reload{background:rgba(0,255,65,.1);border:1px solid rgba(0,255,65,.35);color:#00ff41;font-weight:bold}' +
      '#__zh_update_toast .btn-close{background:none;border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.5);padding:6px 9px}';
    document.head.appendChild(css);

    var t = document.createElement('div');
    t.id = '__zh_update_toast';
    t.innerHTML =
      '<span style="font-size:1.3em">🔄</span>' +
      '<span class="msg">Hay una <b>versión nueva</b> de ZonaHack</span>' +
      '<button class="btn-reload">Recargar</button>' +
      '<button class="btn-close" title="Ahora no">✕</button>';
    document.body.appendChild(t);
    requestAnimationFrame(function(){ t.classList.add('on'); });

    t.querySelector('.btn-reload').onclick = function(){ window.location.reload(); };
    t.querySelector('.btn-close').onclick = function(){
      t.classList.remove('on');
      setTimeout(function(){ if(t.parentNode) t.parentNode.removeChild(t); }, 300);
    };
  }

  navigator.serviceWorker.addEventListener('controllerchange', function(){
    // Si la pestaña recién se abrió (todavía no hay contenido cargado por el usuario)
    // no hace falta molestar con el cartel, se puede recargar directo.
    if(document.visibilityState === 'hidden'){ window.location.reload(); return; }
    mostrarAvisoActualizacion();
  });
})();

window.ZHFirebase = (function () {
  var CFG = {
    projectId: "aaaaa-4938f",
    databaseId: "(default)",
    apiKey: "AIzaSyDM6mf2zv1DqOar1jL0zw-hsdEQA8L4zcQ"
  };
  var BASE = "https://firestore.googleapis.com/v1/projects/" + CFG.projectId + "/databases/" + CFG.databaseId + "/documents";
  var ready = false;

  function split(path) {
    var p = String(path || "").replace(/^\/+|\/+$/g, "");
    var parts = p.split("/").filter(Boolean);
    if (!parts.length) return null;
    if (parts.length === 1) return { col: parts[0], doc: null };
    return { col: parts[0], doc: parts.slice(1).join("/") };
  }

  function enc(v) {
    if (v === null || v === undefined) return { nullValue: null };
    var t = typeof v;
    if (t === "string") return { stringValue: v };
    if (t === "boolean") return { booleanValue: v };
    if (t === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
    if (t === "object") {
      var f = {};
      Object.keys(v).forEach(function (k) { f[k] = enc(v[k]); });
      return { mapValue: { fields: f } };
    }
    return { stringValue: String(v) };
  }

  function dec(f) {
    if (!f) return null;
    var o = {};
    Object.keys(f).forEach(function (k) {
      var v = f[k];
      if ("stringValue" in v) o[k] = v.stringValue;
      else if ("integerValue" in v) o[k] = parseInt(v.integerValue, 10);
      else if ("doubleValue" in v) o[k] = v.doubleValue;
      else if ("booleanValue" in v) o[k] = v.booleanValue;
      else if ("nullValue" in v) o[k] = null;
      else if ("mapValue" in v) o[k] = dec(v.mapValue.fields);
      else if ("arrayValue" in v) o[k] = (v.arrayValue.values || []).map(dec);
      else if ("timestampValue" in v) o[k] = v.timestampValue;
      else if ("referenceValue" in v) o[k] = v.referenceValue;
      else o[k] = v;
    });
    return o;
  }

  function parseList(res) {
    var out = {};
    var docs = (res && res.documents) || [];
    docs.forEach(function (d) { out[d.name.split("/").pop()] = dec(d.fields); });
    return out;
  }

  function url(p) { return BASE + "/" + p + "?key=" + encodeURIComponent(CFG.apiKey); }
  // Igual que url() pero agrega updateMask.fieldPaths como query params (Firestore
  // exige la mascara ahi, NO en el body) para que el PATCH sea un merge parcial real.
  function urlMask(p, paths) {
    var qs = "?key=" + encodeURIComponent(CFG.apiKey);
    paths.forEach(function (k) { qs += "&updateMask.fieldPaths=" + encodeURIComponent(k); });
    return BASE + "/" + p + qs;
  }

  function req(method, u, body) {
    return fetch(u, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error((j.error && j.error.message) || ("FB " + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  function fieldsOf(o) {
    var fields = {};
    Object.keys(o).forEach(function (k) { fields[k] = enc(o[k]); });
    return { fields: fields };
  }

  return {
    init: function (cb) {
      req("GET", url("logs")).then(function () { ready = true; }).catch(function () { ready = false; })
        .then(function () { if (cb) cb(); });
    },
    get ready() { return ready; },
    get: function (path) {
      var s = split(path);
      if (!s) return Promise.resolve({});
      if (s.doc) return req("GET", url(s.col + "/" + s.doc)).then(function (r) { return dec(r.fields); })
        .catch(function (e) { if (e.status === 404) return null; throw e; });
      return req("GET", url(s.col)).then(parseList).catch(function (e) { if (e.status === 404) return {}; throw e; });
    },
    set: function (path, val) {
      var s = split(path);
      if (!s || !s.doc) return Promise.reject(new Error("set() necesita col/doc"));
      return req("PATCH", url(s.col + "/" + s.doc), fieldsOf(val));
    },
    update: function (path, val) {
      var s = split(path);
      if (!s || !s.doc) return Promise.reject(new Error("update() necesita col/doc"));
      return req("PATCH", urlMask(s.col + "/" + s.doc, Object.keys(val)), fieldsOf(val));
    },
    push: function (path, val) {
      var s = split(path);
      if (!s || s.doc) return Promise.reject(new Error("push() necesita una colección"));
      var fields = (val && typeof val === "object" && !Array.isArray(val)) ? enc(val).mapValue.fields : { v: enc(val) };
      return req("POST", url(s.col), { fields: fields }).then(function (r) { return r.name.split("/").pop(); });
    },
    remove: function (path) {
      var s = split(path);
      if (!s) return Promise.resolve();
      if (s.doc) return req("DELETE", url(s.col + "/" + s.doc)).then(function () { return null; });
      // vaciar colección: leer ids y borrar de a uno
      var self = this;
      return req("GET", url(s.col)).then(function (r) {
        var docs = (r && r.documents) || [];
        return Promise.all(docs.map(function (d) { return req("DELETE", url(s.col + "/" + d.name.split("/").pop())); }));
      });
    },
    on: function (path, cb) {
      var timer = setInterval(function () { self_get(path).then(cb).catch(function () {}); }, 2000);
      function self_get(p) {
        var s = split(p);
        if (!s) return Promise.resolve({});
        if (s.doc) return req("GET", url(s.col + "/" + s.doc)).then(function (r) { return dec(r.fields); }).catch(function () { return null; });
        return req("GET", url(s.col)).then(parseList).catch(function () { return {}; });
      }
      self_get(path).then(cb).catch(function () {});
      return { close: function () { clearInterval(timer); } };
    }
  };
})();