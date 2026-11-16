import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  BASE_URL,
  CURATED_CATEGORIES,
  US_EU_CATEGORIES,
  decodeMojibake,
  slugify,
  normalizeUrl,
} from '../api/schema-helper.js';

const ROOT = process.cwd();
const API_BASE = 'https://www.eporner.com/api/v2/video';
const SITEMAP_DIR = path.join(ROOT, 'sitemaps');
const STATE_PATH = path.join(ROOT, 'data', 'sitemap-state.json');
const ENRICHED_PATH = path.join(ROOT, 'data', 'enriched-videos.json');
const FEED_PATH = path.join(ROOT, 'feed.xml');
const OFFLINE = process.argv.includes('--offline');
const PER_PAGE = envNumber('SITEMAP_PER_PAGE', 1000, 1, 1000);
const MAX_FETCH_PAGES = envNumber('SITEMAP_MAX_FETCH_PAGES', 10, 1, 50);
const BOOTSTRAP_PAGES = envNumber('SITEMAP_BOOTSTRAP_PAGES', Math.min(10, MAX_FETCH_PAGES), 1, MAX_FETCH_PAGES);
const MAX_RECORDS = envNumber('SITEMAP_MAX_VIDEOS', 20000, 1000, 45000);
const CHUNK_SIZE = envNumber('SITEMAP_CHUNK_SIZE', 5000, 500, 45000);
const FETCH_DELAY_MS = envNumber('SITEMAP_FETCH_DELAY_MS', 350, 0, 5000);
const USER_AGENT = 'lusthub-sitemap-bot/9.0 (+https://www.lusthub.my.id/robots.txt)';

const STATIC_PAGES = [
  ['/', 'index.html'], ['/about', 'about.html'], ['/howto', 'howto.html'],
  ['/contact', 'contact.html'], ['/dmca', 'dmca.html'],
  ['/privacy', 'privacy.html'], ['/terms', 'terms.html'],
];

// High-demand US/EU queries polled alongside latest releases so catalog stays aligned with real search volume
const US_EU_SEED_QUERIES = US_EU_CATEGORIES.slice(0, 8);

function envNumber(name, fallback, min, max) {
  const value = Number.parseInt(process.env[name] || String(fallback), 10);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return value;
}

function xmlEscape(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function normalizeDate(value) {
  if (!value) return null;
  const iso = String(value).trim().replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/, '$1T$2Z');
  const date = new Date(iso);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function validHttpUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : '';
  } catch { return ''; }
}

function normalizeKeywords(raw) {
  if (!raw) return '';
  const list = Array.isArray(raw) ? raw : String(raw).split(',');
  return list
    .map((item) => decodeMojibake(item).trim())
    .filter((item) => item && item.length <= 40)
    .slice(0, 12)
    .join(', ')
    .slice(0, 240);
}

function normalizeVideo(video) {
  const id = String(video?.id || '').trim();
  const title = decodeMojibake(video?.title) || (id ? `Video ${id}` : '');
  const thumbnail = normalizeUrl(validHttpUrl(video?.thumbnail || video?.default_thumb?.src || video?.thumbs?.[0]?.src));
  const player = normalizeUrl(validHttpUrl(video?.player || video?.embed || (id ? `https://www.eporner.com/embed/${id}/` : '')));
  const published = normalizeDate(video?.published || video?.added);
  if (!id || !title || !thumbnail || !player || !published) return null;

  const duration = Number.parseInt(video?.duration || video?.length_sec || '0', 10);
  const views = Number.parseInt(String(video?.views ?? '0').replace(/\D/g, ''), 10) || 0;
  const rate = video?.rate ? String(video.rate).trim() : '';
  const keywords = normalizeKeywords(video?.keywords);

  const normalized = {
    id,
    slug: slugify(video?.slug || title, 100, id),
    title: title.slice(0, 300),
    description: String(video?.description || `Watch ${title} in HD on lusthub.my.id.`).slice(0, 2048),
    thumbnail,
    player,
    duration: Number.isFinite(duration) && duration > 0 && duration <= 28800 ? duration : 0,
    published,
  };
  if (views > 0) normalized.views = views;
  if (rate) normalized.rate = rate;
  if (keywords) normalized.keywords = keywords;
  return normalized;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, attempt = 1) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(30000),
  });
  if (response.ok) return response.json();
  if (attempt < 4 && (response.status === 429 || response.status >= 500)) {
    const retryAfter = Number.parseInt(response.headers.get('retry-after') || '0', 10);
    await sleep(Math.max(retryAfter * 1000, attempt * 3000));
    return fetchJson(url, attempt + 1);
  }
  throw new Error(`API request failed with HTTP ${response.status}: ${url}`);
}

