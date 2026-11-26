import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { EU_LOCALES } from '../lib/schema.js';
import { getRuntimeIndex } from '../lib/runtime-store.js';
import { renderHomePage } from '../lib/home-renderer.js';

const SUPPORTED_SET = new Set(EU_LOCALES);

let cachedLocales = null;
let cached404 = null;

async function getLocales() {
  if (!cachedLocales) {
    const raw = await readFile(path.join(process.cwd(), 'data', 'eu-locales.json'), 'utf8');
    cachedLocales = JSON.parse(raw);
  }
  return cachedLocales;
}

export default async function handler(req, res) {
  const lang = String(req.query?.lang || '').trim().toLowerCase();
  if (!SUPPORTED_SET.has(lang)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, follow');
    if (!cached404) {
      cached404 = await readFile(path.join(process.cwd(), '404.html'), 'utf8');
    }
    return res.end(cached404);
  }

  const [locales, index] = await Promise.all([getLocales(), getRuntimeIndex()]);
  const hasNoindexParam = Boolean(req.query?.q || req.query?.page || req.query?.ref || req.query?.order);

  const html = renderHomePage({
    lang,
    localeCfg: locales[lang],
    index,
    hasNoindexParam,
  });

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Language', lang);
  if (hasNoindexParam) {
    res.setHeader('X-Robots-Tag', 'noindex, follow');
  }
  res.setHeader('Rating', 'RTA-5042-1996-1400-1577-RTA');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  return res.end(html);
}
