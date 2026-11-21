/* ═══════════════════════════════════════════
   CYBERALERTA - Interfaz Android (WebView)
   Usa el puente Java "News" para traer las noticias.
   ═══════════════════════════════════════════ */
(function () {
  var articles = [];
  var filtro = 'Todas';
  var q = '';

  function $(id) { return document.getElementById(id); }

  function showState(id) {
    ['stateLoading', 'stateError'].forEach(function (s) {
      var el = $(s);
      if (el) el.className = 'state' + (s === id ? ' show' : '');
    });
    var visible = id === null;
    $('grid').style.display = visible ? 'grid' : 'none';
    $('feat').style.display = visible ? 'block' : 'none';
  }

  function relTime(dateStr) {
    var t = Date.parse(dateStr);
    if (!t) return '';
    var diff = Math.max(0, Date.now() - t);
    var m = Math.floor(diff / 60000);
    if (m < 1) return 'ahora';
    if (m < 60) return 'hace ' + m + ' min';
    var h = Math.floor(m / 60);
    if (h < 24) return 'hace ' + h + ' h';
    return 'hace ' + Math.floor(h / 24) + ' d';
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function safeImg(u) {
    u = String(u || '').replace(/["'<>\\]/g, '');
    return u.indexOf('http') === 0 ? u : '';
  }

  function srcBadge(a) {
    return '<span class="src" style="color:' + a.color + ';background:' + a.color + '1f;border:1px solid ' + a.color + '45">' +
      '<span class="dot"></span>' + esc(a.source) + '</span>';
  }

  function render() {
    var list = articles.filter(function (a) {
      var okF = filtro === 'Todas' || a.source === filtro;
      var okQ = !q || (a.title + ' ' + a.snippet).toLowerCase().indexOf(q) >= 0;
      return okF && okQ;
    });

    if (!articles.length) { showState('stateLoading'); return; }
    if (!list.length) {
      $('grid').style.display = 'grid';
      $('feat').style.display = 'none';
      $('grid').innerHTML = '<div class="state show"><div class="big">📰</div><h3>Sin resultados</h3></div>';
      return;
    }

    showState(null);

    // Noticia destacada
    var f = list[0];
    var fimg = safeImg(f.img);
    $('feat').innerHTML = '<div class="fbg"' + (fimg ? " style='background-image:url(" + fimg + ")'" : '') + '></div>' +
      '<div class="fg"></div>' +
      '<div class="fc">' + srcBadge(f) + '<h3>' + esc(f.title) + '</h3>' +
      '<div class="f-meta">' + relTime(f.date) + ' · ' + esc(f.source) + '</div></div>';
    $('feat').onclick = function () { if (f.link) window.location.href = f.link; };

    // Resto de noticias
    $('grid').innerHTML = list.slice(1).map(function (a, i) {
      var img = safeImg(a.img);
      return '<div class="card" data-i="' + i + '" style="animation:fadeIn .3s ' + Math.min(i * 25, 350) + 'ms both">' +
        '<div class="thumb"' + (img ? " style=\"background-image:url('" + img + "')\"" : '') + '>' +
        (img ? '' : '<div class="ph">🖥️</div>') + srcBadge(a) + '</div>' +
        '<div class="cbody"><h3>' + esc(a.title) + '</h3>' +
        '<p>' + esc(a.snippet) + '</p>' +
        '<div class="meta"><span>' + relTime(a.date) + '</span><b>Abrir →</b></div></div>';
    }).join('');

    [].forEach.call($('grid').querySelectorAll('.card'), function (c) {
      c.addEventListener('click', function () {
        var a = list[parseInt(c.getAttribute('data-i'), 10) + 1];
        if (a && a.link) window.location.href = a.link;
      });
    });
  }

  function buildChips() {
    var names = ['Todas'];
    articles.forEach(function (a) { if (names.indexOf(a.source) < 0) names.push(a.source); });
    $('chips').innerHTML = names.map(function (n) {
      return '<button class="chip' + (n === filtro ? ' on' : '') + '" data-f="' + esc(n) + '">' + esc(n) + '</button>';
    }).join('');
    [].forEach.call($('chips').querySelectorAll('.chip'), function (c) {
      c.addEventListener('click', function () {
        filtro = c.getAttribute('data-f');
        [].forEach.call($('chips').querySelectorAll('.chip'), function (x) {
          x.classList.toggle('on', x === c);
        });
        render();
      });
    });
  }

  function cargar(force) {
    $('refresh').classList.add('spin');
    showState('stateLoading');
    try {
      var json = window.News.getNews(); // puente Java (HTTP + parseo)
      var d = JSON.parse(json || '[]');
      if (d && d.length) {
        articles = d;
        $('updated').textContent = new Date().toLocaleTimeString();
        // Estadísticas del hero
        var es = ['Hackplayers', 'Unaaldía (HispaSec)', 'WeLiveSecurity ES'];
        var feeds = {};
        articles.forEach(function (a) { feeds[a.source] = 1; });
        $('statNews').textContent = articles.length;
        $('statFeeds').textContent = Object.keys(feeds).length;
        $('statLang').textContent = articles.filter(function (a) { return es.indexOf(a.source) >= 0; }).length;
        buildChips();
        render();
      } else {
        showState('stateError');
      }
    } catch (e) {
      showState('stateError');
    } finally {
      $('refresh').classList.remove('spin');
    }
  }

  $('refresh').addEventListener('click', function () { cargar(true); });
  $('retry').addEventListener('click', function () { cargar(true); });

  cargar(false);

  /* ─── ASISTENTE DE IA (Gemini gratis) ─── */
  var AI_SYSTEM = 'Sos CyberAlerta, un experto en ciberseguridad que responde en español. ' +
    'Dás respuestas breves, claras y prácticas. Si algo no lo sabés, lo decís directamente.';
  var SUGS = ['¿Qué es el phishing?', '¿Cómo crear una contraseña segura?', '¿Qué es un firewall?', '¿Mi PC tiene virus?', 'Buenas prácticas de ciberseguridad'];
  var aiHistory = [];
  var aiAbierto = false;

  function aiOpen() {
    aiAbierto = true;
    $('aiPanel').className = 'open';
    $('aiKey').value = localStorage.getItem('ca_ai_key') || '';
    renderSugs();
    if (!$('aiMsgs').children.length) {
      addMsg('bot', 'Hola 👋 Soy el asistente de ciberseguridad de CyberAlerta. Preguntame lo que quieras.');
    }
    $('aiInput').focus();
  }
  function aiClose() { aiAbierto = false; $('aiPanel').className = ''; }

  function renderSugs() {
    $('aiSug').innerHTML = SUGS.map(function (s) { return '<button class="sug">' + esc(s) + '</button>'; }).join('');
    [].forEach.call($('aiSug').querySelectorAll('.sug'), function (b) {
      b.addEventListener('click', function () { $('aiInput').value = b.textContent; aiSend(); });
    });
  }

  function addMsg(role, text) {
    var d = document.createElement('div');
    d.className = 'msg ' + role;
    d.textContent = text;
    $('aiMsgs').appendChild(d);
    $('aiMsgs').scrollTop = $('aiMsgs').scrollHeight;
    return d;
  }

  function aiSend() {
    var txt = $('aiInput').value.trim();
    if (!txt) return;
    $('aiInput').value = '';
    aiHistory.push({ role: 'user', content: txt });
    addMsg('user', txt);
    var typing = addMsg('bot', 'Pensando…');
    typing.classList.add('typing');
    try {
      var key = (localStorage.getItem('ca_ai_key') || '').trim();
      var resp = window.AI.ask(JSON.stringify(aiHistory.slice(-10)), AI_SYSTEM, key);
      typing.classList.remove('typing');
      if (resp.indexOf('__ERR__') === 0) {
        typing.classList.add('err');
        typing.textContent = resp.slice(7) + '\n\nPara usar la IA gratis pegá tu clave de Gemini arriba.';
      } else {
        typing.textContent = resp;
        aiHistory.push({ role: 'assistant', content: resp });
      }
    } catch (e) {
      typing.classList.remove('typing');
      typing.classList.add('err');
      typing.textContent = 'Error al conectar con la IA.';
    }
    $('aiMsgs').scrollTop = $('aiMsgs').scrollHeight;
  }

  $('aiBtn').addEventListener('click', aiOpen);
  $('aiClose').addEventListener('click', aiClose);
  $('aiSend').addEventListener('click', aiSend);
  $('aiInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') aiSend(); });
  $('aiKeySave').addEventListener('click', function () {
    localStorage.setItem('ca_ai_key', ($('aiKey').value || '').trim());
    alert('Clave guardada.');
  });
  $('aiKeyLink').addEventListener('click', function () {
    window.location.href = 'https://aistudio.google.com/apikey';
  });
})();