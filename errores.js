/* ═══════════════════════════════════════════
   ZONAHACK - CAPTURA DE ERRORES FRONTEND
   Envía errores JS a Supabase para verlos en el panel admin en tiempo real.
   Incluir en las páginas: <script src="/errores.js" defer></script>
   ═══════════════════════════════════════════ */
(function(){
  if(window.__ZH_erroresCargado) return;
  window.__ZH_erroresCargado = true;

  var SB = "https://xfwolaurpeofysnymqle.supabase.co";
  var KEY = "sb_publishable_3VvBUD5Bdu3Uaq59fJ99MQ_XDCtujUU";
  var H = {"apikey":KEY,"Authorization":"Bearer "+KEY,"Content-Type":"application/json","Prefer":"return=minimal"};
  var DISCORD_LOG = "/api/discord_log";
  var COLAS = [];        // errores pendientes de enviar
  var _enviando = false;
  var _lastEnv = 0;      // último envío (rate limit)

  function usuario(){
    try{return localStorage.getItem("vh_usuario")||"anon";}catch(e){return "anon";}
  }
  function pagina(){
    return (window.location.pathname||"/").slice(0,60);
  }
  function disp(){
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ? "movil" : "escritorio";
  }

  // Enviar alerta a Discord (fallas del sitio y de la base de datos)
  function notificarDiscord(tipo, mensaje, fuente, linea, db, detalle){
    try{
      var payload = {
        tipo: tipo,
        usuario: usuario(),
        pagina: pagina(),
        mensaje: String(mensaje||"").slice(0,1800),
        fuente: String(fuente||"").slice(0,100),
        linea: String(linea||"").slice(0,50),
        db: String(db||"").slice(0,100),
        detalle: String(detalle||"").slice(0,700),
        timestamp: new Date().toISOString()
      };
      var xhr = new XMLHttpRequest();
      xhr.open("POST", DISCORD_LOG, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(JSON.stringify(payload));
    }catch(e){}
  }

  // Encolar y enviar (con rate limit y sin bloquear la página)
  function reportar(mensaje, fuente, linea, pagina_extra){
    try{
      if(!mensaje) return;
      mensaje = String(mensaje).slice(0,300);
      COLAS.push({mensaje:mensaje, fuente:String(fuente||"").slice(0,100), linea:String(linea||"").slice(0,50), pagina:pagina_extra||pagina()});
      if(COLAS.length > 20) COLAS.shift(); // evitar acúmulo infinito
      notificarDiscord("error", mensaje, fuente, linea, "", "");
      programarEnvio();
    }catch(e){}
  }

  // Reportar falla de base de datos (fetch a Supabase que falla)
  function reportarDB(endpoint, status, detalle){
    try{
      var msg = "Fallo en petición a DB: " + (endpoint||"").slice(0,80) + (status? " (HTTP "+status+")" : " (sin respuesta)");
      notificarDiscord("db", msg, "", "", (endpoint||"").slice(0,80), detalle);
      COLAS.push({mensaje:msg.slice(0,300), fuente:"db", linea:String(status||"")+"" , pagina:pagina()});
      if(COLAS.length > 20) COLAS.shift();
      programarEnvio();
    }catch(e){}
  }

  // Envolver fetch para detectar fallas de base de datos (solo endpoints Supabase)
  var _origFetch = window.fetch;
  window.fetch = function(input, init){
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var p = _origFetch.apply(this, arguments);
    if(url.indexOf(SB) === 0){
      p.then(function(r){
        if(!r.ok){
          // Error HTTP de la DB (404 tabla, 400, 500, etc.)
          reportarDB(url.replace(SB+"/rest/v1/","").split("?")[0], r.status, "HTTP "+r.status);
        }
        return r;
      }).catch(function(err){
        // Fallo de red / la DB no responde
        reportarDB(url.replace(SB+"/rest/v1/","").split("?")[0], 0, "Sin respuesta de la DB");
      });
    }
    return p;
  };

  function programarEnvio(){
    if(_enviando) return;
    // Rate limit: máx 1 envío cada 3 segundos (no spamear la DB)
    var ahora = Date.now();
    if(ahora - _lastEnv < 3000){
      setTimeout(programarEnvio, 3000 - (ahora - _lastEnv));
      return;
    }
    _enviando = true;
    var batch = COLAS.splice(0, COLAS.length);
    if(!batch.length){ _enviando = false; return; }
    var u = usuario();
    var d = disp();
    var items = batch.map(function(e){
      return {usuario_nombre:u, mensaje:e.mensaje, fuente:e.fuente, linea:e.linea, pagina:e.pagina, dispositivo:d, user_agent:(navigator.userAgent||"").slice(0,120)};
    });
    fetch(SB+"/rest/v1/errores_frontend", {method:"POST", headers:H, body:JSON.stringify(items)})
    .then(function(r){
      _lastEnv = Date.now();
      _enviando = false;
      if(COLAS.length) programarEnvio();
    })
    .catch(function(){ _enviando = false; });
  }

  // ─── Capturar errores globales ───
  window.addEventListener("error", function(e){
    // No reportar errores ya controlados por la app
    if(e && e.message && String(e.message).indexOf("Cannot read properties of null") >= 0) return;
    reportar((e && e.message)||"Error desconocido", (e && e.filename)||"", (e && e.lineno)||"");
  });

  // Promesas rechazadas sin manejar
  window.addEventListener("unhandledrejection", function(e){
    var r = e && e.reason;
    var msg = "Promesa rechazada";
    try{
      if(r && r.message) msg = "Promesa: "+r.message;
      else if(r) msg = "Promesa: "+String(r).slice(0,200);
    }catch(ex){}
    reportar(msg, "", "");
  });

  // Errores de recursos (imagen/script/iframe que falla)
  window.addEventListener("error", function(e){
    try{
      var t = e && e.target;
      if(t && (t.tagName==="IMG"||t.tagName==="SCRIPT"||t.tagName==="LINK"||t.tagName==="IFRAME")){
        reportar("Recurso falló: "+(t.tagName.toLowerCase())+" "+(t.src||t.href||"").slice(0,80), "recurso", "");
      }
    }catch(ex){}
  }, true);

  // Funcion global para que la app pueda reportar errores manualmente
  window.reportarError = reportar;
})();
