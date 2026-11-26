import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  BASE_URL,
  EU_LOCALES,
  EU_LOCALIZED_CATEGORIES,
  REGIONAL_ARCHIVE_HUBS,
  CURATED_CATEGORIES,
  US_EU_CATEGORIES,
  decodeMojibake,
  slugify,
  cleanSourceTitle,
  isSpamVideoTitle,
  normalizeUrl,
  buildHreflangEntries,
} from '../lib/schema.js';

const ROOT = process.cwd();
const API_BASE = 'https://www.eporner.com/api/v2/video';
const SITEMAP_DIR = path.join(ROOT, 'sitemaps');
const STATE_PATH = path.join(ROOT, 'data', 'sitemap-state.json');
const ENRICHED_PATH = path.join(ROOT, 'data', 'enriched-videos.json');
const COMPOUND_PATH = path.join(ROOT, 'data', 'compound-hubs.json');
const FEED_PATH = path.join(ROOT, 'feed.xml');
const LLMS_PATH = path.join(ROOT, 'llms.txt');
const OFFLINE = process.argv.includes('--offline');
const PER_PAGE = envNumber('SITEMAP_PER_PAGE', 1000, 1, 1000);
const MAX_FETCH_PAGES = envNumber('SITEMAP_MAX_FETCH_PAGES', 10, 1, 50);
const BOOTSTRAP_PAGES = envNumber('SITEMAP_BOOTSTRAP_PAGES', Math.min(10, MAX_FETCH_PAGES), 1, MAX_FETCH_PAGES);
const MAX_RECORDS = envNumber('SITEMAP_MAX_VIDEOS', 20000, 1000, 45000);
const PROTECTED_US_EU_POOL_MAX = envNumber('SITEMAP_US_EU_POOL', 8000, 1000, 15000);
const CHUNK_SIZE = envNumber('SITEMAP_CHUNK_SIZE', 1000, 100, 45000);
const FETCH_DELAY_MS = envNumber('SITEMAP_FETCH_DELAY_MS', 350, 0, 5000);
const USER_AGENT = 'lusthub-sitemap-bot/10.0 (+https://www.lusthub.my.id/robots.txt)';

const STATIC_PAGES = [
  ['/', 'index.html'],
  ['/trending', 'api/discover.js'],
  ['/top-rated', 'api/discover.js'],
  ['/longest', 'api/discover.js'],
  ['/jav', 'api/discover.js'],
  ['/categories', 'api/discover.js'],
  ['/about', 'about.html'],
  ['/howto', 'howto.html'],
  ['/contact', 'contact.html'],
  ['/dmca', 'dmca.html'],
  ['/privacy', 'privacy.html'],
  ['/terms', 'terms.html'],
];

// Dedicated European country & creator hubs seeded every rotation so EU inventory stays deep
const EU_COUNTRY_SEED_QUERIES = [
  'european', 'german', 'french', 'spanish', 'italian', 'british', 'czech', 'russian', 'onlyfans', '4k-uhd',
];
// High-demand US/EU core niche hubs
const US_EU_NICHE_SEED_QUERIES = US_EU_CATEGORIES.filter(s => !EU_COUNTRY_SEED_QUERIES.includes(s));

const EU_GEO_REGEX = /\b(european|euro|british|uk|london|german|deutsch|berlin|munich|french|francaise|paris|spanish|espanol|madrid|barcelona|italian|italiana|rome|czech|prague|russian|slavic|dutch|swedish|polish|austrian|swiss)\b/i;
const US_EU_DEMAND_REGEX = /\b(milf|blonde|brunette|latina|ebony|amateur|pov|onlyfans|fansly|4k|anal|lesbian|threesome|group sex|creampie|stepmom|stepsis|massage|casting|squirt|deepthroat|bbw|college|petite|big tits|big ass|pawg|hotwife|cuckold|pornstar|hardcore|cumshot|double penetration|handjob|solo|lingerie|redhead|cosplay|jav)\b/i;

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
  const title = cleanSourceTitle(video?.title) || decodeMojibake(video?.title) || (id ? `Video ${id}` : '');
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
    slug: slugify(title, 80, id),
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

