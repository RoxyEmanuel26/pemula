#!/usr/bin/env node
/**
 * scripts/build-runtime-shards.mjs
 * Compiles the scalable V2.0 sharded runtime store:
 * - data/runtime/index.json (bounded lightweight index + card metadata for home/category/discover)
 * - data/runtime/shards/{00..3f}.json (64 hash-sharded full-detail JSON buckets, ~115 KB each)
 * Eliminates the monolithic JSON cold-start cliff even at 50,000+ videos.
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CURATED_CATEGORIES,
  cleanSourceTitle,
  extractJavCode,
  isSpamVideoTitle,
  normalizeUrl,
  slugify,
} from '../lib/schema.js';
import { SHARD_COUNT, getShardKey } from '../lib/runtime-store.js';

const CURATED_SET = new Set(CURATED_CATEGORIES);
const ROOT = process.cwd();
const ENRICHED_PATH = path.join(ROOT, 'data', 'enriched-videos.json');
const STATE_PATH = path.join(ROOT, 'data', 'sitemap-state.json');
const RUNTIME_DIR = path.join(ROOT, 'data', 'runtime');
const SHARDS_DIR = path.join(RUNTIME_DIR, 'shards');
const INDEX_PATH = path.join(RUNTIME_DIR, 'index.json');

const HUB_SYNONYM_REGEX = {
  '4k-uhd': /\b(4k|uhd|2160p|ultra\s*hd)\b/i,
  'big-tits': /\b(big\s*tits|busty|huge\s*tits|big\s*boobs|giant\s*tits|titty)\b/i,
  'big-ass': /\b(big\s*ass|pawg|thick\s*ass|huge\s*ass|phat\s*ass|booty)\b/i,
  'double-penetration': /\b(double\s*penetration|\bdp\b|two\s*cocks)\b/i,
  'group-sex': /\b(group\s*sex|orgy|gangbang|swinger|foursome)\b/i,
  'live-cam': /\b(live\s*cam|webcam|chaturbate|camgirl|cam\s*show)\b/i,
  'onlyfans': /\b(onlyfans|fansly|creator\s*leak)\b/i,
  'european': /\b(european|euro|german|deutsch|french|francaise|spanish|espanol|italian|italiana|czech|prague|british|russian|dutch|polish|swedish|austrian)\b/i,
  'german': /\b(german|deutsch|berlin|munich|hamburg)\b/i,
  'french': /\b(french|francaise|paris|lyon)\b/i,
  'spanish': /\b(spanish|espanol|madrid|barcelona)\b/i,
  'italian': /\b(italian|italiana|rome|milan|italy)\b/i,
  'british': /\b(british|london|english\s+amateur|\buk\b)\b/i,
  'czech': /\b(czech|prague)\b/i,
  'russian': /\b(russian|moscow|slavic)\b/i,
  'japanese': /\b(japanese|jav|tokyo|uncensored\s+jav)\b/i,
  'indian': /\b(indian|desi|bhabhi|hindi|tamil|mallu)\b/i,
  'tiktok-viral': /\b(tiktok|fyp|viral\s*reel)\b/i,
};

function buildHubMatcher(slug) {
  if (HUB_SYNONYM_REGEX[slug]) return HUB_SYNONYM_REGEX[slug];
  const term = slug.replace(/-/g, '\\s+');
  return new RegExp(`\\b${term}\\b`, 'i');
}

const CURATED_MATCHERS = CURATED_CATEGORIES.map(slug => [slug, buildHubMatcher(slug)]);

function scoreUsEuQuality(title, tags, views, thumb, summary) {
  const combined = `${title} ${(tags || []).join(' ')}`;
  let score = Math.log10((Number(views) || 0) + 1) * 18;
  if (title && !/[^\x00-\x7F]/.test(title)) score += 20;
  if (/\b(milf|blonde|brunette|latina|ebony|amateur|pov|onlyfans|fansly|4k|anal|lesbian|threesome|creampie|european|british|german|french|spanish|italian|czech|russian|stepmom|massage|casting|squirt|pawg|hardcore|hotwife|pornstar)\b/i.test(combined)) {
    score += 24;
  }
  if (thumb && thumb.includes('_360')) score += 12;
  if (title.length >= 20 && title.length <= 80) score += 8;
  if (summary && summary.length >= 200) score += 10;
  else if (summary && summary.length >= 140) score += 6;
  if (/\b(indo|bokep|mertua|mantu|ngewe|memek|kontol|colmek|ngentot|jilbab|pasutri|mahasiswi|tante|abg|rumahan|pantai|tamil|bhabhi|mallu|hindi)\b/i.test(combined)) {
    score -= 45;
  }
  return score;
}

async function main() {
  await mkdir(SHARDS_DIR, { recursive: true });

  const enrichedDb = JSON.parse(await readFile(ENRICHED_PATH, 'utf8'));
  let stateMap = new Map();
  try {
    const state = JSON.parse(await readFile(STATE_PATH, 'utf8'));
    stateMap = new Map((state.videos || []).map(v => [v.id, v]));
  } catch {
    // Optional state enrichment
  }

  const shards = new Map();
  for (let i = 0; i < SHARD_COUNT; i++) {
    shards.set(i.toString(16).padStart(2, '0'), {});
  }

  const scoredRows = [];
  const byTagDraft = new Map();
  const javRows = [];
  const allCompactCards = new Map();

  for (const [id, entry] of Object.entries(enrichedDb.videos || {})) {
    if (!entry || entry.status !== 'enriched' || !entry.model || entry.model === 'mock-enricher') continue;
    const stateRec = stateMap.get(id);
    const title = cleanSourceTitle(entry.title || stateRec?.title || '') || entry.title || '';
    if (!title || isSpamVideoTitle(title)) continue;

    const slug = entry.slug || stateRec?.slug || slugify(title, 80, id);
    const thumb = normalizeUrl(
      (stateRec?.thumbnail && stateRec.thumbnail.includes('_360') ? stateRec.thumbnail : '') ||
      entry.thumbnail ||
      stateRec?.thumbnail ||
      ''
    );
    const tags = Array.isArray(entry.tags)
      ? [...new Set(entry.tags.map(t => String(t || '').trim().toLowerCase()).filter(t => t && t.length <= 32))].slice(0, 8)
      : [];
    const highlights = Array.isArray(entry.highlights)
      ? entry.highlights.map(h => String(h || '').trim()).filter(Boolean).slice(0, 5)
      : [];
    const faq = Array.isArray(entry.faq)
      ? entry.faq
          .map(f => [String(f?.question || '').trim(), String(f?.answer || '').trim()])
          .filter(([q, a]) => q && a)
          .slice(0, 4)
      : [];
    const views = Number(stateRec?.views || 0);
    const duration = Number(stateRec?.duration || 0);
    const publishedDay = String(stateRec?.published || entry.generated_at || '').slice(0, 10);

    const fullCompact = {
      id,
      t: title,
      s: slug,
      th: thumb,
      st: entry.seo_title || '',
      md: entry.meta_description || '',
      sm: entry.summary || '',
      hl: highlights,
      tg: tags,
      fq: faq,
      at: publishedDay,
    };
    if (views > 0) fullCompact.vw = views;
    if (duration > 0) fullCompact.du = duration;

    shards.get(getShardKey(id))[id] = fullCompact;

    const cardCompact = { t: title, s: slug, th: thumb, at: publishedDay, tg: tags.slice(0, 4) };
    if (views > 0) cardCompact.vw = views;
    if (duration > 0) cardCompact.du = duration;
    allCompactCards.set(id, cardCompact);

    const qualityScore = scoreUsEuQuality(title, tags, views, thumb, fullCompact.sm);
    const javCode = extractJavCode(entry.seo_title || title);
    scoredRows.push({ id, title, tags, score: qualityScore, views, duration, at: publishedDay, javCode });
    if (javCode) {
      javRows.push({ id, code: javCode, score: qualityScore, at: publishedDay });
    }

    const tagKeys = new Set();
    for (const tag of tags) {
      const tSlug = slugify(tag, 40, '');
      if (tSlug) tagKeys.add(tSlug);
    }
    const combinedHay = `${title} ${tags.join(' ')} ${stateRec?.keywords || ''}`;
    for (const [hubSlug, matcher] of CURATED_MATCHERS) {
      if (matcher.test(combinedHay)) tagKeys.add(hubSlug);
    }
    if (javCode) tagKeys.add('japanese');

    for (const key of tagKeys) {
      if (!byTagDraft.has(key)) byTagDraft.set(key, []);
      byTagDraft.get(key).push({ id, score: qualityScore });
    }
  }

  scoredRows.sort((a, b) => b.score - a.score || b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
  const orderedIds = scoredRows.map(r => r.id);

  const featured = scoredRows
    .filter(r => r.score >= 25 && !/[^\x00-\x7F]/.test(r.title) && r.title.length >= 16)
    .slice(0, 160)
    .map(r => r.id);

  const topViewed = [...scoredRows]
    .filter(r => r.views > 0 && !/[^\x00-\x7F]/.test(r.title))
    .sort((a, b) => b.views - a.views || b.score - a.score)
    .slice(0, 120)
    .map(r => r.id);

  const longest = [...scoredRows]
    .filter(r => r.duration >= 1200 && !/[^\x00-\x7F]/.test(r.title))
    .sort((a, b) => b.duration - a.duration || b.views - a.views)
    .slice(0, 120)
    .map(r => r.id);

  javRows.sort((a, b) => b.score - a.score || b.at.localeCompare(a.at));
  const javIds = javRows.slice(0, 240).map(r => r.id);

  const byTag = {};
  const tagCounts = {};
  for (const [key, list] of byTagDraft.entries()) {
    const isCurated = CURATED_SET.has(key);
    if (list.length < 2 && !isCurated) continue;
    list.sort((a, b) => b.score - a.score);
    byTag[key] = list.slice(0, isCurated ? 72 : 48).map(x => x.id);
    if (isCurated) tagCounts[key] = list.length;
  }

  // Only include card preview objects referenced by index buckets (keeps index.json bounded forever!)
  const referencedIds = new Set([...featured, ...topViewed, ...longest, ...javIds]);
  for (const slug of CURATED_CATEGORIES) {
    for (const id of (byTag[slug] || []).slice(0, 32)) referencedIds.add(id);
  }
  const cards = {};
  for (const id of referencedIds) {
    const c = allCompactCards.get(id);
    if (c) cards[id] = c;
  }

  const indexPayload = {
    v: 4,
    at: new Date().toISOString(),
    n: orderedIds.length,
    shardCount: SHARD_COUNT,
    orderedIds,
    featured,
    topViewed,
    longest,
    javIds,
    tagCounts,
    byTag,
    cards,
  };

  await writeFile(INDEX_PATH, JSON.stringify(indexPayload), 'utf8');

  let maxShardBytes = 0;
  let totalShardBytes = 0;
  await Promise.all(
    [...shards.entries()].map(async ([key, obj]) => {
      const json = JSON.stringify(obj);
      const bytes = Buffer.byteLength(json, 'utf8');
      if (bytes > maxShardBytes) maxShardBytes = bytes;
      totalShardBytes += bytes;
      await writeFile(path.join(SHARDS_DIR, `${key}.json`), json, 'utf8');
    })
  );

  const indexStat = await stat(INDEX_PATH);
  const avgShardKb = (totalShardBytes / SHARD_COUNT / 1024).toFixed(1);
  console.log(
    `Built V2.0 sharded runtime: ${orderedIds.length} alive videos across ${SHARD_COUNT} shards (avg ${avgShardKb} KB, max ${(maxShardBytes / 1024).toFixed(1)} KB/shard) | index.json = ${(indexStat.size / 1024).toFixed(1)} KB (${Object.keys(cards).length} hot cards, ${javIds.length} JAV, ${longest.length} long 20m+).`
  );
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exitCode = 1;
});
