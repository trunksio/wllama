// Drives the demo's Chat workspace: loads, switches to chat, mounts a memory,
// asks plain-language questions, and checks the lookup card (canonical key,
// value, provenance) and that unmounting makes the model forget.
//
// Usage: node scripts/test_engram_chat.mjs [http://127.0.0.1:8090/demo.html]

import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://127.0.0.1:8090/demo.html';
let failures = 0;
const check = (label, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}: ${detail}`);
};

const main = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [error]', m.text()); });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.click('#btn-load-assets');
  await page.waitForSelector('#sec-mount:not(.hidden)', { timeout: 900_000 });

  await page.click('#ws-chat');
  await page.waitForFunction(
    () => document.getElementById('status').textContent.includes('Chat workspace ready'), null,
    { timeout: 900_000 });
  console.log('chat ready:', await page.textContent('#status'));

  const mount = async (btn) => {
    await page.click(btn);
    await page.waitForFunction(() => {
      const t = document.getElementById('mount-info').textContent;
      return !t.includes('mounting') && (t.includes('mounted in') || t.includes('Unmounted in'));
    }, null, { timeout: 300_000 });
  };
  const ask = async (q) => {
    await page.fill('#chat-input', q);
    await page.click('#btn-send');
    await page.waitForFunction(() => !document.getElementById('btn-send').disabled, null, { timeout: 300_000 });
    const last = await page.$('#chat-log .msg.assistant:last-of-type');
    const text = (await last.textContent()) ?? '';
    const keys = await last.$$eval('.lookup .key', (es) => es.map((e) => e.textContent)).catch(() => []);
    const values = await last.$$eval('.lookup .value', (es) => es.map((e) => e.textContent)).catch(() => []);
    const prov = await last.$eval('.lookup .prov', (e) => e.textContent).catch(() => '');
    return { text, key: keys[0] ?? '', value: values[0] ?? '', keys, values, prov };
  };

  // cities memory mounted
  await mount('#btn-chat-c');
  let r = await ask('what is the population of Nairobi?');
  check('Nairobi key   ', r.key.startsWith('Nairobi, KE | population |'), `key='${r.key}'`);
  check('Nairobi value ', r.value.trim() === '4397073', `value='${r.value}' prov='${r.prov.slice(0, 40)}'`);
  check('Nairobi prose ', r.text.includes('4,397,073') || r.text.includes('4397073'), `text='${r.text.slice(-80).trim()}'`);
  r = await ask('how many people live in manchester in england');
  check('Manchester key', r.key.startsWith('Manchester, GB | population |'), `key='${r.key}'`);
  check('Manchester val', r.value.trim() === '568996', `value='${r.value}'`);
  r = await ask('tell me a joke');
  check('joke no lookup', r.key === '', `key='${r.key}' text='${r.text.slice(0, 60)}'`);

  // forget: unmount, same question → model guess badge
  await mount('#btn-none-chat');
  r = await ask('what is the population of Nairobi?');
  check('forgot badge  ', r.prov.includes('no memory mounted') || r.text.includes('no memory'), `prov='${r.prov.slice(0, 60)}' text='${r.text.slice(0, 60)}'`);

  // football memory
  await mount('#btn-chat-a');
  r = await ask('who won Newcastle against Liverpool?');
  const pairs = r.keys.map((k, i) => `${k} ${r.values[i]}`);
  check('football legs ', pairs.some((p) => p.startsWith('Newcastle v Liverpool | result |') && p.includes('2-3 (Liverpool)')), `pairs=${JSON.stringify(pairs)}`);
  check('football prose', /Liverpool/.test(r.text) && /2-3|4-1/.test(r.text), `text='${r.text.slice(-120).trim()}'`);

  await browser.close();
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
};
main().catch((e) => { console.error(e); process.exit(1); });
