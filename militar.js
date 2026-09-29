/* ============================================================
   ZONA HACK — RANGOS MILITARES AUTOMÁTICOS SEGÚN ACTIVIDAD
   Módulo global: window.ZHRango
   Suma puntos de actividad por acciones y asigna rango militar.
   Los rangos (nombre/puntos/emoji/color/insignia) se pueden editar
   desde Firestore, colección 'rangos_militares' (doc por nivel).
   Si no hay datos ahí, se usa el array RANGOS de más abajo.
   ============================================================ */
(function(){
  if(window.ZHRango) return;

  var SB='https://xfwolaurpeofysnymqle.supabase.co/rest/v1/';
  var KEY='sb_publishable_3VvBUD5Bdu3Uaq59fJ99MQ_XDCtujUU';
  var LS='vh_puntos_actividad';
  var LS_RANGO='vh_rango_militar';
  var KEY_ACUM='vh_puntos_acum';

  // Jerarquía (fallback si la tabla rangos_militares no existe todavía)
  // img = insignia de rango militar (US Army, Wikimedia Commons)
  var WIKI='https://upload.wikimedia.org/wikipedia/commons/';
  var RANGOS=[
    {nivel:1, nombre:'Recluta',            pts:0,    emoji:'🪖', color:'#8a8a8a',  img:WIKI+'e/ec/Blank_50px.png'},
    {nivel:2, nombre:'Soldado',            pts:50,   emoji:'🎯', color:'#95a5a6',  img:WIKI+'9/91/Army-USA-OR-02.svg'},
    {nivel:3, nombre:'Soldado de 1ra',     pts:120,  emoji:'🎖️', color:'#27ae60',  img:WIKI+'c/cc/Army-USA-OR-03.svg'},
    {nivel:4, nombre:'Cabo',               pts:250,  emoji:'💂', color:'#2ecc71',  img:WIKI+'a/a2/Army-USA-OR-04a.svg'},
    {nivel:5, nombre:'Cabo 1ra',           pts:400,  emoji:'💂', color:'#00ff41',  img:WIKI+'1/1c/Army-USA-OR-04b.svg'},
    {nivel:6, nombre:'Sargento',           pts:600,  emoji:'🔫', color:'#3498db',  img:WIKI+'2/27/Army-USA-OR-05.svg'},
    {nivel:7, nombre:'Sargento 1ra',       pts:850,  emoji:'🔫', color:'#2980b9',  img:WIKI+'0/0b/Army-USA-OR-06.svg'},
    {nivel:8, nombre:'Suboficial Mayor',   pts:1150, emoji:'⭐', color:'#f1c40f',  img:WIKI+'7/71/Army-USA-OR-07.svg'},
    {nivel:9, nombre:'Teniente',           pts:1500, emoji:'⭐', color:'#e67e22',  img:WIKI+'0/05/US-O1_insignia.svg'},
    {nivel:10,nombre:'Capitán',            pts:2000, emoji:'⭐', color:'#e74c3c',  img:WIKI+'7/72/US-O3_insignia.svg'},
    {nivel:11,nombre:'Mayor',              pts:2600, emoji:'👑', color:'#d35400',  img:WIKI+'8/8f/US-O4_insignia.svg'},
    {nivel:12,nombre:'Teniente Coronel',   pts:3300, emoji:'👑', color:'#9b59b6',  img:WIKI+'6/6e/US-O5_insignia.svg'},
    {nivel:13,nombre:'Coronel',            pts:4200, emoji:'👑', color:'#8e44ad',  img:WIKI+'c/c5/US-O6_insignia.svg'},
    {nivel:14,nombre:'General de Brigada', pts:5300, emoji:'🥇', color:'#ff9ff3',  img:WIKI+'2/23/US-O7_insignia.svg'},
    {nivel:15,nombre:'General de División',pts:6800, emoji:'🥇', color:'#00cec9',  img:WIKI+'9/91/US-O8_insignia.svg'},
    {nivel:16,nombre:'Teniente General',   pts:8500, emoji:'🏆', color:'#0984e3',  img:WIKI+'d/da/US-O9_insignia.svg'},
    {nivel:17,nombre:'Comandante Supremo', pts:10500,emoji:'🏆', color:'#ff6b6b',  img:WIKI+'4/40/US-O10_insignia.svg'}
  ];

  // ─── RANGOS EDITABLES DESDE FIRESTORE (coleccion 'rangos_militares') ───
  function asegurarFirebase(cb){
    if(window.ZHFirebase){ cb(); return; }
    var s=document.createElement('script');
    s.src='/firebase_zh.js';
    s.onload=cb;
    s.onerror=cb;
    document.head.appendChild(s);
  }
  function cargarRangosDesdeFirebase(){
    asegurarFirebase(function(){
      if(!window.ZHFirebase) return;
      ZHFirebase.get('rangos_militares').then(function(obj){
        var docs=Object.keys(obj||{}).map(function(k){return obj[k];}).filter(function(r){return r&&r.nombre&&r.pts!=null;});
        if(!docs.length) return; // nada configurado en Firestore todavia: se sigue usando el array de arriba
        docs.sort(function(a,b){return (a.pts||0)-(b.pts||0);});
        RANGOS=docs.map(function(r,i){
          return {nivel:r.nivel||(i+1), nombre:r.nombre, pts:r.pts||0, emoji:r.emoji||'🎖️', color:r.color||'#8a8a8a', img:r.img||''};
        });
        actualizarBadge();
      }).catch(function(){});
    });
  }

  // Puntos de actividad por acción (dentro de espiar / acciones concretas)
  var PUNTOS_ACCION={
    'ver_video':3, 'buscar':1, 'favorito':2, 'like':1,
    'juego':5, 'herramienta':2, 'diario':2, 'chat':1,
    'reclamo_diario':5, 'login':1, 'compartir':3, 'comentario':2
  };

  function usuario(){
    try{ var u=localStorage.getItem('vh_usuario'); return (u&&u!=='anon')?u:''; }catch(e){ return ''; }
  }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }

  function puntosLocal(){ try{ return parseInt(localStorage.getItem(LS)||'0',10)||0; }catch(e){ return 0; } }
  function guardarLocal(p){ try{ localStorage.setItem(LS,String(p)); }catch(e){} }

  function rangoSegunPuntos(p){
    p=p||0; var act=RANGOS[0];
    for(var i=0;i<RANGOS.length;i++){ if(p>=RANGOS[i].pts) act=RANGOS[i]; }
    var sig=null;
    for(var i=0;i<RANGOS.length;i++){ if(RANGOS[i].pts>p){ sig=RANGOS[i]; break; } }
    return {rango:act, siguiente:sig, progreso: sig? Math.min(100,Math.round((p-act.pts)/(sig.pts-act.pts)*100)) : 100};
  }

  function guardarDB(puntos, rangoNombre, rangoNivel, onOk){
    var u=usuario(); if(!u) return;
    var body=JSON.stringify({puntos_actividad:puntos, rango_militar:rangoNombre, rango_militar_nivel:rangoNivel});
    fetch(SB+'usuarios_ext?usuario_nombre=eq.'+encodeURIComponent(u),{
      method:'PATCH', headers:{'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json'}, body:body
    }).then(function(r){ return r.json(); }).then(function(d){
      if(d && d.length===0){
        fetch(SB+'usuarios_ext',{method:'POST',headers:{'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({usuario_nombre:u,puntos_actividad:puntos,rango_militar:rangoNombre,rango_militar_nivel:rangoNivel})}).catch(function(){});
      }
      if(onOk) onOk();
    }).catch(function(){ if(onOk) onOk(); });
  }

  // Notificación de ascenso
  function notificarAscenso(r){
    var el=document.createElement('div');
    el.style.cssText='position:fixed;top:80px;left:50%;transform:translateX(-50%) translateY(-20px);z-index:99999;padding:12px 22px;border-radius:8px;background:#0d0d0d;border:2px solid '+r.color+';color:#fff;font-family:"Courier New",monospace;font-size:.9em;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.6);transition:all .5s;opacity:0;pointer-events:none;letter-spacing:1px';
    el.innerHTML='<div style="font-size:1.6em">'+r.emoji+'</div><div style="color:'+r.color+';font-weight:bold;margin-top:2px">🎖️ ASCENSO MILITAR</div><div>Ahora eres <b style="color:'+r.color+'">'+esc(r.nombre)+'</b></div><div style="color:#888;font-size:.7em;margin-top:4px">'+puntosLocal()+' pts de actividad</div>';
    document.body.appendChild(el);
    setTimeout(function(){ el.style.opacity='1'; el.style.transform='translateX(-50%) translateY(0)'; },60);
    setTimeout(function(){ el.style.opacity='0'; el.style.transform='translateX(-50%) translateY(-20px)'; setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); },500); },3800);
    try{ if(window.toast) toast('🎖️ ASCENDISTE A '+r.nombre); }catch(e){}
  }

  // Sumar puntos por acción
  var _lastT=0;
  function sumarPuntos(pts, accion){
    var u=usuario(); if(!u) return;
    pts=Math.max(1,parseInt(pts,10)||1);
    var antes=puntosLocal();
    var nuevo=antes+pts;
    guardarLocal(nuevo);
    // acumulador total (para ranking global)
    try{ localStorage.setItem(KEY_ACUM, String((parseInt(localStorage.getItem(KEY_ACUM)||'0',10)||0)+pts)); }catch(e){}
    var infoAntes=rangoSegunPuntos(antes);
    var info=rangoSegunPuntos(nuevo);
    if(info.rango.nivel>infoAntes.rango.nivel){
      guardarDB(nuevo, info.rango.nombre, info.rango.nivel, function(){ notificarAscenso(info.rango); });
      try{ if(window.registrarFeed) registrarFeed(); }catch(e){}
      // Registrar ascenso en feed_actividad
      fetch(SB+'feed_actividad',{method:'POST',headers:{'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({tipo:'rango_militar',usuario_nombre:u,detalle:'ascendió a '+info.rango.nombre+' ('+info.rango.emoji+')'})}).catch(function(){});
    } else {
      var now=Date.now();
      if(now-_lastT>5000){ guardarDB(nuevo, info.rango.nombre, info.rango.nivel); _lastT=now; }
    }
    actualizarBadge();
    return info;
  }

  // Badge en el header (rangoMilitarBadge)
  function actualizarBadge(){
    var info=rangoSegunPuntos(puntosLocal());
    var b=document.getElementById('rangoMilitarBadge');
    if(!b) return;
    var r=info.rango;
    b.innerHTML=r.emoji+' <b style="color:'+r.color+'">'+esc(r.nombre)+'</b>';
    b.style.display='inline-block';
    b.style.border='1px solid '+r.color;
    b.style.background=r.color+'22';
    b.style.boxShadow='0 0 8px '+r.color+'55';
  }

  // Cargar desde la DB al inicio (puntos guardados)
  function cargarDesdeDB(){
    var u=usuario(); if(!u) return;
    fetch(SB+'usuarios_ext?select=puntos_actividad,rango_militar,rango_militar_nivel&usuario_nombre=eq.'+encodeURIComponent(u)+'&limit=1',{headers:{'apikey':KEY,'Authorization':'Bearer '+KEY}})
    .then(function(r){ return r.json(); }).then(function(d){
      if(d && d.length && d[0].puntos_actividad!=null){
        var db=parseInt(d[0].puntos_actividad,10)||0;
        var local=puntosLocal();
        if(db>local){ guardarLocal(db); }
        actualizarBadge();
      }
    }).catch(function(){});
  }

  // Sumar puntos desde espiar según acción (hook ligero)
  function porAccion(accion, detalle){
    if(!accion) return;
    if(PUNTOS_ACCION[accion]) sumarPuntos(PUNTOS_ACCION[accion], detalle||accion);
  }

  // API pública
  window.ZHRango={
    sumar:sumarPuntos,
    porAccion:porAccion,
    puntos:puntosLocal,
    acumulado:function(){ try{ return parseInt(localStorage.getItem(KEY_ACUM)||'0',10)||0; }catch(e){ return 0; } },
    rangoSegunPuntos:rangoSegunPuntos,
    rangoActual:function(){ return rangoSegunPuntos(puntosLocal()); },
    actualizarBadge:actualizarBadge,
    cargarDesdeDB:cargarDesdeDB,
    get RANGOS(){ return RANGOS; }
  };
  cargarRangosDesdeFirebase();

  // Auto-cargar al inicio (si hay badge en la página)
  document.addEventListener('DOMContentLoaded', function(){
    setTimeout(function(){
      cargarDesdeDB();
      actualizarBadge();
    }, 500);
  });
  setTimeout(function(){ cargarDesdeDB(); actualizarBadge(); }, 800);
})();