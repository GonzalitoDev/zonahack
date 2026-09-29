var CACHE = "vh-v19";
var OFFLINE_URL = "/offline.html";
// Optimización de tamaño/velocidad: solo se precachean los archivos críticos de
// arranque. El resto (paneles, emuladores, herramientas) se cachea bajo demanda
// al primer acceso (runtime caching), reduciendo la descarga inicial y el peso.
var FILES = [
  "/","/index.html","/offline.html","/manifest.json","/sw.js",
  "/icon_48.png","/icon_96.png","/icon_144.png","/icon_192.png",
  "/icon_256.png","/icon_384.png","/icon_512.png",
  "/monedas.js","/militar.js","/errores.js",
  "/perfil.html","/login.html","/registro.html","/descargar_apk.html"
];

self.addEventListener("install",function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      return c.addAll(FILES);
    }).then(function(){
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate",function(e){
  e.waitUntil(
    caches.keys().then(function(k){
      return Promise.all(
        k.filter(function(x){return x!==CACHE;})
         .map(function(x){return caches.delete(x);})
      );
    }).then(function(){
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch",function(e){
  // Ignorar esquemas no soportados por la Cache API (chrome-extension:, chrome:, blob:...)
  try{
    var _proto=(e.request.url||"").split(":")[0].toLowerCase();
    if(_proto!=="http"&&_proto!=="https") return;
  }catch(err){ return; }

  if(e.request.method!=="GET"){
    e.respondWith(fetch(e.request).catch(function(){return new Response("",{status:503});}));
    return;
  }

  // HTML navigation requests: try network first, fallback to cache, then offline page
  if(e.request.mode==="navigate"){
    e.respondWith(
fetch(e.request).then(function(res){
        if(res&&res.status===200&&res.type==="basic"){
          var c=res.clone();
          caches.open(CACHE).then(function(ca){
            if((e.request.url||"").indexOf("http")===0){ try{ca.put(e.request,c);}catch(err){} }
          });
        }
        return res;
      }).catch(function(){
        return caches.match(e.request).then(function(r){
          return r || caches.match(OFFLINE_URL);
        });
      })
    );
    return;
  }

  // API (Supabase/Vercel): siempre a la red, nunca cachear
  if(e.request.url.indexOf("/api/")>=0){
    e.respondWith(fetch(e.request).catch(function(){return new Response("",{status:503});}));
    return;
  }

  // Static assets: cache-first
  e.respondWith(
    caches.match(e.request).then(function(cached){
      return cached || fetch(e.request).then(function(res){
        if(res&&res.status===200&&res.type==="basic"){
          var c=res.clone();
          caches.open(CACHE).then(function(ca){
            if((e.request.url||"").indexOf("http")===0){ try{ca.put(e.request,c);}catch(err){} }
          });
        }
        return res;
      }).catch(function(){
        if(e.request.destination==="image"||e.request.url.match(/\.(png|jpg|jpeg|gif|svg|ico)$/)){
          return new Response("",{status:200,headers:{"Content-Type":"image/png"}});
        }
        return new Response("Offline",{status:503});
      });
    })
  );
});

// ─── NOTIFICACIONES PUSH ────────────────────────────────────────────────
// Mostrar notificacion cuando llega un push desde el servidor.
// El mensaje puede venir como texto plano o como JSON con {title, body, icon, url}.
self.addEventListener("push",function(e){
  var data = {};
  try{
    data = e.data ? e.data.json() : {};
  }catch(err){
    data = { title: e.data ? e.data.text() : "ZonaHack" };
  }
  var titulo = data.title || "ZonaHack";
  var cuerpo = data.body || "Nuevo contenido disponible";
  var icono  = data.icon || "/icon_192.png";
  var url    = data.url || "/";
  var tag    = data.tag || "zonahack";

  e.waitUntil(
    self.registration.showNotification(titulo, {
      body: cuerpo,
      icon: icono,
      badge: "/icon_96.png",
      data: { url: url },
      tag: tag,
      vibrate: [200,100,200],
      renotify: true
    })
  );
});

// Al hacer clic en la notificacion: abrir la url indicada
self.addEventListener("notificationclick",function(e){
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({type:"window",includeUncontrolled:true}).then(function(clientList){
      for(var i=0;i<clientList.length;i++){
        var c=clientList[i];
        if("focus" in c && c.url.indexOf(self.location.origin)===0){
          return c.navigate(url).then(function(){ return c.focus(); });
        }
      }
      if(self.clients.openWindow){
        return self.clients.openWindow(url);
      }
    })
  );
});

self.addEventListener("notificationclose",function(e){
  // Opcional: se puede loguear cuando el usuario cierra una notificacion
});

// ─── BACKGROUND SYNC ────────────────────────────────────────────────────
// Sincroniza la suscripcion push cuando hay conexion de nuevo.
self.addEventListener("sync",function(e){
  if(e.tag==="sync-push"){
    e.waitUntil(
      self.clients.matchAll({type:"window",includeUncontrolled:true}).then(function(clients){
        return Promise.all(clients.map(function(c){
          return c.postMessage({type:"reintentar-push"});
        }));
      })
    );
  }
});
