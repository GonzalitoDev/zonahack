/* ═══════════════════════════════════════════
   ZONAHACK - SISTEMA DE MONEDAS
   Módulo reutilizable. Se usa en index, perfil, tienda, juegos.
   Requiere: tabla monedas + monedas_transacciones en Supabase.

   FIX v2:
   - La DB es la fuente de verdad del saldo (cuando hay internet).
   - localStorage es caché + colchón offline (deltas pendientes que se
     aplican a la DB cuando vuelve la conexión).
   - Se corrigen los totales (ya no se mandan null → el PATCH no fallaba).
   - La racha diaria se sincroniza con la DB (ultimo_reclamo_diario).
   ═══════════════════════════════════════════ */
(function(win){
  var SB="https://xfwolaurpeofysnymqle.supabase.co";
  var KEY="sb_publishable_3VvBUD5Bdu3Uaq59fJ99MQ_XDCtujUU";
  var H={"apikey":KEY,"Authorization":"Bearer "+KEY};
  var HJSON=Object.assign({},H,{"Content-Type":"application/json","Prefer":"return=minimal"});
  var LS_KEY="vh_monedas";
  var LS_SALDO="vh_monedas_saldo";      // {saldo:n} caché del saldo
  var LS_PEND="vh_monedas_pendientes";  // deltas sin aplicar a la DB (offline)
  var LS_ULTIMO="vh_monedas_ultimo";    // {fecha:'YYYY-MM-DD',racha:n} reclamo diario

  function user(){
    return localStorage.getItem("vh_usuario")||"anon";
  }
  function pad(n){ return n<10?"0"+n:""+n; }
  function hoyStr(){
    var d=new Date();
    return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
  }
  function ayerStr(){
    var d=new Date(Date.now()-86400000);
    return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
  }
  function esFecha(iso,str){
    try{
      var d=new Date(iso);
      return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())===str;
    }catch(e){ return false; }
  }
  function esHoy(iso){ return !!iso && esFecha(iso,hoyStr()); }
  function esAyer(iso){ return !!iso && esFecha(iso,ayerStr()); }

  // ── Caché local ──
  function localGet(){
    try{return JSON.parse(localStorage.getItem(LS_KEY)||"null");}catch(e){return null;}
  }
  function localSet(d){
    try{localStorage.setItem(LS_KEY,JSON.stringify(d));}catch(e){}
  }
  function saldoLocalGet(){
    try{return JSON.parse(localStorage.getItem(LS_SALDO)||"null");}catch(e){return null;}
  }
  function saldoLocalSet(n){
    try{localStorage.setItem(LS_SALDO,JSON.stringify({saldo:n}));}catch(e){}
  }
  function saldoLocal(){
    var l=saldoLocalGet();
    return l&&l.saldo?l.saldo:0;
  }
  function ultimoLocalGet(){
    try{return JSON.parse(localStorage.getItem(LS_ULTIMO)||"null");}catch(e){return null;}
  }
  function ultimoLocalSet(fecha,racha){
    try{localStorage.setItem(LS_ULTIMO,JSON.stringify({fecha:fecha,racha:racha}));}catch(e){}
  }
  // ── Pendientes (offline) ──
  function pendGet(){
    try{return JSON.parse(localStorage.getItem(LS_PEND)||"[]")||[];}catch(e){return [];}
  }
  function pendSet(a){
    try{localStorage.setItem(LS_PEND,JSON.stringify(a));}catch(e){}
  }
  function pendPush(delta,desc,tipo){
    var p=pendGet();
    p.push({delta:delta,desc:desc,tipo:tipo,ts:Date.now()});
    if(p.length>200)p=p.slice(-200);
    pendSet(p);
  }
  function pendSum(){
    return pendGet().reduce(function(a,b){return a+(b.delta||0);},0);
  }

  // ── Fetch de la fila de monedas del usuario ──
  function fetchRow(u,cb){
    fetch(SB+"/rest/v1/monedas?select=*&usuario_nombre=eq."+encodeURIComponent(u)+"&limit=1",{headers:H})
    .then(function(r){return r.json();})
    .then(function(d){ cb(null,d&&d[0]?d[0]:null); })
    .catch(function(e){ cb(e||new Error("offline"),null); });
  }

  function calcularMontoPorDia(dia){
    var tabla={1:50,2:75,3:100,4:150,5:200,6:300,7:500};
    return tabla[dia]||50;
  }

  /* Obtener saldo: DB = verdad (aplica pendientes offline), local = caché */
  function obtenerSaldo(cb){
    var u=user();
    if(!u||u==="anon"){ cb&&cb(saldoLocal(),{saldo:saldoLocal()}); return; }
    fetchRow(u,function(err,row){
      if(err){
        cb&&cb(saldoLocal(),{saldo:saldoLocal()});
        return;
      }
      var pend=pendSum();
      if(row){
        var total=Math.max(0,(row.saldo||0)+pend);
        if(pend){
          fetch(SB+"/rest/v1/monedas?usuario_nombre=eq."+encodeURIComponent(u),{method:"PATCH",headers:HJSON,
            body:JSON.stringify({saldo:total,updated_at:new Date().toISOString()})}).catch(function(){});
          pendSet([]);
        }
        saldoLocalSet(total);
        localSet({saldo:total,total_ganadas:row.total_ganadas,total_gastadas:row.total_gastadas,
                  ultimo:row.ultimo_reclamo_diario,racha:row.racha_reclamo});
        cb&&cb(total,row);
      } else {
        var l=saldoLocal();
        // Crear la fila con el saldo local si es > 0
        if(l>0||pend>0){
          var crear=Math.max(l,pend);
          fetch(SB+"/rest/v1/monedas",{method:"POST",headers:HJSON,
            body:JSON.stringify({usuario_nombre:u,saldo:crear,total_ganadas:crear,total_gastadas:0,updated_at:new Date().toISOString()})}).catch(function(){});
          saldoLocalSet(crear);
          pendSet([]);
          cb&&cb(crear,{saldo:crear});
        } else {
          saldoLocalSet(0);
          cb&&cb(0,{saldo:0});
        }
      }
    });
  }

  /* Registrar transacción en DB */
  function registrarTx(u,tipo,monto,desc){
    fetch(SB+"/rest/v1/monedas_transacciones",{method:"POST",headers:HJSON,
      body:JSON.stringify({usuario_nombre:u,tipo:tipo,monto:monto,descripcion:desc||""})}).catch(function(){});
  }

  /* Sumar monedas. credito=true para ganar, false para gastar. Devuelve nuevo saldo. */
  function sumarMonto(monto,credito,desc,tipo,cb){
    var u=user();
    var delta=credito?Math.abs(monto):-Math.abs(monto);
    if(!u||u==="anon"){
      var l=saldoLocal();
      var nl=Math.max(0,l+delta);
      saldoLocalSet(nl);
      cb&&cb(nl);
      return;
    }
    // Actualizar caché local al instante (rápido)
    var nuevoLocal=Math.max(0,saldoLocal()+delta);
    saldoLocalSet(nuevoLocal);

    fetchRow(u,function(err,row){
      if(err){
        // Offline: acumular pendiente y quedarse con local
        pendPush(delta,desc,tipo);
        cb&&cb(nuevoLocal);
        return;
      }
      // Aplicar pendientes previos + delta nuevo
      var base=Math.max(0,(row?(row.saldo||0):0)+pendSum());
      var nuevo=Math.max(0,base+delta);
      var tg=(row?(row.total_ganadas||0):0)+(credito?Math.abs(monto):0);
      var tgs=(row?(row.total_gastadas||0):0)+(credito?0:Math.abs(monto));
      var ok=function(){
        pendSet([]);
        saldoLocalSet(nuevo);
        registrarTx(u,tipo||(credito?"ganar":"gastar"),Math.abs(monto),desc||"");
        cb&&cb(nuevo);
      };
      if(row){
        fetch(SB+"/rest/v1/monedas?usuario_nombre=eq."+encodeURIComponent(u),{method:"PATCH",headers:HJSON,
          body:JSON.stringify({saldo:nuevo,total_ganadas:tg,total_gastadas:tgs,updated_at:new Date().toISOString()})})
        .then(ok)
        .catch(function(){ pendPush(delta,desc,tipo); cb&&cb(nuevoLocal); });
      } else {
        fetch(SB+"/rest/v1/monedas",{method:"POST",headers:HJSON,
          body:JSON.stringify({usuario_nombre:u,saldo:nuevo,total_ganadas:tg,total_gastadas:tgs,updated_at:new Date().toISOString()})})
        .then(ok)
        .catch(function(){ pendPush(delta,desc,tipo); cb&&cb(nuevoLocal); });
      }
    });
  }

  /* Reclamo diario con racha sincronizada con la DB */
  function reclamarDiario(cb){
    var u=user();
    var hoy=hoyStr();
    if(!u||u==="anon"){
      cb&&cb({ok:false,msg:"Iniciá sesión para reclamar"});
      return;
    }
    // Guard rápido local (evita doble reclamo en el mismo navegador)
    var ult=ultimoLocalGet();
    if(ult&&ult.fecha===hoy){
      cb&&cb({ok:false,msg:"Ya reclamaste hoy. Volvé mañana!"});
      return;
    }
    fetchRow(u,function(err,row){
      // Chequear si ya reclamó hoy (DB)
      if(!err&&row&&esHoy(row.ultimo_reclamo_diario)){
        ultimoLocalSet(hoy,row.racha_reclamo||1);
        cb&&cb({ok:false,msg:"Ya reclamaste hoy. Volvé mañana!"});
        return;
      }
      // Calcular racha
      var rachaBase=0;
      if(ult&&ult.fecha===ayerStr()) rachaBase=ult.racha||0;
      else if(row&&esAyer(row.ultimo_reclamo_diario)) rachaBase=row.racha_reclamo||0;
      var nuevaRacha=Math.min(7,rachaBase+1);
      var monto=calcularMontoPorDia(nuevaRacha);
      // Marcar local YA (evita doble)
      ultimoLocalSet(hoy,nuevaRacha);

      // Sumar monedas (usa la DB + pendientes)
      sumarMonto(monto,true,"Recompensa diaria (día "+nuevaRacha+")","reclamo_diario",function(nuevo){
        // Guardar racha y fecha en DB
        fetch(SB+"/rest/v1/monedas?usuario_nombre=eq."+encodeURIComponent(u),{method:"PATCH",headers:HJSON,
          body:JSON.stringify({racha_reclamo:nuevaRacha,ultimo_reclamo_diario:new Date().toISOString(),updated_at:new Date().toISOString()})})
        .catch(function(){
          fetch(SB+"/rest/v1/monedas",{method:"POST",headers:HJSON,
            body:JSON.stringify({usuario_nombre:u,saldo:nuevo,total_ganadas:nuevo,total_gastadas:0,
              racha_reclamo:nuevaRacha,ultimo_reclamo_diario:new Date().toISOString(),updated_at:new Date().toISOString()})}).catch(function(){});
        });
        registrarTx(u,"reclamo_diario",monto,"Recompensa diaria (día "+nuevaRacha+")");
        try{ if(window.ZHRango) ZHRango.sumar(5,"Reclamo diario (día "+nuevaRacha+")"); }catch(e){}
        cb&&cb({ok:true,monto:monto,dia:nuevaRacha,saldo:nuevo});
      });
    });
  }

  /* Estado del reclamo diario: {reclamado, racha, monto_hoy} */
  function estadoDiario(cb){
    var u=user();
    if(!u||u==="anon"){ cb&&cb({reclamado:false,racha:0,monto_hoy:50,dias_para:1}); return; }
    var ult=ultimoLocalGet();
    var reclamado=ult&&ult.fecha===hoyStr();
    var racha=ult?ult.racha||0:0;
    fetchRow(u,function(err,row){
      if(!err&&row){
        if(esHoy(row.ultimo_reclamo_diario)){ reclamado=true; racha=row.racha_reclamo||racha; }
        else if(esAyer(row.ultimo_reclamo_diario)){ racha=row.racha_reclamo||racha; }
        else if(!row.ultimo_reclamo_diario){ racha=0; }
        // Sincronizar caché local con la DB (si el local no reclamó hoy)
        if(!(ult&&ult.fecha===hoyStr())){
          ultimoLocalSet(ult&&ult.fecha||hoyStr(), racha);
        }
      }
      var monto_hoy=calcularMontoPorDia(racha>=7?7:racha+1);
      cb&&cb({reclamado:reclamado,racha:racha,monto_hoy:monto_hoy,dias_para:1});
    });
  }

  /* Historial de transacciones */
  function historial(cb){
    var u=user();
    if(!u||u==="anon"){ cb&&cb([]); return; }
    fetch(SB+"/rest/v1/monedas_transacciones?usuario_nombre=eq."+encodeURIComponent(u)+"&order=created_at.desc&limit=30",{headers:H})
    .then(function(r){return r.json();}).then(function(d){cb&&cb(d||[]);})
    .catch(function(){cb&&cb([]);});
  }

  /* Gasto con verificación de saldo */
  function gastar(monto,desc,tipo,cb){
    obtenerSaldo(function(saldo){
      if((saldo||0)<monto){
        cb&&cb({ok:false,msg:"No tenés suficientes monedas",saldo:saldo});
        return;
      }
      sumarMonto(-monto,false,desc,tipo,function(nuevo){cb&&cb({ok:true,saldo:nuevo});});
    });
  }

  /* Badge de monedas en el header */
  function actualizarBadge(id){
    obtenerSaldo(function(saldo){
      var el=document.getElementById(id);
      if(!el)return;
      el.textContent="🪙 "+saldo.toLocaleString("es-AR");
      el.style.display="";
    });
  }

  win.ZHMonedas={
    obtenerSaldo:obtenerSaldo,
    sumar:sumarMonto,
    gastar:gastar,
    reclamarDiario:reclamarDiario,
    estadoDiario:estadoDiario,
    historial:historial,
    actualizarBadge:actualizarBadge,
    _localGet:localGet,_localSet:localSet,
    _saldoLocalGet:saldoLocalGet,_saldoLocalSet:saldoLocalSet,
    _pendGet:pendGet,_pendSet:pendSet
  };
})(window);