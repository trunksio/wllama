// User-shaped reproduction: load the live demo, switch to the cities
// workspace, mount, then click the sample buttons in sequence (and again,
// rapidly), reporting the rendered answer + provenance after each. Engine
// selectable: ENGINE=webkit|chromium|firefox.
//
// Usage: ENGINE=webkit node scripts/test_engram_samples.mjs [https://engram.md/demo.html]

import { chromium, webkit, firefox } from 'playwright';

const URL = process.argv[2] ?? 'https://engram.md/demo.html';
const engineName = process.env.ENGINE ?? 'chromium';
// chromium-nojspi: Chromium with WebAssembly JSPI disabled, which forces
// wllama onto the same compat worker path Safari uses
const engine = { chromium, webkit, firefox, 'chromium-nojspi': chromium }[engineName];
const launchArgs = engineName === 'chromium-nojspi'
  ? { args: ['--js-flags=--no-experimental-wasm-jspi', '--disable-features=WebAssemblyJSPI'] }
  : {};

const main = async () => {
  const browser = await engine.launch({ headless: true, ...launchArgs });
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [error]', m.text()); });
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  console.log(`engine=${engineName} url=${URL}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.click('#btn-load-assets');
  await page.waitForSelector('#sec-mount:not(.hidden)', { timeout: 900_000 });
  console.log('loaded:', await page.textContent('#status'));

  await page.click('#ws-cities');
  await page.waitForFunction(
    () => document.getElementById('status').textContent.includes('Cities workspace ready'),
    { timeout: 300_000 });
  await page.click('#btn-c');
  await page.waitForFunction(() => {
    const t = document.getElementById('mount-info').textContent;
    return t.includes('mounted in');
  }, { timeout: 300_000 });
  console.log('mounted:', await page.textContent('#mount-info'));

  const samples = await page.$$('#samples button');
  console.log(`${samples.length} sample buttons`);
  let failures = 0;
  const runSample = async (i, label) => {
    const buttons = await page.$$('#samples button');
    const text = await buttons[i].textContent();
    await buttons[i].click();
    await page.click('#btn-run');
    await page.waitForFunction(() => !document.getElementById('btn-run').disabled, { timeout: 300_000 });
    const out = await page.textContent('#output');
    const check = await page.textContent('#answer-check');
    const prov = await page.textContent('#provenance');
    const ok = check.startsWith('✓');
    if (!ok) failures++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${label} ${text.slice(0, 40)} → out='${out.slice(-24).trim()}' check='${check.slice(0, 40)}' prov='${prov.slice(0, 50)}'`);
  };
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < samples.length; i++) await runSample(i, `r${round}`);
  }
  await browser.close();
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
};
main().catch((e) => { console.error(e); process.exit(1); });
