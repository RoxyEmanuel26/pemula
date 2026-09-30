import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const BASE_URL = (process.env.SITEMAP_BASE_URL || 'https://www.lusthub.my.id').replace(/\/$/, '');
const API_BASE = 'https://www.eporner.com/api/v2/video';
const SITEMAP_DIR = path.join(ROOT, 'sitemaps');
const STATE_PATH = path.join(ROOT, 'data', 'sitemap-state.json');
const OFFLINE = process.argv.includes('--offline');
const PER_PAGE = envNumber('SITEMAP_PER_PAGE', 1000, 1, 1000);
const MAX_FETCH_PAGES = envNumber('SITEMAP_MAX_FETCH_PAGES', 20, 1, 50);
const BOOTSTRAP_PAGES = envNumber('SITEMAP_BOOTSTRAP_PAGES', 10, 1, MAX_FETCH_PAGES);
const MAX_RECORDS = envNumber('SITEMAP_MAX_VIDEOS', 20000, 1000, 45000);
const CHUNK_SIZE = envNumber('SITEMAP_CHUNK_SIZE', 5000, 500, 45000);
const FETCH_DELAY_MS = envNumber('SITEMAP_FETCH_DELAY_MS', 350, 0, 5000);
const USER_AGENT = 'lusthub-sitemap-bot/8.0 (+https://www.lusthub.my.id/robots.txt)';

const STATIC_PAGES = [
  ['/', 'index.html'], ['/about', 'about.html'], ['/howto', 'howto.html'],
  ['/contact', 'contact.html'], ['/dmca', 'dmca.html'],
  ['/privacy', 'privacy.html'], ['/terms', 'terms.html'],
];

// Submit categories that are actually linked by the UI. Mass-generated thin
// category routes waste crawl budget and do not gain quality from a sitemap.
const CURATED_CATEGORIES = [
  'amateur', 'asian', 'celebrity', 'couple', 'dance', 'hijab', 'homemade',
  'indonesia', 'japanese', 'korean', 'live-cam', 'mature', 'outdoor', 'student',
  'viral', 'bokep-indo', 'mahasiswi', 'pasutri', 'rumahan', 'artis-indo',
  'pantai', 'hotel', 'tiktok-viral', 'hot-indo',
];

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

function decodeMojibake(value) {
  const text = String(value || '').trim();
  if (!/[ÃÂâ]/.test(text)) return text;
  try {
    const decoded = Buffer.from(text, 'latin1').toString('utf8');
    return decoded.includes('\uFFFD') ? text : decoded;
  } catch { return text; }
}

function slugify(value, fallback) {
  const slug = decodeMojibake(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 100).replace(/-+$/g, '');
  return slug || fallback;
}

function normalizeDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`;
  const date = new Date(zoned);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function validHttpUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : '';
  } catch { return ''; }
}

function normalizeVideo(video) {
  const id = String(video?.id || '').trim();
  const title = decodeMojibake(video?.title) || (id ? `Video ${id}` : '');
  const thumbnail = validHttpUrl(video?.thumbnail || video?.default_thumb?.src || video?.thumbs?.[0]?.src);
  const player = validHttpUrl(video?.player || video?.embed || (id ? `https://www.eporner.com/embed/${id}/` : ''));
  const published = normalizeDate(video?.published || video?.added);
  if (!id || !title || !thumbnail || !player || !published) return null;
  const duration = Number.parseInt(video?.duration || video?.length_sec || '0', 10);
  return {
    id, slug: slugify(video?.slug || title, id), title: title.slice(0, 300),
    description: String(video?.description || `Watch ${title} in HD on lusthub.my.id.`).slice(0, 2048),
    thumbnail, player,
    duration: Number.isFinite(duration) && duration > 0 && duration <= 28800 ? duration : 0,
    published,
  };
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

async function fetchLatestVideos(knownIds, stateExists) {
  const found = new Map();
  const pageLimit = stateExists ? MAX_FETCH_PAGES : BOOTSTRAP_PAGES;
  for (let page = 1; page <= pageLimit; page += 1) {
    const url = new URL(`${API_BASE}/search/`);
    url.search = new URLSearchParams({
      query: 'all', per_page: String(PER_PAGE), page: String(page), thumbsize: 'small',
      order: 'latest', gay: '0', lq: '1', format: 'json',
    }).toString();
    const payload = await fetchJson(url);
    const videos = Array.isArray(payload?.videos) ? payload.videos : [];
    let encounteredKnown = false;
    for (const rawVideo of videos) {
      if (knownIds.has(String(rawVideo?.id || ''))) encounteredKnown = true;
      const video = normalizeVideo(rawVideo);
      if (video && !found.has(video.id)) found.set(video.id, video);
    }
    console.log(`Fetched latest page ${page}/${pageLimit}: ${videos.length} records`);
    if (videos.length === 0 || encounteredKnown || videos.length < PER_PAGE) break;
    if (page < pageLimit) await sleep(FETCH_DELAY_MS);
  }
  return [...found.values()];
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
  return urlset(CURATED_CATEGORIES.map((category) =>
    `  <url>\n    <loc>${xmlEscape(`${BASE_URL}/c/${category}`)}</loc>\n  </url>`));
}

