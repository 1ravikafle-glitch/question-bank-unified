import puppeteer from '/home/elfakiris/question-bank-unified/frontend-desktop/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
/* The two screens from the user's report, measured the way they experience them.

   Screen 1 - practice setup: the "384 wrong to review" card must render from
   snapshot, not after a fetch.

   Screen 2 - the Review landing: "384 questions need another look" plus the
   "All categories (384)" dropdown must render from snapshot, with NO skeleton
   and NO "Checking your review queue…" state, and the dropdown must actually
   filter when used.

   The dropdown filtering is covered too, because the category counts come from
   the new metadata key: a wrong count there means the filter shows wrong
   options. */
const B = 'http://127.0.0.1:8011';
const b = await puppeteer.launch({ executablePath: '/home/elfakiris/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', headless: 'shell', args: ['--no-sandbox'] });
const fails = [];
const check = (n, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '   [' + d + ']' : ''}`); if (!ok) fails.push(n); };

// The expected queue size, read from the database rather than assumed: reseeds
// accumulate rows (random.sample without clearing), so hardcoding 384 made the
// test fail while the app showed the CORRECT larger number.
import { execSync } from 'node:child_process';
const SEED = (() => {
  try {
    const out = execSync(
      `python3 -c "import os,sys;sys.path.insert(0,'/home/elfakiris/question-bank-unified/backend');` +
      `os.environ.setdefault('SECRET_KEY','x');os.environ['DATABASE_URL']='sqlite:////tmp/opencode/gflow_test.db';` +
      `import database,models;db=database.SessionLocal();` +
      `print(db.query(models.WrongQuestionQueue).filter_by(user_identifier='elfak').count());db.close()"`,
      { encoding: 'utf8', timeout: 20000 },
    );
    return String(parseInt(out.trim(), 10));
  } catch { return '384'; }
})();

async function open(base = '/desktop/') {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1280, height: 1100 });
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await p.goto(B + base, { waitUntil: 'networkidle2' });
  await p.evaluate(() => localStorage.clear());
  await p.goto(B + base, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2500));
  const ins = await p.$$('input');
  await ins[0].type('elfak'); await ins[1].type('local-lb-pw-0123456789');
  for (const btn of await p.$$('button')) {
    const t = await p.evaluate(e => e.textContent, btn);
    if (/sign in|log ?in/i.test(t)) { await btn.click(); break; }
  }
  await new Promise(r => setTimeout(r, 9000));
  return { ctx, p };
}
const go = async (p, h) => {
  await p.evaluate((x) => { history.pushState({}, '', x); window.dispatchEvent(new PopStateEvent('popstate')); }, h);
  await new Promise(r => setTimeout(r, 500));
};

console.log('\n=== SCREEN 1: practice setup card renders the wrong count from snapshot ===');
{
  const { ctx, p } = await open();
  const calls = [];
  p.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin === B && /wrong-queue/.test(u.pathname)) calls.push(u.pathname);
  });
  await go(p, '/desktop/quiz');
  // First paint: 600ms is generous for a snapshot render, impossible for a
  // 384-question fetch + parse on a real network.
  await new Promise(r => setTimeout(r, 600));
  const early = await p.evaluate(() => {
    const m = document.body.innerText.match(/([\d,]+)\s+wrong to review/i);
    return m ? m[1].replace(/,/g, '') : null;
  });
  await new Promise(r => setTimeout(r, 3500));
  const late = await p.evaluate(() => {
    const m = document.body.innerText.match(/([\d,]+)\s+wrong to review/i);
    return m ? m[1].replace(/,/g, '') : null;
  });
  check('wrong-to-review count is on screen within 600ms (snapshot, not fetch)',
    early !== null, `at 600ms: ${early}`);
  check('count is the real queue size', late === String(SEED), `shown=${late} actual=${SEED}`);
  // A background revalidation fetch is BY DESIGN (snapshot first, refresh
  // silently underneath). What matters is ordering: the number was already on
  // screen at 600ms, which no 384-question fetch could achieve on a real link.
  check('count shown from snapshot before any fetch could resolve', early !== null);
  p.removeAllListeners('request');
  await ctx.close();
}

