/* ═══════════════════════════════════════════════════════
   ZONAHACK - GUARD DE RANGO (acceso por rangos)
   Para proteger una página: <body data-rango="vip"> + este script.
   Niveles: user=1 · vip=2 · premium=3 · moderator=4 · admin/root/owner=5
   ═══════════════════════════════════════════════════════ */
var ZH_KEY = "sb_publishable_3VvBUD5Bdu3Uaq59fJ99MQ_XDCtujUU";
var ZH_LEVEL = {anon:1,user:1,vip:2,premium:3,moderator:4,mod:4,admin:5,super_admin:5,root:5,owner:5,developer:5,fundador:5};
function zhUsuario(){ try{ return (localStorage.getItem("vh_usuario")||"").trim(); }catch(e){ return ""; } }
function zhNivel(r){ return ZH_LEVEL[((r||"").toLowerCase())]||1; }
/* Pase anónimo: la página Anonymous puede otorgar acceso a los sectores privados */
function zhTienePassAnon(){
  try{
    var d=JSON.parse(localStorage.getItem("zh_anon_pass")||"null");
    return !!d && typeof d.exp==="number" && d.exp>Date.now();
  }catch(e){ return false; }
}
function zhPuede(req, actual){
  var nivel = Math.max(zhNivel(actual), zhTienePassAnon()?4:0);
  return nivel >= zhNivel(req);
}
function zhObtenerRango(cb){
  if(window._zhRangoCache){ cb(window._zhRangoCache); return; }
  var u = zhUsuario();
  if(!u){ window._zhRangoCache="user"; cb("user"); return; }
  try{
    fetch("https://xfwolaurpeofysnymqle.supabase.co/rest/v1/rangos?select=rango&usuario_nombre=eq."+encodeURIComponent(u)+"&limit=1",{
      headers:{apikey:ZH_KEY,"Authorization":"Bearer "+ZH_KEY}
    }).then(function(r){ return r.json(); }).then(function(d){
      var rango=(d&&d[0]&&d[0].rango)||"user";
      window._zhRangoCache=rango; cb(rango);
    }).catch(function(){ window._zhRangoCache="user"; cb("user"); });
  }catch(e){ cb("user"); }
}
function zhBloquear(req, actual){
  if(document.getElementById("zhDenegado")) return;
  var d=document.createElement("div");
  d.id="zhDenegado";
  d.style.cssText="position:fixed;inset:0;z-index:999999;background:radial-gradient(circle at 50% 30%,#1a0a0a,#070202 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#ff4d4d;font-family:'Segoe UI',system-ui,sans-serif;padding:20px";
  d.innerHTML=
    '<div style="font-size:4.2em;animation:zhshake .4s .2s both">🚫</div>'+
    '<h1 style="margin:12px 0;font-size:clamp(1.2em,4vw,1.6em);letter-spacing:3px;color:#ff4d4d;text-shadow:0 0 22px rgba(255,77,77,.6)">ACCESO NO AUTORIZADO</h1>'+
    '<p style="color:#ffb3b3;max-width:440px;font-size:.86em;line-height:1.8">Este sitio requiere el rango <b style="color:#f1c40f">'+String(req).toUpperCase()+'</b>.<br>Tu rango actual es <b style="color:#f1c40f">'+String(actual||"user").toUpperCase()+'</b>.</p>'+
    '<div style="display:flex;flex-direction:column;gap:8px;margin-top:18px">'+
    '<a href="/login.html" style="background:#ff4d4d;color:#1a0505;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:800;font-size:.78em">🔑 INICIAR SESIÓN</a>'+
    '<a href="/" style="color:#6d7f93;font-size:.7em;text-decoration:none">← Volver al inicio</a>'+
    '</div>'+
    '<style>@keyframes zhshake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}</style>';
  document.body.appendChild(d);
}
function zhVerificar(){
  var req=(document.body.getAttribute("data-rango")||"").trim();
  if(!req) return;
  zhObtenerRango(function(actual){
    if(!zhPuede(req,actual)) zhBloquear(req,actual);
  });
}
if(document.readyState==="loading"){ document.addEventListener("DOMContentLoaded",zhVerificar); }
else{ zhVerificar(); }
window.zhObtenerRango=zhObtenerRango;
window.zhPuede=zhPuede;
window.zhNivel=zhNivel;
window.zhUsuario=zhUsuario;