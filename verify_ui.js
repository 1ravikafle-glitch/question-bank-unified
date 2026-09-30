/** Verify sidebar / header / popover / login after the sidebar+header pass.
 *  Usage: node verify_ui.js
 *  Serves from http://127.0.0.1:8003 (serve_local.py) with API on 8001. */
const puppeteer = require('puppeteer-core');

const BASE = 'http://127.0.0.1:8003';
const CHROME = '/home/elfakiris/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const OUT = '/tmp/qbu_verify';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });

  // 1) Login page — should show ThemeSegmented
  await page.goto(BASE + '/login', { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(1200);
  await page.screenshot({ path: OUT + '_1_login.png' });
  const loginTheme = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[role="group"][aria-label="Appearance"] button')];
    return els.map((b) => b.textContent.trim());
  });

  // Log in as local admin (Elfak/Kafle defaults)
  await page.type('#login-username', 'Elfak');
  await page.type('#login-password', 'Kafle');
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {}),
  ]);
  await sleep(1500);
  await page.screenshot({ path: OUT + '_2_home.png' });

  // Sidebar structure: group labels, rows, dividers, scroll state
  const sidebar = await page.evaluate(() => {
    const aside = document.querySelector('aside[aria-label="Sidebar navigation"]');
    if (!aside) return { found: false };
    const groups = [...aside.querySelectorAll('.nav-group')].map((g) => ({
      label: g.getAttribute('aria-label'),
      rows: [...g.querySelectorAll('a')].map((a) => a.textContent.replace(/\s+/g, ' ').trim()),
      dividers: g.querySelectorAll('div[aria-hidden="true"]').length,
    }));
    const nav = aside.querySelector('nav');
    return {
      found: true,
      groups,
      navScrollHeight: nav.scrollHeight,
      navClientHeight: nav.clientHeight,
      scrolls: nav.scrollHeight > nav.clientHeight + 1,
      asideHeight: aside.getBoundingClientRect().height,
      hasElfakRow: /Elfak/.test(aside.textContent),
      brand: aside.querySelector('a[href="/"]')?.textContent.replace(/\s+/g, ' ').trim(),
    };
  });

  // Header trigger: should show E + Elfak
  const trigger = await page.evaluate(() => {
    const btn = document.querySelector('header button[aria-label="User menu"]');
    if (!btn) return { found: false };
    const r = btn.getBoundingClientRect();
    return {
      found: true,
      text: btn.textContent.replace(/\s+/g, ' ').trim(),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  });

  // Open the popover (click trigger)
  await page.click('header button[aria-label="User menu"]');
  await sleep(700);
  await page.screenshot({ path: OUT + '_3_popover.png' });
  const popover = await page.evaluate(() => {
    const menu = document.querySelector('[role="menu"]');
    if (!menu) return { found: false };
    const r = menu.getBoundingClientRect();
    return {
      found: true,
      w: Math.round(r.width),
      hasAppearance: !!menu.querySelector('[role="group"][aria-label="Appearance"]'),
      segments: [...menu.querySelectorAll('[role="group"][aria-label="Appearance"] button')].map((b) => b.textContent.trim()),
      items: menu.textContent.replace(/\s+/g, ' ').trim().slice(0, 200),
    };
  });

  // Escape closes
  await page.keyboard.press('Escape');
  await sleep(500);
  const closedByEsc = await page.evaluate(() => !document.querySelector('[role="menu"]'));

  console.log(JSON.stringify({ loginTheme, sidebar, trigger, popover, closedByEsc, errors: errors.slice(0, 5) }, null, 1));
  await browser.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
