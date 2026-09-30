import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const DIR = path.join(ROOT, 'sitemaps');
const errors = [];
const seen = new Map();
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
  for (const block of urls) {
    const location = block.match(/<loc>(.*?)<\/loc>/)?.[1];
    if (!location) { errors.push(`${name}: URL entry has no loc`); continue; }
    if (!location.startsWith('https://www.lusthub.my.id/')) errors.push(`${name}: non-canonical loc ${location}`);
    if (seen.has(location)) errors.push(`${name}: duplicate loc also in ${seen.get(location)}: ${location}`);
    else seen.set(location, name);
    if (name.startsWith('sitemap_videos_')) {
      for (const tag of ['video:thumbnail_loc', 'video:title', 'video:description', 'video:player_loc']) {
        if (!block.includes(`<${tag}>`)) errors.push(`${name}: ${location} missing ${tag}`);
      }
      const lastmod = block.match(/<lastmod>(.*?)<\/lastmod>/)?.[1];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(lastmod || '')) errors.push(`${name}: ${location} has invalid lastmod`);
    }
  }
}

const index = await readFile(path.join(ROOT, 'sitemap_index.xml'), 'utf8');
const indexed = captureAll(index, /<loc>https:\/\/www\.lusthub\.my\.id\/sitemaps\/(.*?)<\/loc>/g);
for (const name of indexed) if (!files.includes(name)) errors.push(`sitemap_index.xml references missing ${name}`);
for (const name of files) if (!indexed.includes(name)) errors.push(`${name} is not referenced by sitemap_index.xml`);

if (errors.length) {
  console.error(`Sitemap validation failed with ${errors.length} issue(s):`);
  for (const error of errors.slice(0, 100)) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const sizes = await Promise.all(files.map((name) => stat(path.join(DIR, name))));
  const mb = sizes.reduce((sum, item) => sum + item.size, 0) / 1024 / 1024;
  console.log(`Sitemap validation passed: ${files.length} files, ${seen.size} unique URLs, ${mb.toFixed(2)} MB.`);
}
