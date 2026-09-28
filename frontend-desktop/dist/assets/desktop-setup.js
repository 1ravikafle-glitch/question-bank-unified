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

  function getSavedQuiz() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var saved = JSON.parse(raw);
      if (!saved.questions || !saved.questions.length) return null;
      if ((Date.now() - (saved.savedAt || 0)) >= RESTORE_WINDOW_MS) return null;
      var idx = saved.currentIndex || 0;
      if (idx < 0 || idx >= saved.questions.length) return null;
      return saved;
    } catch (e) { return null; }
  }

  function hasRestorableQuiz() {
    return !!getSavedQuiz();
  }

  // Wipes auto-start residue saved by the app underneath while our menu is open.
  var menuShownAt = 0;
  var wiperTimer = null;
  function startWiper() {
    stopWiper();
    menuShownAt = Date.now();
    wiperTimer = setInterval(function () {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        var saved = JSON.parse(raw);
        if (saved && (saved.savedAt || 0) > menuShownAt) localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
    }, 2000);
  }
  function stopWiper() {
    if (wiperTimer) { try { clearInterval(wiperTimer); } catch (e) {} wiperTimer = null; }
  }
  try { window.addEventListener('pagehide', stopWiper); } catch (e) {}

  function shouldShowSetup() {
    return isQuizRoute() && !hasQuizParams() && !hasRestorableQuiz();
  }

  // Global order: A–Z, Devanagari names last. Pure ordering, values untouched.
  function sortCategories(cats) {
    return cats.slice().sort(function (a, b) {
      var ad = /[\u0900-\u097F]/.test(a) ? 1 : 0, bd = /[\u0900-\u097F]/.test(b) ? 1 : 0;
      if (ad !== bd) return ad - bd;
      var al = String(a).toLowerCase(), bl = String(b).toLowerCase();
      return al < bl ? -1 : al > bl ? 1 : 0;
    });
  }


  // ── Apps: Elfak GIS Pro Studio (separate Render service, opens in a new tab)
  //     Appended as its own group. Nothing else in the sidebar is touched.
  var GIS_URL = 'https://elfakgisstudio.onrender.com/';
  var SSO_KEY = 'fpsc-sso-token';

  function gisHref() {
    var t = null;
    try { t = localStorage.getItem(SSO_KEY); } catch (e) {}
    if (t && String(t).length > 20) {
      return GIS_URL.replace(/\/$/, '') + '/sso/exchange?t=' + encodeURIComponent(t);
    }
    return GIS_URL;
  }

  function injectGisLink() {
    try {
      var nav = document.querySelector('.desktop-sidebar nav');
      if (!nav) return;
      var existing = nav.querySelector('[data-qsp-gis]');
      if (existing) { existing.setAttribute('href', gisHref()); return; }

      var d = document.createElement('div');
      d.setAttribute('data-qsp-gis-group', '1');

      var label = document.createElement('p');
      label.className = 'px-3';
      label.setAttribute('style', 'font-size:0.6875rem;font-weight:600;text-transform:uppercase;' +
        'letter-spacing:0.08em;color:hsl(var(--foreground) / 0.45);' +
        'margin-bottom:0.375rem;padding-top:1rem');
      label.textContent = 'Apps';
      d.appendChild(label);

      var a = document.createElement('a');
      a.setAttribute('data-qsp-gis', '1');
      a.setAttribute('href', gisHref());
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
      a.setAttribute('style', 'display:flex;align-items:center;gap:0.75rem;' +
        'padding:0.5rem 0.75rem;border-radius:0.5rem;font-weight:500;font-size:0.9375rem;' +
        'color:hsl(var(--primary));background:hsl(var(--primary) / 0.08);' +
        'border:1px dashed hsl(var(--primary) / 0.45);text-decoration:none');

      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '15'); svg.setAttribute('height', '15');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.8');
      svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
      svg.style.flexShrink = '0';
      var p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p1.setAttribute('d', 'M1 6l8-3 8 3 8-3v15l-8 3-8-3-8 3z');
      var p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p2.setAttribute('d', 'M9 3v15M15 6v15');
      svg.appendChild(p1); svg.appendChild(p2);
      a.appendChild(svg);

      var span = document.createElement('span');
      span.style.flex = '1';
      span.textContent = 'GIS Pro Studio';
      a.appendChild(span);

      var arrow = document.createElement('span');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.style.fontSize = '11px';
      arrow.style.opacity = '.6';
      arrow.textContent = '\u2197';
      a.appendChild(arrow);

      d.appendChild(a);
      nav.appendChild(d);
    } catch (e) {}
  }

  // Re-append if React re-renders the sidebar, and refresh the href after login.
  function watchGis() {
    try {
      var nav = document.querySelector('.desktop-sidebar nav');
      if (!nav) { setTimeout(watchGis, 500); return; }
      new MutationObserver(function () { injectGisLink(); })
        .observe(nav, { childList: true });
    } catch (e) {}
  }

  // Capture the SSO token that /auth/login returns, so the link can carry it.
  function hookGisSso() {
    if (window.__qsp_gis_sso) return;
    window.__qsp_gis_sso = true;
    try {
      var openOrig = XMLHttpRequest.prototype.open;
      var sendOrig = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (m, url) {
        try { this.__qspUrl = url; } catch (e) {}
        return openOrig.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function () {
        try {
          var self = this;
          this.addEventListener('load', function () {
            try {
              var u = String(self.__qspUrl || '');
              if (u.indexOf('/auth/login') === -1 && u.indexOf('/auth/sso/refresh') === -1) return;
              if (self.readyState !== 4 || self.status !== 200) return;
              var d = JSON.parse(self.responseText);
              if (d && d.sso_token && d.sso_token.length > 20) {
                if (localStorage.getItem(SSO_KEY) !== d.sso_token) {
                  localStorage.setItem(SSO_KEY, d.sso_token);
                  injectGisLink();
                }
              }
            } catch (e) {}
          });
        } catch (e) {}
        return sendOrig.apply(this, arguments);
      };
    } catch (e) {}
  }


  // ── Sidebar footer: Preferences + Account as proper groups ──
  // The theme buttons, sound toggle and user menu ship as loose rows with
  // tiny/faint labels. Group them like the nav sections above (same 14px
  // card, same 11px section label) without touching their behaviour.
  function sectionLabel(text) {
    var p = document.createElement('p');
    p.className = 'px-3';
    p.setAttribute('style', 'font-size:0.6875rem;font-weight:600;text-transform:uppercase;' +
      'letter-spacing:0.08em;color:hsl(var(--foreground) / 0.45);' +
      'margin-bottom:0.375rem;padding-top:0.25rem');
    p.textContent = text;
    return p;
  }

  function polishSidebarFooter() {
    try {
      var aside = document.querySelector('.desktop-sidebar');
      if (!aside) return;
      var blocks = [];
      for (var i = 0; i < aside.children.length; i++) {
        var ch = aside.children[i];
        if (ch.tagName !== 'DIV' || ch.querySelector('nav')) continue;
        blocks.push(ch);
      }
      // First footer block = theme + sound → "Preferences" group card
      var pref = null;
      for (var j = 0; j < blocks.length; j++) {
        if (blocks[j].querySelector('.theme-toggle-btn')) { pref = blocks[j]; break; }
      }
      if (pref && !pref.getAttribute('data-qsp-foot')) {
        pref.setAttribute('data-qsp-foot', 'prefs');
        pref.insertBefore(sectionLabel('Preferences'), pref.firstChild);
      }
      if (pref) {
        // Re-asserted every run: React re-renders can wipe these nodes.
        var tiny = pref.querySelectorAll('p[class*="0.625rem"]');
        for (var t = 0; t < tiny.length; t++) tiny[t].style.display = 'none';
        var spans = pref.querySelectorAll('span');
        for (var q = 0; q < spans.length; q++) {
          if ((spans[q].textContent || '').trim() === 'Sound effects') {
            spans[q].style.fontSize = '0.9375rem';
            spans[q].style.fontWeight = '500';
            spans[q].style.color = 'hsl(var(--foreground))';
            break;
          }
        }
        // Theme options read as rows, like the nav links above: icon +
        // label side by side, full-width capsules.
        var grid = pref.querySelector('.grid');
        if (grid && !grid.getAttribute('data-qsp-grid')) {
          grid.setAttribute('data-qsp-grid', '1');
          grid.style.display = 'flex';
          grid.style.flexDirection = 'column';
          grid.style.gap = '6px';
          grid.style.padding = '0';
          grid.style.background = 'none';
        }
        var btns = pref.querySelectorAll('.theme-toggle-btn');
        for (var k = 0; k < btns.length; k++) {
          (function (b) {
            var cap = b.querySelector('[data-qsp-cap]');
            if (!cap) {
              cap = document.createElement('span');
              cap.setAttribute('data-qsp-cap', '1');
              b.appendChild(cap);
            }
            cap.textContent = b.getAttribute('title') || '';
            // Individual properties only: never wipe the app's own inline
            // styles (it marks the active theme via background).
            cap.style.fontSize = '0.9375rem';
            cap.style.fontWeight = '500';
            cap.style.color = 'hsl(var(--foreground))';
            cap.style.flex = '1';
            cap.style.textAlign = 'left';
            b.style.display = 'flex';
            b.style.flexDirection = 'row';
            b.style.alignItems = 'center';
            b.style.gap = '9px';
            b.style.width = '100%';
            b.style.padding = '0.5rem 0.75rem';
            b.style.borderRadius = '11px';
            b.style.border = '1px solid hsl(var(--border)/.55)';
            if (!b.style.background || b.style.background === 'none') {
              b.style.background = 'hsl(var(--muted)/.35)';
            }
            b.style.cursor = 'pointer';
          })(btns[k]);
        }
        // Sound row gets the same capsule treatment.
        var sndSpan = null;
        var spans2 = pref.querySelectorAll('span');
        for (var w = 0; w < spans2.length; w++) {
          if ((spans2[w].textContent || '').trim() === 'Sound effects') { sndSpan = spans2[w]; break; }
        }
        var sndRow = sndSpan ? sndSpan.parentElement : null;
        if (sndRow && !sndRow.getAttribute('data-qsp-snd')) {
          sndRow.setAttribute('data-qsp-snd', '1');
          sndRow.style.display = 'flex';
          sndRow.style.alignItems = 'center';
          sndRow.style.justifyContent = 'space-between';
          sndRow.style.gap = '9px';
          sndRow.style.width = '100%';
          sndRow.style.padding = '0.5rem 0.75rem';
          sndRow.style.borderRadius = '11px';
          sndRow.style.border = '1px solid hsl(var(--border)/.55)';
          sndRow.style.background = 'hsl(var(--muted)/.35)';
          sndRow.style.marginTop = '6px';
        }
      }
      // User block → "Account" group card (menu behaviour untouched)
      var user = null;
      for (var m = 0; m < blocks.length; m++) {
        if (blocks[m].querySelector('[aria-label="User menu"]')) { user = blocks[m]; break; }
      }
      if (user && !user.getAttribute('data-qsp-foot')) {
        user.setAttribute('data-qsp-foot', 'account');
        user.insertBefore(sectionLabel('Account'), user.firstChild);
      }
    } catch (e) {}
  }

  function injectStyles() {
    if (document.getElementById('qsp-css')) return;
    var s = document.createElement('style');
    s.id = 'qsp-css';
    s.textContent = [
      // ── App chrome: Apple grouped sidebar + pinned header (all pages) ──
      '.desktop-sidebar nav>div{margin-bottom:.75rem!important;background:hsl(var(--muted)/.45)!important;border:1px solid hsl(var(--border)/.6)!important;border-radius:14px!important;padding:.5rem .375rem .625rem!important}',
      '.desktop-sidebar nav>div>p{padding-top:.25rem!important;margin-bottom:.375rem!important}',
      // Sidebar item capsules: always visible, lift on hover (active keeps green pill)
      '.desktop-sidebar nav a:not([aria-current="page"]){border:1px solid hsl(var(--border)/.55)!important;border-radius:11px!important;background:hsl(var(--muted)/.35)!important;transition:transform .18s ease,background .18s ease,box-shadow .18s ease,border-color .18s ease!important}',
      '.desktop-sidebar nav a:not([aria-current="page"]):hover{transform:translateX(3px);background:hsl(var(--muted)/.75)!important;border-color:hsl(var(--primary)/.45)!important;box-shadow:0 4px 14px rgba(0,0,0,.10)!important}',
      '.desktop-sidebar nav a:active{transform:translateX(1px) scale(.99)}',
      // Login contrast only: darker submit fill + full-opacity stats text.
      // Scoped to the password form so no other primary button changes.
      'form:has(input[type="password"]) button[type="submit"].btn-primary{background-color:#15803d!important;color:#fff!important}',
      '.dark form:has(input[type="password"]) button[type="submit"].btn-primary{background-color:hsl(var(--primary))!important;color:hsl(var(--primary-foreground))!important}',
      'div.card:has(input[type="password"]) p[style*="opacity:"]{opacity:1!important}',
      '@media(min-width:1024px){.desktop-sidebar>a[href="/"]{height:64px!important;padding-top:0!important;padding-bottom:0!important;display:flex!important;align-items:center!important}}',
      '@media(min-width:1024px){.desktop-sidebar{padding-top:56px!important}}',
      '@media(min-width:1024px){header[aria-label="Header"]{position:fixed!important;top:56px!important;right:0!important;left:280px!important;margin-left:0!important;height:64px!important;z-index:50!important}}',
      '@media(min-width:1024px){div.min-h-screen:has(>header[aria-label="Header"]) #main-content{padding-top:72px!important}}',
      '#qsp-topcover{position:fixed;top:0;left:280px;right:0;height:124px;background:hsl(var(--background));z-index:44;pointer-events:none;display:none}',
      '@media(min-width:1024px){#qsp-topcover.on{display:block}}',
      // Sidebar footer groups: same card language as the nav sections.
      '.desktop-sidebar>div[data-qsp-foot]{margin:0 .75rem .75rem!important;background:hsl(var(--muted)/.45)!important;border:1px solid hsl(var(--border)/.6)!important;border-radius:14px!important;padding:.5rem .375rem .625rem!important}',
      '.desktop-sidebar>div[data-qsp-foot] .theme-toggle-btn{border-radius:10px!important}',
      // Whole-app texture: subtle dot grid (~5% ink) over the page background.
      // Cards stay opaque, so it reads only in open space, both themes.
      'body{background-image:radial-gradient(hsl(var(--foreground)/.05) 1px,transparent 1.1px)!important;background-size:22px 22px!important}',
      // Home category cards: capsule emphasis + hover lift + clear contrast + tighter grid
      '.category-grid{gap:.625rem!important}',
      '.category-grid .subject-card{border-radius:14px!important;border:1px solid hsl(var(--border))!important;background:hsl(var(--card))!important;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease!important}',
      '.category-grid .subject-card:hover{transform:translateY(-3px);box-shadow:0 10px 24px rgba(0,0,0,.10)!important;border-color:hsl(var(--primary)/.4)!important}',
      '.category-grid .subject-card:active{transform:translateY(-1px) scale(.99)}',
      '.category-grid .subject-card [class*="title"],.category-grid .subject-card h3,.category-grid .subject-card h4{color:hsl(var(--foreground))!important;opacity:1!important}',
      '.category-grid .subject-card p,.category-grid .subject-card span{opacity:1!important}',
      // Beast armed: suppress numeric pills even against framer-motion hover (!important beats inline)
      'body.beast-home-on .qsp-num:not(#qsp-home-beast){background:hsl(var(--muted))!important;color:hsl(var(--muted-foreground))!important;border:1px solid hsl(var(--border))!important;box-shadow:none!important}',
      '.qsp-overlay{position:fixed;inset:0;z-index:99999;background:hsl(var(--background));overflow-y:auto;padding:clamp(20px,5vh,56px) clamp(16px,4vw,32px) 90px;font-family:Inter,system-ui,-apple-system,sans-serif}',
      '@media(min-width:1024px){.qsp-overlay{left:280px}}',
      '.qsp-wrap{max-width:720px;margin:0 auto}',
      '.qsp-back{display:inline-flex;align-items:center;gap:6px;background:none;border:none;color:hsl(var(--muted-foreground));font-size:13px;font-weight:600;cursor:pointer;padding:0 0 14px;font-family:inherit}',
      '.qsp-back:hover{color:hsl(var(--foreground))}',
      '.qsp-card{background:hsl(var(--card));border:1px solid hsl(var(--border));border-radius:14px;padding:clamp(20px,3vw,30px);box-shadow:0 1px 2px rgba(0,0,0,.04),0 12px 32px rgba(0,0,0,.06)}',
      '.qsp-title{font-size:19px;font-weight:700;color:hsl(var(--foreground));margin:0 0 4px;letter-spacing:-.01em}',
      '.qsp-sub{font-size:13px;color:hsl(var(--muted-foreground));margin:0 0 20px}',
      '.qsp-label{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:hsl(var(--muted-foreground));margin:0 0 8px}',
      '.qsp-pills{display:flex;gap:8px;margin-bottom:20px}',
      '.qsp-pill{flex:1;padding:11px 0;border-radius:9px;border:1px solid hsl(var(--border));background:hsl(var(--muted));color:hsl(var(--muted-foreground));font-size:13.5px;font-weight:600;cursor:pointer;transition:all .13s;font-family:inherit}',
      '.qsp-pill:hover{border-color:hsl(var(--primary) / .55);color:hsl(var(--primary))}',
      '.qsp-pill.on{background:hsl(var(--primary));border-color:hsl(var(--primary));color:hsl(var(--primary-foreground));box-shadow:0 3px 12px rgba(34,197,94,.35)}',
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
      '.qsp-select{width:100%;padding:11px 38px 11px 13px;border-radius:9px;border:1px solid hsl(var(--border));background:hsl(var(--card));color:hsl(var(--foreground));font-size:13.5px;font-family:inherit;margin-bottom:18px;appearance:none;-webkit-appearance:none;cursor:pointer;background-image:url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3e%3cpath stroke=\'%2394a3b8\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.6\' d=\'M6 8l4 4 4-4\'/%3e%3c/svg%3e");background-position:right 12px center;background-repeat:no-repeat;background-size:15px}',
      '.dark .qsp-select{background-image:url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3e%3cpath stroke=\'%23aab7a4\' stroke-width=\'1.6\' stroke-linecap=\'round\' stroke-linejoin=\'round\' d=\'M6 8l4 4 4-4\'/%3e%3c/svg%3e")}',
      '.qsp-select:focus{outline:none;border-color:hsl(var(--primary));box-shadow:0 0 0 3px rgba(34,197,94,.15)}',
      '.qsp-emoji-chip{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;background:hsl(var(--muted));font-size:.9rem;flex-shrink:0;margin-right:.55rem}',
      '.category-dropdown-item>span[style*="margin-right:"]{display:none!important}',
      '.category-dropdown-item>span:empty{display:none}',
      '.qsp-start{width:100%;padding:13px 0;border-radius:10px;border:none;font-size:14.5px;font-weight:700;cursor:pointer;background:hsl(var(--primary));color:hsl(var(--primary-foreground));transition:all .13s;font-family:inherit;box-shadow:0 3px 12px rgba(34,197,94,.3)}',
      '.qsp-start:hover{background:hsl(var(--primary) / .88)}',
      '.qsp-start:active{transform:scale(.99)}',
      '.qsp-continue{width:100%;padding:13px 14px;border-radius:10px;border:1px solid hsl(var(--primary) / .55);background:hsl(var(--primary) / .10);color:hsl(var(--primary));font-size:14px;font-weight:700;cursor:pointer;margin-bottom:12px;transition:all .13s;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 3px 12px rgba(34,197,94,.18)}',
      '.qsp-continue:hover{background:hsl(var(--primary) / .18)}',
      '.qsp-continue:active{transform:scale(.99)}',
      '.qsp-wrong{margin-top:14px;background:hsl(var(--destructive) / .08);border:1px solid hsl(var(--destructive) / .28);border-radius:10px;padding:13px 14px 14px}',
      '.qsp-wrong-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}',
      '.qsp-wrong-label{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:700;color:hsl(var(--destructive))}',
      '.qsp-wrong-time{font-size:12px;color:hsl(var(--destructive) / .72)}',
      '.qsp-wrong-btn{width:100%;padding:12px 0;border-radius:9px;border:none;font-size:13.5px;font-weight:700;cursor:pointer;color:#fff;background:linear-gradient(135deg,#ef4444 0%,#ea580c 100%);box-shadow:0 3px 12px rgba(239,68,68,.3);transition:all .13s;font-family:inherit}',
      '.qsp-wrong-btn:hover{filter:brightness(1.05)}',
      '.qsp-wrong-btn:active{transform:scale(.99)}',
      '.qsp-loading{text-align:center;padding:36px 0;color:hsl(var(--muted-foreground));font-size:13px}',
      '.qsp-spin{width:28px;height:28px;border:3px solid hsl(var(--border));border-top-color:hsl(var(--primary));border-radius:50%;animation:qsp-spin .65s linear infinite;margin:0 auto 10px}',
      '@keyframes qsp-spin{to{transform:rotate(360deg)}}'
    ].join('');
    document.head.appendChild(s);
  }

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Keyword fallback emoji (admin map wins when present) ──
  var emojiMap = {};
  function guessEmoji(name) {
    var n = String(name).toLowerCase();
    if (/[\u0900-\u097F]/.test(name)) return '📜';
    if (n.indexOf('silv') !== -1 || n.indexOf('silk') !== -1 || n.indexOf('nursery') !== -1) return '🌱';
    if (n.indexOf('bio') !== -1 || n.indexOf('eco') !== -1) return '🌿';
    if (n.indexOf('wild') !== -1) return '🦌';
    if (n.indexOf('soil') !== -1 || n.indexOf('watershed') !== -1) return '🏔️';
    if (n.indexOf('practice') !== -1 || n.indexOf('mock') !== -1 || n.indexOf('model set') !== -1) return '📝';
    if (n.indexOf('law') !== -1 || n.indexOf('policy') !== -1 || n.indexOf('act') !== -1) return '⚖️';
    if (n.indexOf('survey') !== -1 || n.indexOf('mensuration') !== -1 || n.indexOf('research') !== -1 || n.indexOf('stat') !== -1) return '📊';
    if (n.indexOf('utilization') !== -1 || n.indexOf('timber') !== -1 || n.indexOf('engineer') !== -1) return '🪵';
    if (n.indexOf('fire') !== -1 || n.indexOf('protect') !== -1) return '🔥';
    if (n.indexOf('ranger') !== -1) return '🎖️';
    if (n.indexOf('officer') !== -1 || n.indexOf('admin') !== -1) return '🏛️';
    if (n.indexOf('guard') !== -1 || n.indexOf('rakshak') !== -1) return '🛡️';
    if (n.indexOf('gk') !== -1 || n.indexOf('general') !== -1) return '🧠';
    if (n.indexOf('iq') !== -1 || n.indexOf('aptitude') !== -1) return '🧩';
    if (n.indexOf('forest') !== -1) return '🌲';
    return '📚';
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
    if (btn.dataset.baseCss === undefined) btn.dataset.baseCss = btn.style.cssText;
    fxCleanup(btn);
    btn.classList.add('on');
    // Explicit inline colors (copied base cssText would otherwise win over classes)
    btn.style.background = '#22c55e';
    btn.style.color = '#fff';
    btn.style.border = '1px solid #22c55e';
    btn.style.boxShadow = '0 4px 14px rgba(34,197,94,.4)';
    btn.innerHTML = '<span aria-hidden="true">&#x1f525;</span> <span class="qsp-beast-t">BEAST</span>';
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
    if (btn.dataset.baseCss !== undefined) btn.style.cssText = btn.dataset.baseCss;
    btn.innerHTML = '<span aria-hidden="true">&#x1f525;</span> <span class="qsp-beast-t">Beast</span>';
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

  function buildHTML(total, cats, wrongCount, resume, offlineNote) {
    var pills = [10, 20, 50, 100].map(function (n) {
      return '<button type="button" class="qsp-pill' + (n === 10 ? ' on' : '') + '" data-n="' + n + '">' + n + '</button>';
    }).join('') + '<button type="button" class="qsp-pill" id="qsp-beast" data-n="beast" style="white-space:nowrap;overflow:hidden;" title="Beast Mode — practice ALL questions: full bank or whole category"><span aria-hidden="true">&#x1f525;</span> <span class="qsp-beast-t">Beast</span></button>';
    var opts = '<option value="">🗂️ All Categories</option>' + cats.map(function (c) {
      var em = (emojiMap && emojiMap[c]) || guessEmoji(c);
      return '<option value="' + esc(c) + '">' + esc(em + ' ' + c) + '</option>';
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
      (offlineNote
        ? '<p class="qsp-sub" style="margin-top:-12px">📴 Offline — using downloaded pack</p>'
        : '') +
      (resume
        ? '<button type="button" class="qsp-continue" id="qsp-continue"><span aria-hidden="true">&#x25b6;</span> Continue — Question ' + resume.index + ' of ' + resume.total + '</button>'
        : '') +
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

  // Snapshot the resume state at menu-open (deterministic — no race with the app).
  function showSetup(resume) {
    if (document.querySelector('.qsp-overlay')) return;
    injectStyles();
    // Wiper only on a FRESH menu: anything saved while it is open is
    // auto-start residue from the app underneath. With a resume snapshot
    // present the app restores the same quiz, so leave storage alone.
    if (!resume) startWiper();

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
      fetch('/questions/count/').then(function (r) { if (!r.ok) throw 0; return r.json(); }).catch(function () { return null; }),
      fetch('/questions/categories/').then(function (r) { if (!r.ok) throw 0; return r.json(); }).catch(function () { return null; }),
      fetch('/questions/category-meta').then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) { emojiMap = (d && d.emoji) || {}; }).catch(function () {}),
      fetch('/quiz/wrong-queue/' + encodeURIComponent(userId)).then(function (r) { if (!r.ok) throw 0; return r.json(); }).catch(function () { return { questions: [], count: 0 }; })
    ]).then(function (res) {
      if (!document.body.contains(overlay)) return;
      var renderMenu = function (total, cats, wq, offlineNote) {

      var wQuestions = wq.questions || [];
      var wc = (typeof wq.count === 'number') ? wq.count : wQuestions.length;
      wrongIds = wQuestions.map(function (q) { return q.id; }).filter(function (id) { return id != null; });

      overlay.innerHTML = buildHTML(total, cats, wc, resume, offlineNote);
      var card = overlay.firstChild;

      var cont = card.querySelector('#qsp-continue');
      if (cont) cont.addEventListener('click', function () {
        stopWiper();
        try { sessionStorage.setItem('qsp_continue', '1'); } catch (e) {}
        window.location.reload();
      });

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
        stopWiper();
        removeOverlay();
        window.history.back();
      });
      };
      // Data source: live API, or the downloaded pack when offline with no cache
      var wq0 = res[3] || {};
      var t0 = (res[0] && res[0].count) || 0;
      var c0 = sortCategories(res[1] || []);
      if ((!t0 || !c0.length) && navigator.onLine === false) {
        packStatus().then(function (pack) {
          if (!document.body.contains(overlay)) return;
          if (!pack) { renderMenu(0, [], { questions: [], count: 0 }, true); return; }
          idbOpen().then(function (db) {
            return idbReq(db.transaction(['kv'], 'readonly').objectStore('kv').get('bank')).then(function (rec) {
              db.close();
              var bank = (rec && rec.questions) || [];
              var cc = {};
              bank.forEach(function (q) { if (q.category) cc[q.category] = (cc[q.category] || 0) + 1; });
              renderMenu(bank.length, sortCategories(Object.keys(cc)), { questions: [], count: 0 }, true);
            });
          }).catch(function () { renderMenu(0, [], { questions: [], count: 0 }, true); });
        }).catch(function () { renderMenu(0, [], { questions: [], count: 0 }, true); });
      } else {
        renderMenu(t0, c0, wq0, false);
      }
    }).catch(function () {
      if (!document.body.contains(overlay)) return;
      overlay.innerHTML = '<div class="qsp-wrap"><div class="qsp-card"><div class="qsp-loading"><p>Failed to load quiz data.</p><button type="button" class="qsp-start" style="max-width:170px;margin:14px auto 0" onclick="location.reload()">Retry</button></div></div></div>';
    });
  }

  // Entry: /quiz with no options ALWAYS opens the menu (never auto-starts).
  // A mid-quiz save becomes an explicit Continue choice, never a forced resume.
  function enterQuizMenu() {
    if (!isQuizRoute() || hasQuizParams()) { removeOverlay(); stopWiper(); return; }
    if (document.querySelector('.qsp-overlay')) return;
    var resume = getSavedQuiz();
    showSetup(resume ? {
      index: (resume.currentIndex || 0) + 1,
      total: resume.questions.length,
    } : null);
  }

  function check() {
    enterQuizMenu();
    try { enhanceHomeCard(); } catch (e) {}
    try { ensureTopcover(); } catch (e) {}
    try { alignHero(); } catch (e) {}
    try { enhancePackCard(); } catch (e) {}
    try { paintOffbar(); } catch (e) {}
    try { enhanceResultsNote(); } catch (e) {}
  }

  // Results page: note when offline results are still queued
  function enhanceResultsNote() {
    try {
      if (location.pathname !== '/results' && location.pathname !== '/desktop/results') return;
      if (document.querySelector('#qsp-offnote')) return;
      outboxCount().then(function (n) {
        if (!n || document.querySelector('#qsp-offnote')) return;
        var main = document.querySelector('#main-content') || document.body;
        var d = document.createElement('div');
        d.id = 'qsp-offnote';
        d.setAttribute('role', 'status');
        d.style.cssText = 'margin:0 5% 12px;padding:11px 16px;border-radius:10px;border:1px solid hsl(var(--primary)/.4);background:hsl(var(--primary)/.07);font-size:.82rem;font-weight:600;font-family:Inter,system-ui,sans-serif;';
        d.textContent = '📴 ' + n + ' offline result' + (n > 1 ? 's' : '') + ' saved on this device — will sync automatically when you reconnect.';
        var ref = main.firstChild;
        if (ref) main.insertBefore(d, ref);
        else main.appendChild(d);
      }).catch(function () {});
    } catch (e) {}
  }

  // Mutation bursts (React mounting can emit hundreds) must not each run
  // the full enhancement pass: coalesce into one trailing run so the main
  // thread never wedges under a storm of observer callbacks.
  var enhanceTimer = null;
  function scheduleEnhance() {
    if (enhanceTimer) return;
    enhanceTimer = setTimeout(function () {
      enhanceTimer = null;
      try { enhanceHomeCard(); } catch (e) {}
      try { injectGisLink(); polishSidebarFooter(); } catch (e) {}
    }, 120);
  }

  function hookNav() {
    if (window.__qsp_hooked) return;
    window.__qsp_hooked = true;
    try {
      var origPush = history.pushState;
      history.pushState = function () {
        var r = origPush.apply(this, arguments);
        setTimeout(check, 60);
        setTimeout(function () { try { injectGisLink(); } catch (e) {} }, 80);
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
        // Coalesced (see scheduleEnhance): a burst of mutations schedules a
        // single pass instead of running the full DOM work per mutation.
        scheduleEnhance();
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
    if (!isHomeRoute()) { homeBeast = false; homeCat = ''; try { document.body.classList.remove('beast-home-on'); } catch (e) {} return; }
    try { sortHomeGrid(); } catch (e) {}
    var sec = document.querySelector('section[aria-label="Practice session setup"]');
    if (!sec) return;
    try { enhanceHomeDropdown(sec); } catch (e) {}
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
      try { b.classList.add('qsp-num'); } catch (e) {}
      b.addEventListener('click', function () {
        homeBeast = false;
        try { document.body.classList.remove('beast-home-on'); } catch (e) {}
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
      bp.className = 'qsp-pill'; // base class so .on / hover rules apply
      bp.style.cssText = ref.style.cssText + ';flex:1;font-weight:700;white-space:nowrap;overflow:hidden;';
      bp.style.fontSize = '0.8125rem';
      bp.style.color = 'hsl(var(--muted-foreground))';
      bp.innerHTML = '<span aria-hidden="true">&#x1f525;</span> <span class="qsp-beast-t">Beast</span>';
      bp.addEventListener('click', function () {
        homeBeast = true;
        try { document.body.classList.add('beast-home-on'); } catch (e) {}
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

  // A–Z with Devanagari last (compare key, not display text).
  function catSortKey(name) {
    var t = String(name || '').trim();
    var dev = /[\u0900-\u097F]/.test(t) ? '1' : '0';
    return dev + '|' + t.toLowerCase();
  }

  // Home category dropdown: emoji chips + A–Z order (All Categories first).
  function cleanItemName(it) {
    try {
      var clone = it.cloneNode(true);
      var chips = clone.querySelectorAll('.qsp-emoji-chip');
      for (var i = 0; i < chips.length; i++) chips[i].remove();
      return (clone.textContent || '').trim();
    } catch (e) { return (it.textContent || '').trim(); }
  }
  function enhanceHomeDropdown(sec) {
    try {
      var items = sec.querySelectorAll('.category-dropdown-item');
      if (!items.length) return;
      Array.prototype.forEach.call(items, function (it) {
        // Name = text minus any chips (React's own icon span is CSS-hidden, ignore it)
        var probe = it.cloneNode(true);
        var pch = probe.querySelectorAll('.qsp-emoji-chip');
        for (var k = 0; k < pch.length; k++) pch[k].remove();
        var raw = (probe.textContent || '').trim();
        // strip a leading React emoji if present
        var m = raw.match(/^((?:\p{Extended_Pictographic}\uFE0F?|\u200D|\s)+)(.*)$/u);
        if (m) raw = (m[2] || '').trim();
        var em = raw === 'All Categories' ? '🗂️' : ((emojiMap && emojiMap[raw]) || guessEmoji(raw));
        var have = it.querySelectorAll('.qsp-emoji-chip');
        if (have.length === 1 && have[0].textContent === em && it.dataset.ename === raw) return; // steady: zero writes
        it.dataset.ename = raw;
        for (var j = 0; j < have.length; j++) have[j].remove();
        var chip = document.createElement('span');
        chip.setAttribute('aria-hidden', 'true');
        chip.className = 'qsp-emoji-chip';
        chip.textContent = em;
        it.insertBefore(chip, it.firstChild);
      });
      var list = items[0].parentElement;
      var sig = Array.prototype.map.call(items, function (it) { return it.dataset.ename; }).join('~');
      if (list.dataset.sorted === sig) return;
      var arr = Array.prototype.slice.call(items);
      arr.sort(function (x, y) {
        var a = x.dataset.ename, b = y.dataset.ename;
        if (a === 'All Categories') return -1;
        if (b === 'All Categories') return 1;
        var ka = catSortKey(a), kb = catSortKey(b);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
      Array.prototype.forEach.call(arr, function (it) { list.appendChild(it); });
      list.dataset.sorted = sig;
    } catch (e) {}
  }

  // Home category grid: A–Z order (Devanagari last), capsules via CSS.
  function sortHomeGrid() {
    try {
      var grid = document.querySelector('.category-grid');
      if (!grid) return;
      var cards = grid.querySelectorAll(':scope > .subject-card');
      if (cards.length < 2) return;
      var names = Array.prototype.map.call(cards, function (c) {
        var t = (c.textContent || '').replace(/\d[\d,]*\s*questions?\s*/ig, '').replace(/^[^\p{L}]+/u, '').trim();
        return t;
      });
      var keys = names.map(catSortKey);
      var ordered = true;
      for (var i = 1; i < keys.length; i++) { if (keys[i - 1] > keys[i]) { ordered = false; break; } }
      if (ordered) { grid.dataset.sorted = '1'; return; }
      if (grid.dataset.sorted === '1') return;
      var arr = Array.prototype.map.call(cards, function (c, i) { return { el: c, k: keys[i] }; });
      arr.sort(function (x, y) { return x.k < y.k ? -1 : x.k > y.k ? 1 : 0; });
      Array.prototype.forEach.call(arr, function (o) { grid.appendChild(o.el); });
      grid.dataset.sorted = '1';
    } catch (e) {}
  }

  function paintHomeBeast() {
    var bp = document.querySelector('#qsp-home-beast');
    if (homeBeast) beastFXOn(bp);
    else {
      beastFXOff(bp);
      try { document.body.classList.remove('beast-home-on'); } catch (e) {}
    }
    if (bp && bp.getAttribute('aria-pressed') !== String(homeBeast)) {
      bp.setAttribute('aria-pressed', homeBeast ? 'true' : 'false');
    }
  }

  // ── Offline: SW registration, status bar, outbox sync, pack card ──
  function registerSW() {
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(function () {});
        // Prime runtime cache with this page's assets (worker may have
        // installed after they first loaded) so offline works first try.
        setTimeout(function () {
          try {
            if (!('caches' in window)) return;
            var urls = [location.href];
            var nodes = document.querySelectorAll('script[src], link[rel="stylesheet"]');
            for (var i = 0; i < nodes.length; i++) {
              var u = nodes[i].src || nodes[i].href;
              if (u && u.indexOf(location.origin) === 0) urls.push(u);
            }
            caches.open('forestry-v4').then(function (cache) {
              urls.forEach(function (u) {
                cache.match(u).then(function (hit) {
                  if (!hit) cache.add(u).catch(function () {});
                });
              });
            }).catch(function () {});
          } catch (e) {}
        }, 3000);
      }
    } catch (e) {}
  }

  function idbOpen() {
    return new Promise(function (resolve, reject) {
      try {
        var r = indexedDB.open('forestry-offline', 1);
        r.onupgradeneeded = function () {
          var db = r.result;
          if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
          if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
        };
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
      } catch (e) { reject(e); }
    });
  }

  function idbReq(r) {
    return new Promise(function (resolve, reject) {
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }

  function outboxCount() {
    return idbOpen().then(function (db) {
      return idbReq(db.transaction(['outbox'], 'readonly').objectStore('outbox').getAll()).then(function (all) {
        db.close();
        return (all || []).length;
      });
    }).catch(function () { return 0; });
  }

  function syncOutbox() {
    return idbOpen().then(function (db) {
      return idbReq(db.transaction(['outbox'], 'readonly').objectStore('outbox').getAll()).then(function (items) {
        db.close();
        var chain = Promise.resolve(0);
        (items || []).forEach(function (it) {
          chain = chain.then(function (n) {
            return fetch('/quiz/submit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ answers: it.answers, username: it.username }),
            }).then(function (r) {
              if (!r.ok) throw 0;
              var ids = Object.keys(it.answers || {}).map(function (k) { return +k || k; });
              return clearQueueFor(ids, it.username).then(function () {
                return idbOpen().then(function (db2) {
                  return idbReq(db2.transaction(['outbox'], 'readwrite').objectStore('outbox').delete(it.id)).then(function () {
                    db2.close();
                    return n + 1;
                  });
                });
              });
            });
          });
        });
        return chain;
      });
    });
  }

  function packStatus() {
    return idbOpen().then(function (db) {
      return idbReq(db.transaction(['kv'], 'readonly').objectStore('kv').get('bank')).then(function (rec) {
        db.close();
        if (rec && rec.questions && rec.questions.length) return { total: rec.questions.length, savedAt: rec.savedAt || 0 };
        return null;
      });
    }).catch(function () { return null; });
  }

  function paintOffbar() {
    var bar = document.querySelector('#qsp-offbar');
    if (!bar) return;
    var online = navigator.onLine !== false;
    outboxCount().then(function (n) {
      packStatus().then(function (pack) {
        if (!document.body.contains(bar)) return;
        if (online && n === 0) { bar.style.display = 'none'; return; }
        bar.style.display = 'flex';
        bar.style.cursor = online && n > 0 ? 'pointer' : 'default';
        bar.title = online && n > 0 ? 'Tap to sync now' : '';
        bar.innerHTML = '<span aria-hidden="true">' + (online ? '🔄' : '📴') + '</span><span>' +
          (!online
            ? (pack ? 'Offline — practicing from downloaded pack' : 'Offline — connect to download practice pack')
            : ('Syncing ' + n + ' offline result' + (n > 1 ? 's' : '') + '… tap to retry')) + '</span>';
      });
    });
  }

  function trySyncNow() {
    if (navigator.onLine === false) return;
    outboxCount().then(function (n) {
      if (!n) { paintOffbar(); return; }
      syncOutbox().then(function (synced) {
        paintOffbar();
        if (synced > 0) showOffToast('Synced ' + synced + ' offline quiz' + (synced > 1 ? 'zes' : ''));
      }).catch(function () { paintOffbar(); });
    });
  }

  function clearQueueFor(ids, username) {
    if (!ids || !ids.length) return Promise.resolve();
    return fetch('/quiz/wrong-queue/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_identifier: username, question_ids: ids }),
    }).catch(function () {}).then(function () {});
  }

  function injectOffbarCSS() {
    if (document.getElementById('qsp-offcss')) return;
    var s = document.createElement('style');
    s.id = 'qsp-offcss';
    s.textContent = [
      '#qsp-offbar{position:fixed;bottom:76px;left:50%;transform:translateX(-50%);z-index:99990;display:flex;align-items:center;gap:8px;padding:9px 16px;border-radius:999px;font-size:.78rem;font-weight:600;background:#1c1917;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.25);font-family:Inter,system-ui,sans-serif;white-space:nowrap}',
      '#qsp-offtoast{position:fixed;bottom:124px;left:50%;transform:translateX(-50%);z-index:99991;background:hsl(152 55% 45%);color:#fff;font-size:.8rem;font-weight:600;padding:10px 18px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.25);font-family:Inter,system-ui,sans-serif}',
      '#qsp-packcard{background:#fff;border:1px solid #e5e9e5;border-radius:14px;padding:20px;box-shadow:0 1px 2px rgba(0,0,0,.04);margin-bottom:20px;font-family:Inter,system-ui,sans-serif}',
      '#qsp-packcard h3{font-size:15px;font-weight:700;color:#101813;margin:0 0 4px}',
      '#qsp-packcard p{font-size:13px;color:#6b7686;margin:0 0 12px;line-height:1.5}',
      '#qsp-packcard .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
      '#qsp-packbtn{background:#22c55e;color:#fff;border:none;border-radius:9px;padding:9px 18px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit}',
      '#qsp-packbtn:disabled{opacity:.6;cursor:wait}',
      '#qsp-packdel{background:none;border:1px solid #e2e8e2;border-radius:9px;padding:9px 14px;font-size:13px;font-weight:600;color:#5b6672;cursor:pointer;font-family:inherit}',
      '#qsp-packmsg{font-size:12px;color:#8a94a0;margin:8px 0 0}'
    ].join('');
    document.head.appendChild(s);
  }

  function showOffToast(msg) {
    try {
      var old = document.querySelector('#qsp-offtoast');
      if (old) old.remove();
      var t = document.createElement('div');
      t.id = 'qsp-offtoast';
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(function () { if (t.parentElement) t.remove(); }, 2000);
    } catch (e) {}
  }

  function initOffline() {
    if (document.querySelector('#qsp-offbar')) return;
    injectOffbarCSS();
    // Silent auto-download: bank arrives in small pages (~1200 questions,
    // well under 0.5MB each) with a pause between them, so scrolling and
    // animations never stutter. Skipped when offline, on metered
    // connections, or when the pack is fresh.
    function yieldToBrowser(done) {
      try {
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(function () { done(); }, { timeout: 1500 });
          return;
        }
      } catch (e) {}
      setTimeout(done, 0);
    }
    function saveBank(qs) {
      return idbOpen().then(function (db) {
        return idbReq(db.transaction(['kv'], 'readwrite').objectStore('kv').put({
          k: 'bank', questions: qs, savedAt: Date.now(), total: qs.length
        })).then(function () { db.close(); });
      });
    }
    function downloadPaged(total, onDone) {
      var PAGE = 1200, all = [], skip = 0;
      function next() {
        if (navigator.onLine === false) return; // went offline mid-download
        if (skip >= total) {
          if (all.length) saveBank(all).then(function () { paintOffbar(); if (onDone) onDone(); }).catch(function () {});
          return;
        }
        fetch('/questions/?skip=' + skip + '&limit=' + Math.min(PAGE, total - skip)).then(function (r) {
          if (!r.ok) throw 0;
          return r.json();
        }).then(function (qs) {
          if (!qs || !qs.length) {
            if (all.length) saveBank(all).then(function () { paintOffbar(); }).catch(function () {});
            return;
          }
          for (var i = 0; i < qs.length; i++) all.push(qs[i]);
          skip += qs.length;
          yieldToBrowser(function () { setTimeout(next, 650); });
        }).catch(function () {});
      }
      next();
    }
    try {
      var saveData = false;
      try {
        var conn = navigator.connection;
        saveData = !!(conn && (conn.saveData || /^(slow-2g|2g)$/.test(conn.effectiveType || '')));
      } catch (e) {}
      if (navigator.onLine !== false && !saveData) {
        packStatus().then(function (pack) {
          fetch('/questions/count/').then(function (r) { return r.json(); }).then(function (d) {
            var total = (d && d.count) || 0;
            var fresh = pack && (Date.now() - pack.savedAt) < 7 * 86400000;
            if (fresh && total === pack.total) return; // up to date
            if (!total) return;
            downloadPaged(total, function () { showOffToast('Offline pack ready — practice works without internet'); });
          }).catch(function () {});
        }).catch(function () {});
      }
    } catch (e) {}
    var bar = document.createElement('div');
    bar.id = 'qsp-offbar';
    bar.setAttribute('role', 'status');
    bar.style.display = 'none';
    bar.addEventListener('click', function () { trySyncNow(); });
    document.body.appendChild(bar);
    paintOffbar();
    window.addEventListener('online', function () {
      paintOffbar();
      trySyncNow();
    });
    window.addEventListener('offline', function () {
      paintOffbar();
      showOffToast('You are offline — practicing from the downloaded pack');
    });
    setInterval(function () { paintOffbar(); trySyncNow(); }, 15000);
  }

  // Home pack card (desktop).
  //
  // Retired: the question bank now downloads automatically on first visit and
  // a 2s toast reports it, so a manual Download / Update / Delete card on the
  // home page is redundant. Kept as a no-op so existing call sites stay valid,
  // and it defensively removes the node if a cached copy is still in the DOM.
  function enhancePackCard() {
    try {
      var stale = document.querySelector('#qsp-packcard');
      if (stale && stale.parentElement) stale.parentElement.removeChild(stale);
      if (true) return;
      if (!isHomeRoute() || document.querySelector('#qsp-packcard')) return;
      var sec = document.querySelector('section[aria-label="Practice session setup"]');
      if (!sec) return;
      var card = document.createElement('div');
      card.id = 'qsp-packcard';
      card.innerHTML = '<h3>📴 Offline Practice</h3><p id="qsp-packmsg">Checking…</p>' +
        '<div class="row"><button type="button" id="qsp-packbtn">Download pack</button>' +
        '<button type="button" id="qsp-packdel" style="display:none">Delete</button></div>';
      sec.parentElement.insertBefore(card, sec.nextSibling);
      var msg = card.querySelector('#qsp-packmsg');
      var btn = card.querySelector('#qsp-packbtn');
      var del = card.querySelector('#qsp-packdel');
      function refresh() {
        packStatus().then(function (pack) {
          if (!document.body.contains(card)) return;
          if (pack) {
            var d = pack.savedAt ? ' · updated ' + new Date(pack.savedAt).toLocaleDateString() : '';
            msg.textContent = pack.total.toLocaleString() + ' questions saved' + d + '. Quizzes, Beast Mode and results work offline; scores sync on reconnect.';
            btn.textContent = 'Update pack';
            del.style.display = '';
          } else {
            msg.textContent = 'Download the bank once, then practice anywhere — no internet needed.';
            btn.textContent = 'Download pack';
            del.style.display = 'none';
          }
        });
        outboxCount().then(function (n) {
          if (n > 0 && document.body.contains(card)) msg.textContent += ' ' + n + ' result' + (n > 1 ? 's' : '') + ' waiting to sync.';
        });
      }
      refresh();
      btn.addEventListener('click', function () {
        btn.disabled = true;
        msg.textContent = 'Downloading questions…';
        fetch('/questions/?limit=10000').then(function (r) {
          if (!r.ok) throw 0;
          return r.json();
        }).then(function (qs) {
          msg.textContent = 'Saving…';
          return idbOpen().then(function (db) {
            return idbReq(db.transaction(['kv'], 'readwrite').objectStore('kv').put({
              k: 'bank', questions: qs, savedAt: Date.now(), total: qs.length
            })).then(function () { db.close(); return qs.length; });
          });
        }).then(function (n) {
          btn.disabled = false;
          msg.textContent = 'Saved ' + n.toLocaleString() + ' questions for offline practice.';
          paintOffbar();
          refresh();
        }).catch(function () {
          btn.disabled = false;
          msg.textContent = 'Download failed — check connection and retry.';
        });
      });
      del.addEventListener('click', function () {
        idbOpen().then(function (db) {
          return idbReq(db.transaction(['kv'], 'readwrite').objectStore('kv').delete('bank')).then(function () { db.close(); });
        }).then(refresh).catch(refresh);
      });
    } catch (e) {}
  }

  // ── Solid backdrop above the pinned header (hides scrolled content) ──
  function ensureTopcover() {
    try {
      if (!document.querySelector('#qsp-topcover')) {
        var d = document.createElement('div');
        d.id = 'qsp-topcover';
        d.setAttribute('aria-hidden', 'true');
        document.body.appendChild(d);
      }
      var on = window.innerWidth >= 1024 && !!document.querySelector('header[aria-label="Header"]');
      document.querySelector('#qsp-topcover').classList.toggle('on', on);
    } catch (e) {}
  }

  // ── Align home hero top with the sidebar LEARN label (runtime measured) ──
  function alignHero() {
    try {
      if (window.innerWidth < 1024) return;
      var p = location.pathname;
      if (p !== '/' && p !== '/desktop' && p !== '/desktop/') return;
      var learn = null;
      var ps = document.querySelectorAll('.desktop-sidebar p');
      for (var i = 0; i < ps.length; i++) {
        if ((ps[i].textContent || '').trim() === 'LEARN') { learn = ps[i]; break; }
      }
      var hero = null;
      var secs = document.querySelectorAll('main section');
      for (var j = 0; j < secs.length; j++) {
        if (/Welcome back/.test(secs[j].textContent || '')) { hero = secs[j]; break; }
      }
      var main = document.querySelector('#main-content');
      if (!learn || !hero || !main) return;
      var delta = hero.getBoundingClientRect().top - learn.getBoundingClientRect().top;
      if (Math.abs(delta) < 4) return;
      var cur = parseFloat(getComputedStyle(main).paddingTop) || 0;
      var next = cur - delta;
      // Never let content slide under the fixed header (ends at y=120)
      if (hero.getBoundingClientRect().top - delta < 124) {
        next = cur - (hero.getBoundingClientRect().top - 124);
      }
      if (next < 0) next = 0;
      if (next > 400) return;
      main.style.setProperty('padding-top', next + 'px', 'important');
    } catch (e) {}
  }

  function init() {
    hookNav();
    try { injectStyles(); } catch (e) {} // sidebar groups + pinned header on every page
    try { injectGisLink(); watchGis(); hookGisSso(); } catch (e) {} // Apps > GIS Pro Studio
    try { polishSidebarFooter(); } catch (e) {}
    try { ensureTopcover(); } catch (e) {}
    try { registerSW(); } catch (e) {}
    try { initOffline(); } catch (e) {}
    try { alignHero(); } catch (e) {}
    setTimeout(function () { try { alignHero(); } catch (e) {} }, 1500);
    setTimeout(function () { try { alignHero(); ensureTopcover(); } catch (e) {} }, 3500);
    try {
      var rT = null;
      window.addEventListener('resize', function () {
        if (rT) clearTimeout(rT);
        rT = setTimeout(function () { try { alignHero(); ensureTopcover(); } catch (e) {} }, 250);
      });
    } catch (e) {}
    // Admin emoji map for every page (dropdown chips), refreshed silently
    try {
      fetch('/questions/category-meta')
        .then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (d) {
          emojiMap = (d && d.emoji) || {};
          // Meta may arrive after chips rendered with guesses → rebuild them once
          try {
            var olds = document.querySelectorAll('.qsp-emoji-chip');
            for (var i = 0; i < olds.length; i++) olds[i].remove();
            enhanceHomeCard();
          } catch (e) {}
        })
        .catch(function () {});
    } catch (e) {}
    // Continue flow: user chose resume → skip the menu once, let the app restore.
    try {
      if (sessionStorage.getItem('qsp_continue') === '1') {
        sessionStorage.removeItem('qsp_continue');
        try { enhanceHomeCard(); } catch (e) {}
        return;
      }
    } catch (e) {}
    check();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
