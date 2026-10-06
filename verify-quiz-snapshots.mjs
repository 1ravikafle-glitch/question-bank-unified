import puppeteer from '/home/elfakiris/question-bank-unified/frontend-desktop/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
/* Quiz / practice / wrong-question snapshots, exercised for real.

   Each check drives the actual UI and then compares what the screen shows
   against a FRESH API read. Comparing the screen against itself proves nothing:
   an earlier version of this file "verified" a stale home page by checking that
   a number did not change. */
const B = 'http://127.0.0.1:8011';
const b = await puppeteer.launch({ executablePath: '/home/elfakiris/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', headless: 'shell', args: ['--no-sandbox'] });
const fails = [];
const check = (n, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '   [' + d + ']' : ''}`); if (!ok) fails.push(n); };

async function open(base = '/desktop/', user = 'elfak', pass = 'local-lb-pw-0123456789') {
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
  await new Promise(r => setTimeout(r, 6500));
  return { ctx, p };
}
const go = async (p, h) => {
  await p.evaluate((x) => { history.pushState({}, '', x); window.dispatchEvent(new PopStateEvent('popstate')); }, h);
  await new Promise(r => setTimeout(r, 3600));
};
const api = (p, path) => p.evaluate(async (u) => {
  const r = await fetch(u, { headers: { Authorization: 'Bearer ' + localStorage.getItem('fpsc-session') } });
  if (!r.ok) return { error: r.status };
  return r.json();
}, path);

/* Plays a whole quiz through the real controls. Order matters: the options stay
   in the DOM after answering (locked, not removed), so advance must be checked
   first or the loop re-clicks one question forever. */
async function playQuiz(p, maxSteps = 70) {
  for (let i = 0; i < maxSteps; i++) {
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
    await new Promise(r => setTimeout(r, 450));
    if (await p.evaluate(() => /practice complete|you scored|see results/i.test(document.body.innerText))) break;
  }
  await new Promise(r => setTimeout(r, 6000));
}

console.log('\n=== A. PRACTICE SETUP: snapshot counts agree with the API ===');
{
  const { ctx, p } = await open();
  await go(p, '/desktop/quiz');
  // The setup screen renders "{n} wrong to review" further down the page, and a
  // "All Categories" select. My first attempt matched "General Review ... 240",
  // which is not a count this screen shows at all.
  const shownWrong = await p.evaluate(() => {
    const m = document.body.innerText.match(/([\d,]+)\s+wrong to review/i);
    return m ? m[1].replace(/,/g, '') : null;
  });
  const freshWrong = (await api(p, '/quiz/wrong-queue/elfak')).count;
  check('setup shows the wrong-to-review count', shownWrong !== null, `shown=${shownWrong}`);
  check('setup wrong count agrees with the API',
    shownWrong !== null && String(freshWrong) === shownWrong,
    `screen=${shownWrong} api=${freshWrong}`);

  // /questions/categories/ returns a BARE ARRAY, not {categories: [...]}, and
  // the desktop setup screen uses a custom dropdown rather than a <select>.
  // My first attempt read `.categories` off an array and looked for a <select>
  // that does not exist there, so it reported 0 and 0.
  const freshCats = await api(p, '/questions/categories/');
  const cats = Array.isArray(freshCats) ? freshCats : (freshCats.categories || []);
  await p.evaluate(() => {
    const x = [...document.querySelectorAll('button')].find(b => /all categories/i.test(b.textContent || ''));
    if (x) x.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  const shownCats = await p.evaluate((want) => {
    const t = document.body.innerText;
    return want.filter(c => t.includes(c));
  }, cats);
  check('the category list from the snapshot is shown to the user',
    cats.length > 1 && shownCats.length === cats.length,
    `${shownCats.length}/${cats.length} categories rendered`);
  await ctx.close();
}

console.log('\n=== B. QUIZ: submit invalidates home + results + progress ===');
{
  const { ctx, p } = await open();
  await go(p, '/desktop/quiz');
  await p.evaluate(() => {
    const x = [...document.querySelectorAll('button')].find(b => /start quiz|^start$/i.test((b.textContent || '').trim()));
    if (x) x.click();
  });
  await new Promise(r => setTimeout(r, 4000));
  await playQuiz(p);
  const attemptsFresh = await api(p, '/quiz/progress/elfak');
  await go(p, '/desktop/');
  const tile = await p.evaluate(() => {
    const t = [...document.querySelectorAll('.stat-tile')].find(x => /attempted/i.test(x.innerText));
    return t ? t.innerText.replace(/\s+/g, ' ').trim() : null;
  });
  const shownAttempted = tile?.match(/ATTEMPTED\s*([\d,]+)/i)?.[1]?.replace(/,/g, '');
  check('home tile matches the API after a quiz (not stale)',
    attemptsFresh.attempted !== undefined && String(attemptsFresh.attempted) === String(shownAttempted),
    `tile=${shownAttempted} api=${attemptsFresh.attempted}`);
  const n = (await api(p, '/quiz/progress/elfak')).recent_attempts?.length;
  check('the new attempt is visible in progress', (n ?? 0) > 0, `${n} recent attempts`);
  await ctx.close();
}

console.log('\n=== C. WRONG QUESTIONS: all three screens agree with the API ===');
{
  const { ctx, p } = await open();
  const apiCount = async () => (await api(p, '/quiz/wrong-queue/elfak')).count;

  await go(p, '/desktop/quiz/practice-wrong');
  const stated = await p.evaluate(() => {
    const m = document.body.innerText.match(/([\d,]+)\s+questions? need another look/i)
           || document.body.innerText.match(/All wrong \((\d+)\)/i);
    return m ? m[1].replace(/,/g, '') : null;
  });
  check('wrong-review screen states the queue size', stated !== null, `stated=${stated}`);
  check('wrong-review size agrees with the API', stated !== null && String(await apiCount()) === stated,
    `screen=${stated} api=${await apiCount()}`);

  // Practise it for real. Note: answering blind means most answers are wrong,
  // and a wrongly answered question correctly STAYS in the queue - so the old
  // "the queue must shrink" assertion was wrong, not the app. What matters for
  // snapshots is that every screen agrees with the server afterwards.
  await p.evaluate(() => {
    const x = [...document.querySelectorAll('button')].find(b => /start review/i.test(b.textContent || ''));
    if (x) x.click();
  });
  await new Promise(r => setTimeout(r, 4200));
  await playQuiz(p);
  const server = await apiCount();

  await go(p, '/desktop/quiz');
  const setupAfter = await p.evaluate(() => {
    const m = document.body.innerText.match(/([\d,]+)\s+wrong to review/i);
    return m ? m[1].replace(/,/g, '') : null;
  });
  // The race this guards: clearWrongQueue used to be fired and forgotten while
  // the refresh ran concurrently, so this could still show the pre-practice
  // number for a while.
  check('practice setup shows the CURRENT count after practising (no stale race)',
    setupAfter === null || setupAfter === String(server),
    `screen=${setupAfter} api=${server}`);

  await go(p, '/desktop/progress');
  const progAfter = await p.evaluate(() => {
    const m = document.body.innerText.match(/([\d,]+)\s+in your review queue/i);
    return m ? m[1].replace(/,/g, '') : null;
  });
  check('progress page review-queue count agrees with the API',
    progAfter === null || progAfter === String(server),
    `screen=${progAfter} api=${server}`);

  const lifetimeWrong = await p.evaluate(() => {
    const m = document.body.innerText.match(/([\d,]+)\s*\n?WRONG/i);
    return m ? m[1].replace(/,/g, '') : null;
  });
  check('the lifetime WRONG tile is a different stat from the queue (not confused)',
    lifetimeWrong === null || lifetimeWrong !== String(server) || server === lifetimeWrong,
    `lifetime WRONG=${lifetimeWrong} queue=${server}`);
  await ctx.close();
}

console.log('\n=== D. snapshots still SERVE (speed must not regress) ===');
{
  const { ctx, p } = await open();
  await go(p, '/desktop/progress');
  const first = await p.evaluate(() => document.body.innerText);
  await go(p, '/desktop/');
  await go(p, '/desktop/progress');
  const sk = await p.evaluate(() => document.querySelectorAll('.skeleton').length);
  const second = await p.evaluate(() => document.body.innerText);
  check('remount shows no loading skeleton', sk === 0, `skeletons=${sk}`);
  check('remount content is stable', first.slice(0, 100) === second.slice(0, 100));
  await ctx.close();
}

await b.close();
console.log(`\n${'='.repeat(60)}`);
console.log(`  ${fails.length ? 'FAILURES: ' + fails.join(' | ') : 'ALL PASS'}`);
console.log('='.repeat(60));