/*  ZonaHack AdBlock — bloqueador propio para los reproductores embebidos.
 *
 *  Qué hace:
 *   1. "Blinda" cada iframe de reproductores externos: le quita el permiso de abrir
 *      pop-ups, de redirigir la página y de descargar archivos (sandbox). Los
 *      reproductores de confianza (YouTube, Archive.org, Vimeo...) no se tocan.
 *   2. Bloquea en esta página los scripts, iframes, imágenes y pedidos de red de
 *      dominios de publicidad conocidos.
 *   3. Bloquea ventanas nuevas que no salen de un clic tuyo.
 *   4. Oculta los contenedores de anuncios más comunes.
 *  Escudo 🛡 abajo a la izquierda: ver bloqueos, apagarlo o permitir un reproductor
 *  que deje de andar.
 *
 *  Uso: <script src="/adblock_zh.js?v=1"></script> lo más arriba posible del <head>.
 */
(function () {
  "use strict";
  if (window.__zhAdblock) return;
  window.__zhAdblock = true;

  /* ─── configuración guardada ─── */
  var KEY = "zh_adblock";
  function leer() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function guardar() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} }
  var cfg = leer();
  if (cfg.on === undefined) cfg.on = true;
  cfg.permitidos = cfg.permitidos || {};   // dominio -> true (reproductores con pop-ups permitidos)
  cfg.total = cfg.total || 0;              // bloqueos históricos
  cfg.mini = !!cfg.mini;

  /* ─── listas ─── */
  // Reproductores de confianza: no se modifican.
  var CONFIABLES = [
    "youtube.com", "youtube-nocookie.com", "youtu.be", "ytimg.com", "archive.org", "vimeo.com",
    "dailymotion.com", "odysee.com", "wikimedia.org", "wikipedia.org", "spotify.com", "soundcloud.com",
    "twitch.tv", "google.com", "googlevideo.com", "bandcamp.com", "supabase.co", "vercel.app",
    "jsdelivr.net", "cdnjs.cloudflare.com", "unpkg.com", "firebaseio.com", "firebasedatabase.app",
    "gstatic.com", "googleapis.com", "openstreetmap.org", "nasa.gov"
  ];
  // Publicidad, pop-unders y rastreadores conocidos.
  var BLOQUEADOS = [
    "doubleclick.net", "googlesyndication.com", "googleadservices.com", "adservice.google.com",
    "google-analytics.com", "googletagservices.com", "pagead2.googlesyndication.com", "amazon-adsystem.com",
    "adnxs.com", "adsrvr.org", "criteo.com", "criteo.net", "taboola.com", "outbrain.com", "revcontent.com",
    "mgid.com", "popads.net", "popcash.net", "propellerads.com", "propellerclick.com", "adsterra.com",
    "adsterratools.com", "a-ads.com", "exoclick.com", "exosrv.com", "juicyads.com", "trafficjunky.net",
    "trafficstars.com", "onclickads.net", "onclkds.com", "adcash.com", "hilltopads.net", "hilltopads.com",
    "clickadu.com", "monetag.com", "galaksion.com", "admaven.com", "ad-maven.com", "pushhouse.io",
    "richpush.co", "pushame.com", "adskeeper.co.uk", "adskeeper.com", "zeropark.com", "popmyads.com",
    "bidvertiser.com", "yllix.com", "infolinks.com", "media.net", "adform.net", "smartadserver.com",
    "rubiconproject.com", "pubmatic.com", "openx.net", "casalemedia.com", "lijit.com", "sharethrough.com",
    "yieldmo.com", "33across.com", "adition.com", "adroll.com", "quantserve.com", "scorecardresearch.com",
    "hotjar.com", "mc.yandex.ru", "an.yandex.ru", "adfox.ru", "clickaine.com", "realsrv.com",
    "tsyndicate.com", "displayvertising.com", "highperformanceformat.com", "profitablecpmrate.com",
    "profitablegatecpm.com", "effectivecpmgate.com", "bounceexchange.com", "adblockanalytics.com",
    "dolohen.com", "acint.net", "ad.plus", "aclib.net", "adexchangeclear.com", "pemsrv.com"
  ];
  var PATRONES = /(^|[./_-])(popunder|popads?|clickunder|onclick(ads)?|adserv(er|ice)?|adsby|banner-?ads?)([./_-]|$)/i;

  function host(url) {
    try { return new URL(url, location.href).hostname.toLowerCase(); } catch (e) { return ""; }
  }
  function coincide(h, lista) {
    for (var i = 0; i < lista.length; i++) { var d = lista[i]; if (h === d || h.slice(-d.length - 1) === "." + d) return true; }
    return false;
  }
  function esConfiable(h) { return !h || h === location.hostname || coincide(h, CONFIABLES); }
  function esPublicidad(url) {
    if (!url) return false;
    var h = host(url);
    if (!h || h === location.hostname) return false;
    if (coincide(h, BLOQUEADOS)) return true;
    try { var u = new URL(url, location.href); return PATRONES.test(u.hostname + u.pathname); } catch (e) { return false; }
  }

  /* ─── contadores ─── */
  var stats = { ventanas: 0, recursos: 0, blindados: 0 };
  var reproductores = {}; // dominio -> { iframes: Set-like array, permitido }
  function sumar(tipo, detalle) {
    stats[tipo]++;
    if (tipo !== "blindados") { cfg.total++; guardar(); }
    if (detalle) registro.unshift({ t: tipo, d: String(detalle).slice(0, 120), h: new Date().toLocaleTimeString() });
    if (registro.length > 30) registro.length = 30;
    pintar();
  }
  var registro = [];

  /* ═══════════ 1. BLINDAR IFRAMES ═══════════ */
  var QUITAR = ["allow-popups", "allow-popups-to-escape-sandbox", "allow-top-navigation",
    "allow-top-navigation-by-user-activation", "allow-top-navigation-to-custom-protocols", "allow-modals", "allow-downloads"];
  var BASE = ["allow-scripts", "allow-same-origin", "allow-forms", "allow-presentation", "allow-pointer-lock", "allow-orientation-lock"];
  var descSrc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "src");
  var setAttr = Element.prototype.setAttribute;
  var getAttr = Element.prototype.getAttribute;

  function sandboxBlindado(original) {
    var tokens = original == null ? BASE.slice() : String(original).split(/\s+/).filter(Boolean);
    tokens = tokens.filter(function (t) { return QUITAR.indexOf(t.toLowerCase()) < 0; });
    BASE.forEach(function (t) { if (tokens.indexOf(t) < 0) tokens.push(t); });
    return tokens.join(" ");
  }

  // Devuelve true si cambió el sandbox (y hay que recargar el iframe para que aplique).
  function blindar(f, url) {
    url = url == null ? (getAttr.call(f, "src") || "") : String(url);
    if (!url || /^about:/i.test(url) || /^javascript:/i.test(url)) return false;
    var h = /^(data|blob):/i.test(url) ? "(" + url.split(":")[0] + ")" : host(url);
    var guardado = f.__zhOrig !== undefined;
    var original = guardado ? f.__zhOrig : getAttr.call(f, "sandbox");

    // reproductor conocido para el panel
    if (h && h !== location.hostname && !(h.charAt(0) !== "(" && coincide(h, CONFIABLES))) {
      var r = reproductores[h] = reproductores[h] || { iframes: [], permitido: false };
      if (r.iframes.indexOf(f) < 0) r.iframes.push(f);
    }

    var debe = cfg.on && h.charAt(0) === "(" ? true : cfg.on && !esConfiable(h) && !cfg.permitidos[h];
    if (!debe) {
      if (guardado) { // restaurar como estaba
        if (original == null) f.removeAttribute("sandbox"); else setAttr.call(f, "sandbox", original);
        delete f.__zhOrig; f.removeAttribute("data-zh-blindado");
        return true;
      }
      return false;
    }
    if (!guardado) f.__zhOrig = original;
    var nuevo = sandboxBlindado(original);
    if (getAttr.call(f, "sandbox") === nuevo && guardado) return false;
    setAttr.call(f, "sandbox", nuevo);
    if (!f.hasAttribute("data-zh-blindado")) { setAttr.call(f, "data-zh-blindado", h); sumar("blindados"); }
    return true;
  }
  function recargar(f) {
    var u = getAttr.call(f, "src");
    if (u && descSrc) { descSrc.set.call(f, "about:blank"); setTimeout(function () { descSrc.set.call(f, u); }, 30); }
  }

  if (descSrc && descSrc.set) {
    Object.defineProperty(HTMLIFrameElement.prototype, "src", {
      configurable: true, enumerable: descSrc.enumerable,
      get: descSrc.get,
      set: function (v) { try { blindar(this, v); } catch (e) {} descSrc.set.call(this, v); }
    });
  }

  /* ═══════════ 2. BLOQUEAR RECURSOS DE PUBLICIDAD EN ESTA PÁGINA ═══════════ */
  function srcDe(el) {
    if (!el || el.nodeType !== 1) return "";
    var tag = el.tagName;
    if (tag === "SCRIPT" || tag === "IFRAME" || tag === "IMG" || tag === "EMBED") return getAttr.call(el, "src") || "";
    if (tag === "LINK") return getAttr.call(el, "href") || "";
    return "";
  }
  function anular(el) {
    var u = srcDe(el);
    try { if (el.tagName === "SCRIPT") el.type = "javascript/bloqueado-zh"; } catch (e) {}
    try { if (el.tagName === "LINK") el.removeAttribute("href"); else el.removeAttribute("src"); } catch (e) {}
    sumar("recursos", host(u) || u);
  }
  function revisarNodo(el) {
    if (!cfg.on || !el || el.nodeType !== 1) return false;
    var u = srcDe(el);
    if (u && esPublicidad(u)) { anular(el); return true; }
    if (el.tagName === "IFRAME" && u) { if (blindar(el, u)) recargar(el); }
    return false;
  }

  Element.prototype.setAttribute = function (n, v) {
    var nombre = String(n).toLowerCase();
    if (cfg.on && (nombre === "src" || nombre === "href")) {
      var tag = this.tagName;
      if ((tag === "SCRIPT" || tag === "IFRAME" || tag === "IMG" || (tag === "LINK" && nombre === "href")) && esPublicidad(v)) {
        sumar("recursos", host(v)); return;
      }
      if (tag === "IFRAME" && nombre === "src") { try { blindar(this, v); } catch (e) {} }
    }
    return setAttr.call(this, n, v);
  };
  var descScript = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "src");
  if (descScript && descScript.set) {
    Object.defineProperty(HTMLScriptElement.prototype, "src", {
      configurable: true, enumerable: descScript.enumerable, get: descScript.get,
      set: function (v) { if (cfg.on && esPublicidad(v)) { sumar("recursos", host(v)); return; } descScript.set.call(this, v); }
    });
  }
  ["appendChild", "insertBefore", "replaceChild"].forEach(function (m) {
    var orig = Node.prototype[m];
    Node.prototype[m] = function (nodo) {
      try {
        if (cfg.on && nodo && nodo.nodeType === 1 && (nodo.tagName === "SCRIPT" || nodo.tagName === "IFRAME" || nodo.tagName === "IMG") && esPublicidad(srcDe(nodo))) {
          anular(nodo);
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
  });
  // fetch / XHR / beacon hacia publicidad
  var fetchOrig = window.fetch;
  if (fetchOrig) {
    window.fetch = function (rec) {
      var u = typeof rec === "string" ? rec : (rec && rec.url) || "";
      if (cfg.on && esPublicidad(u)) { sumar("recursos", host(u)); return Promise.reject(new TypeError("Bloqueado por ZonaHack AdBlock")); }
      return fetchOrig.apply(this, arguments);
    };
  }
  var xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) {
    if (cfg.on && esPublicidad(u)) { sumar("recursos", host(u)); this.__zhBloq = true; }
    return xhrOpen.apply(this, arguments);
  };
  var xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () { if (this.__zhBloq) { try { this.abort(); } catch (e) {} return; } return xhrSend.apply(this, arguments); };
  if (navigator.sendBeacon) {
    var beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (u) { if (cfg.on && esPublicidad(u)) { sumar("recursos", host(u)); return true; } return beacon.apply(null, arguments); };
  }

  /* ═══════════ 3. VENTANAS NUEVAS SIN CLIC ═══════════ */
  var openOrig = window.open;
  window.open = function (u) {
    if (cfg.on) {
      var activo = navigator.userActivation ? navigator.userActivation.isActive : true;
      if (!activo || esPublicidad(u)) { sumar("ventanas", u ? (host(u) || u) : "(ventana vacía)"); avisar("🛡 Pop-up bloqueado"); return null; }
    }
    return openOrig.apply(window, arguments);
  };

  /* ═══════════ 4. OCULTAR CONTENEDORES DE ANUNCIOS ═══════════ */
  var CSS_ANUNCIOS = 'ins.adsbygoogle,[id^="google_ads_"],[id^="div-gpt-ad"],iframe[src*="doubleclick.net"],iframe[src*="googlesyndication"],' +
    '[class*="adsbygoogle"],.adsbox,.ad-banner,.ad-container,.ad-slot,[data-ad-slot],[data-ad-client],' +
    'a[href*="popads.net"],a[href*="adsterra"],a[href*="exoclick"]{display:none!important}';

  /* ═══════════ observador: lo que entra por innerHTML o por el parser ═══════════ */
  function revisarArbol(raiz) {
    if (!raiz || raiz.nodeType !== 1) return;
    revisarNodo(raiz);
    if (raiz.querySelectorAll) raiz.querySelectorAll("script[src],iframe[src],img[src],embed[src]").forEach(revisarNodo);
  }
  var obs = new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      if (m.type === "childList") m.addedNodes.forEach(revisarArbol);
      else if (m.type === "attributes" && m.target.tagName === "IFRAME" && m.attributeName === "src") {
        var f = m.target, u = getAttr.call(f, "src");
        if (u && f.__zhUltimo !== u) { f.__zhUltimo = u; if (blindar(f, u)) recargar(f); }
      }
    });
  });
  obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });

  /* ═══════════ escudo y panel (shadow DOM: no choca con los estilos de la página) ═══════════ */
  var raiz = null, sh = null, abierto = false, avisoT = 0;
  function crearUI() {
    if (raiz || !document.body) return;
    var st = document.createElement("style"); st.textContent = CSS_ANUNCIOS; (document.head || document.documentElement).appendChild(st);
    raiz = document.createElement("div");
    raiz.id = "zh-adblock";
    raiz.style.cssText = "position:fixed;left:10px;bottom:10px;z-index:2147483646;";
    sh = raiz.attachShadow ? raiz.attachShadow({ mode: "open" }) : raiz;
    sh.innerHTML =
      '<style>' +
      ':host{all:initial}*{box-sizing:border-box;font-family:"Courier New",Courier,monospace}' +
      '.esc{all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;background:rgba(10,12,10,.92);border:1px solid rgba(0,255,65,.3);color:#00ff41;border-radius:18px;padding:5px 10px;font-size:12px;box-shadow:0 2px 10px rgba(0,0,0,.5)}' +
      '.esc.off{color:#888;border-color:#444}.esc.mini{padding:5px 7px}.esc:hover{border-color:#00ff41}' +
      '.pan{position:absolute;left:0;bottom:40px;width:min(330px,calc(100vw - 20px));max-height:70vh;overflow:auto;background:#0b0d0b;border:1px solid rgba(0,255,65,.3);border-radius:8px;padding:12px;color:#c8d6e5;font-size:12px;display:none;box-shadow:0 6px 24px rgba(0,0,0,.6)}' +
      '.pan.on{display:block}h4{margin:0 0 8px;color:#00ff41;font-size:13px;letter-spacing:.05em}' +
      '.fila{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(0,255,65,.07)}' +
      '.num{color:#00ff41;font-weight:bold}.tenue{color:#7f8c8d;font-size:11px;line-height:1.5}' +
      'button.b{all:unset;cursor:pointer;border:1px solid rgba(0,255,65,.25);color:#00ff41;border-radius:4px;padding:4px 8px;font-size:11px;white-space:nowrap}' +
      'button.b:hover{background:rgba(0,255,65,.08)}button.b.rojo{color:#e74c3c;border-color:rgba(231,76,60,.35)}button.b.oro{color:#f1c40f;border-color:rgba(241,196,15,.35)}' +
      '.sw{position:relative;width:38px;height:20px;border-radius:10px;background:#333;cursor:pointer;flex-shrink:0;border:0}.sw.on{background:#0a7a2f}' +
      '.sw::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#ddd;transition:left .15s}.sw.on::after{left:20px}' +
      '.dom{word-break:break-all}.log{max-height:110px;overflow:auto;margin-top:4px}' +
      '.toast{position:absolute;left:0;bottom:40px;background:rgba(10,12,10,.95);border:1px solid rgba(0,255,65,.3);color:#00ff41;font-size:12px;padding:5px 10px;border-radius:4px;white-space:nowrap;opacity:0;transition:opacity .2s;pointer-events:none}.toast.on{opacity:1}' +
      '</style>' +
      '<div class="toast" id="t"></div>' +
      '<div class="pan" id="p" role="dialog" aria-label="ZonaHack AdBlock"></div>' +
      '<button class="esc" id="e" type="button" title="ZonaHack AdBlock"></button>';
    document.body.appendChild(raiz);
    sh.getElementById("e").addEventListener("click", function () { abierto = !abierto; pintar(); });
    sh.getElementById("p").addEventListener("click", accion);
    pintar();
  }
  function totalPagina() { return stats.ventanas + stats.recursos; }
  function pintar() {
    if (!sh) return;
    var e = sh.getElementById("e"), p = sh.getElementById("p");
    e.className = "esc" + (cfg.on ? "" : " off") + (cfg.mini && !abierto ? " mini" : "");
    e.textContent = cfg.on ? (cfg.mini && !abierto ? "🛡" : "🛡 " + totalPagina() + (stats.blindados ? " · " + stats.blindados + "▶" : "")) : "🛡 off";
    p.classList.toggle("on", abierto);
    if (!abierto) return;
    var doms = Object.keys(reproductores);
    p.innerHTML =
      '<div class="fila"><h4 style="margin:0">🛡 ZonaHack AdBlock</h4><button class="sw' + (cfg.on ? " on" : "") + '" data-a="toggle" aria-label="Activar o desactivar"></button></div>' +
      '<div class="fila"><span>Pop-ups bloqueados</span><span class="num">' + stats.ventanas + '</span></div>' +
      '<div class="fila"><span>Anuncios y rastreadores</span><span class="num">' + stats.recursos + '</span></div>' +
      '<div class="fila"><span>Reproductores blindados</span><span class="num">' + stats.blindados + '</span></div>' +
      '<div class="fila"><span class="tenue">Total histórico</span><span class="tenue">' + cfg.total + '</span></div>' +
      (doms.length ? '<h4 style="margin-top:12px">Reproductores en esta página</h4>' + doms.map(function (d) {
        var perm = !!cfg.permitidos[d];
        return '<div class="fila"><span class="dom">' + esc(d) + '<br><span class="tenue">' + (perm ? "sin blindaje (pop-ups permitidos)" : "blindado: sin pop-ups ni redirecciones") + '</span></span>' +
          '<button class="b ' + (perm ? "" : "oro") + '" data-a="' + (perm ? "blindar" : "permitir") + '" data-d="' + esc(d) + '">' + (perm ? "Blindar" : "No anda") + '</button></div>';
      }).join("") + '<p class="tenue">Si un reproductor dice "sandbox" o no carga, tocá <b>No anda</b>: se recarga sin blindaje y lo recuerda.</p>' : "") +
      (registro.length ? '<h4 style="margin-top:12px">Últimos bloqueos</h4><div class="log">' + registro.map(function (r) {
        return '<div class="tenue">' + r.h + " · " + (r.t === "ventanas" ? "pop-up" : "anuncio") + " · " + esc(r.d) + "</div>";
      }).join("") + "</div>" : "") +
      '<div class="fila" style="border:0;margin-top:10px;gap:6px;justify-content:flex-start;flex-wrap:wrap">' +
      '<button class="b" data-a="mini">' + (cfg.mini ? "Mostrar contador" : "Achicar escudo") + '</button>' +
      (Object.keys(cfg.permitidos).length ? '<button class="b rojo" data-a="limpiar">Blindar todos otra vez</button>' : "") +
      "</div>";
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function reaplicar(d) {
    var r = reproductores[d]; if (!r) return;
    r.iframes.forEach(function (f) { if (f.isConnected && blindar(f)) recargar(f); });
  }
  function accion(ev) {
    var b = ev.target.closest ? ev.target.closest("[data-a]") : null; if (!b) return;
    var a = b.getAttribute("data-a"), d = b.getAttribute("data-d");
    if (a === "toggle") {
      cfg.on = !cfg.on; guardar();
      Object.keys(reproductores).forEach(reaplicar);
      avisar(cfg.on ? "🛡 AdBlock activado" : "AdBlock desactivado");
    } else if (a === "permitir") { cfg.permitidos[d] = true; guardar(); reaplicar(d); avisar("Recargando " + d + " sin blindaje"); }
    else if (a === "blindar") { delete cfg.permitidos[d]; guardar(); reaplicar(d); avisar("🛡 " + d + " blindado"); }
    else if (a === "limpiar") { var ds = Object.keys(cfg.permitidos); cfg.permitidos = {}; guardar(); ds.forEach(reaplicar); }
    else if (a === "mini") { cfg.mini = !cfg.mini; guardar(); }
    pintar();
  }
  function avisar(msg) {
    if (!sh) return;
    var t = sh.getElementById("t"); t.textContent = msg; t.classList.add("on");
    clearTimeout(avisoT); avisoT = setTimeout(function () { t.classList.remove("on"); }, 1800);
  }

  if (document.body) crearUI(); else document.addEventListener("DOMContentLoaded", crearUI);
  // API para depurar desde la consola
  window.zhAdblock = { stats: stats, cfg: cfg, reproductores: reproductores, esPublicidad: esPublicidad };
})();
