/* ═══════════════════════════════════════════
   DBXPLORER - Interfaz (WebView)
   App propia conectada a la base de datos (Supabase).
   v1.1: + tablas (usuarios, monedas, novedades) + reproductor interno
   ═══════════════════════════════════════════ */
(function () {
  var SB = "https://xfwolaurpeofysnymqle.supabase.co";
  var KEY = "sb_publishable_3VvBUD5Bdu3Uaq59fJ99MQ_XDCtujUU";
  var H = { "apikey": KEY, "Authorization": "Bearer " + KEY };
  var videos = [], usuarios = [], monedas = [], novedades = [];
  var cat = "Todas", q = "", tab = "videos";

  var INV = ["inv.nadeko.net", "yewtu.be", "invidious.nerdvpn.de", "inv.vern.cc", "invidious.flokinet.to"];

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function showState(id) {
    ['stateLoading', 'stateError'].forEach(function (s) {
      var el = $(s);
      if (el) el.className = 'state' + (s === id ? ' show' : '');
    });
    $('grid').style.display = (id === null && tab === 'videos') ? 'grid' : 'none';
    $('lista').style.display = (id === null && tab !== 'videos') ? 'flex' : 'none';
  }

  function cargar() {
    $('refresh').classList.add('spin');
    showState('stateLoading');
    Promise.all([
      fetch(SB + "/rest/v1/videos?select=id,titulo,url,thumbnail,tipo,categoria&order=created_at.desc&limit=500", { headers: H }).then(function (r) { return r.json(); }).catch(function () { return []; }),
      fetch(SB + "/rest/v1/usuarios_ext?select=usuario_nombre,online,estado&limit=300", { headers: H }).then(function (r) { return r.json(); }).catch(function () { return []; }),
      fetch(SB + "/rest/v1/monedas?select=usuario_nombre,saldo&order=saldo.desc&limit=20", { headers: H }).then(function (r) { return r.json(); }).catch(function () { return []; }),
      fetch(SB + "/rest/v1/actualizaciones?select=titulo,descripcion,tipo,version,created_at&activo=eq.true&order=created_at.desc&limit=30", { headers: H }).then(function (r) { return r.json(); }).catch(function () { return []; })
    ]).then(function (res) {
      $('refresh').classList.remove('spin');
      videos = res[0] || [];
      usuarios = res[1] || [];
      monedas = res[2] || [];
      novedades = res[3] || [];
      if (!videos.length && !usuarios.length) { showState('stateError'); return; }
      var cats = {}; videos.forEach(function (v) { if (v.categoria) cats[v.categoria] = 1; });
      $('sVideos').textContent = videos.length;
      $('sUsers').textContent = usuarios.length;
      $('sCats').textContent = Object.keys(cats).length;
      $('updated').textContent = 'sync ' + new Date().toLocaleTimeString();
      buildChips();
      setTab(tab);
    }).catch(function () {
      $('refresh').classList.remove('spin');
      showState('stateError');
    });
  }

  function setTab(v) {
    tab = v;
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('on', t.getAttribute('data-v') === v); });
    var esVideos = v === 'videos';
    $('videoBuscar').style.display = esVideos ? 'flex' : 'none';
    $('chips').style.display = esVideos ? 'flex' : 'none';
    showState(null);
    if (esVideos) renderVideos();
    else if (v === 'foros') cargarForos();
    else renderLista(v);
  }

  function buildChips() {
    var cats = ["Todas"];
    videos.forEach(function (v) { if (v.categoria && cats.indexOf(v.categoria) < 0) cats.push(v.categoria); });
    $('chips').innerHTML = cats.map(function (c) {
      return '<button class="chip' + (c === cat ? ' on' : '') + '" data-c="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('');
    [].forEach.call($('chips').querySelectorAll('.chip'), function (b) {
      b.addEventListener('click', function () {
        cat = b.getAttribute('data-c');
        [].forEach.call($('chips').querySelectorAll('.chip'), function (x) { x.classList.toggle('on', x === b); });
        renderVideos();
      });
    });
  }

  function renderVideos() {
    var list = videos.filter(function (v) {
      var okC = cat === 'Todas' || v.categoria === cat;
      var okQ = !q || (v.titulo || '').toLowerCase().indexOf(q) >= 0;
      return okC && okQ;
    });
    var grid = $('grid');
    if (!list.length) {
      grid.innerHTML = '<div class="state show"><div class="big">📦</div><h3>Sin resultados</h3></div>';
      grid.style.display = 'grid';
      return;
    }
    grid.innerHTML = list.map(function (v, i) {
      var th = v.thumbnail ? "background-image:url('" + String(v.thumbnail).replace(/["'<>\\]/g, '') + "')" : '';
      return '<div class="card" data-i="' + i + '" style="animation:fadeIn .3s ' + Math.min(i * 20, 350) + 'ms both">' +
        '<div class="th"' + (th ? ' style="' + th + '"' : '') + '>' + (th ? '' : '<div class="ph">📦</div>') + '</div>' +
        '<div class="inf"><div class="t">' + esc((v.titulo || 'Sin título').slice(0, 80)) + '</div>' +
        (v.categoria ? '<div class="c">' + esc(v.categoria) + '</div>' : '') + '</div></div>';
    }).join('');
    [].forEach.call(grid.querySelectorAll('.card'), function (c) {
      c.addEventListener('click', function () {
        var v = list[parseInt(c.getAttribute('data-i'), 10)];
        if (v && v.url) abrirVideo(v);
      });
    });
  }

  function renderLista(v) {
    var lista = $('lista');
    if (v === 'usuarios') {
      if (!usuarios.length) { lista.innerHTML = '<div class="state show"><h3>Sin usuarios</h3></div>'; lista.style.display = 'flex'; return; }
      lista.innerHTML = usuarios.slice(0, 150).map(function (u, i) {
        var est = u.online ? 'on' : '';
        return '<div class="item"><div class="avatar">' + esc((u.usuario_nombre || '?').charAt(0).toUpperCase()) + '</div>' +
          '<div class="info"><div class="nom"><span class="onl ' + est + '"></span>' + esc(u.usuario_nombre) + '</div>' +
          '<div class="sub">' + (u.estado ? 'Estado: ' + esc(u.estado) : 'usuario') + (u.online ? ' · en línea' : '') + '</div></div></div>';
      }).join('');
    } else if (v === 'monedas') {
      if (!monedas.length) { lista.innerHTML = '<div class="state show"><h3>Sin datos de monedas</h3></div>'; lista.style.display = 'flex'; return; }
      lista.innerHTML = monedas.map(function (m, i) {
        var medallas = ['🥇', '🥈', '🥉'];
        var med = i < 3 ? medallas[i] : (i + 1) + '.';
        return '<div class="item"><div class="avatar">' + med + '</div>' +
          '<div class="info"><div class="nom">' + esc(m.usuario_nombre) + '</div>' +
          '<div class="sub">Puesto ' + (i + 1) + '</div></div>' +
          '<div class="val gold">🪙 ' + (m.saldo || 0).toLocaleString('es-AR') + '</div></div>';
      }).join('');
    } else if (v === 'novedades') {
      if (!novedades.length) { lista.innerHTML = '<div class="state show"><h3>Sin novedades</h3></div>'; lista.style.display = 'flex'; return; }
      lista.innerHTML = novedades.map(function (n) {
        var tipo = n.tipo || 'actualizacion';
        var col = { actualizacion: 'novedad', novedad: 'novedad', fix: 'fix', evento: 'evento', alerta: 'alerta' }[tipo] || 'novedad';
        var ico = { actualizacion: '⚙️', novedad: '✨', fix: '🔧', evento: '🎉', alerta: '⚠️' }[tipo] || '🔄';
        return '<div class="item"><div class="avatar">' + ico + '</div>' +
          '<div class="info"><div class="nom">' + esc(n.titulo || '') +
          '<span class="badge-tipo ' + col + '">' + esc(tipo) + '</span></div>' +
          (n.descripcion ? '<div class="sub">' + esc((n.descripcion || '').slice(0, 90)) + '</div>' : '') +
          '<div class="sub">' + (n.version ? 'v' + esc(n.version) + ' · ' : '') + (n.created_at || '').slice(0, 10) + '</div></div></div>';
      }).join('');
    }
    lista.style.display = 'flex';
  }

  /* ─── FOROS Y NOTICIAS (scrappeado) ─── */
  var forosDatos = null;
  function cargarForos() {
    var lista = $('lista');
    if (forosDatos) { renderForos(); return; }
    lista.innerHTML = '<div class="state show"><div class="spinner"></div><h3>Scrapeando foros y noticias…</h3></div>';
    lista.style.display = 'flex';
    Promise.all([
      // Noticias de seguridad / deep web (scraper del servidor)
      fetch('https://offlinevideoplayer.vercel.app/api/deepweb?limit=20')
        .then(function (r) { return r.json(); }).catch(function () { return { noticias: [] }; }),
      // Foro: discusiones de Hacker News (Algolia)
      fetch('https://hn.algolia.com/api/v1/search?query=' + encodeURIComponent('hacking OR security OR dark web') + '&tags=story&hitsPerPage=20')
        .then(function (r) { return r.json(); }).catch(function () { return { hits: [] }; })
    ]).then(function (res) {
      forosDatos = {
        noticias: (res[0] && res[0].noticias) || [],
        hilos: (res[1] && res[1].hits) || []
      };
      renderForos();
    });
  }
  function renderForos() {
    var d = forosDatos || { noticias: [], hilos: [] };
    var h = '';
    if (d.noticias.length) {
      h += '<div class="sec">🌐 Noticias scrappeadas</div>';
      h += d.noticias.slice(0, 12).map(function (n) {
        return '<div class="item" data-u="' + esc(n.link) + '"><div class="avatar">📰</div>' +
          '<div class="info"><div class="nom">' + esc(n.title) + '</div>' +
          '<div class="sub">' + esc(n.fuente || '') + (n.date ? ' · ' + esc(String(n.date).slice(0, 16)) : '') + '</div></div></div>';
      }).join('');
    }
    if (d.hilos.length) {
      h += '<div class="sec">💬 Foro scrappeado · Hacker News</div>';
      h += d.hilos.slice(0, 20).map(function (x) {
        var url = x.url || ('https://news.ycombinator.com/item?id=' + x.objectID);
        return '<div class="item" data-u="' + esc(url) + '"><div class="avatar">🗨️</div>' +
          '<div class="info"><div class="nom">' + esc(x.title) + '</div>' +
          '<div class="sub">▲ ' + (x.points || 0) + ' · 💬 ' + (x.num_comments || 0) + ' · ' + esc((x.created_at || '').slice(0, 10)) + '</div></div></div>';
      }).join('');
    }
    if (!h) h = '<div class="state show"><h3>Sin contenido</h3></div>';
    var lista = $('lista');
    lista.innerHTML = h;
    lista.style.display = 'flex';
    // Tocar un item → abrir el link (MainActivity lo abre en el navegador)
    [].forEach.call(lista.querySelectorAll('.item'), function (it) {
      it.addEventListener('click', function () {
        var u = it.getAttribute('data-u');
        if (u) window.location.href = u;
      });
    });
  }

  /* ─── REPRODUCTOR INTERNO ─── */
  function abrirVideo(v) {
    var id = String(v.url || '').replace('https://www.youtube.com/watch?v=', '');
    if (!id) return;
    $('pTitulo').textContent = v.titulo || 'Reproduciendo';
    $('player').className = 'open';
    var iframe = $('pFrame');
    iframe.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&playsinline=1&rel=0&modestbranding=1';
    iframe.setAttribute('data-id', id);
  }
  function cerrarVideo() {
    $('player').className = '';
    var f = $('pFrame');
    f.src = 'about:blank';
  }
  $('pCerrar').addEventListener('click', cerrarVideo);

  $('refresh').addEventListener('click', function () { cargar(); });
  $('retry').addEventListener('click', function () { cargar(); });
  $('q').addEventListener('input', function (e) { q = e.target.value.trim().toLowerCase(); renderVideos(); });

  cargar();

  /* ═══════════════════════════════════════════
     ZONA FALOPA - Robot bailando stripper
     ═══════════════════════════════════════════ */
  var audioCtx = null, beatTimer = null, gira = false;
  var fMsgs = [
    'El robot está en su prime 🤖✨',
    '🔥 NI SIQUIERA EL NÚCLEO RESISTE',
    '⚠️ NSFW = NO SEXY, FALOPA 💀',
    'El robot cobra en cripto 🪙',
    '🪩 Dale hasta el piso, robotito',
    'Esto no está en la base de datos… todavía'
  ];
  var fMsgI = 0;

  function abrirFalopa() {
    $('falopa').className = 'open';
    fMsgI = 0;
    $('fMsg').textContent = fMsgs[0];
    setTimeout(function () { $('fMsg').textContent = '🌀 ZONA FALOPA ACTIVADA'; }, 1500);
    if (fMsgI !== -1) {
      setInterval(function () {
        fMsgI = (fMsgI + 1) % fMsgs.length;
        $('fMsg').textContent = fMsgs[fMsgI];
      }, 5000);
    }
  }
  function cerrarFalopa() {
    $('falopa').className = '';
    detenerMusica();
    limpiarConfeti();
    gira = false;
    $('robot').style.animation = '';
  }
  function detenerMusica() {
    if (beatTimer) { clearInterval(beatTimer); beatTimer = null; }
    if (audioCtx) { try { audioCtx.close(); } catch (e) {} audioCtx = null; }
    $('fMusica').textContent = '🎵 Música';
  }
  function toggleMusica() {
    if (audioCtx) { detenerMusica(); return; }
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      $('fMusica').textContent = '⏹ Parar música';
      function kick() {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.setValueAtTime(160, audioCtx.currentTime);
        o.frequency.exponentialRampToValueAtTime(45, audioCtx.currentTime + 0.18);
        g.gain.setValueAtTime(0.9, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
        o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.22);
      }
      function hat() {
        var n = audioCtx.createBufferSource(), g = audioCtx.createGain();
        var buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.05, audioCtx.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        n.buffer = buf; g.gain.value = 0.15;
        n.connect(g); g.connect(audioCtx.destination); n.start();
      }
      kick(); hat();
      beatTimer = setInterval(function () { kick(); if (Math.random() > 0.3) hat(); }, 460);
    } catch (e) {
      $('fMsg').textContent = '🔇 Tu celu no deja sonar acá';
    }
  }
  var confetis = [];
  function lanzarConfeti(n) {
    for (var i = 0; i < (n || 50); i++) {
      var c = document.createElement('div');
      c.className = 'confeti';
      c.style.left = (Math.random() * 100) + 'vw';
      c.style.background = ['#ff00cc', '#00e5ff', '#ffcc00', '#7a5cff', '#ff5a5a'][Math.floor(Math.random() * 5)];
      c.style.animationDuration = (2 + Math.random() * 2.5) + 's';
      c.style.width = (6 + Math.random() * 8) + 'px';
      $('falopa').appendChild(c);
      confetis.push(c);
      setTimeout(function (el) { try { el.remove(); } catch (e) {} }, 5000);
    }
  }
  function limpiarConfeti() {
    confetis.forEach(function (c) { try { c.remove(); } catch (e) {} });
    confetis = [];
  }
  $('fBtn').addEventListener('click', abrirFalopa);
  $('fCerrar').addEventListener('click', cerrarFalopa);
  $('fMusica').addEventListener('click', toggleMusica);
  $('fConfetti').addEventListener('click', function () { lanzarConfeti(60); });
  $('fVuelta').addEventListener('click', function () {
    gira = !gira;
    $('robot').style.animation = gira
      ? 'rBounce .9s ease-in-out infinite, giro3d 2.5s linear infinite'
      : 'rBounce .9s ease-in-out infinite';
  });

  // Exponer funciones que usan los onclick del HTML
  window.setTab = setTab;
  window.abrirVideo = abrirVideo;
  window.cerrarVideo = cerrarVideo;
  window.cargarForos = cargarForos;
})();