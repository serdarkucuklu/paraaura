/* Noble Vision Design System — runtime helpers.
   Loaded as a CLASSIC <script> in the browser (must run BEFORE app.js, which uses NobleVision).
   Also CommonJS-importable in Node for unit tests (package.json absent → .js is CJS).
   Pure helpers (relativeTime, lerp) are exported via module.exports; the DOM API attaches to
   window.NobleVision only when a document is present. */
(function (global) {
  'use strict';

  function lerp(a, b, t) { return a + (b - a) * t; }

  function relativeTime(date, now) {
    now = now || new Date();
    var s = Math.max(0, Math.round((now - date) / 1000));
    if (s < 10) return 'az önce';
    if (s < 60) return s + ' sn önce';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' dk önce';
    var h = Math.round(m / 60);
    if (h < 24) return h + ' saat önce';
    var d = Math.round(h / 24);
    return d + ' gün önce';
  }

  // ─── Browser-only DOM API ──────────────────────────────────────────────────
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    var NV = {
      relativeTime: relativeTime,
      lerp: lerp,

      initTheme: function () {
        var saved = localStorage.getItem('nv-theme') || 'system';
        NV.setTheme(saved);
      },

      setTheme: function (mode) {
        localStorage.setItem('nv-theme', mode);
        var sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        document.documentElement.dataset.theme = (mode === 'system') ? sys : mode;
      },

      toggleTheme: function () {
        var current = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        NV.setTheme(current);
      },

      toast: function (msg, type) {
        type = type || 'info';
        var wrap = document.querySelector('.nv-toast-wrap');
        if (!wrap) {
          wrap = document.createElement('div');
          wrap.className = 'nv-toast-wrap';
          wrap.setAttribute('aria-live', 'polite');
          document.body.appendChild(wrap);
        }
        var t = document.createElement('div');
        t.className = 'nv-toast nv-toast--' + type;
        t.textContent = msg;
        wrap.appendChild(t);
        requestAnimationFrame(function () { t.classList.add('nv-show'); });
        setTimeout(function () {
          t.classList.remove('nv-show');
          setTimeout(function () { t.remove(); }, 300);
        }, 4200);
      },

      skeleton: function (el, rows) {
        rows = rows || 3;
        var html = '';
        for (var i = 0; i < rows; i++) {
          html += '<div class="nv-skeleton" style="height:2.4rem;margin-bottom:.6rem"></div>';
        }
        el.innerHTML = html;
      },

      countUp: function (el, to, opts) {
        opts = opts || {};
        var format = opts.format || function (v) { return v.toFixed(2); };
        var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var from = parseFloat(el.dataset.nvVal || '0');
        el.dataset.nvVal = String(to);
        if (reduce || !isFinite(from)) { el.textContent = format(to); return; }
        var start = performance.now(), dur = 400;
        function tick(now) {
          var p = Math.min(1, (now - start) / dur);
          el.textContent = format(lerp(from, to, p));
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      },

      focusTrap: function (el) {
        var sel = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';
        el.addEventListener('keydown', function (e) {
          if (e.key !== 'Tab') return;
          var f = Array.prototype.slice.call(el.querySelectorAll(sel));
          if (!f.length) return;
          var first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
          else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
        });
      }
    };

    // React to system theme changes when in "system" mode.
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if ((localStorage.getItem('nv-theme') || 'system') === 'system') NV.setTheme('system');
    });

    global.NobleVision = NV;
    NV.initTheme();
  }

  // ─── Node (CommonJS) export for unit tests ─────────────────────────────────
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { relativeTime: relativeTime, lerp: lerp };
  }
})(typeof window !== 'undefined' ? window : this);