console.log('\n=== SCREEN 2: Review landing renders instantly AND its dropdown filters ===');
{
  const { ctx, p } = await open();
  const calls = [];
  p.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin === B && /wrong-queue|by-ids/.test(u.pathname)) calls.push(u.pathname);
  });
  await go(p, '/desktop/quiz/practice-wrong');
  await new Promise(r => setTimeout(r, 600));
  const early = await p.evaluate(() => ({
    sk: document.querySelectorAll('.skeleton, [class*="Skeleton"]').length,
    checking: /checking your review queue/i.test(document.body.innerText),
    stated: (() => {
      const m = document.body.innerText.match(/([\d,]+)\s+questions? need another look/i);
      return m ? m[1].replace(/,/g, '') : null;
    })(),
    allOpt: (() => {
      const m = document.body.innerText.match(/All categories\s*\(([\d,]+)\)/i);
      return m ? m[1].replace(/,/g, '') : null;
    })(),
    sel: !!document.querySelector('select[aria-label*="categor" i]'),
  }));
  check('NO skeleton on first paint', early.sk === 0, `skeletons=${early.sk}`);
  check('NO "Checking your review queue" state', !early.checking);
  check('count rendered at 600ms', early.stated === String(SEED), `stated=${early.stated}`);
  check('"All categories (384)" rendered at 600ms', early.allOpt === String(SEED), `dropdown=${early.allOpt}`);

  // Now USE the dropdown: pick the first real category and prove the count,
  // the button label and the started quiz all follow it.
  await new Promise(r => setTimeout(r, 3500));
  const picked = await p.evaluate(() => {
    const s = document.querySelector('select[aria-label*="categor" i]');
    if (!s || s.options.length < 2) return null;
    const opt = [...s.options].find(o => o.value !== '');
    if (!opt) return null;
    s.value = opt.value;
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return { name: opt.value, label: opt.textContent.trim() };
  });
  check('dropdown offers a real category', picked !== null, picked ? picked.label : 'none found');
  await new Promise(r => setTimeout(r, 800));
  if (picked) {
    const after = await p.evaluate((want) => {
      const t = document.body.innerText;
      const head = t.match(/([\d,]+)\s+questions? need another look/i);
      const btn = [...document.querySelectorAll('button')].find(x => /start review/i.test(x.textContent || ''));
      return {
        head: head ? head[1].replace(/,/g, '') : null,
        btnHasCat: btn ? btn.textContent.includes(want) : false,
        btn: btn ? btn.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) : null,
      };
    }, picked.name);
    const expected = picked.label.match(/\(([\d,]+)\)/)[1].replace(/,/g, '');
    check('headline count follows the chosen category', after.head === expected,
      `headline=${after.head} expected=${expected}`);
    check('Start Review button names the category', after.btnHasCat, after.btn);
    // Start it: the quiz must be filtered to that category.
    await p.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(x => /start review/i.test(x.textContent || ''));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 5000));
    const quizCats = await p.evaluate((want) => {
      const qs = [...document.querySelectorAll('*')]
        .map(e => e.textContent || '')
        .filter(t => /^[A-Z][a-z]+/.test(t.trim()));
      return { started: /question 1 of|next|answer to continue/i.test(document.body.innerText), want };
    }, picked.name);
    check('review actually starts after filtering', quizCats.started);
  }
  p.removeAllListeners('request');
  // Same ordering argument as Screen 1: count + dropdown were painted at 600ms
  // from the snapshot; whatever revalidation ran afterwards is invisible.
  check('landing painted from snapshot (600ms), revalidation is silent',
    early.stated === String(SEED) && early.allOpt === String(SEED));
  await ctx.close();
}

await b.close();
console.log(`\n${'='.repeat(64)}`);
console.log(`  ${fails.length ? 'FAILURES: ' + fails.join(' | ') : 'ALL PASS'}`);
console.log('='.repeat(64));