/**
 * Scores non-enriched catalog videos for Tier-2 protected US & European retention.
 * Prevents high-view US/EU/European seed videos from being evicted by random 0-view uploads.
 */
function scoreUsEuRetention(video) {
  const title = cleanSourceTitle(video.title || '');
  if (isSpamVideoTitle(title)) return -999;
  const combined = `${title} ${video.keywords || ''}`;
  const views = Number(video.views) || 0;
  let score = Math.log10(views + 1) * 24;

  const isEuGeo = EU_GEO_REGEX.test(combined);
  const isUsEuDemand = US_EU_DEMAND_REGEX.test(combined);

  if (isEuGeo) score += 45;
  if (isUsEuDemand) score += 25;
  if (title && !/[^\x00-\x7F]/.test(title)) score += 15;
  if (video.thumbnail && video.thumbnail.includes('_360')) score += 10;
  if (video.keywords) score += 8;
  if (/\b(indo|bokep|mertua|mantu|ngewe|memek|kontol|colmek|ngentot|tamil|hindi)\b/i.test(combined)) score -= 45;
  return score;
}

function isUsEuProtectedCandidate(video) {
  const title = cleanSourceTitle(video.title || '');
  if (isSpamVideoTitle(title)) return false;
  const combined = `${title} ${video.keywords || ''}`;
  const views = Number(video.views) || 0;
  if (EU_GEO_REGEX.test(combined)) return true;
  if (views >= 3000 && US_EU_DEMAND_REGEX.test(combined)) return true;
  if (views >= 20000 && !/[^\x00-\x7F]/.test(title)) return true;
  return false;
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

  // 3. Dedicated EU country + creator hubs (5 rotating per run) + US/EU high-demand niches (5 rotating per run)
  const runSlot = Math.floor(Date.now() / 43200000);
  const selectedQueries = [];
  for (let i = 0; i < 5; i += 1) {
    selectedQueries.push(EU_COUNTRY_SEED_QUERIES[(runSlot * 5 + i) % EU_COUNTRY_SEED_QUERIES.length]);
  }
  for (let i = 0; i < 5; i += 1) {
    selectedQueries.push(US_EU_NICHE_SEED_QUERIES[(runSlot * 5 + i) % US_EU_NICHE_SEED_QUERIES.length]);
  }

  for (let i = 0; i < selectedQueries.length; i += 1) {
    const slug = selectedQueries[i];
    const order = i % 2 === 0 ? 'top-monthly' : 'most-popular';
    await sleep(FETCH_DELAY_MS);
    try {
      const seeded = await fetchSearchFeed(slug.replace(/-/g, ' '), order, 1, knownIds, false);
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
    const dirty = execFileSync('git', ['status', '--porcelain', '--', file], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (dirty) return new Date().toISOString().slice(0, 10);
    const value = execFileSync('git', ['log', '-1', '--format=%cI', '--', file], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return normalizeDate(value)?.slice(0, 10) || null;
  } catch { return null; }
}

async function fileLastModified(file) {
  const fromGit = gitLastModified(file);
  if (fromGit) return fromGit;
  try {
    const st = await stat(path.join(ROOT, file));
    return st.mtime.toISOString().slice(0, 10);
  } catch { return null; }
}

function urlset(rows, options = {}) {
  const { video = false, xhtml = false } = typeof options === 'boolean' ? { video: options } : options;
  const ns = [
    'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    video ? 'xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"' : '',
    xhtml ? 'xmlns:xhtml="http://www.w3.org/1999/xhtml"' : '',
  ].filter(Boolean).join(' ');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset ${ns}>\n${rows.join('\n')}\n</urlset>\n`;
}

function renderXhtmlAlternates(pathSuffix = '') {
  return buildHreflangEntries(pathSuffix)
    .map(({ hreflang, href }) => `    <xhtml:link rel="alternate" hreflang="${xmlEscape(hreflang)}" href="${xmlEscape(href)}" />`)
    .join('\n');
}

function buildPagesSitemap() {
  return urlset(STATIC_PAGES.map(([urlPath, file]) => {
    const lastmod = gitLastModified(file);
    const alternates = urlPath === '/' ? renderXhtmlAlternates('') : null;
    return [
      '  <url>',
      `    <loc>${xmlEscape(`${BASE_URL}${urlPath}`)}</loc>`,
      lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
      alternates,
      '  </url>',
    ].filter(Boolean).join('\n');
  }), { xhtml: true });
}

function buildCategoriesSitemap(catLastMod, tagCounts = {}) {
  const rows = [];
  for (const category of EU_LOCALIZED_CATEGORIES) {
    const alternates = renderXhtmlAlternates(`/c/${category}`);
    rows.push(`  <url>\n    <loc>${xmlEscape(`${BASE_URL}/c/${category}`)}</loc>\n    <lastmod>${catLastMod}</lastmod>\n${alternates}\n  </url>`);
  }
  // Only include non-empty regional archive hubs in English sitemap (0 thin/empty URLs!)
  for (const regional of REGIONAL_ARCHIVE_HUBS) {
    if (Number(tagCounts[regional] || 0) > 0) {
      rows.push(`  <url>\n    <loc>${xmlEscape(`${BASE_URL}/c/${regional}`)}</loc>\n    <lastmod>${catLastMod}</lastmod>\n  </url>`);
    }
  }
  return urlset(rows, { xhtml: true });
}

function buildCompoundSitemap(compoundHubs, lastmod) {
  const curatedSet = new Set(CURATED_CATEGORIES);
  const validHubs = (compoundHubs || []).filter(h => h && h.slug && !curatedSet.has(h.slug));
  return urlset(validHubs.map((hub) =>
    `  <url>\n    <loc>${xmlEscape(`${BASE_URL}/c/${hub.slug}`)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`
  ));
}

/**
 * Generates sitemaps/sitemap_eu_locales.xml containing all localized European
 * homepages (/de, /fr, /es, /it, /nl, /pt, /pl) + localized international hubs (/{lang}/c/:slug)
 * strictly for EU_LOCALIZED_CATEGORIES (64 international hubs, 0 regional Indonesian slang hubs)
 * with complete 9-way reciprocal xhtml:link hreflang clusters and zero duplicate <loc>.
 */
function buildEuLocalesSitemap(homeLastMod, catLastMod) {
  const rows = [];
  const homeAlternates = renderXhtmlAlternates('');

  for (const lang of EU_LOCALES) {
    rows.push(
      `  <url>\n    <loc>${xmlEscape(`${BASE_URL}/${lang}`)}</loc>\n    <lastmod>${homeLastMod}</lastmod>\n${homeAlternates}\n  </url>`
    );
  }

  for (const lang of EU_LOCALES) {
    for (const category of EU_LOCALIZED_CATEGORIES) {
      const alternates = renderXhtmlAlternates(`/c/${category}`);
      rows.push(
        `  <url>\n    <loc>${xmlEscape(`${BASE_URL}/${lang}/c/${category}`)}</loc>\n    <lastmod>${catLastMod}</lastmod>\n${alternates}\n  </url>`
      );
    }
  }

  return urlset(rows, { xhtml: true });
}

function buildVideoSitemap(videos, enrichedMap) {
  return urlset(videos.map((video) => {
    const e = enrichedMap[video.id];
    const rawTitle = e?.seo_title ? e.seo_title.replace(/\s*\|\s*(LustHub|lusthub\.my\.id)$/i, '').trim() : video.title;
    const title = String(rawTitle || video.title).slice(0, 100);
    const desc = e?.meta_description || video.description;
    const thumb = normalizeUrl(e?.thumbnail && e.thumbnail.includes('_360') ? e.thumbnail : video.thumbnail);
    const durVal = Number(video.duration || e?.duration || 0);
    const duration = durVal > 0 ? `\n      <video:duration>${Math.floor(durVal)}</video:duration>` : '';
    const tagList = Array.isArray(e?.tags)
      ? e.tags.map(t => String(t || '').trim()).filter(t => t && t.length <= 32).slice(0, 5)
      : [];
    const tagsXml = tagList.map(t => `\n      <video:tag>${xmlEscape(t)}</video:tag>`).join('');
    const pubIso = String(video.published || '2026-01-01T00:00:00Z').replace(/\.\d+Z$/, 'Z');
    return `  <url>\n    <loc>${xmlEscape(`${BASE_URL}/v/${video.id}-${video.slug}`)}</loc>\n    <lastmod>${pubIso.slice(0, 10)}</lastmod>\n    <video:video>\n      <video:thumbnail_loc>${xmlEscape(thumb)}</video:thumbnail_loc>\n      <video:title>${xmlEscape(title)}</video:title>\n      <video:description>${xmlEscape(desc)}</video:description>\n      <video:player_loc>${xmlEscape(video.player)}</video:player_loc>${duration}\n      <video:publication_date>${pubIso}</video:publication_date>\n      <video:family_friendly>no</video:family_friendly>${tagsXml}\n    </video:video>\n  </url>`;
  }), { video: true });
}

function buildRssFeed(videos, enrichedMap) {
  const cleanFeedVideos = videos.filter((v) => !isSpamVideoTitle(v.title) && !/[^\x00-\x7F]/.test(v.title) && v.title.length >= 14);
  const feedSource = cleanFeedVideos.length >= 25 ? cleanFeedVideos : videos;
  const latestItems = feedSource.slice(0, 50).map((video) => {
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
    `  <sitemap>\n    <loc>${xmlEscape(`${BASE_URL}/${file}`)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </sitemap>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</sitemapindex>\n`;
}

async function syncLlmsTxt(videoSitemapFiles, compoundCount = 0) {
  try {
    const content = await readFile(LLMS_PATH, 'utf8');
    const startMarker = '<!-- AUTO:SITEMAPS:START -->';
    const endMarker = '<!-- AUTO:SITEMAPS:END -->';
    const sIdx = content.indexOf(startMarker);
    const eIdx = content.indexOf(endMarker);
    if (sIdx === -1 || eIdx === -1 || eIdx <= sIdx) return false;

    const euCount = EU_LOCALES.length * (EU_LOCALIZED_CATEGORIES.length + 1);
    const euCodeList = EU_LOCALES.map(l => l.toUpperCase()).join('/');
    const lines = [
      `- Master Sitemap Index: ${BASE_URL}/sitemap_index.xml`,
      `- Core Category Sitemap (${EU_LOCALIZED_CATEGORIES.length}+ EN Hubs): ${BASE_URL}/sitemap_categories.xml`,
      `- Long-Tail Compound Hub Sitemap (${compoundCount} US/EU/JAV Niches): ${BASE_URL}/sitemap_compound.xml`,
      `- European Localized Sitemap (${euCount} ${euCodeList} Hubs): ${BASE_URL}/sitemap_eu_locales.xml`,
      ...videoSitemapFiles.map((f, idx) => `- Video Sitemap ${String(idx + 1).padStart(3, '0')}: ${BASE_URL}/${f}`),
      `- Discovery & Static Pages Sitemap (/trending, /top-rated, /longest, /jav, /categories): ${BASE_URL}/sitemap_pages.xml`,
      `- RSS Video Feed: ${BASE_URL}/feed.xml`,
      `- Robots Policy: ${BASE_URL}/robots.txt`,
    ];

    const updated = `${content.slice(0, sIdx + startMarker.length)}\n${lines.join('\n')}\n${content.slice(eIdx)}`;
    return writeIfChanged(LLMS_PATH, updated);
  } catch {
    return false;
  }
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

  // Load genuine non-spam AI-enriched videos FIRST so they are pinned and never evicted
  const enrichedIds = new Set();
  let enrichedMap = {};
  try {
    const rawEnriched = await readFile(ENRICHED_PATH, 'utf8');
    const enrichedJson = JSON.parse(rawEnriched);
    if (enrichedJson.videos) {
      enrichedMap = enrichedJson.videos;
      for (const [id, v] of Object.entries(enrichedJson.videos)) {
        if (v.status === 'enriched' && v.model && v.model !== 'mock-enricher' && !isSpamVideoTitle(v.title)) {
          enrichedIds.add(id);
        }
      }
    }
  } catch {}

  // Preserve freshly fetched metadata (views/rate/keywords/big thumb) over stale state records
  const merged = new Map();
  for (const video of [...latest, ...state.videos]) {
    const normalized = normalizeVideo(video);
    if (normalized && !removedIds.has(normalized.id) && !merged.has(normalized.id)) {
      merged.set(normalized.id, normalized);
    }
  }

  // Recover previously evicted genuine AI-enriched videos back into the active sitemap pool
  let recoveredCount = 0;
  for (const id of enrichedIds) {
    if (merged.has(id) || removedIds.has(id)) continue;
    const e = enrichedMap[id];
    if (!e || !e.title) continue;
    const recovered = normalizeVideo({
      id,
      slug: e.slug,
      title: e.title,
      description: e.meta_description || e.summary || `Watch ${e.title} in HD on lusthub.my.id.`,
      thumbnail: e.thumbnail,
      player: `https://www.eporner.com/embed/${id}/`,
      duration: e.duration || 0,
      views: e.views || 0,
      published: e.generated_at || '2026-10-28T00:00:00Z',
      keywords: Array.isArray(e.tags) ? e.tags.join(', ') : '',
    });
    if (recovered) {
      merged.set(id, recovered);
      recoveredCount += 1;
    }
  }

  // 3-Tier Retention (prevents high-demand US/EU/European seed videos from being evicted by 0-view uploads):
  // Tier 1: Pinned genuine AI-enriched videos
  // Tier 2: Protected US/EU high-demand & European geo pool (up to 8,000 slots sorted by demand score + views)
  // Tier 3: Fresh rolling uploads by publish date up to MAX_RECORDS (20,000)
  const allMerged = [...merged.values()];
  const pinnedEnriched = allMerged
    .filter((v) => enrichedIds.has(v.id))
    .sort((a, b) => b.published.localeCompare(a.published) || a.id.localeCompare(b.id));

  const nonEnriched = allMerged.filter((v) => !enrichedIds.has(v.id));
  const remainingBudget = Math.max(0, MAX_RECORDS - pinnedEnriched.length);
  const tier2Cap = Math.min(PROTECTED_US_EU_POOL_MAX, remainingBudget);

  const protectedPool = nonEnriched
    .filter(isUsEuProtectedCandidate)
    .sort((a, b) => scoreUsEuRetention(b) - scoreUsEuRetention(a) || b.published.localeCompare(a.published))
    .slice(0, tier2Cap);
  const protectedIds = new Set(protectedPool.map(v => v.id));

  const freshTail = nonEnriched
    .filter((v) => !protectedIds.has(v.id))
    .sort((a, b) => b.published.localeCompare(a.published) || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, remainingBudget - protectedPool.length));

  const videos = [...pinnedEnriched, ...protectedPool, ...freshTail].slice(0, MAX_RECORDS);
  if (!videos.length) throw new Error('No valid videos available; refusing to replace a good sitemap with an empty one.');
  if (recoveredCount > 0) console.log(`Recovered ${recoveredCount} AI-enriched video(s) into sitemap pool.`);

  const changed = [];
  const indexEntries = [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const pagesLastMod = await fileLastModified('index.html') || todayStr;
  const catLastMod = await fileLastModified('data/category-descriptions.json') || todayStr;
  const euLastMod = await fileLastModified('data/eu-locales.json') || catLastMod;

  let compoundHubs = [];
  let compoundLastMod = todayStr;
  let tagCounts = {};
  try {
    const rawCompound = JSON.parse(await readFile(COMPOUND_PATH, 'utf8'));
    if (Array.isArray(rawCompound?.hubs)) compoundHubs = rawCompound.hubs;
    if (rawCompound?.generatedAt) compoundLastMod = String(rawCompound.generatedAt).slice(0, 10);
  } catch {}
  try {
    const runtimeIdx = JSON.parse(await readFile(path.join(ROOT, 'data', 'runtime', 'index.json'), 'utf8'));
    if (runtimeIdx?.tagCounts) tagCounts = runtimeIdx.tagCounts;
  } catch {}

  if (await writeIfChanged(path.join(SITEMAP_DIR, 'sitemap_pages.xml'), buildPagesSitemap())) changed.push('sitemap_pages.xml');
  if (await writeIfChanged(path.join(SITEMAP_DIR, 'sitemap_categories.xml'), buildCategoriesSitemap(catLastMod, tagCounts))) changed.push('sitemap_categories.xml');
  if (compoundHubs.length > 0) {
    if (await writeIfChanged(path.join(SITEMAP_DIR, 'sitemap_compound.xml'), buildCompoundSitemap(compoundHubs, compoundLastMod))) {
      changed.push('sitemap_compound.xml');
    }
  }
  if (await writeIfChanged(path.join(SITEMAP_DIR, 'sitemap_eu_locales.xml'), buildEuLocalesSitemap(pagesLastMod, euLastMod))) changed.push('sitemap_eu_locales.xml');

  indexEntries.push({ file: 'sitemap_pages.xml', lastmod: pagesLastMod });
  indexEntries.push({ file: 'sitemap_categories.xml', lastmod: catLastMod });
  if (compoundHubs.length > 0) {
    indexEntries.push({ file: 'sitemap_compound.xml', lastmod: compoundLastMod });
  }
  indexEntries.push({ file: 'sitemap_eu_locales.xml', lastmod: euLastMod });

  // Quality Gate: ONLY genuine non-spam AI-enriched videos
  const sitemapVideos = enrichedIds.size > 0
    ? videos.filter((v) => enrichedIds.has(v.id) && !isSpamVideoTitle(v.title))
    : videos.filter((v) => !isSpamVideoTitle(v.title));

  const keep = new Set();
  const videoFiles = [];
  for (let offset = 0, index = 1; offset < sitemapVideos.length; offset += CHUNK_SIZE, index += 1) {
    const chunk = sitemapVideos.slice(offset, offset + CHUNK_SIZE);
    const file = `sitemap_videos_${String(index).padStart(3, '0')}.xml`;
    keep.add(file);
    videoFiles.push(file);
    if (await writeIfChanged(path.join(SITEMAP_DIR, file), buildVideoSitemap(chunk, enrichedMap))) changed.push(file);
    indexEntries.push({ file, lastmod: chunk[0]?.published.slice(0, 10) || null });
  }

  const removedFiles = await removeObsoleteSitemaps(keep);
  const indexXml = buildIndex(indexEntries);
  if (await writeIfChanged(STATE_PATH, `${JSON.stringify({ version: 1, videos })}\n`)) changed.push('data/sitemap-state.json');
  if (await writeIfChanged(path.join(ROOT, 'sitemap.xml'), indexXml)) changed.push('sitemap.xml');
  if (await writeIfChanged(path.join(ROOT, 'sitemap_index.xml'), indexXml)) changed.push('sitemap_index.xml');
  if (await writeIfChanged(FEED_PATH, buildRssFeed(sitemapVideos, enrichedMap))) changed.push('feed.xml');
  if (await syncLlmsTxt(videoFiles, compoundHubs.length)) changed.push('llms.txt');

  const newCount = latest.filter((video) => !knownIds.has(video.id)).length;
  const removedCount = state.videos.filter((video) => removedIds.has(video.id)).length;
  console.log(`Sitemap refresh complete: ${videos.length} rolling videos (Tier1 pinned=${pinnedEnriched.length}, Tier2 US/EU protected=${protectedPool.length}, Tier3 fresh=${freshTail.length} | ${sitemapVideos.length} genuine AI-enriched in sitemap), ${newCount} new, ${removedCount} removed.`);
  console.log(`Generated ${keep.size} video sitemap files + sitemap_compound.xml (${compoundHubs.length} compound hubs) + sitemap_eu_locales.xml (${EU_LOCALES.length * (EU_LOCALIZED_CATEGORIES.length + 1)} EU URLs); deleted ${removedFiles} obsolete files.`);
  console.log(changed.length ? `Changed: ${changed.join(', ')}` : 'No content changes; no deployment is needed.');
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