async function readState() {
  try {
    const parsed = JSON.parse(await readFile(STATE_PATH, 'utf8'));
    if (!Array.isArray(parsed.videos)) throw new Error('videos must be an array');
    return parsed;
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn(`Ignoring invalid sitemap state: ${error.message}`);
    return { version: 1, videos: [] };
  }
}

async function fetchSearchFeed(query, order, pages, knownIds, stopOnKnown) {
  const found = new Map();
  for (let page = 1; page <= pages; page += 1) {
    const url = new URL(`${API_BASE}/search/`);
    url.search = new URLSearchParams({
      query, per_page: String(PER_PAGE), page: String(page), thumbsize: 'big',
      order, gay: '0', lq: '1', format: 'json',
    }).toString();
    const payload = await fetchJson(url);
    const videos = Array.isArray(payload?.videos) ? payload.videos : [];
    let encounteredKnown = false;
    for (const rawVideo of videos) {
      if (knownIds.has(String(rawVideo?.id || ''))) encounteredKnown = true;
      const video = normalizeVideo(rawVideo);
      if (video && !found.has(video.id)) found.set(video.id, video);
    }
    console.log(`Fetched [${query} | ${order}] p${page}/${pages}: ${videos.length} records`);
    if (videos.length === 0 || (stopOnKnown && encounteredKnown) || videos.length < PER_PAGE) break;
    if (page < pages) await sleep(FETCH_DELAY_MS);
  }
  return [...found.values()];
}

async function fetchCatalogVideos(knownIds, stateExists) {
  const merged = new Map();
  const pageLimit = stateExists ? MAX_FETCH_PAGES : BOOTSTRAP_PAGES;

  // 1. Fresh uploads (using big 640x360 thumbs)
  const latest = await fetchSearchFeed('all', 'latest', pageLimit, knownIds, false);
  for (const v of latest) merged.set(v.id, v);

  // 2. High-velocity US/EU global trending feeds (top-weekly & top-monthly)
  for (const order of ['top-weekly', 'top-monthly']) {
    await sleep(FETCH_DELAY_MS);
    try {
      const popular = await fetchSearchFeed('all', order, 2, knownIds, false);
      for (const v of popular) {
        if (!merged.has(v.id)) merged.set(v.id, v);
      }
    } catch (err) {
      console.warn(`Popular feed (${order}) warning: ${err.message}`);
    }
  }

  // 3. Curated US/EU niche queries (picks 3 rotating hubs per run to spread API load cleanly)
  const dayOffset = Math.floor(Date.now() / 86400000);
  for (let i = 0; i < 3; i += 1) {
    const slug = US_EU_SEED_QUERIES[(dayOffset + i) % US_EU_SEED_QUERIES.length];
    await sleep(FETCH_DELAY_MS);
    try {
      const seeded = await fetchSearchFeed(slug.replace(/-/g, ' '), 'top-monthly', 1, knownIds, false);
      for (const v of seeded) {
        if (!merged.has(v.id)) merged.set(v.id, v);
      }
    } catch (err) {
      console.warn(`Seed query (${slug}) warning: ${err.message}`);
    }
  }

  return [...merged.values()];
}

async function fetchRemovedIds() {
  try {
    const payload = await fetchJson(`${API_BASE}/removed/?format=json`);
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.videos) ? payload.videos : [];
    return new Set(rows.map((entry) => String(entry?.id || entry)).filter(Boolean));
  } catch (error) {
    console.warn(`Removed-video check skipped: ${error.message}`);
    return new Set();
  }
}

