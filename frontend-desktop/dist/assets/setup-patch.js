(function() {
  'use strict';

  var API_BASE = '';

  function fetchJSON(url) {
    return fetch(API_BASE + url).then(function(r) {
      if (!r.ok) throw new Error('Request failed');
      return r.json();
    });
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

  function createStyles() {
    var s = document.createElement('style');
    s.id = 'patch-setup-styles';
    s.textContent = [
      '#patch-setup-overlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:#0e1f16;display:flex;align-items:flex-start;justify-content:center;padding:40px 24px;overflow-y:auto;font-family:Inter,system-ui,sans-serif}',
      '#patch-setup-card{width:100%;max-width:520px;background:rgba(30,55,40,0.85);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px;box-shadow:0 20px 60px rgba(0,0,0,0.5);backdrop-filter:blur(12px)}',
      '#patch-setup-title{font-family:Fraunces,Inter,system-ui,sans-serif;font-size:1.5rem;font-weight:700;color:#e8f5e9;margin:0 0 4px 0}',
      '#patch-setup-sub{font-size:0.875rem;color:#94a3b8;margin:0 0 24px 0}',
      '.patch-label{font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;margin-bottom:8px;display:block}',
      '.patch-pills{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px}',
      '.patch-pill{padding:8px 18px;border-radius:999px;border:1.5px solid rgba(255,255,255,0.12);background:transparent;color:#cbd5e1;font-size:0.875rem;font-weight:600;cursor:pointer;transition:all 0.15s}',
      '.patch-pill:hover{border-color:rgba(76,175,80,0.5);color:#e8f5e9}',
      '.patch-pill.active{background:#2e7d32;border-color:#2e7d32;color:white}',
      '.patch-select{width:100%;padding:10px 14px;border-radius:10px;border:1.5px solid rgba(255,255,255,0.12);background:#1a3a28;color:#e2e8f0;font-size:0.875rem;margin-bottom:20px;appearance:none;cursor:pointer;background-image:url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3e%3cpath stroke=\'%236b7280\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'M6 8l4 4 4-4\'/%3e%3c/svg%3e");background-position:right 10px center;background-repeat:no-repeat;background-size:16px;padding-right:2.5rem}',
      '.patch-select:focus{outline:none;border-color:#4caf50}',
      '.patch-select option{background:#1a3a28;color:#e2e8f0}',
      '.patch-wrong-section{padding:16px;border-radius:12px;border:1.5px solid rgba(255,255,255,0.08);background:rgba(20,40,30,0.6);margin-bottom:20px}',
      '.patch-wrong-title{font-size:0.9rem;font-weight:600;color:#e2e8f0;margin-bottom:4px}',
      '.patch-wrong-desc{font-size:0.8rem;color:#94a3b8;margin-bottom:12px}',
      '.patch-btn{width:100%;padding:14px;border-radius:12px;border:none;font-size:1rem;font-weight:700;cursor:pointer;transition:all 0.15s}',
      '.patch-btn-primary{background:#2e7d32;color:white}',
      '.patch-btn-primary:hover{background:#388e3c;transform:scale(1.01)}',
      '.patch-btn-primary:active{transform:scale(0.98)}',
      '.patch-btn-wrong{background:transparent;border:1.5px solid rgba(255,255,255,0.12);color:#cbd5e1;font-size:0.875rem;padding:10px;margin-top:10px}',
      '.patch-btn-wrong:hover{border-color:#4caf50;color:white}',
      '.patch-loading{text-align:center;padding:40px;color:#94a3b8}',
      '.patch-spinner{width:32px;height:32px;border:3px solid rgba(255,255,255,0.1);border-top-color:#4caf50;border-radius:50%;animation:patch-spin 0.7s linear infinite;margin:0 auto 12px}',
      '@keyframes patch-spin{to{transform:rotate(360deg)}}'
    ].join('');
    document.head.appendChild(s);
  }

  function renderLoading() {
    return '<div class="patch-loading"><div class="patch-spinner"></div><p>Loading quiz setup...</p></div>';
  }

  function renderSetup(total, categories, wrongCount) {
    var pills = [10, 20, 50, 100].map(function(n) {
      return '<button class="patch-pill' + (n === 10 ? ' active' : '') + '" data-count="' + n + '">' + n + '</button>';
    }).join('');

    var catOpts = '<option value="">All Categories</option>' + categories.map(function(c) {
      return '<option value="' + c + '">' + c + '</option>';
    }).join('');

    var wrongSection = wrongCount > 0
      ? '<div class="patch-wrong-section">' +
          '<div class="patch-wrong-title">Wrong Questions (' + wrongCount + ')</div>' +
          '<div class="patch-wrong-desc">Practice questions you got wrong before</div>' +
          '<button class="patch-btn patch-btn-wrong" id="patch-wrong-btn">Review Wrong Questions</button>' +
        '</div>'
      : '';

    return '<div id="patch-setup-title">Practice Setup</div>' +
      '<p id="patch-setup-sub">' + total.toLocaleString() + ' questions across ' + categories.length + ' categories</p>' +
      '<span class="patch-label">Number of Questions</span>' +
      '<div class="patch-pills" id="patch-count-pills">' + pills + '</div>' +
      '<span class="patch-label">Category</span>' +
      '<select class="patch-select" id="patch-category-select">' + catOpts + '</select>' +
      wrongSection +
      '<button class="patch-btn patch-btn-primary" id="patch-start-btn">Start Quiz</button>';
  }

  function isOnQuizPage() {
    var p = location.pathname;
    return p === '/quiz' || p === '/desktop/quiz' || p === '/quiz/' || p === '/desktop/quiz/';
  }

  function isPracticeWrongPage() {
    var p = location.pathname;
    return p.indexOf('/practice-wrong') !== -1;
  }

  function hasQuizParams() {
    var sp = new URLSearchParams(location.search);
    return sp.has('count') || sp.has('category') || sp.has('qid');
  }

  function showSetupScreen() {
    if (document.getElementById('patch-setup-overlay')) return;
    if (isPracticeWrongPage()) return;
    if (hasQuizParams()) return;

    var overlay = document.createElement('div');
    overlay.id = 'patch-setup-overlay';
    var card = document.createElement('div');
    card.id = 'patch-setup-card';
    card.innerHTML = renderLoading();
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    var selectedCount = 10;
    var selectedCategory = '';

    var userId = 'anonymous';
    try {
      var stored = localStorage.getItem('userId');
      if (stored) userId = stored;
    } catch {}

    Promise.all([
      fetchJSON('/questions/count/'),
      fetchJSON('/questions/categories/'),
      fetchJSON('/quiz/wrong-queue/' + encodeURIComponent(userId)).catch(function() { return { questions: [] }; })
    ]).then(function(results) {
      var total = (results[0] && results[0].count) || 0;
      var cats = sortCategories(results[1] || []);
      var wrongQueue = results[2] || {};
      var wrongCount = (wrongQueue.questions && wrongQueue.questions.length) || 0;

      card.innerHTML = renderSetup(total, cats, wrongCount);

      var pills = card.querySelectorAll('.patch-pill');
      pills.forEach(function(pill) {
        pill.addEventListener('click', function() {
          pills.forEach(function(p) { p.classList.remove('active'); });
          pill.classList.add('active');
          selectedCount = parseInt(pill.dataset.count, 10);
        });
      });

      var catSelect = card.querySelector('#patch-category-select');
      catSelect.addEventListener('change', function() {
        selectedCategory = catSelect.value;
      });

      card.querySelector('#patch-start-btn').addEventListener('click', function() {
        var base = location.pathname;
        var quizPath = base.indexOf('/desktop/') === 0 ? '/desktop/quiz' : '/quiz';
        var params = new URLSearchParams();
        params.set('count', String(selectedCount));
        if (selectedCategory) params.set('category', selectedCategory);
        window.location.href = quizPath + '?' + params.toString();
      });

      var wrongBtn = card.querySelector('#patch-wrong-btn');
      if (wrongBtn) {
        wrongBtn.addEventListener('click', function() {
          var base = location.pathname;
          var wrongPath = base.indexOf('/desktop/') === 0 ? '/desktop/quiz/practice-wrong' : '/quiz/practice-wrong';
          window.location.href = wrongPath;
        });
      }
    }).catch(function(err) {
      console.error('Setup patch error:', err);
      card.innerHTML = '<div class="patch-loading"><p>Failed to load quiz data</p><button class="patch-btn patch-btn-primary" style="max-width:200px;margin:16px auto 0" onclick="location.reload()">Retry</button></div>';
    });
  }

  function init() {
    createStyles();
    if (isOnQuizPage() && !hasQuizParams() && !isPracticeWrongPage()) {
      showSetupScreen();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 300); });
  } else {
    setTimeout(init, 300);
  }
})();