function buildVideoSitemap(videos) {
  return urlset(videos.map((video) => {
    const duration = video.duration ? `\n      <video:duration>${video.duration}</video:duration>` : '';
    return `  <url>\n    <loc>${xmlEscape(`${BASE_URL}/v/${video.id}-${video.slug}`)}</loc>\n    <lastmod>${video.published.slice(0, 10)}</lastmod>\n    <video:video>\n      <video:thumbnail_loc>${xmlEscape(video.thumbnail)}</video:thumbnail_loc>\n      <video:title>${xmlEscape(video.title)}</video:title>\n      <video:description>${xmlEscape(video.description)}</video:description>\n      <video:player_loc>${xmlEscape(video.player)}</video:player_loc>${duration}\n      <video:publication_date>${video.published}</video:publication_date>\n      <video:family_friendly>no</video:family_friendly>\n    </video:video>\n  </url>`;
  }), true);
}

function buildRootSitemap() {
  const lastmod = gitLastModified('index.html');
  return urlset([`  <url>\n    <loc>${BASE_URL}/</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`]);
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
  const latest = OFFLINE ? [] : await fetchLatestVideos(knownIds, state.videos.length > 0);
  const removedIds = OFFLINE ? new Set() : await fetchRemovedIds();
  const merged = new Map();
  for (const video of [...latest, ...state.videos]) {
    const normalized = normalizeVideo(video);
    if (normalized && !removedIds.has(normalized.id) && !merged.has(normalized.id)) merged.set(normalized.id, normalized);
  }
  const videos = [...merged.values()]
    .sort((a, b) => b.published.localeCompare(a.published) || a.id.localeCompare(b.id))
    .slice(0, MAX_RECORDS);
  if (!videos.length) throw new Error('No valid videos available; refusing to replace a good sitemap with an empty one.');

  const changed = [];
  const indexEntries = [];
  if (await writeIfChanged(path.join(SITEMAP_DIR, 'sitemap_pages.xml'), buildPagesSitemap())) changed.push('sitemap_pages.xml');
  if (await writeIfChanged(path.join(SITEMAP_DIR, 'sitemap_categories.xml'), buildCategoriesSitemap())) changed.push('sitemap_categories.xml');
  indexEntries.push({ file: 'sitemap_pages.xml', lastmod: gitLastModified('index.html') });
  indexEntries.push({ file: 'sitemap_categories.xml', lastmod: null });

  const keep = new Set();
  for (let offset = 0, index = 1; offset < videos.length; offset += CHUNK_SIZE, index += 1) {
    const chunk = videos.slice(offset, offset + CHUNK_SIZE);
    const file = `sitemap_videos_${String(index).padStart(3, '0')}.xml`;
    keep.add(file);
    if (await writeIfChanged(path.join(SITEMAP_DIR, file), buildVideoSitemap(chunk))) changed.push(file);
    indexEntries.push({ file, lastmod: chunk[0]?.published.slice(0, 10) || null });
  }

  const removedFiles = await removeObsoleteSitemaps(keep);
  if (await writeIfChanged(STATE_PATH, `${JSON.stringify({ version: 1, videos })}\n`)) changed.push('data/sitemap-state.json');
  if (await writeIfChanged(path.join(ROOT, 'sitemap.xml'), buildRootSitemap())) changed.push('sitemap.xml');
  if (await writeIfChanged(path.join(ROOT, 'sitemap_index.xml'), buildIndex(indexEntries))) changed.push('sitemap_index.xml');

  const newCount = latest.filter((video) => !knownIds.has(video.id)).length;
  const removedCount = state.videos.filter((video) => removedIds.has(video.id)).length;
  console.log(`Sitemap refresh complete: ${videos.length} rolling videos, ${newCount} new, ${removedCount} removed.`);
  console.log(`Generated ${keep.size} video sitemap files; deleted ${removedFiles} obsolete files.`);
  console.log(changed.length ? `Changed: ${changed.join(', ')}` : 'No content changes; no deployment is needed.');
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
