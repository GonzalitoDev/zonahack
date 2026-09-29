/* ═══════════════════════════════════════════
   ZONAHACK - AVISO DE ACTUALIZACION
   Cuando el Service Worker instala una version nueva mientras la
   pestaña está abierta, muestra un cartel para recargar en vez de
   recargar de golpe (no corta lo que el usuario esté haciendo).
   Incluir en las páginas: <script src="/update_check.js" defer></script>
   ═══════════════════════════════════════════ */
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
    if(document.visibilityState === 'hidden'){ window.location.reload(); return; }
    mostrarAvisoActualizacion();
  });
})();
