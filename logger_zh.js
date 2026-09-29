/* ═══════════════════════════════════════════════
   ZONAHACK - LOGS a Cloud Firestore
   Autónomo: sin SDK, sin scripts externos.
   Envía a la colección 'logs': visitas, errores y
   eventos (ZHLog()). Se lee desde /logs.html.
   Incluí en cualquier página:
     <script src="/logger_zh.js"></script>
   Uso manual:
     ZHLog('click','menu_peliculas');
     ZHLog('error',{msg:'...'});
   ═══════════════════════════════════════════════ */
window.ZHLog = (function () {
  var URL = "https://firestore.googleapis.com/v1/projects/aaaaa-4938f/databases/(default)/documents/logs?key=AIzaSyDM6mf2zv1DqOar1jL0zw-hsdEQA8L4zcQ";
  var Q = [];
  var busy = false;

  function encFields(o) {
    var f = {};
    Object.keys(o).forEach(function (k) {
      var v = o[k];
      if (v === null || v === undefined) f[k] = { nullValue: null };
      else if (typeof v === "string") f[k] = { stringValue: v };
      else if (typeof v === "boolean") f[k] = { booleanValue: v };
      else if (typeof v === "number") f[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
      else if (typeof v === "object") f[k] = { stringValue: JSON.stringify(v) };
      else f[k] = { stringValue: String(v) };
    });
    return f;
  }

  function entry(e, d) {
    var it = {
      e: String(e || "evento"),
      p: (location.pathname || "/"),
      u: (function () { try { return localStorage.getItem('vh_usuario') || 'anon'; } catch (x) { return 'anon'; } })(),
      r: (document.referrer || ""),
      vw: window.innerWidth + "x" + window.innerHeight,
      ts: Date.now(),
      t: new Date().toISOString()
    };
    if (d !== undefined && d !== null) it.d = (typeof d === "string") ? d : JSON.stringify(d);
    return it;
  }

  function pump() {
    if (busy || !Q.length) return;
    busy = true;
    var it = Q.shift();
    fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: encFields(it) })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error((j.error && j.error.message) || ("FB " + r.status));
      });
    }).then(function () { busy = false; pump(); })
      .catch(function () {
        busy = false;
        Q.unshift(it);
        if (Q.length > 30) Q.pop();
        setTimeout(pump, 8000);
      });
  }

  function log(e, d) {
    try {
      Q.push(entry(e, d));
      if (Q.length > 30) Q.shift();
      pump();
    } catch (x) {}
  }

  function auto() {
    try {
      log("view");
      window.addEventListener("error", function (ev) {
        log("error", { msg: ev.message || "", src: (ev.filename || "") + ":" + (ev.lineno || "") });
      });
      window.addEventListener("unhandledrejection", function (ev) {
        log("error", String((ev.reason && ev.reason.message) || ev.reason || "promesa"));
      });
    } catch (x) {}
  }

  auto();
  return { log: log, auto: auto };
})();