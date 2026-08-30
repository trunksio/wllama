// Verifies the demo page's Cache Storage layer: with a persistent browser
// profile, the first visit downloads the assets and the second visit must
// serve every file from the browser cache.
//
// Usage: node scripts/test_engram_cache.mjs [http://127.0.0.1:8090/demo.html]

import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://127.0.0.1:8090/demo.html';
const profile = mkdtempSync(join(tmpdir(), 'engram-cache-test-'));

const loadOnce = async (context, label) => {
  const page = await context.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.click('#btn-load-assets');
  await page.waitForSelector('#sec-mount:not(.hidden)', { timeout: 600_000 });
  const rows = await page.$$eval('#progress .dl > div:first-child',
    (els) => els.map((e) => e.textContent));
  console.log(`${label}:`);
  for (const r of rows) console.log(`  ${r}`);
  await page.close();
  return rows;
};

const main = async () => {
  const context = await chromium.launchPersistentContext(profile, { headless: true });
  const first = await loadOnce(context, 'first visit');
  const second = await loadOnce(context, 'second visit');
  await context.close();

  const cachedFirst = first.filter((r) => r.includes('from browser cache')).length;
  const cachedSecond = second.filter((r) => r.includes('from browser cache')).length;
  console.log(`\nfirst visit from cache: ${cachedFirst}/${first.length} (expect 0)`);
  console.log(`second visit from cache: ${cachedSecond}/${second.length} (expect all)`);
  const ok = cachedFirst === 0 && second.length > 0 && cachedSecond === second.length;
  console.log(ok ? 'CACHE PASS' : 'CACHE FAIL');
  process.exit(ok ? 0 : 1);
};

main().catch((err) => { console.error(err); process.exit(1); });
