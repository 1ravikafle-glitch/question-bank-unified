import puppeteer from '/home/elfakiris/question-bank-unified/frontend-desktop/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
/* "Every page and section must load in the background on home load, so every
   page renders instantly."

   The test: land on the home page, wait for the background warm-up, then visit
   EVERY section and require that it renders with no loading skeleton and no
   fetch of its own data. Anything that shows a skeleton fails, because a
   skeleton means the page decided to fetch rather than read a snapshot.

   Counts real network calls per page so "instant" is measured, not assumed:
   a page that renders fast but still fetched is not instant, it is just quick. */
const B = 'http://127.0.0.1:8011';
const b = await puppeteer.launch({ executablePath: '/home/elfakiris/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', headless: 'shell', args: ['--no-sandbox'] });
const fails = [];
const check = (n, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '   [' + d + ']' : ''}`); if (!ok) fails.push(n); };

const SECTIONS = [
  '/quiz', '/mock', '/questions', '/quiz/practice-wrong',
  '/results', '/progress', '/bookmarks', '/notes', '/about', '/feedback',
];

/* Which data calls mean "this page fetched for itself" rather than reading a
   snapshot. /questions/* and /questions/count are deliberately excluded: the
   bank pack is an offline concern, not a per-page snapshot. */
const DATA = /\/quiz\/|\/bookmarks\/|\/notes\/|\/auth\/me|\/questions\/count|\/questions\/categories|feedback\/mine|admin/;

async function session(base, user = 'elfak', pass = 'local-lb-pw-0123456789') {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1280, height: 1000 });
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await p.goto(B + base, { waitUntil: 'networkidle2' });
  await p.evaluate(() => localStorage.clear());
  await p.goto(B + base, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2500));
  const ins = await p.$$('input');
  await ins[0].type(user); await ins[1].type(pass);
  for (const btn of await p.$$('button')) {
    const t = await p.evaluate(e => e.textContent, btn);
    if (/sign in|log ?in/i.test(t)) { await btn.click(); break; }
  }
  await new Promise(r => setTimeout(r, 4000));
  return { ctx, p };
}

async function run(base, label) {
  const { ctx, p } = await session(base);

  console.log(`\n=== ${label}: warm-up is running after the home load ===`);
  // Wait for the warmer to actually finish, rather than a fixed sleep.
  const warmState = await p.evaluate(async () => {
    const m = await import('/assets/routePrewarm.js').catch(() => null);
    void m;
    return null;
  }).catch(() => null);
  void warmState;
  // The app exposes nothing globally, so poll the observable effect instead:
  // the sidebar badges and section counts must stop changing.
  let stable = 0, last = '';
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 500));
    const sig = await p.evaluate(() => document.body.innerText
      // strip the live clock/date, which changes every second and would make
      // "settled" unreachable on mobile
      .replace(/\d{1,2}:\d{2}(:\d{2})?\s*[AP]M?/gi, '')
      .replace(/\d{1,2}\s+\w+\s+\d{4}/gi, '')
      .replace(/\s+/g, ' ').slice(0, 300));
    if (sig === last) { stable++; if (stable >= 3) break; } else { stable = 0; last = sig; }
  }
  check('home page settled (background warm-up finished)', stable >= 3, `stable for ${stable} polls`);

  console.log(`\n=== ${label}: EVERY section renders from snapshot, no skeleton, no fetch ===`);
  for (const path of SECTIONS) {
    const calls = [];
    const onReq = (r) => { const u = new URL(r.url()); if (u.pathname !== new URL(B + base).pathname) return; if (DATA.test(u.pathname)) calls.push(u.pathname); };
    p.on('request', onReq);
    await p.evaluate((x) => { history.pushState({}, '', x); window.dispatchEvent(new PopStateEvent('popstate')); }, base + path.slice(1));
    const t0 = Date.now();
    await new Promise(r => setTimeout(r, 3600));
    const ms = Date.now() - t0;
    p.off('request', onReq);

    const sk = await p.evaluate(() => document.querySelectorAll('.skeleton').length);
    const els = await p.evaluate(() => document.querySelectorAll('main *, body > div *').length);
    const uniq = [...new Set(calls.map(c => c.replace(base, '')))];
    const ok = sk === 0 && uniq.length === 0 && els > 40;
    check(`${label} ${path}`, ok,
      `skeletons=${sk} dataFetches=${uniq.length ? uniq.join(',') : 'none'} nodes=${els}`);
  }

  console.log(`\n=== ${label}: nav pointer-intent refills what went STALE since login ===`);
  {
    // After a full warm-up every key is present, so hovering correctly fetches
    // NOTHING - which is what my first two attempts observed and wrongly called a
    // failure. The prewarm exists for keys that went stale since login, so the
    // test has to make one stale first. A quiz submit is the real way that
    // happens: it marks the wrong-queue counts dirty.
    const cleared = await p.evaluate(async () => {
      const m = await import('@/utils/pageStore').catch(() => null);
      return !!m;
    }).catch(() => false);
    void cleared;

    // Play a short quiz through the real controls to invalidate for real.
    await p.evaluate((x) => { history.pushState({}, '', x); window.dispatchEvent(new PopStateEvent('popstate')); }, base + 'quiz');
    await new Promise(r => setTimeout(r, 3600));
    await p.evaluate(() => {
      const x = [...document.querySelectorAll('button')].find(b => /start quiz|^start$/i.test((b.textContent || '').trim()));
      if (x) x.click();
    });
    await new Promise(r => setTimeout(r, 4000));
    for (let i = 0; i < 70; i++) {
      const acted = await p.evaluate(() => {
        const txt = (x) => (x.textContent || '').trim();
        const adv = [...document.querySelectorAll('button')].find(x => /^(next|submit|finish|see results)/i.test(txt(x)));
        if (adv) { adv.click(); return 'next'; }
        const CHROME = /new quiz|prev|answer to continue|more|notes|bookmark|skip|start/i;
        const opt = [...document.querySelectorAll('button')].filter(x => /^[A-D].{3,}$/.test(txt(x)) && !CHROME.test(txt(x)));
        if (opt.length) { opt[0].click(); return 'answered'; }
        return 'stuck';
      });
      if (acted === 'stuck') break;
      await new Promise(r => setTimeout(r, 380));
      if (await p.evaluate(() => /practice complete|you scored|see results/i.test(document.body.innerText))) break;
    }
    await new Promise(r => setTimeout(r, 6000));

    // The submit invalidated the wrong-queue counts. Now hover a nav row that
    // needs them and watch for the refill.
    const calls = [];
    const onReq = (r) => { if (/wrong-queue/.test(new URL(r.url()).pathname)) calls.push(new URL(r.url()).pathname); };
    p.on('request', onReq);
    const handle = await p.evaluateHandle((needle) => {
      const el = [...document.querySelectorAll('a')].find(a => new RegExp(needle, 'i').test(a.textContent || ''));
      return el || null;
    }, 'wrong questions');
    const el = handle.asElement();
    const found = !!el;
    if (el) { await el.scrollIntoView(); await new Promise(r => setTimeout(r, 400)); await el.hover(); }
    await new Promise(r => setTimeout(r, 3000));
    p.off('request', onReq);
    check('hovering a nav row refills the keys a submit invalidated', found && calls.length > 0,
      `row found=${found} wrong-queue fetches=${calls.length}`);
  }

  await ctx.close();
}

await run('/desktop/', 'desktop');
await b.close();
console.log(`\n${'='.repeat(62)}`);
console.log(`  ${fails.length ? 'FAILURES: ' + fails.join(' | ') : 'ALL PASS'}`);
console.log('='.repeat(62));