/* ZonaHack - sesión verificada por el servidor.
   No confía en localStorage: pregunta a /api/auth?accion=me y sincroniza
   la identidad real. Si alguien cambia vh_usuario o vh_rango a mano,
   el servidor lo pisa con los datos de la cuenta autenticada. */
(function () {
  "use strict";
  if (window.ZH_AUTH) return;

  var API = "/api/auth";
  var state = {
    ready: null,
    listo: false,
    verified: false,
    offline: false,
    usuario: "anon",
    rango: "user",
    admin: false,
    panel: { autorizado: false, nivel: "" },
    vip: { activo: false, hasta: "" }
  };
  window.ZH_AUTH = state;

  function token() {
    try { return localStorage.getItem("vh_token") || ""; } catch (e) { return ""; }
  }

  function borrarSesionLocal() {
    try {
      localStorage.removeItem("vh_token");
      localStorage.removeItem("vh_sesion");
      localStorage.removeItem("vh_rango");
      localStorage.removeItem("vh_admin_pass");
      localStorage.removeItem("zh_jefe");
      localStorage.setItem("vh_usuario", "anon");
    } catch (e) {}
    try {
      sessionStorage.removeItem("zh_admin_unlock");
      sessionStorage.removeItem("zh_jefe");
    } catch (e) {}
    window._rangoManual = null;
    window._esAdminPortal = false;
    window._esVIP = false;
  }

  function aplicar(d) {
    state.verified = true;
    state.usuario = String(d.usuario || "").toLowerCase();
    state.rango = String(d.rango || "user").toLowerCase();
    state.admin = !!d.admin;
    state.panel = d.panel || { autorizado: false, nivel: "" };
    state.vip = d.vip || { activo: false, hasta: "" };
    try {
      localStorage.setItem("vh_usuario", state.usuario);
      localStorage.setItem("vh_rango", state.rango);
      // La cookie HttpOnly es la fuente de verdad; no dejamos el token en JS.
      localStorage.removeItem("vh_token");
      localStorage.removeItem("vh_sesion");
      if (!state.admin) {
        localStorage.removeItem("vh_admin_pass");
        localStorage.removeItem("zh_jefe");
        window._rangoManual = null;
        window._esAdminPortal = false;
      }
    } catch (e) {}
  }

  function pedirMe() {
    var h = { "Accept": "application/json" };
    var t = token();
    if (t) h["Authorization"] = "Bearer " + t;
    return fetch(API + "?accion=me", {
      method: "GET",
      headers: h,
      credentials: "same-origin",
      cache: "no-store"
    }).then(function (r) {
      if (r.status === 401 || r.status === 403) {
        var err = new Error("no_autorizado");
        err.codigo = 401;
        throw err;
      }
      if (!r.ok) {
        var err2 = new Error("http_" + r.status);
        err2.codigo = r.status;
        throw err2;
      }
      return r.json();
    });
  }

  function finalizar() {
    state.listo = true;
    try {
      document.dispatchEvent(new CustomEvent("zh-auth-ready", { detail: state }));
    } catch (e) {}
    return state;
  }

  // Páginas de cuenta/administración: se verifica de forma síncrona ANTES de
  // que el resto de la página pueda leer localStorage. Así nadie puede cambiar
  // vh_usuario a mano y "entrar" como otro usuario mientras carga el HTML.
  var PAGINAS_PROTEGIDAS = {
    "perfil.html": 1, "historial.html": 1, "playlists.html": 1,
    "monedas.html": 1, "monedas_tienda.html": 1, "soporte.html": 1,
    "tienda.html": 1,
    "panel_admin.html": 1, "paneladmin": 1, "admin.html": 1, "manage.html": 1, "logs.html": 1,
    "agregar_pelicula.html": 1, "sabotaje.html": 1,
    "videohub_admin.html": 1, "videohub_admin": 1, "scraper_pro.html": 1
  };
  var syncDone = false;
  try {
    var pagina = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (PAGINAS_PROTEGIDAS[pagina]) {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", API + "?accion=me", false);
      xhr.setRequestHeader("Accept", "application/json");
      var t0 = token();
      if (t0) xhr.setRequestHeader("Authorization", "Bearer " + t0);
      xhr.send(null);
      if (xhr.status === 200) {
        aplicar(JSON.parse(xhr.responseText || "{}"));
        state.offline = false;
        syncDone = true;
      } else if (xhr.status === 401 || xhr.status === 403) {
        state.verified = false;
        borrarSesionLocal();
        syncDone = true;
        // Página privada sin sesión válida: no se muestra ni por un instante.
        location.replace("/login.html?next=" +
          encodeURIComponent(location.pathname + location.search));
      }
    }
  } catch (e) {}

  state.ready = syncDone
    ? Promise.resolve().then(finalizar)
    : pedirMe().then(function (d) {
        if (!d || !d.usuario) throw new Error("respuesta_invalida");
        aplicar(d);
        state.offline = false;
      }).catch(function (e) {
        if (e && e.codigo === 401) {
          state.verified = false;
          borrarSesionLocal();
        } else {
          // Sin red (modo offline/PWA): conservamos el token y avisamos.
          state.offline = true;
          state.verified = false;
          state.usuario = "anon";
          state.rango = "user";
          state.admin = false;
        }
      }).then(finalizar, finalizar);

  state.isOwner = function (usuario) {
    return !!(state.verified && usuario &&
      String(usuario).toLowerCase() === state.usuario);
  };

  state.canAccess = function (usuario) {
    return !!(state.verified && (state.admin || state.isOwner(usuario)));
  };

  state.urlLogin = function (next) {
    var dest = next || (location.pathname + location.search);
    return "/login.html?next=" + encodeURIComponent(dest);
  };

  state.requireUser = function (next) {
    if (state.verified) return true;
    if (state.offline) {
      state.avisoOffline("Necesitás conexión a internet para verificar tu cuenta.");
      return false;
    }
    location.replace(state.urlLogin(next));
    return false;
  };

  state.requireAdmin = function (next) {
    if (state.verified && state.admin) return true;
    if (state.offline) {
      state.avisoOffline("Necesitás conexión para verificar permisos de administrador.");
      return false;
    }
    if (!state.verified) {
      location.replace(state.urlLogin(next || "/panel_admin.html"));
      return false;
    }
    state.avisoOffline("Tu cuenta no tiene permisos de administrador.");
    return false;
  };

  state.requirePanel = function (next) {
    if (state.verified && (state.admin || (state.panel && state.panel.autorizado))) return true;
    if (state.offline) {
      state.avisoOffline("Necesitás conexión para verificar el acceso al panel.");
      return false;
    }
    if (!state.verified) {
      location.replace(state.urlLogin(next || "/panel_admin.html"));
      return false;
    }
    state.avisoOffline("No tenés autorización para entrar al panel.");
    return false;
  };

  state.avisoOffline = function (texto) {
    try {
      if (document.getElementById("zhAuthBlock")) return;
      var d = document.createElement("div");
      d.id = "zhAuthBlock";
      d.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#07090e;" +
        "color:#d7e2ef;display:flex;align-items:center;justify-content:center;text-align:center;" +
        "padding:24px;font-family:system-ui,sans-serif";
      d.innerHTML = '<div style="max-width:420px"><div style="font-size:2.6em;margin-bottom:10px">🔒</div>' +
        '<h2 style="margin:0 0 8px;font-size:1.05em">Acceso restringido</h2>' +
        '<p style="color:#8fa1b5;font-size:.8em;line-height:1.5;margin:0 0 18px">' +
        String(texto || "No autorizado") + '</p>' +
        '<a href="/login.html" style="display:inline-block;padding:10px 18px;border-radius:10px;' +
        'background:#00ff41;color:#000;font-weight:800;text-decoration:none;font-size:.8em">INICIAR SESIÓN</a>' +
        ' <a href="/" style="display:inline-block;padding:10px 18px;border-radius:10px;' +
        'border:1px solid #26313d;color:#8fa1b5;text-decoration:none;font-size:.8em">VOLVER</a></div>';
      document.body.appendChild(d);
    } catch (e) {}
  };

  state.logout = function (irA) {
    var fin = function () {
      borrarSesionLocal();
      location.href = irA || "/login.html";
    };
    try {
      fetch(API + "?accion=logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        credentials: "same-origin"
      }).then(fin, fin);
    } catch (e) {
      fin();
    }
  };

  state.fetchAuth = function (accion, data) {
    var h = { "Content-Type": "application/json" };
    var t = token();
    if (t) h["Authorization"] = "Bearer " + t;
    var opts = { method: data ? "POST" : "GET", headers: h, credentials: "same-origin" };
    if (data) opts.body = JSON.stringify(data);
    return fetch(API + "?accion=" + encodeURIComponent(accion), opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        j.__status = r.status;
        return j;
      });
    });
  };
})();
