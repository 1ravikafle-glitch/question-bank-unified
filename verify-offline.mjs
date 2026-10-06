import puppeteer from '/home/elfakiris/question-bank-unified/frontend-desktop/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
/* What actually works with the network cut, in each app.
   Every check is made with setOfflineMode(true), not mocked. */
const B = 'http://127.0.0.1:8011';
const b = await puppeteer.launch({ executablePath: '/home/elfakiris/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', headless: 'shell', args: ['--no-sandbox'] });
const fails = [], warns = [];
const check = (n, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '   [' + d + ']' : ''}`); if (!ok) fails.push(n); };
const warn = (n, d = '') => { console.log(`  WARN  ${n}${d ? '   [' + d + ']' : ''}`); warns.push(n); };

const SECTIONS = ['/quiz', '/mock', '/questions', '/quiz/practice-wrong', '/results', '/progress', '/bookmarks', '/notes', '/about', '/feedback'];

async function boot(base, user = 'elfak', pass = 'local-lb-pw-0123456789') {
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
  await new Promise(r => setTimeout(r, 7000));
  return { ctx, p };
}

const go = async (p, h) => {
  await p.evaluate((x) => { history.pushState({}, '', x); window.dispatchEvent(new PopStateEvent('popstate')); }, h);
  await new Promise(r => setTimeout(r, 2600));
};

async function run(base, label, width) {
  console.log(`\n${'='.repeat(64)}\n${label}\n${'='.repeat(64)}`);
  const { ctx, p } = await boot(base);
  if (width) await p.setViewport({ width, height: 1000 });

  console.log(`\n=== ${label}: offline pack downloaded while online ===`);
  // The banner downloads the bank in the background; give it room.
  let pack = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    pack = await p.evaluate(async () => {
      try {
        const m = await import('/assets/' + [...document.querySelectorAll('script')].map(s => s.src.split('/').pop()).find(x => x.startsWith('index-')));
        return m ? 'module-loaded' : null;
      } catch { return null; }
    }).catch(() => null);
    void pack;
    const txt = await p.evaluate(() => document.body.innerText);
    if (/offline pack ready/i.test(txt)) { pack = 'toast seen'; break; }
  }
  const bankSize = await p.evaluate(async () => {
    const dbs = await indexedDB.databases?.() || [];
    return dbs.map(d => d.name).join(',') || 'none';
  }).catch(() => 'err');
  check('an IndexedDB store exists for the offline pack', bankSize !== 'none' && bankSize !== 'err', bankSize);

  console.log(`\n=== ${label}: cut the network, then visit every section ===`);
  await p.setOfflineMode(true);
  await new Promise(r => setTimeout(r, 800));
  for (const s of SECTIONS) {
    await go(p, base + s.slice(1));
    const st = await p.evaluate(() => ({
      nodes: document.querySelectorAll('body *').length,
      sk: document.querySelectorAll('.skeleton').length,
      txt: document.body.innerText.replace(/\s+/g, ' ').slice(0, 70),
      blank: document.body.innerText.trim().length < 40,
    }));
    check(`offline ${s}`, !st.blank && st.nodes > 25, `nodes=${st.nodes} skeleton=${st.sk} "${st.txt}"`);
  }

  console.log(`\n=== ${label}: start and complete a quiz with no network ===`);
  await go(p, base + 'quiz');
  const started = await p.evaluate(() => {
    const x = [...document.querySelectorAll('button')].find(b => /start quiz|^start$/i.test((b.textContent || '').trim()));
    if (!x) return 'no-start-button';
    x.click(); return 'clicked';
  });
  await new Promise(r => setTimeout(r, 4500));
  const gotQ = await p.evaluate(() => /next|answer to continue|question/i.test(document.body.innerText));
  check('quiz starts offline from the downloaded pack', started === 'clicked' && gotQ, `start=${started}`);

  let sawOfflineFlag = false, sawToast = false;
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
    await new Promise(r => setTimeout(r, 400));
    const st = await p.evaluate(() => document.body.innerText);
    if (/offline result|saved on this device|will sync/i.test(st)) sawOfflineFlag = true;
    if (/practice complete|you scored/i.test(st)) break;
  }
  await new Promise(r => setTimeout(r, 4000));
  const res = await p.evaluate(() => ({
    txt: document.body.innerText.replace(/\s+/g, ' '),
    toasts: [...document.querySelectorAll('[class*="toast"], [role="status"], [role="alert"]')].map(t => t.innerText.trim()).filter(Boolean),
  }));
  // The hang signature was EVERY control disabled - all four options plus the
  // advance button - because `submitting` never cleared. A single disabled
  // "Previous" on question 1 is correct behaviour, so counting disabled buttons
  // and demanding zero was the wrong test. Check the actual signature instead.
  const dis = await p.evaluate(() => [...document.querySelectorAll('button')]
    .filter(x => x.disabled).map(x => (x.textContent || '').trim().slice(0, 24)));
  const allOptionsLocked = await p.evaluate(() => {
    const opt = [...document.querySelectorAll('button')].filter(x => /^[A-D].{3,}$/.test((x.textContent || '').trim()));
    return opt.length > 0 && opt.every(x => x.disabled);
  });
  check('quiz completes offline and does not hang',
    /practice complete|you scored/i.test(res.txt) && !allOptionsLocked,
    `scored=${/practice complete|you scored/i.test(res.txt)} allOptionsLocked=${allOptionsLocked} disabled=[${dis.join(', ')}]`);
  check('the result is labelled as queued offline', sawOfflineFlag || /offline result|saved on this device|will sync/i.test(res.txt),
    sawOfflineFlag ? 'inline notice present' : 'no offline wording found');
  // This is the gap the user reported.
  // Must be a toast about THE RESULT being queued. An earlier version matched
  // any toast mentioning "offline", which the persistent banner satisfies on its
  // own - so it passed while no result toast existed at all.
  check('a TOAST tells the user this result was queued offline',
    res.toasts.some(t => /result saved|result could not be saved|will sync when you reconnect/i.test(t)),
    `toasts seen: ${JSON.stringify(res.toasts).slice(0, 160)}`);

  console.log(`\n=== ${label}: bookmark while offline ===`);
  await go(p, base + 'questions');
  await new Promise(r => setTimeout(r, 2000));
  const bm = await p.evaluate(async () => {
    const btn = [...document.querySelectorAll('button')].find(b => /bookmark|🔖/i.test(b.getAttribute('aria-label') || b.textContent || ''));
    if (!btn) return 'no-button';
    btn.click();
    await new Promise(r => setTimeout(r, 900));
    return 'clicked';
  });
  await new Promise(r => setTimeout(r, 1500));
  const bmState = await p.evaluate(() => ({
    txt: document.body.innerText.replace(/\s+/g, ' '),
    toasts: [...document.querySelectorAll('[class*="toast"], [role="status"], [role="alert"]')].map(t => t.innerText.trim()).filter(Boolean),
  }));
  check('bookmark can be toggled offline', bm === 'clicked', bm);
  check('bookmark gives the user visible feedback', bmState.toasts.length > 0 || /bookmark/i.test(bmState.txt), JSON.stringify(bmState.toasts).slice(0, 100));

  console.log(`\n=== ${label}: reload while still offline (service worker shell) ===`);
  try {
    await p.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));
    const after = await p.evaluate(() => ({ nodes: document.querySelectorAll('body *').length, txt: document.body.innerText.replace(/\s+/g, ' ').slice(0, 60) }));
    check('app shell loads from cache with no network', after.nodes > 25 && after.txt.length > 20, `nodes=${after.nodes} "${after.txt}"`);
  } catch (e) {
    check('app shell loads from cache with no network', false, String(e).slice(0, 80));
  }

  await p.setOfflineMode(false);
  await ctx.close();
}

await run('/desktop/', 'DESKTOP');
await run('/mobile/', 'MOBILE', 420);

await b.close();
console.log(`\n${'='.repeat(64)}`);
console.log(`  FAILURES (${fails.length}): ${fails.join(' | ') || 'none'}`);
console.log(`  WARNINGS (${warns.length}): ${warns.join(' | ') || 'none'}`);
console.log('='.repeat(64));