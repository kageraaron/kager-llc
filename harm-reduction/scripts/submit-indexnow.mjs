#!/usr/bin/env node
// Submit URLs to IndexNow (Bing, Yandex, and downstream AI surfaces like
// ChatGPT Search / Copilot that rely on the Bing index).
//
// Usage:
//   node scripts/submit-indexnow.mjs                  # submit every URL in dist/sitemap-0.xml
//   node scripts/submit-indexnow.mjs <url> [url...]   # submit only the URLs you pass
//
// Run AFTER the site is built and deployed (IndexNow re-fetches the live URLs).

import { readFileSync } from 'node:fs';

const KEY = '1b70a6189014407e9d96bb2930438b61';
const HOST = 'www.ravewellness.org';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';

function urlsFromSitemap(path) {
  const xml = readFileSync(path, 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

const args = process.argv.slice(2);
let urlList;
if (args.length) {
  urlList = args;
} else {
  try {
    urlList = urlsFromSitemap('dist/sitemap-0.xml');
  } catch {
    console.error('No dist/sitemap-0.xml found. Run `npm run build` first, or pass URLs as arguments.');
    process.exit(1);
  }
}

if (!urlList.length) {
  console.error('No URLs to submit.');
  process.exit(1);
}

const body = { host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList };

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

console.log(`IndexNow: submitted ${urlList.length} URL(s) -> HTTP ${res.status} ${res.statusText}`);
if (!res.ok) {
  const text = await res.text().catch(() => '');
  if (text) console.log(text);
  process.exit(1);
}
