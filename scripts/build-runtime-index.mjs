#!/usr/bin/env node
/**
 * scripts/build-runtime-index.mjs
 * Compiles a compact, minified runtime index (data/enriched-runtime.json)
 * containing ONLY genuine alive non-spam AI-enriched videos plus:
 * - Pre-built O(1) tag & curated-hub lookup buckets (`byTag`) matching both tags AND titles
 * - Ranked US/EU `featured` IDs
 * - Deterministic `orderedIds` ring array guaranteeing 0% orphaned videos across /v/ internal linking
 */

import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CURATED_CATEGORIES,
  cleanSourceTitle,
  extractJavCode,
  isSpamVideoTitle,
  normalizeUrl,
  slugify,
} from '../api/schema-helper.js';

const CURATED_SET = new Set(CURATED_CATEGORIES);
const ROOT = process.cwd();
const ENRICHED_PATH = path.join(ROOT, 'data', 'enriched-videos.json');
const STATE_PATH = path.join(ROOT, 'data', 'sitemap-state.json');
const RUNTIME_PATH = path.join(ROOT, 'data', 'enriched-runtime.json');

/** Extra title/tag synonym matchers so every US & EU curated hub maps rich alive AI videos. */
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
  if (summary && summary.length >= 140) score += 8;
  if (/\b(indo|bokep|mertua|mantu|ngewe|memek|kontol|colmek|ngentot|jilbab|pasutri|mahasiswi|tante|abg|rumahan|pantai|tamil|bhabhi|mallu|hindi)\b/i.test(combined)) {
    score -= 45;
  }
  return score;
}

async function main() {
  const enrichedDb = JSON.parse(await readFile(ENRICHED_PATH, 'utf8'));
  let stateMap = new Map();
  try {
    const state = JSON.parse(await readFile(STATE_PATH, 'utf8'));
    stateMap = new Map((state.videos || []).map(v => [v.id, v]));
  } catch {
    // State file optional; fallback to enriched fields alone
  }

  const videos = {};
  const scoredRows = [];
  const byTagDraft = new Map();

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

    const compact = {
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
    if (views > 0) compact.vw = views;
    if (duration > 0) compact.du = duration;

    videos[id] = compact;

    const qualityScore = scoreUsEuQuality(title, tags, views, thumb, compact.sm);
    scoredRows.push({ id, title, tags, score: qualityScore, at: publishedDay });

    // Index explicit slugified tags + all matching curated hubs from title/tags/JAV code
    const tagKeys = new Set();
    for (const tag of tags) {
      const tSlug = slugify(tag, 40, '');
      if (tSlug) tagKeys.add(tSlug);
    }
    const combinedHay = `${title} ${tags.join(' ')} ${stateRec?.keywords || ''}`;
    for (const [hubSlug, matcher] of CURATED_MATCHERS) {
      if (matcher.test(combinedHay)) tagKeys.add(hubSlug);
    }
    if (extractJavCode(title)) tagKeys.add('japanese');

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

  const byTag = {};
  for (const [key, list] of byTagDraft.entries()) {
    const isCurated = CURATED_SET.has(key);
    if (list.length < 2 && !isCurated) continue;
    list.sort((a, b) => b.score - a.score);
    byTag[key] = list.slice(0, isCurated ? 72 : 48).map(x => x.id);
  }

  const runtime = {
    v: 3,
    at: new Date().toISOString(),
    n: orderedIds.length,
    orderedIds,
    featured,
    byTag,
    videos,
  };

  await writeFile(RUNTIME_PATH, JSON.stringify(runtime), 'utf8');
  const [srcStat, outStat] = await Promise.all([stat(ENRICHED_PATH), stat(RUNTIME_PATH)]);
  const hubsPopulated = CURATED_CATEGORIES.filter(s => (byTag[s]?.length || 0) > 0).length;
  const hubsGe12 = CURATED_CATEGORIES.filter(s => (byTag[s]?.length || 0) >= 12).length;
  console.log(
    `Built data/enriched-runtime.json: ${runtime.n} alive videos, ${Object.keys(byTag).length} O(1) tag buckets (${hubsPopulated}/${CURATED_CATEGORIES.length} hubs populated, ${hubsGe12} with >=12 enriched), ${featured.length} featured IDs | ${(srcStat.size / 1024 / 1024).toFixed(2)} MB -> ${(outStat.size / 1024 / 1024).toFixed(2)} MB (${Math.round((1 - outStat.size / srcStat.size) * 100)}% smaller).`
  );
}

main().catch(err => {
  console.error(err?.stack || err);
  process.exitCode = 1;
});
