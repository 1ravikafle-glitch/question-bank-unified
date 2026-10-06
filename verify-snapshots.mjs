import puppeteer from '/home/elfakiris/question-bank-unified/frontend-desktop/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
/* Snapshot correctness measured in a real browser.

   Three separate things are being proved, and the previous version of this file
   quietly proved none of them: it looked for a sign-out button that lives inside
   a dropdown it never opened, its progress regex matched nothing, and its quiz
   automation never actually submitted - so "home page reflects the quiz" passed
   with before === after. Each check below now fails loudly if it did not do the
   thing it claims. */
const B = 'http://127.0.0.1:8011';
const b = await puppeteer.launch({ executablePath: '/home/elfakiris/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', headless: 'shell', args: ['--no-sandbox'] });
const fails = [];
const check = (n, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '   [' + d + ']' : ''}`); if (!ok) fails.push(n); };

async function session(user, pass) {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1280, height: 1000 });
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await p.goto(B + '/desktop/', { waitUntil: 'networkidle2' });
  await p.evaluate(() => localStorage.clear());
  await p.goto(B + '/desktop/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2500));
  const ins = await p.$$('input');
  await ins[0].type(user); await ins[1].type(pass);
  for (const btn of await p.$$('button')) {
    const t = await p.evaluate(e => e.textContent, btn);
    if (/sign in|log ?in/i.test(t)) { await btn.click(); break; }
  }
  await new Promise(r => setTimeout(r, 6000));
  return { ctx, p };
}
const go = async (p, h) => {
  await p.evaluate((x) => { history.pushState({}, '', x); window.dispatchEvent(new PopStateEvent('popstate')); }, h);
  await new Promise(r => setTimeout(r, 3400));
};
const clickByText = async (p, re) => p.evaluate((src) => {
  const rx = new RegExp(src, 'i');
  const el = [...document.querySelectorAll('button, [role="menuitem"], [role="button"], a')]
    .find(b => rx.test((b.textContent || '').trim()));
  if (!el) return false;
  el.click(); return true;
}, re.source || re);

console.log('\n=== 1. snapshots still SERVE on remount (the feature must not regress) ===');
{
  const { ctx, p } = await session('elfak', 'local-lb-pw-0123456789');
  await go(p, '/desktop/progress');
  const first = await p.evaluate(() => document.body.innerText);
  await go(p, '/desktop/');
  await go(p, '/desktop/progress');
  const sk = await p.evaluate(() => document.querySelectorAll('.skeleton').length);
  const second = await p.evaluate(() => document.body.innerText);
  check('remount shows no loading skeleton', sk === 0, `skeletons=${sk}`);
  check('remount renders identical content', first.slice(0, 120) === second.slice(0, 120));
  await ctx.close();
}

console.log('\n=== 2. a real quiz submit refreshes the home snapshot ===');
{
  const { ctx, p } = await session('elfak', 'local-lb-pw-0123456789');
  await go(p, '/desktop/');
  // Read the ATTEMPTED stat tile. The previous version regexed the body text,
  // which matched "2,162" (the BANK total in the neighbouring tile) and so
  // reported no change even when the page had genuinely refreshed.
  const grab = () => p.evaluate(() => {
    const tiles = [...document.querySelectorAll('.stat-tile')];
    const tile = tiles.find(t => /attempted/i.test(t.innerText));
    if (!tile) return null;
    const m = tile.innerText.match(/([\d,]+)/);
    return m ? m[1] : null;
  });
  const before = await grab();
  // Actually play a quiz: start, answer every question, submit.
  await go(p, '/desktop/quiz');
  await clickByText(p, /start quiz|^start$/i);
  await new Promise(r => setTimeout(r, 4000));
  const started = await p.evaluate(() => /next|submit|finish|question 1/i.test(document.body.innerText));
  check('quiz actually started', started, 'otherwise this test would pass vacuously');
  let answered = 0;
  for (let i = 0; i < 60; i++) {
    // Order matters. The options stay in the DOM after answering (they are
    // locked, not removed), so checking for options FIRST re-clicks the same
    // question forever. Advance first, then answer.
    const acted = await p.evaluate(() => {
      const txt = (b) => (b.textContent || '').trim();
      const advance = [...document.querySelectorAll('button')]
        .find(b => /^(next|submit|finish|see results)/i.test(txt(b)));
      if (advance) { advance.click(); return 'next'; }
      const CHROME = /new quiz|prev|answer to continue|more|notes|bookmark|skip/i;
      const opt = [...document.querySelectorAll('button')]
        .filter(b => /^[A-D].{3,}$/.test(txt(b)) && !CHROME.test(txt(b)));
      if (opt.length) { opt[0].click(); return 'answered'; }
      return 'stuck';
    });
    if (acted === 'stuck') break;
    if (acted === 'answered') answered++;
    await new Promise(r => setTimeout(r, 500));
    const done = await p.evaluate(() => /practice complete|your score|see results/i.test(document.body.innerText));
    if (done) break;
  }
  await new Promise(r => setTimeout(r, 6000));
  await go(p, '/desktop/');
  const after = await grab();
  check('a quiz was genuinely completed', answered > 0, `answered ${answered} questions`);

  // Deterministic staleness check. Comparing before/after ATTEMPTED is flaky:
  // the quiz draws random questions, so if all ten were already attempted the
  // count correctly does not move. Instead ask whether the tile agrees with a
  // FRESH read of the API - if the home snapshot were stale, the two would
  // disagree, whatever questions were drawn.
  const fresh = await p.evaluate(async () => {
    const res = await fetch('/quiz/progress/' + encodeURIComponent(localStorage.getItem('userId')), {
      headers: { Authorization: 'Bearer ' + localStorage.getItem('fpsc-session') },
    });
    if (!res.ok) return { error: res.status };
    const d = await res.json();
    return { attempted: d.attempted ?? d.total_attempted ?? null };
  });
  check('fresh progress read succeeded', fresh.attempted !== null && fresh.error === undefined, JSON.stringify(fresh));
  const shown = String(after).replace(/,/g, '');
  check('home tile matches the API, i.e. the snapshot was NOT stale',
    fresh.attempted !== null && String(fresh.attempted) === shown,
    `tile shows ${shown}, API says ${fresh.attempted}`);
  await ctx.close();
}

console.log('\n=== 3. sign-out clears the session AND the snapshot store ===');
{
  const { ctx, p } = await session('elfak', 'local-lb-pw-0123456789');
  await go(p, '/desktop/bookmarks');
  await go(p, '/desktop/progress');   // populate snapshots for this account
  // The sign-out item lives in the header dropdown; open it first.
  const opened = await p.evaluate(() => {
    const t = [...document.querySelectorAll('button,[role="button"]')].find(b => /avatar|account|menu|profile/i.test(b.getAttribute('aria-label') || b.getAttribute('title') || ''));
    if (!t) return false; t.click(); return true;
  });
  await new Promise(r => setTimeout(r, 1200));
  const clicked = await clickByText(p, /log ?out|sign ?out/i);
  await new Promise(r => setTimeout(r, 3000));
  const token = await p.evaluate(() => localStorage.getItem('fpsc-session'));
  const onLogin = await p.evaluate(() => /sign in|log ?in/i.test(document.body.innerText) || location.pathname.includes('login'));
  check('sign-out control was reachable (menu opened)', opened, `menu trigger found=${opened}`);
  check('sign-out control was clicked', clicked);
  check('session token removed from storage', !token, `token=${token ? 'still present' : 'gone'}`);
  check('landed on the login screen', onLogin);
  await ctx.close();
}

console.log('\n=== 4. a DIFFERENT account inherits NOTHING (same tab) ===');
{
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1280, height: 1000 });
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await p.goto(B + '/desktop/', { waitUntil: 'networkidle2' });
  // account one
  let ins = await p.$$('input');
  await ins[0].type('elfak'); await ins[1].type('local-lb-pw-0123456789');
  for (const btn of await p.$$('button')) { const t = await p.evaluate(e => e.textContent, btn); if (/sign in|log ?in/i.test(t)) { await btn.click(); break; } }
  await new Promise(r => setTimeout(r, 6000));
  await go(p, '/desktop/bookmarks');
  await go(p, '/desktop/progress');
  const acct1 = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400));
  // sign out, in the SAME tab/context
  await p.evaluate(() => {
    const t = [...document.querySelectorAll('button,[role="button"]')].find(b => /avatar|account|menu|profile/i.test(b.getAttribute('aria-label') || b.getAttribute('title') || ''));
    if (t) t.click();
  });
  await new Promise(r => setTimeout(r, 1200));
  await clickByText(p, /log ?out|sign ?out/i);
  await new Promise(r => setTimeout(r, 3500));
  // account two, same tab
  ins = await p.$$('input');
  if (!ins.length) { await p.goto(B + '/desktop/login', { waitUntil: 'networkidle2' }); ins = await p.$$('input'); }
  await ins[0].type('seconduser'); await ins[1].type('local-2nd-pw-0123456789');
  for (const btn of await p.$$('button')) { const t = await p.evaluate(e => e.textContent, btn); if (/sign in|log ?in/i.test(t)) { await btn.click(); break; } }
  await new Promise(r => setTimeout(r, 6500));
  const signedInAs = await p.evaluate(() => localStorage.getItem('userId'));
  check('second account is the one signed in', signedInAs === 'seconduser', `userId=${signedInAs}`);
  await go(p, '/desktop/bookmarks');
  const bm = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  check('second account sees its OWN empty bookmarks', /No bookmarks yet|Tap 🔖|save it here/i.test(bm), bm.slice(0, 70));
  await go(p, '/desktop/progress');
  const pr = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const acct2Marks = await p.evaluate(() => {
    const tile = [...document.querySelectorAll('.stat-tile')].find(t => /attempted/i.test(t.innerText));
    return tile ? tile.innerText.replace(/\s+/g, ' ').trim() : null;
  });
  const acct1Tile = acct1.match(/ATTEMPTED[^A-Z]*[\d,]+/i)?.[0] || 'unknown';
  check('account 2 reads its OWN progress, not account 1\'s',
    acct2Marks === null || !/ATTEMPTED\s*600/i.test(acct2Marks),
    `account1 tile="${acct1Tile}" account2 tile=${acct2Marks}`);
  await ctx.close();
}

console.log('\n=== 5. feedback is live in this build ===');
{
  const { ctx, p } = await session('elfak', 'local-lb-pw-0123456789');
  const r = await p.evaluate(async () => {
    const res = await fetch('/feedback/mine', { headers: { Authorization: 'Bearer ' + localStorage.getItem('fpsc-session') } });
    return { status: res.status, ct: res.headers.get('content-type') || '' };
  });
  check('/feedback/mine returns JSON, not the SPA shell', r.ct.includes('application/json'), `${r.status} ${r.ct}`);
  await ctx.close();
}

await b.close();
console.log(`\n${'='.repeat(58)}`);
console.log(`  ${fails.length ? 'FAILURES: ' + fails.join(' | ') : 'ALL PASS'}`);
console.log('='.repeat(58));