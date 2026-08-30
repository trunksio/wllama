// Automated end-to-end test of the engram demo page: drives the real page in
// headless Chromium, repeatedly completing the same prompts and diffing the
// answers across repeats and cartridge swaps — the exact flow a human clicks.
//
// Usage: node scripts/test_engram_demo.mjs [http://127.0.0.1:8080]

import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8080';
const URL = (BASE.endsWith('/') || BASE.endsWith('.html'))
  ? BASE : `${BASE}/examples/engram-demo/`;

const PROMPTS = {
  a: { prompt: 'Newcastle v Liverpool | result |', expect: '2-3 (Liverpool)' },
  b: { prompt: 'Arsenal v Tottenham | result |', expect: '2-1 (Arsenal)' },
  both: { prompt: 'Arsenal v Tottenham | result |', expectA: '4-1 (Arsenal)', expectB: '2-1 (Arsenal)' },
};

let failures = 0;
const report = (label, got, expect) => {
  const ok = expect === null || got.trim().startsWith(expect);
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}: got='${got.trim()}'${expect ? ` expect='${expect}'` : ''}`);
  return got.trim();
};
// exact match: the page must have trimmed all trailing babble from the answer
const reportExact = (label, got, expect) => {
  const ok = got.trim() === expect;
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}: got='${got.trim()}' expect(exact)='${expect}'`);
  return got.trim();
};

const main = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let logAll = true;
  page.on('console', (msg) => {
    if (logAll || msg.type() === 'error') console.log(`  [${msg.type()}]`, msg.text());
  });
  page.on('pageerror', (err) => console.log('  [pageerror]', err.message));

  console.log(`loading ${URL}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.click('#btn-load-assets');
  // if the page has download-progress rows, sample them mid-download
  if (await page.$('#progress')) {
    try {
      await page.waitForSelector('#progress .dl', { timeout: 30_000 });
      await page.waitForTimeout(3_000);
      const rows = await page.$$eval('#progress .dl > div:first-child',
        (els) => els.map((e) => e.textContent));
      console.log('progress rows:', rows);
      if (rows.length === 0) { failures++; console.log('FAIL no progress rows'); }
    } catch {
      failures++;
      console.log('FAIL progress rows never appeared');
    }
  }
  await page.waitForSelector('#sec-mount:not(.hidden)', { timeout: 300_000 });
  console.log('model + cartridges loaded:', await page.textContent('#status'));

  const mount = async (btn) => {
    await page.click(btn);
    await page.waitForFunction(
      () => {
        const info = document.getElementById('mount-info').textContent;
        return !info.includes('mounting') &&
          (info.includes('mounted in') || info.includes('Unmounted in'));
      },
      { timeout: 120_000 }
    );
    console.log('  mount:', await page.textContent('#mount-info'));
  };

  const complete = async (prompt) => {
    await page.fill('#prompt', prompt);
    await page.click('#btn-run');
    await page.waitForFunction(
      () => !document.getElementById('btn-run').disabled,
      { timeout: 120_000 }
    );
    const full = await page.textContent('#output');
    return full.slice(prompt.length); // generated part only
  };

  // 1. repeat-stability with cartridge A mounted
  await mount('#btn-a');
  for (let i = 0; i < 6; i++) {
    report(`A repeat ${i + 1} `, await complete(PROMPTS.a.prompt), PROMPTS.a.expect);
  }

  // 2. swap to B, repeat-stability
  await mount('#btn-b');
  for (let i = 0; i < 4; i++) {
    report(`B repeat ${i + 1} `, await complete(PROMPTS.b.prompt), PROMPTS.b.expect);
  }

  // 3. rapid swap on the shared fixture
  for (let i = 0; i < 2; i++) {
    await mount('#btn-a');
    report(`swap->A     `, await complete(PROMPTS.both.prompt), PROMPTS.both.expectA);
    await mount('#btn-b');
    report(`swap->B     `, await complete(PROMPTS.both.prompt), PROMPTS.both.expectB);
  }

  // 3b. cities workspace (bare base + cities cartridge), if the page has one
  if (await page.$('#ws-cities')) {
    await page.click('#ws-cities');
    await page.waitForFunction(
      () => document.getElementById('status').textContent.includes('Cities workspace ready'),
      { timeout: 120_000 }
    );
    await mount('#btn-c');
    reportExact('C London     ', await complete('London, GB | population |'), '8961989');
    reportExact('C Paris      ', await complete('Paris, FR | population |'), '2138551');
    reportExact('C Paris again', await complete('Paris, FR | population |'), '2138551');
    reportExact('C Nanjing    ', await complete('Nanjing, CN | population |'), '9314685');
    // back to football for the unmounted checks
    await page.click('#ws-football');
    await page.waitForFunction(
      () => document.getElementById('status').textContent.includes('Football workspace ready'),
      { timeout: 120_000 }
    );
  }

  // 4. unmounted: record base babble (no expectation, just show it varies or not)
  await mount('#btn-none');
  for (let i = 0; i < 3; i++) {
    report(`none ${i + 1}      `, await complete(PROMPTS.a.prompt), null);
  }

  await browser.close();
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
