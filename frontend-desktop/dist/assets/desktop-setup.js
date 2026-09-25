(function () {
  'use strict';

  var STORAGE_KEY = 'fpsc-quiz-state';
  var RESTORE_WINDOW_MS = 4 * 60 * 60 * 1000;

  function isWrongPage() {
    return location.pathname.indexOf('practice-wrong') !== -1;
  }

  function isQuizRoute() {
    var p = location.pathname;
    if (isWrongPage()) return false;
    // Match the app's /quiz route (root) and the /desktop entry serving it
    return p === '/quiz' || p === '/quiz/' || p === '/desktop/quiz' || p === '/desktop/quiz/';
  }

  function hasQuizParams() {
    var sp;
    try { sp = new URLSearchParams(location.search); } catch (e) { return false; }
    return sp.has('count') || sp.has('category') || sp.has('qid');
  }

  function hasRestorableQuiz() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var saved = JSON.parse(raw);
      if (!saved.questions || !saved.questions.length) return false;
      return (Date.now() - (saved.savedAt || 0)) < RESTORE_WINDOW_MS;
    } catch (e) { return false; }
  }

  function shouldShowSetup() {
    return isQuizRoute() && !hasQuizParams() && !hasRestorableQuiz();
  }

  function sortCategories(cats) {
    var order = ['forestry', 'biodiversity', 'wildlife', 'forest management', 'soil conservation', 'environmental science', 'ecology', 'botany', 'zoology', 'climate change'];
    return cats.slice().sort(function (a, b) {
      var al = String(a).toLowerCase(), bl = String(b).toLowerCase();
      var ai = -1, bi = -1;
      for (var i = 0; i < order.length; i++) {
        if (ai === -1 && al.indexOf(order[i]) !== -1) ai = i;
        if (bi === -1 && bl.indexOf(order[i]) !== -1) bi = i;
      }
      ai = ai === -1 ? 999 : ai;
      bi = bi === -1 ? 999 : bi;
      if (ai !== bi) return ai - bi;
      return al < bl ? -1 : al > bl ? 1 : 0;
    });
  }

  function injectStyles() {
    if (document.getElementById('qsp-css')) return;
    var s = document.createElement('style');
    s.id = 'qsp-css';
    s.textContent = [
      '.qsp-overlay{position:fixed;inset:0;z-index:99999;background:#f3f5f3;overflow-y:auto;padding:clamp(20px,5vh,56px) clamp(16px,4vw,32px) 90px;font-family:Inter,system-ui,-apple-system,sans-serif}',
      '@media(min-width:1024px){.qsp-overlay{left:280px}}',
      '.qsp-wrap{max-width:720px;margin:0 auto}',
      '.qsp-back{display:inline-flex;align-items:center;gap:6px;background:none;border:none;color:#64748b;font-size:13px;font-weight:600;cursor:pointer;padding:0 0 14px;font-family:inherit}',
      '.qsp-back:hover{color:#0f172a}',
      '.qsp-card{background:#fff;border:1px solid #e5e9e5;border-radius:14px;padding:clamp(20px,3vw,30px);box-shadow:0 1px 2px rgba(0,0,0,.04),0 12px 32px rgba(0,0,0,.06)}',
      '.qsp-title{font-size:19px;font-weight:700;color:#101813;margin:0 0 4px;letter-spacing:-.01em}',
      '.qsp-sub{font-size:13px;color:#6b7686;margin:0 0 20px}',
      '.qsp-label{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#8a94a0;margin:0 0 8px}',
      '.qsp-pills{display:flex;gap:8px;margin-bottom:20px}',
      '.qsp-pill{flex:1;padding:11px 0;border-radius:9px;border:1px solid #e2e8e2;background:#f4f6f4;color:#5b6672;font-size:13.5px;font-weight:600;cursor:pointer;transition:all .13s;font-family:inherit}',
      '.qsp-pill:hover{border-color:#86c78f;color:#15803d}',
      '.qsp-pill.on{background:#22c55e;border-color:#22c55e;color:#fff;box-shadow:0 3px 12px rgba(34,197,94,.35)}',
      '.qsp-pill.beast-armed{position:relative;overflow:hidden;font-size:12px;animation:beastGlow 1.6s ease-in-out infinite}',
      '@keyframes beastGlow{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.55),0 4px 14px rgba(34,197,94,.35)}50%{box-shadow:0 0 18px 4px rgba(251,146,60,.75),0 4px 18px rgba(34,197,94,.5)}}',
      '.qsp-pill.beast-shake{animation:beastShake .45s ease,beastGlow 1.6s ease-in-out .45s infinite}',
      '@keyframes beastShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-4px) rotate(-1deg)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(2px)}}',
      '.fx-ember{position:absolute;bottom:-3px;width:5px;height:5px;border-radius:50%;background:radial-gradient(circle,#fde68a 0%,#f59e0b 55%,rgba(245,158,11,0) 100%);pointer-events:none;animation:emberRise 1.5s linear infinite}',
      '@keyframes emberRise{0%{transform:translateY(0) scale(1);opacity:0}15%{opacity:1}100%{transform:translateY(-34px) scale(.25);opacity:0}}',
      '.fx-spark{position:absolute;top:50%;left:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:radial-gradient(circle,#fff7ed 0%,#fb923c 60%,rgba(251,146,60,0) 100%);pointer-events:none;animation:sparkBurst .7s ease-out forwards}',
      '@keyframes sparkBurst{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--dx,20px),var(--dy,-20px)) scale(.1);opacity:0}}',
      '.fx-dragon{position:absolute;top:1px;left:0;font-size:13px;line-height:1;pointer-events:none;animation:dragonFly 1.9s linear forwards}',
      '@keyframes dragonFly{0%{transform:translate(-30px,0);opacity:0}8%{opacity:1}92%{opacity:1}100%{transform:translate(420px,0);opacity:0}}',
      '.qsp-select{width:100%;padding:11px 38px 11px 13px;border-radius:9px;border:1px solid #dfe4de;background:#fff;color:#1c2420;font-size:13.5px;font-family:inherit;margin-bottom:18px;appearance:none;-webkit-appearance:none;cursor:pointer;background-image:url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3e%3cpath stroke=\'%2394a3b8\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.6\' d=\'M6 8l4 4 4-4\'/%3e%3c/svg%3e");background-position:right 12px center;background-repeat:no-repeat;background-size:15px}',
      '.qsp-select:focus{outline:none;border-color:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.15)}',
      '.qsp-start{width:100%;padding:13px 0;border-radius:10px;border:none;font-size:14.5px;font-weight:700;cursor:pointer;background:#22c55e;color:#fff;transition:all .13s;font-family:inherit;box-shadow:0 3px 12px rgba(34,197,94,.3)}',
      '.qsp-start:hover{background:#16a34a}',
      '.qsp-start:active{transform:scale(.99)}',
      '.qsp-wrong{margin-top:14px;background:#fef1f0;border:1px solid #f5d5d0;border-radius:10px;padding:13px 14px 14px}',
      '.qsp-wrong-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}',
      '.qsp-wrong-label{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:700;color:#991b1b}',
      '.qsp-wrong-time{font-size:12px;color:#b68080}',
      '.qsp-wrong-btn{width:100%;padding:12px 0;border-radius:9px;border:none;font-size:13.5px;font-weight:700;cursor:pointer;color:#fff;background:linear-gradient(135deg,#ef4444 0%,#ea580c 100%);box-shadow:0 3px 12px rgba(239,68,68,.3);transition:all .13s;font-family:inherit}',
      '.qsp-wrong-btn:hover{filter:brightness(1.05)}',
      '.qsp-wrong-btn:active{transform:scale(.99)}',
      '.qsp-loading{text-align:center;padding:36px 0;color:#8a94a0;font-size:13px}',
      '.qsp-spin{width:28px;height:28px;border:3px solid #e2e8e2;border-top-color:#22c55e;border-radius:50%;animation:qsp-spin .65s linear infinite;margin:0 auto 10px}',
      '@keyframes qsp-spin{to{transform:rotate(360deg)}}'
    ].join('');
    document.head.appendChild(s);
  }

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Beast Mode FX kit (CSS-only motion, nodes cleaned up on disarm) ──
  var FX_OFF = false;
  try { FX_OFF = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  function fxCleanup(btn) {
    if (!btn) return;
    var dead = btn.querySelectorAll('.fx-ember,.fx-spark,.fx-dragon');
    for (var i = 0; i < dead.length; i++) dead[i].remove();
  }

  function beastEmbers(btn, n) {
    for (var i = 0; i < n; i++) {
      var s = document.createElement('span');
      s.className = 'fx-ember';
      s.setAttribute('aria-hidden', 'true');
      s.style.left = (6 + Math.random() * 88) + '%';
      s.style.animationDelay = (Math.random() * 1.5).toFixed(2) + 's';
      s.style.animationDuration = (1.1 + Math.random() * 0.8).toFixed(2) + 's';
      btn.appendChild(s);
    }
  }

  function beastBurst(btn, n) {
    for (var i = 0; i < n; i++) {
      (function (k) {
        var s = document.createElement('span');
        s.className = 'fx-spark';
        s.setAttribute('aria-hidden', 'true');
        var ang = (Math.PI * 2 * k) / n + Math.random() * 0.5;
        var dist = 26 + Math.random() * 38;
        s.style.setProperty('--dx', Math.cos(ang).toFixed(0) + 'px');
        s.style.setProperty('--dy', Math.sin(ang).toFixed(0) + 'px');
        s.addEventListener('animationend', function () { s.remove(); });
        setTimeout(function () { if (s.parentElement) s.remove(); }, 1500);
        btn.appendChild(s);
      })(i);
    }
  }

  function beastDragon(btn) {
    var d = document.createElement('span');
    d.className = 'fx-dragon';
    d.setAttribute('aria-hidden', 'true');
    d.textContent = '🐉';
    d.addEventListener('animationend', function () { d.remove(); });
    setTimeout(function () { if (d.parentElement) d.remove(); }, 2500);
    btn.appendChild(d);
  }

  function beastFXOn(btn) {
    if (!btn || btn.dataset.armed === '1') return; // idempotent: no DOM churn → no observer loop
    btn.dataset.armed = '1';
    fxCleanup(btn);
    btn.classList.add('on');
    btn.innerHTML = '&#x1f525; BEAST';
    if (FX_OFF) return;
    btn.classList.add('beast-armed');
    btn.classList.remove('beast-shake');
    void btn.offsetWidth;
    btn.classList.add('beast-shake');
    beastEmbers(btn, 8);
    beastBurst(btn, 12);
    beastDragon(btn);
  }

  function beastFXOff(btn) {
    if (!btn || btn.dataset.armed !== '1') return; // idempotent
    delete btn.dataset.armed;
    btn.classList.remove('on', 'beast-armed', 'beast-shake');
    btn.innerHTML = '&#x1f525; Beast';
    fxCleanup(btn);
  }

  function clearStaleNumericGreen() {
    // React doesn't know Beast was picked — clear stale green from number pills (once per arm)
    try {
      var sec = document.querySelector('section[aria-label="Practice session setup"]');
      if (!sec) return;
      var nums = Array.prototype.filter.call(sec.querySelectorAll('button'), function (b) {
        var t = b.textContent.trim();
        return t === '10' || t === '20' || t === '50' || t === '100';
      });
      Array.prototype.forEach.call(nums, function (p) {
        p.style.background = 'hsl(var(--muted))';
        p.style.color = 'hsl(var(--muted-foreground))';
        p.style.border = '1px solid hsl(var(--border))';
        p.style.boxShadow = '0 1px 3px hsl(var(--foreground) / 0.06)';
      });
    } catch (e) {}
  }

  function buildHTML(total, cats, wrongCount) {
    var pills = [10, 20, 50, 100].map(function (n) {
      return '<button type="button" class="qsp-pill' + (n === 10 ? ' on' : '') + '" data-n="' + n + '">' + n + '</button>';
    }).join('') + '<button type="button" class="qsp-pill" id="qsp-beast" data-n="beast" title="Beast Mode — practice ALL questions: full bank or whole category">&#x1f525; Beast</button>';
    var opts = '<option value="">All Categories</option>' + cats.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }).join('');
    var wrong = wrongCount > 0
      ? '<div class="qsp-wrong">' +
          '<div class="qsp-wrong-top"><span class="qsp-wrong-label"><span aria-hidden="true">&#x1f501;</span> ' + wrongCount + ' wrong to review</span>' +
          '<span class="qsp-wrong-time">~' + (wrongCount * 2) + ' min</span></div>' +
          '<button type="button" class="qsp-wrong-btn" id="qsp-wrong">&#9889; Practice Wrong Questions</button></div>'
      : '';
    return '<div class="qsp-wrap">' +
      '<button type="button" class="qsp-back" id="qsp-back">&larr; Back</button>' +
      '<div class="qsp-card">' +
      '<h2 class="qsp-title">Start a Practice Session</h2>' +
      '<p class="qsp-sub">' + total.toLocaleString() + ' questions across ' + cats.length + ' categories</p>' +
      '<label class="qsp-label">Questions</label>' +
      '<div class="qsp-pills" id="qsp-pills">' + pills + '</div>' +
      '<label class="qsp-label">Category</label>' +
      '<select class="qsp-select" id="qsp-cat">' + opts + '</select>' +
      '<button type="button" class="qsp-start" id="qsp-go">Start Quiz</button>' + wrong +
      '</div></div>';
  }

  function removeOverlay() {
    var o = document.querySelector('.qsp-overlay');
    if (o) o.remove();
  }

  function showSetup() {
    if (document.querySelector('.qsp-overlay')) return;
    injectStyles();

    var overlay = document.createElement('div');
    overlay.className = 'qsp-overlay';
    overlay.innerHTML = '<div class="qsp-wrap"><div class="qsp-card"><div class="qsp-loading"><div class="qsp-spin"></div>Loading...</div></div></div>';
    document.body.appendChild(overlay);

    var count = 10;
    var cat = '';
    var beast = false;
    var wrongIds = [];

    var userId = 'anonymous';
    try { var u = localStorage.getItem('userId'); if (u) userId = u; } catch (e) {}

    Promise.all([
      fetch('/questions/count/').then(function (r) { if (!r.ok) throw 0; return r.json(); }),
      fetch('/questions/categories/').then(function (r) { if (!r.ok) throw 0; return r.json(); }),
      fetch('/quiz/wrong-queue/' + encodeURIComponent(userId)).then(function (r) { if (!r.ok) throw 0; return r.json(); }).catch(function () { return { questions: [], count: 0 }; })
    ]).then(function (res) {
      if (!document.body.contains(overlay)) return;
      var total = (res[0] && res[0].count) || 0;
      var cats = sortCategories(res[1] || []);
      var wq = res[2] || {};
      var wQuestions = wq.questions || [];
      var wc = (typeof wq.count === 'number') ? wq.count : wQuestions.length;
      wrongIds = wQuestions.map(function (q) { return q.id; }).filter(function (id) { return id != null; });

      overlay.innerHTML = buildHTML(total, cats, wc);
      var card = overlay.firstChild;

      var pills = card.querySelectorAll('.qsp-pill');
      var beastBtn = card.querySelector('#qsp-beast');
      function paintBeast() {
        if (beast) beastFXOn(beastBtn);
        else beastFXOff(beastBtn);
      }
      Array.prototype.forEach.call(pills, function (b) {
        b.addEventListener('click', function () {
          var isn = b.getAttribute('data-n');
          Array.prototype.forEach.call(pills, function (p) { p.classList.remove('on'); });
          b.classList.add('on');
          if (isn === 'beast') {
            beast = true;
          } else {
            beast = false;
            count = parseInt(isn, 10) || 10;
          }
          paintBeast();
        });
      });

      card.querySelector('#qsp-cat').addEventListener('change', function (e) { cat = e.target.value; });

      card.querySelector('#qsp-go').addEventListener('click', function () {
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
        var qs = beast ? '?count=0' : '?count=' + count;
        if (cat) qs += '&category=' + encodeURIComponent(cat);
        window.location.href = '/quiz' + qs;
      });

      var wb = card.querySelector('#qsp-wrong');
      if (wb) wb.addEventListener('click', function () {
        removeOverlay();
        try {
          history.pushState({ wrongQuestionIds: wrongIds, source: 'queue' }, '', '/quiz/practice-wrong');
          window.dispatchEvent(new PopStateEvent('popstate'));
        } catch (e) {
          window.location.href = '/quiz';
        }
        setTimeout(function () {
          if (location.pathname.indexOf('practice-wrong') === -1) showSetup();
        }, 1200);
      });

      var back = card.querySelector('#qsp-back');
      if (back) back.addEventListener('click', function () {
        removeOverlay();
        window.history.back();
      });
    }).catch(function () {
      if (!document.body.contains(overlay)) return;
      overlay.innerHTML = '<div class="qsp-wrap"><div class="qsp-card"><div class="qsp-loading"><p>Failed to load quiz data.</p><button type="button" class="qsp-start" style="max-width:170px;margin:14px auto 0" onclick="location.reload()">Retry</button></div></div></div>';
    });
  }

  function check() {
    if (shouldShowSetup()) showSetup();
    else removeOverlay();
    try { enhanceHomeCard(); } catch (e) {}
  }

  function hookNav() {
    if (window.__qsp_hooked) return;
    window.__qsp_hooked = true;
    try {
      var origPush = history.pushState;
      history.pushState = function () {
        var r = origPush.apply(this, arguments);
        setTimeout(check, 60);
        return r;
      };
      var origReplace = history.replaceState;
      history.replaceState = function () {
        var r = origReplace.apply(this, arguments);
        setTimeout(check, 60);
        return r;
      };
    } catch (e) {}
    window.addEventListener('popstate', function () { setTimeout(check, 60); });
    // Re-enhance home card across React re-renders (which wipe injected nodes)
    try {
      var mo = new MutationObserver(function () {
        try { enhanceHomeCard(); } catch (e) {}
      });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }

  // ── Home practice card: 5th "Beast" pill (no rebuild, no layout change) ──
  var homeBeast = false;
  var homeCat = '';
  var BEAST_ON = { background: 'hsl(152 55% 45%)', color: 'white', border: '1px solid hsl(var(--moss-600))' };

  function isHomeRoute() {
    var p = location.pathname;
    return p === '/' || p === '/desktop' || p === '/desktop/';
  }

  function enhanceHomeCard() {
    if (!isHomeRoute()) { homeBeast = false; homeCat = ''; return; }
    var sec = document.querySelector('section[aria-label="Practice session setup"]');
    if (!sec) return;
    // Track category from the dropdown items + toggle text
    try {
      var items = sec.querySelectorAll('.category-dropdown-item');
      Array.prototype.forEach.call(items, function (it) {
        if (it.__beastWired) return;
        it.__beastWired = true;
        it.addEventListener('click', function () {
          var t = (it.textContent || '').trim();
          homeCat = (t === 'All Categories') ? '' : t;
        });
      });
    } catch (e) {}
    // Numeric pills: leaving Beast mode when a number is picked
    var pills = Array.prototype.filter.call(sec.querySelectorAll('button'), function (b) {
      var t = b.textContent.trim();
      return t === '10' || t === '20' || t === '50' || t === '100';
    });
    if (pills.length < 4) return;
    Array.prototype.forEach.call(pills, function (b) {
      if (b.__beastWired) return;
      b.__beastWired = true;
      b.addEventListener('click', function () {
        homeBeast = false;
        paintHomeBeast();
      });
    });
    // Add the Beast pill once (re-added after React re-renders)
    var bp = sec.querySelector('#qsp-home-beast');
    if (!bp) {
      var ref = pills[0];
      bp = document.createElement('button');
      bp.type = 'button';
      bp.id = 'qsp-home-beast';
      bp.title = 'Beast Mode — practice ALL questions: full bank or whole category';
      bp.setAttribute('aria-label', 'Beast Mode: practice all questions');
      bp.setAttribute('aria-pressed', 'false');
      bp.className = ref.className;
      bp.style.cssText = ref.style.cssText + ';flex:1;font-weight:700;';
      bp.textContent = '🔥 Beast';
      bp.addEventListener('click', function () {
        homeBeast = true;
        clearStaleNumericGreen();
        paintHomeBeast();
      });
      ref.parentElement.appendChild(bp);
    }
    paintHomeBeast();
    // Intercept Start Quiz (capture phase beats React) when Beast is armed
    var starters = Array.prototype.filter.call(sec.querySelectorAll('button'), function (b) {
      return b.textContent.trim() === 'Start Quiz';
    });
    Array.prototype.forEach.call(starters, function (st) {
      if (st.__beastWired) return;
      st.__beastWired = true;
      st.addEventListener('click', function (e) {
        if (!homeBeast) return;
        try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
        var qs = '?count=0';
        if (homeCat) qs += '&category=' + encodeURIComponent(homeCat);
        window.location.href = '/quiz' + qs;
      }, true);
    });
  }

  function paintHomeBeast() {
    var bp = document.querySelector('#qsp-home-beast');
    if (homeBeast) beastFXOn(bp);
    else beastFXOff(bp);
    if (bp && bp.getAttribute('aria-pressed') !== String(homeBeast)) {
      bp.setAttribute('aria-pressed', homeBeast ? 'true' : 'false');
    }
  }

  function init() {
    hookNav();
    check();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 250); });
  } else {
    setTimeout(init, 250);
  }
})();