function gitLastModified(file) {
  try {
    const value = execFileSync('git', ['log', '-1', '--format=%cI', '--', file], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return normalizeDate(value)?.slice(0, 10) || null;
  } catch { return null; }
}

function urlset(rows, video = false) {
  const videoNamespace = video ? ' xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"' : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${videoNamespace}>\n${rows.join('\n')}\n</urlset>\n`;
}

function buildPagesSitemap() {
  return urlset(STATIC_PAGES.map(([urlPath, file]) => {
    const lastmod = gitLastModified(file);
    return ['  <url>', `    <loc>${xmlEscape(`${BASE_URL}${urlPath}`)}</loc>`,
      lastmod ? `    <lastmod>${lastmod}</lastmod>` : null, '  </url>'].filter(Boolean).join('\n');
  }));
}

function buildCategoriesSitemap() {
  const catLastMod = gitLastModified('data/category-descriptions.json') || gitLastModified('category.html') || new Date().toISOString().slice(0, 10);
  return urlset(CURATED_CATEGORIES.map((category) =>
    `  <url>\n    <loc>${xmlEscape(`${BASE_URL}/c/${category}`)}</loc>\n    <lastmod>${catLastMod}</lastmod>\n  </url>`));
}

function buildVideoSitemap(videos, enrichedMap) {
  return urlset(videos.map((video) => {
    const e = enrichedMap[video.id];
    const title = e?.seo_title ? e.seo_title.replace(/\s*\|\s*(LustHub|lusthub\.my\.id)$/i, '').trim() : video.title;
    const desc = e?.meta_description || video.description;
    const thumb = normalizeUrl(e?.thumbnail && e.thumbnail.includes('_360') ? e.thumbnail : video.thumbnail);
    const duration = video.duration ? `\n      <video:duration>${video.duration}</video:duration>` : '';
    return `  <url>\n    <loc>${xmlEscape(`${BASE_URL}/v/${video.id}-${video.slug}`)}</loc>\n    <lastmod>${video.published.slice(0, 10)}</lastmod>\n    <video:video>\n      <video:thumbnail_loc>${xmlEscape(thumb)}</video:thumbnail_loc>\n      <video:title>${xmlEscape(title)}</video:title>\n      <video:description>${xmlEscape(desc)}</video:description>\n      <video:player_loc>${xmlEscape(video.player)}</video:player_loc>${duration}\n      <video:publication_date>${video.published}</video:publication_date>\n      <video:family_friendly>no</video:family_friendly>\n    </video:video>\n  </url>`;
  }), true);
}

function buildRssFeed(videos, enrichedMap) {
  const latestItems = videos.slice(0, 50).map((video) => {
    const e = enrichedMap[video.id];
    const link = `${BASE_URL}/v/${video.id}-${video.slug}`;
    const title = e?.seo_title || video.title;
    const desc = e?.meta_description || video.description;
    const thumb = normalizeUrl(video.thumbnail);
    const pubDate = new Date(video.published).toUTCString();
    return `    <item>
      <title>${xmlEscape(title)}</title>
      <link>${xmlEscape(link)}</link>
      <guid isPermaLink="true">${xmlEscape(link)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${xmlEscape(desc)}</description>
      <media:thumbnail url="${xmlEscape(thumb)}" width="640" height="360" />
      <media:rating scheme="urn:simple">adult</media:rating>
    </item>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>lusthub.my.id — Latest 18+ HD Videos</title>
    <link>${BASE_URL}/</link>
    <description>Daily curated US, European, Asian, and amateur 1080p HD adult videos on lusthub.my.id.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${BASE_URL}/feed.xml" rel="self" type="application/rss+xml" />
${latestItems.join('\n')}
  </channel>
</rss>
`;
}

function buildIndex(entries) {
  const rows = entries.map(({ file, lastmod }) =>
    `  <sitemap>\n    <loc>${xmlEscape(`${BASE_URL}/sitemaps/${file}`)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </sitemap>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</sitemapindex>\n`;
}

async function writeIfChanged(file, content) {
  let previous = null;
  try { previous = await readFile(file, 'utf8'); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  if (previous === content) return false;
  await writeFile(file, content, 'utf8');
  return true;
}

async function removeObsoleteSitemaps(keep) {
  let removed = 0;
  for (const name of await readdir(SITEMAP_DIR)) {
    const generatedVideo = /^sitemap_video(?:s)?_.+\.xml$/i.test(name);
    const legacy = /^sitemap_(?:kategori|tags)\.xml$/i.test(name);
    if ((generatedVideo || legacy) && !keep.has(name)) {
      await unlink(path.join(SITEMAP_DIR, name));
      removed += 1;
    }
  }
  return removed;
}

async function main() {
  await mkdir(SITEMAP_DIR, { recursive: true });
  await mkdir(path.dirname(STATE_PATH), { recursive: true });
  const state = await readState();
  const knownIds = new Set(state.videos.map((video) => video.id));
  const latest = OFFLINE ? [] : await fetchCatalogVideos(knownIds, state.videos.length > 0);
  const removedIds = OFFLINE ? new Set() : await fetchRemovedIds();

  // Preserve freshly fetched metadata (views/rate/keywords/big thumb) over stale state records
  const merged = new Map();
  for (const video of [...latest, ...state.videos]) {
    const normalized = normalizeVideo(video);
    if (normalized && !removedIds.has(normalized.id) && !merged.has(normalized.id)) {
      merged.set(normalized.id, normalized);
    }
  }
  const videos = [...merged.values()]
    .sort((a, b) => b.published.localeCompare(a.published) || a.id.localeCompare(b.id))
    .slice(0, MAX_RECORDS);
  if (!videos.length) throw new Error('No valid videos available; refusing to replace a good sitemap with an empty one.');

  const changed = [];
  const indexEntries = [];
  if (await writeIfChanged(path.join(SITEMAP_DIR, 'sitemap_pages.xml'), buildPagesSitemap())) changed.push('sitemap_pages.xml');
  if (await writeIfChanged(path.join(SITEMAP_DIR, 'sitemap_categories.xml'), buildCategoriesSitemap())) changed.push('sitemap_categories.xml');
  indexEntries.push({ file: 'sitemap_pages.xml', lastmod: gitLastModified('index.html') || new Date().toISOString().slice(0, 10) });
  indexEntries.push({ file: 'sitemap_categories.xml', lastmod: gitLastModified('data/category-descriptions.json') || gitLastModified('category.html') || new Date().toISOString().slice(0, 10) });

  // Quality Gate: ONLY genuine AI-enriched videos (exclude mock-enricher & pending/failed thin pages)
  const enrichedIds = new Set();
  let enrichedMap = {};
  try {
    const rawEnriched = await readFile(ENRICHED_PATH, 'utf8');
    const enrichedJson = JSON.parse(rawEnriched);
    if (enrichedJson.videos) {
      enrichedMap = enrichedJson.videos;
      for (const [id, v] of Object.entries(enrichedJson.videos)) {
        if (v.status === 'enriched' && v.model && v.model !== 'mock-enricher') {
          enrichedIds.add(id);
        }
      }
    }
  } catch {}

  const sitemapVideos = enrichedIds.size > 0
    ? videos.filter((v) => enrichedIds.has(v.id))
    : videos;

  const keep = new Set();
  for (let offset = 0, index = 1; offset < sitemapVideos.length; offset += CHUNK_SIZE, index += 1) {
    const chunk = sitemapVideos.slice(offset, offset + CHUNK_SIZE);
    const file = `sitemap_videos_${String(index).padStart(3, '0')}.xml`;
    keep.add(file);
    if (await writeIfChanged(path.join(SITEMAP_DIR, file), buildVideoSitemap(chunk, enrichedMap))) changed.push(file);
    indexEntries.push({ file, lastmod: chunk[0]?.published.slice(0, 10) || null });
  }

  const removedFiles = await removeObsoleteSitemaps(keep);
  const indexXml = buildIndex(indexEntries);
  if (await writeIfChanged(STATE_PATH, `${JSON.stringify({ version: 1, videos })}\n`)) changed.push('data/sitemap-state.json');
  if (await writeIfChanged(path.join(ROOT, 'sitemap.xml'), indexXml)) changed.push('sitemap.xml');
  if (await writeIfChanged(path.join(ROOT, 'sitemap_index.xml'), indexXml)) changed.push('sitemap_index.xml');
  if (await writeIfChanged(FEED_PATH, buildRssFeed(sitemapVideos, enrichedMap))) changed.push('feed.xml');

  const newCount = latest.filter((video) => !knownIds.has(video.id)).length;
  const removedCount = state.videos.filter((video) => removedIds.has(video.id)).length;
  console.log(`Sitemap refresh complete: ${videos.length} rolling videos (${sitemapVideos.length} genuine AI-enriched in sitemap), ${newCount} new, ${removedCount} removed.`);
  console.log(`Generated ${keep.size} video sitemap files; deleted ${removedFiles} obsolete files.`);
  console.log(changed.length ? `Changed: ${changed.join(', ')}` : 'No content changes; no deployment is needed.');
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
