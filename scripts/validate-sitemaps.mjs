import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { ALL_LOCALES, CURATED_CATEGORIES } from '../lib/schema.js';

const ROOT = process.cwd();
const DIR = path.join(ROOT, 'sitemaps');
const errors = [];
const seen = new Map();
const hreflangGraph = new Map(); // loc -> Map(hreflang -> targetHref)
const REQUIRED_HREFLANGS = [...ALL_LOCALES, 'x-default'];

const captureAll = (content, regex) => [...content.matchAll(regex)].map((match) => match[1]);
const files = (await readdir(DIR)).filter((name) => name.endsWith('.xml')).sort();

for (const name of files) {
  const file = path.join(DIR, name);
  const content = await readFile(file, 'utf8');
  const bytes = (await stat(file)).size;
  const urls = captureAll(content, /<url>([\s\S]*?)<\/url>/g);
  if (!content.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) errors.push(`${name}: invalid XML declaration`);
  if (bytes > 50 * 1024 * 1024) errors.push(`${name}: exceeds 50 MB`);
  if (urls.length > 50000) errors.push(`${name}: exceeds 50,000 URLs`);
  if (/<(?:priority|changefreq)>/i.test(content)) errors.push(`${name}: contains ignored priority/changefreq tags`);
  if (content.includes('<xhtml:link') && !content.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"')) {
    errors.push(`${name}: uses xhtml:link without xmlns:xhtml namespace`);
  }

  for (const block of urls) {
    const location = block.match(/<loc>(.*?)<\/loc>/)?.[1];
    if (!location) { errors.push(`${name}: URL entry has no loc`); continue; }
    if (!location.startsWith('https://www.lusthub.my.id/')) errors.push(`${name}: non-canonical loc ${location}`);
    if (/lusthub\.my\.id\/\//.test(location)) errors.push(`${name}: double-slash loc ${location}`);
    if (seen.has(location)) errors.push(`${name}: duplicate loc also in ${seen.get(location)}: ${location}`);
    else seen.set(location, name);

    const altMatches = [...block.matchAll(/<xhtml:link\s+rel="alternate"\s+hreflang="([^"]+)"\s+href="([^"]+)"\s*\/>/g)];
    if (altMatches.length > 0) {
      const altMap = new Map();
      for (const m of altMatches) {
        altMap.set(m[1], m[2]);
      }
      for (const reqLang of REQUIRED_HREFLANGS) {
        if (!altMap.has(reqLang)) {
          errors.push(`${name}: ${location} missing hreflang="${reqLang}"`);
        }
      }
      hreflangGraph.set(location, altMap);
    }

    if (name.startsWith('sitemap_videos_')) {
      for (const tag of ['video:thumbnail_loc', 'video:title', 'video:description', 'video:player_loc']) {
        if (!block.includes(`<${tag}>`)) errors.push(`${name}: ${location} missing ${tag}`);
      }
      const lastmod = block.match(/<lastmod>(.*?)<\/lastmod>/)?.[1];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(lastmod || '')) errors.push(`${name}: ${location} has invalid lastmod`);
    }
  }
}

// Verify EU localized sitemap + compound sitemap presence and complete hreflang reciprocity
if (!files.includes('sitemap_eu_locales.xml')) {
  errors.push('Missing sitemaps/sitemap_eu_locales.xml');
}
if (!files.includes('sitemap_compound.xml')) {
  errors.push('Missing sitemaps/sitemap_compound.xml');
}
const expectedLocalizedCount = ALL_LOCALES.length * (CURATED_CATEGORIES.length + 1);
if (hreflangGraph.size !== expectedLocalizedCount) {
  errors.push(`Expected ${expectedLocalizedCount} hreflang-annotated URLs, found ${hreflangGraph.size}`);
}
for (const [srcLoc, altMap] of hreflangGraph.entries()) {
  for (const [code, targetHref] of altMap.entries()) {
    if (!seen.has(targetHref)) {
      errors.push(`hreflang target ${targetHref} (from ${srcLoc} [${code}]) is missing from sitemaps`);
      continue;
    }
    const backMap = hreflangGraph.get(targetHref);
    if (!backMap || ![...backMap.values()].includes(srcLoc)) {
      errors.push(`hreflang reciprocity broken: ${srcLoc} -> ${targetHref} does not link back`);
    }
  }
}

const index = await readFile(path.join(ROOT, 'sitemap_index.xml'), 'utf8');
const rootSitemap = await readFile(path.join(ROOT, 'sitemap.xml'), 'utf8');
if (index !== rootSitemap) errors.push('sitemap.xml and sitemap_index.xml have drifted out of sync');

const indexed = captureAll(index, /<loc>https:\/\/www\.lusthub\.my\.id\/sitemaps\/(.*?)<\/loc>/g);
for (const name of indexed) if (!files.includes(name)) errors.push(`sitemap_index.xml references missing ${name}`);
for (const name of files) if (!indexed.includes(name)) errors.push(`${name} is not referenced by sitemap_index.xml`);

try {
  const feed = await readFile(path.join(ROOT, 'feed.xml'), 'utf8');
  if (!feed.startsWith('<?xml version="1.0" encoding="UTF-8"?>') || !feed.includes('<rss version="2.0"')) {
    errors.push('feed.xml: invalid RSS 2.0 structure');
  }
} catch {
  errors.push('feed.xml: missing RSS feed file');
}

if (errors.length) {
  console.error(`Sitemap validation failed with ${errors.length} issue(s):`);
  for (const error of errors.slice(0, 100)) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const sizes = await Promise.all(files.map((name) => stat(path.join(DIR, name))));
  const mb = sizes.reduce((sum, item) => sum + item.size, 0) / 1024 / 1024;
  console.log(`Sitemap validation passed: ${files.length} files, ${seen.size} unique URLs (${hreflangGraph.size} verified ${REQUIRED_HREFLANGS.length}-way reciprocal hreflang URLs), ${mb.toFixed(2)} MB.`);
}
