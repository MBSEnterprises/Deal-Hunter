import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const sources = JSON.parse(await fs.readFile('retail-sources.json', 'utf8'));
const results = [];

function extractPrice(text, productId) {
  const compact = String(text || '').replace(/\s+/g, ' ');
  const windows = [];
  const idx = productId ? compact.indexOf(productId) : -1;
  if (idx >= 0) windows.push(compact.slice(Math.max(0, idx - 700), idx + 1800));
  windows.push(compact.slice(0, 30000));
  for (const block of windows) {
    const matches = [...block.matchAll(/\$\s*([0-9]{1,4}(?:,[0-9]{3})*(?:\.\d{2})?)/g)]
      .map(m => Number(m[1].replace(/,/g, '')))
      .filter(n => Number.isFinite(n) && n >= 5 && n < 10000);
    if (matches.length) return matches[0];
  }
  return null;
}

async function readBody(page) {
  await page.waitForTimeout(2500);
  return page.locator('body').innerText({ timeout: 10000 });
}

const browser = await chromium.launch({ headless: true, args: ['--disable-http2'] });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',
  viewport: { width: 1440, height: 1200 }
});

for (const source of sources) {
  const checked_at = new Date().toISOString();
  const row = { ...source, checked_at, price: null, status: 'unknown', method: 'browser' };
  const page = await context.newPage();
  try {
    try {
      await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 35000 });
      const body = await readBody(page);
      row.price = extractPrice(body, source.product_id);
      row.method = 'retailer_browser';
      row.final_url = page.url();
    } catch (directError) {
      row.direct_error = String(directError?.message || directError).slice(0, 220);
    }

    if (row.price == null) {
      const queries = [
        `https://www.bing.com/search?q=${encodeURIComponent(`site:${new URL(source.url).hostname} "${source.product_id}" "${source.name}"`)}`,
        `https://www.google.com/search?q=${encodeURIComponent(`site:${new URL(source.url).hostname} "${source.product_id}" "${source.name}"`)}`
      ];
      for (const searchUrl of queries) {
        try {
          await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          const body = await readBody(page);
          const recovered = extractPrice(body, source.product_id);
          if (recovered != null) {
            row.price = recovered;
            row.method = searchUrl.includes('bing.com') ? 'bing_browser_fallback' : 'google_browser_fallback';
            break;
          }
        } catch (_) {}
      }
    }

    row.status = row.price == null ? 'price_unavailable' : 'ok';
  } catch (e) {
    row.status = 'error';
    row.error = String(e?.message || e).slice(0, 300);
  } finally {
    await page.close();
  }
  results.push(row);
}

await browser.close();
await fs.writeFile('price-cache.json', JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
