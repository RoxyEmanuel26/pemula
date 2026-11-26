#!/usr/bin/env node
/**
 * scripts/indexnow-submit.mjs
 * Submits new and updated US & European URLs instantaneously to IndexNow
 * (notifying Bing, DuckDuckGo, Yahoo, Seznam EU, Yandex, and Naver).
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { BASE_URL, EU_LOCALES } from '../lib/schema.js';

const ROOT = process.cwd();
const KEY_FILENAME = '1b69cc1059c94dbcb3e9a18b36d3ed85.txt';
const DRY_RUN = process.argv.includes('--dry-run') || process.argv.includes('--mock');
const MAX_VIDEO_URLS = 1500;

async function extractLocs(xmlPath) {
  try {
    const content = await readFile(xmlPath, 'utf8');
    return [...content.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1].trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function main() {
  const keyPath = path.join(ROOT, KEY_FILENAME);
  const key = (await readFile(keyPath, 'utf8')).trim();
  const host = new URL(BASE_URL).hostname;
  const keyLocation = `${BASE_URL}/${KEY_FILENAME}`;

  // Prioritize root, EU localized homepages, RSS feed, static pages, EN hubs, and all 292 EU hubs first
  const urls = new Set([
    `${BASE_URL}/`,
    ...EU_LOCALES.map(lang => `${BASE_URL}/${lang}`),
    `${BASE_URL}/feed.xml`,
  ]);

  const sitemapsDir = path.join(ROOT, 'sitemaps');
  const files = (await readdir(sitemapsDir)).filter(f => f.endsWith('.xml')).sort();

  const nonVideoFiles = files.filter(f => !f.startsWith('sitemap_videos_'));
  const videoFiles = files.filter(f => f.startsWith('sitemap_videos_'));

  for (const file of nonVideoFiles) {
    const locs = await extractLocs(path.join(sitemapsDir, file));
    for (const u of locs) urls.add(u);
  }

  let videoAdded = 0;
  for (const file of videoFiles) {
    if (videoAdded >= MAX_VIDEO_URLS) break;
    const locs = await extractLocs(path.join(sitemapsDir, file));
    for (const u of locs) {
      if (videoAdded >= MAX_VIDEO_URLS) break;
      if (!urls.has(u)) {
        urls.add(u);
        videoAdded++;
      }
    }
  }

  const urlList = [...urls];
  console.log(`IndexNow prepared ${urlList.length} URLs for host ${host} (keyLocation: ${keyLocation}).`);

  if (DRY_RUN) {
    console.log('DRY RUN mode: skipping network POST to api.indexnow.org.');
    console.log('Sample payload URLs:', urlList.slice(0, 10));
    return;
  }

  const CHUNK = 1000;
  for (let i = 0; i < urlList.length; i += CHUNK) {
    const chunk = urlList.slice(i, i + CHUNK);
    const payload = {
      host,
      key,
      keyLocation,
      urlList: chunk,
    };

    try {
      const res = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify(payload),
      });
      console.log(`IndexNow batch ${Math.floor(i / CHUNK) + 1} (${chunk.length} URLs): HTTP ${res.status}`);
      if (!res.ok) {
        const body = await res.text();
        console.warn(`IndexNow non-OK response: ${body.slice(0, 200)}`);
      }
    } catch (err) {
      console.warn(`IndexNow request failed gracefully: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exitCode = 1;
});
