// Isolate the streaming desync: raw createCompletion repeats via the page's
// wllama instance — no engram mounted, with and without stop strings.
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8080';

const main = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE}/examples/engram-demo/`, { waitUntil: 'domcontentloaded' });
  await page.click('#btn-load-assets');
  await page.waitForSelector('#sec-mount:not(.hidden)', { timeout: 300_000 });
  await page.waitForFunction(() => !!window.wllama, { timeout: 10_000 });

  const run = (opts) => page.evaluate(async (o) => {
    let streamed = '';
    const res = await window.wllama.createCompletion({
      prompt: o.prompt, max_tokens: 10, temperature: 0,
      ...(o.stop ? { stop: ['\n'] } : {}),
      stream: true,
      onData: (c) => { streamed += c.choices[0].text; },
    });
    return streamed;
  }, opts);

  console.log('--- no stop, 5 repeats (should be identical):');
  for (let i = 0; i < 5; i++) {
    console.log(`  ${i + 1}: '${await run({ prompt: 'The capital of France is', stop: false })}'`);
  }
  console.log('--- with stop [\\n], 5 repeats (should be identical):');
  for (let i = 0; i < 5; i++) {
    console.log(`  ${i + 1}: '${await run({ prompt: 'The capital of France is', stop: true })}'`);
  }
  await browser.close();
};
main().catch((e) => { console.error(e); process.exit(1); });
