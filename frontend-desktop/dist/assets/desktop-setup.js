(function() {
  'use strict';

  var IS_DESKTOP = location.pathname.indexOf('/desktop/') === 0;
  var QUIZ_PATH = IS_DESKTOP ? '/desktop/quiz' : '/quiz';
  var WRONG_PATH = IS_DESKTOP ? '/desktop/quiz/practice-wrong' : '/quiz/practice-wrong';

  function isQuizPage() {
    var p = location.pathname;
    return p === '/quiz' || p === '/desktop/quiz' || p === '/quiz/' || p === '/desktop/quiz/';
  }

  function isWrongPage() {
    return location.pathname.indexOf('/practice-wrong') !== -1;
  }

  function hasQuizParams() {
    var sp = new URLSearchParams(location.search);
    return sp.has('count') || sp.has('category') || sp.has('qid');
  }

  function isQuizActive() {
    var sp = new URLSearchParams(location.search);
    if (sp.has('count') || sp.has('category') || sp.has('qid')) return true;
    if (isWrongPage()) return true;
    try {
      var raw = localStorage.getItem('quiz_persisted_state');
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved.questions && saved.questions.length > 0) return true;
      }
    } catch {}
    return false;
  }

  function sortCategories(cats) {
    var order = ['forestry', 'biodiversity', 'wildlife', 'forest management', 'soil conservation', 'environmental science', 'ecology', 'botany', 'zoology', 'climate change'];
    return cats.slice().sort(function(a, b) {
      var ai = order.findIndex(function(o) { return a.toLowerCase().indexOf(o) !== -1; });
      var bi = order.findIndex(function(o) { return b.toLowerCase().indexOf(o) !== -1; });
      ai = ai === -1 ? 999 : ai;
      bi = bi === -1 ? 999 : bi;
      return ai - bi || a.localeCompare(b);
    });
  }

  function injectStyles() {
    if (document.getElementById('quiz-setup-patch-css')) return;
    var s = document.createElement('style');
    s.id = 'quiz-setup-patch-css';
    s.textContent = [
      '.qsp-overlay{position:fixed;inset:0;z-index:99999;background:#0f1f16;display:flex;align-items:flex-start;justify-content:center;padding:clamp(20px,5vh,48px) 20px 80px;overflow-y:auto}',
      '.qsp-card{width:100%;max-width:480px;background:rgba(26,50,36,0.92);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:28px 28px 24px;box-shadow:0 8px 40px rgba(0,0,0,0.45);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}',
      '.qsp-hdr{display:flex;align-items:center;gap:10px;margin-bottom:20px}',
      '.qsp-back{width:32px;height:32px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:#94a3b8;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .12s}',
      '.qsp-back:hover{background:rgba(255,255,255,0.08);color:#e2e8f0}',
      '.qsp-hdr-text small{display:block;font-size:12px;color:#94a3b8;font-weight:500;letter-spacing:.02em}',
      '.qsp-hdr-text strong{display:block;font-size:18px;color:#e8f5e9;font-weight:700;font-family:Fraunces,serif}',
      '.qsp-sub{font-size:13px;color:#94a3b8;margin:0 0 20px;line-height:1.5}',
      '.qsp-label{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:8px}',
      '.qsp-pills{display:flex;gap:6px;margin-bottom:20px}',
      '.qsp-pill{flex:1;padding:10px 0;border-radius:10px;border:1.5px solid rgba(255,255,255,0.1);background:transparent;color:#cbd5e1;font-size:13px;font-weight:600;cursor:pointer;transition:all .12s;font-family:inherit}',
      '.qsp-pill:hover{border-color:rgba(76,175,80,0.4);color:#e8f5e9}',
      '.qsp-pill.on{background:#2e7d32;border-color:#2e7d32;color:#fff;box-shadow:0 2px 8px rgba(46,125,50,0.3)}',
      '.qsp-select{width:100%;padding:10px 36px 10px 12px;border-radius:10px;border:1.5px solid rgba(255,255,255,0.1);background:#162e22;color:#e2e8f0;font-size:13px;font-family:inherit;margin-bottom:20px;appearance:none;cursor:pointer;background-image:url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3e%3cpath stroke=\'%236b7280\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'M6 8l4 4 4-4\'/%3e%3c/svg%3e");background-position:right 10px center;background-repeat:no-repeat;background-size:16px}',
      '.qsp-select:focus{outline:none;border-color:#4caf50}',
      '.qsp-select option{background:#162e22;color:#e2e8f0}',
      '.qsp-start{width:100%;padding:13px 0;border-radius:12px;border:none;font-size:14px;font-weight:700;cursor:pointer;background:#2e7d32;color:#fff;transition:all .12s;font-family:inherit}',
      '.qsp-start:hover{background:#388e3c}',
      '.qsp-start:active{transform:scale(0.98)}',
      '.qsp-wrong-box{margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06)}',
      '.qsp-wrong-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}',
      '.qsp-wrong-label{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:#e2e8f0}',
      '.qsp-wrong-time{font-size:12px;color:#64748b}',
      '.qsp-wrong-btn{width:100%;padding:11px 0;border-radius:10px;border:1.5px solid rgba(255,255,255,0.1);background:transparent;color:#cbd5e1;font-size:13px;font-weight:600;cursor:pointer;transition:all .12s;font-family:inherit}',
      '.qsp-wrong-btn:hover{border-color:#4caf50;color:#fff}',
      '.qsp-spin{width:28px;height:28px;border:3px solid rgba(255,255,255,0.08);border-top-color:#4caf50;border-radius:50%;animation:qsp-spin .65s linear infinite;margin:0 auto 10px}',
      '@keyframes qsp-spin{to{transform:rotate(360deg)}}',
      '.qsp-loading{text-align:center;padding:32px 0;color:#64748b;font-size:13px}'
    ].join('');
    document.head.appendChild(s);
  }

  function buildHTML(total, cats, wrongCount) {
    var pills = [10, 20, 50, 100].map(function(n) {
      return '<button class="qsp-pill' + (n === 10 ? ' on' : '') + '" data-n="' + n + '">' + n + '</button>';
    }).join('');
    var opts = '<option value="">All Categories</option>' + cats.map(function(c) {
      return '<option value="' + c + '">' + c + '</option>';
    }).join('');
    var wrong = wrongCount > 0
      ? '<div class="qsp-wrong-box">' +
          '<div class="qsp-wrong-top"><span class="qsp-wrong-label"><span aria-hidden="true">&#x1f501;</span> ' + wrongCount + ' wrong to review</span>' +
          '<span class="qsp-wrong-time">~' + (wrongCount * 2) + ' min</span></div>' +
          '<button class="qsp-wrong-btn" id="qsp-wrong">&#9889; Practice Wrong Questions</button></div>'
      : '';
    return '<div class="qsp-hdr"><button class="qsp-back" id="qsp-back">&larr;</button>' +
      '<div class="qsp-hdr-text"><small>Practice quiz</small><strong>Forestry PSC</strong></div></div>' +
      '<p class="qsp-sub">Start a Practice Session<br>' + total.toLocaleString() + ' questions across ' + cats.length + ' categories</p>' +
      '<label class="qsp-label">Questions</label>' +
      '<div class="qsp-pills" id="qsp-pills">' + pills + '</div>' +
      '<label class="qsp-label">Category</label>' +
      '<select class="qsp-select" id="qsp-cat">' + opts + '</select>' +
      '<button class="qsp-start" id="qsp-go">Start Quiz</button>' + wrong;
  }

  function showSetup() {
    if (document.querySelector('.qsp-overlay')) return;

    injectStyles();

    var overlay = document.createElement('div');
    overlay.className = 'qsp-overlay';
    var card = document.createElement('div');
    card.className = 'qsp-card';
    card.innerHTML = '<div class="qsp-loading"><div class="qsp-spin"></div>Loading...</div>';
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    var count = 10;
    var cat = '';

    var userId = 'anonymous';
    try { var u = localStorage.getItem('userId'); if (u) userId = u; } catch {}

    Promise.all([
      fetch('/questions/count/').then(function(r) { return r.json(); }),
      fetch('/questions/categories/').then(function(r) { return r.json(); }),
      fetch('/quiz/wrong-queue/' + encodeURIComponent(userId)).then(function(r) { return r.json(); }).catch(function() { return { questions: [] }; })
    ]).then(function(res) {
      var total = (res[0] && res[0].count) || 0;
      var cats = sortCategories(res[1] || []);
      var wq = res[2] || {};
      var wc = (wq.questions && wq.questions.length) || 0;

      card.innerHTML = buildHTML(total, cats, wc);

      card.querySelectorAll('.qsp-pill').forEach(function(b) {
        b.addEventListener('click', function() {
          card.querySelectorAll('.qsp-pill').forEach(function(p) { p.classList.remove('on'); });
          b.classList.add('on');
          count = parseInt(b.dataset.n, 10);
        });
      });

      card.querySelector('#qsp-cat').addEventListener('change', function(e) {
        cat = e.target.value;
      });

      card.querySelector('#qsp-go').addEventListener('click', function() {
        var qs = '?count=' + count;
        if (cat) qs += '&category=' + encodeURIComponent(cat);
        window.location.href = QUIZ_PATH + qs;
      });

      var wb = card.querySelector('#qsp-wrong');
      if (wb) wb.addEventListener('click', function() {
        window.location.href = WRONG_PATH;
      });

      var back = card.querySelector('#qsp-back');
      if (back) back.addEventListener('click', function() {
        overlay.remove();
        window.location.href = IS_DESKTOP ? '/desktop/' : '/';
      });
    }).catch(function() {
      card.innerHTML = '<div class="qsp-loading"><p>Failed to load. </p><button class="qsp-start" style="max-width:160px;margin:12px auto 0" onclick="location.reload()">Retry</button></div>';
    });
  }

  function init() {
    if (!isQuizPage()) return;
    if (isQuizActive()) return;
    showSetup();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 200); });
  } else {
    setTimeout(init, 200);
  }
})();
