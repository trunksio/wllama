// Automated end-to-end test of the engram demo page: drives the real page in
// headless Chromium, repeatedly completing the same prompts and diffing the
// answers across repeats and cartridge swaps — the exact flow a human clicks.
//
// Usage: node scripts/test_engram_demo.mjs [http://127.0.0.1:8080]

import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8080';
const URL = BASE.endsWith('/') ? BASE : `${BASE}/examples/engram-demo/`;

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
  await page.waitForSelector('#sec-mount:not(.hidden)', { timeout: 300_000 });
  console.log('model + cartridges loaded:', await page.textContent('#status'));

  const mount = async (btn) => {
    await page.click(btn);
    await page.waitForFunction(
      () => !document.getElementById('mount-info').textContent.includes('…'),
      { timeout: 60_000 }
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
