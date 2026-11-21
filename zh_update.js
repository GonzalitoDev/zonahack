(function () {
  "use strict";
  if (window.__zhUpdateLoaded) return;
  window.__zhUpdateLoaded = true;

  var doc = document;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function ready(fn) {
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", fn, { once: true });
    else fn();
  }

  ready(function () {
    if (!doc.body) return;

    doc.documentElement.classList.add("zh-enhanced");

    var bar = doc.getElementById("zhProgressBar");
    if (!bar) {
      bar = doc.createElement("div");
      bar.id = "zhProgressBar";
      bar.setAttribute("aria-hidden", "true");
      doc.body.appendChild(bar);
    }

    var btn = doc.getElementById("zhBackTop");
    if (!btn) {
      btn = doc.createElement("button");
      btn.id = "zhBackTop";
      btn.type = "button";
      btn.setAttribute("aria-label", "Volver arriba");
      btn.title = "Volver arriba";
      btn.setAttribute("aria-hidden", "true");
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';
      btn.addEventListener("click", function () {
        try {
          window.scrollTo({ top: 0, left: 0, behavior: reduced ? "auto" : "smooth" });
        } catch (e) {
          window.scrollTo(0, 0);
        }
      });
      doc.body.appendChild(btn);
    }

    var ticking = false;
    function update() {
      var st = window.pageYOffset || doc.documentElement.scrollTop || doc.body.scrollTop || 0;
      var dh = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
      var max = Math.max(0, dh - window.innerHeight);
      var pct = max > 0 ? Math.min(100, Math.max(0, (st / max) * 100)) : 0;

      bar.style.width = pct.toFixed(2) + "%";
      var show = st > 400;
      btn.classList.toggle("zh-show", show);
      btn.setAttribute("aria-hidden", show ? "false" : "true");
      ticking = false;
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
      raf(update);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    window.addEventListener("load", update);
    update();
  });
})();
