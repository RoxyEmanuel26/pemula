#!/usr/bin/env node
/**
 * scripts/build-home-ssr.mjs
 * Statically pre-renders curated US/EU category links, top 24 genuine enriched
 * video cards, and homepage ItemList schema directly into index.html so crawlers
 * and first-time visitors see complete crawlable content at sub-50ms edge speed.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BASE_URL,
  US_EU_CATEGORIES,
  escapeHtml,
  decodeMojibake,
  cleanSourceTitle,
  slugify,
  normalizeUrl,
  createItemListSchema,
} from '../api/schema-helper.js';

const ROOT = process.cwd();
const INDEX_PATH = path.join(ROOT, 'index.html');
const STATE_PATH = path.join(ROOT, 'data', 'sitemap-state.json');
const ENRICHED_PATH = path.join(ROOT, 'data', 'enriched-videos.json');

const HOME_FEATURED_CATEGORIES = [
  ...US_EU_CATEGORIES.slice(0, 14),
  'japanese', 'asian', 'korean', 'viral', 'homemade', 'indonesia',
];

function formatCategoryLabel(slug) {
  const labels = {
    'milf': 'MILF',
    'pov': 'POV',
    'onlyfans': 'OnlyFans',
    '4k-uhd': '4K UHD',
    'big-tits': 'Big Tits',
    'big-ass': 'Big Ass',
    'japanese': 'Japanese JAV',
    'live-cam': 'Live Cam',
  };
  if (labels[slug]) return labels[slug];
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatDurationBadge(sec) {
  const s = Number(sec || 0);
  if (!Number.isFinite(s) || s <= 0) return '';
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function scoreHomeVideo(video, enriched) {
  const title = cleanSourceTitle(video.title || enriched?.title || '');
  let score = Math.log10((Number(video.views) || 0) + 1) * 15;
  if (title && !/[^\x00-\x7F]/.test(title)) score += 25;
  if (/\b(milf|blonde|latina|ebony|amateur|pov|onlyfans|fansly|4k|anal|lesbian|threesome|creampie|european)\b/i.test(title)) {
    score += 20;
  }
  if (/[A-Z]{2,5}-?\d{3,5}/i.test(title)) score += 12;
  if (video.thumbnail && video.thumbnail.includes('_360')) score += 10;
  return score;
}

function replaceBetweenMarkers(html, markerName, innerContent) {
  const startMarker = `<!-- SSR:${markerName}:START -->`;
  const endMarker = `<!-- SSR:${markerName}:END -->`;
  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(`Missing marker pair ${startMarker} ... ${endMarker} in index.html`);
  }
  const before = html.slice(0, startIdx + startMarker.length);
  const after = html.slice(endIdx);
  return `${before}\n${innerContent}\n${after}`;
}

async function main() {
  const indexHtml = await readFile(INDEX_PATH, 'utf8');
  const state = JSON.parse(await readFile(STATE_PATH, 'utf8'));
  const enrichedDb = JSON.parse(await readFile(ENRICHED_PATH, 'utf8'));

  const stateMap = new Map(state.videos.map(v => [v.id, v]));
  const enrichedVideos = Object.values(enrichedDb.videos || {}).filter(
    e => e.status === 'enriched' && e.model && e.model !== 'mock-enricher' && stateMap.has(e.video_id)
  );

  // Merge catalog metadata with enrichment data and rank top US/EU candidates
  const candidates = enrichedVideos
    .map(e => {
      const s = stateMap.get(e.video_id);
      return { state: s, enriched: e, score: scoreHomeVideo(s, e) };
    })
    .sort((a, b) => b.score - a.score || b.state.published.localeCompare(a.state.published))
    .slice(0, 24);

  // Build category pills strip
  const categoryPillsHtml = HOME_FEATURED_CATEGORIES
    .map(slug => `                <a href="/c/${escapeHtml(slug)}" class="ssr-cat-pill">${escapeHtml(formatCategoryLabel(slug))}</a>`)
    .join('\n');

  // Build 24 static SSR video cards matching gallery.css + gallery.js DOM contract
  const cardsHtml = candidates.map(({ state: s, enriched: e }, idx) => {
    const title = cleanSourceTitle(s.title) || decodeMojibake(s.title || e.title || 'Untitled');
    const safeTitle = escapeHtml(title);
    const slug = slugify(title, 80, s.id);
    const href = `/v/${s.id}-${slug}`;
    const thumb = normalizeUrl(e.thumbnail && e.thumbnail.includes('_360') ? e.thumbnail : s.thumbnail);
    const dur = formatDurationBadge(s.duration);
    const viewsStr = (Number(s.views) || 0).toLocaleString('en-US');
    const dateStr = (s.published || '').slice(0, 10);
    const priorityAttrs = idx < 4 ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"';
    const tagsCsv = Array.isArray(e.tags) ? e.tags.slice(0, 4).join(',') : '';

    return `                <a href="${href}" class="card" data-ssr="1" data-index="${idx}" data-video-id="${escapeHtml(s.id)}" data-embed="${escapeHtml(s.player)}" data-title="${safeTitle}" data-duration="${escapeHtml(dur)}" data-duration-sec="${Number(s.duration) || 0}" data-views="${escapeHtml(viewsStr)}" data-date="${escapeHtml(dateStr)}" data-keywords="${escapeHtml(tagsCsv)}" aria-label="${safeTitle}">
                    <div class="card-img-wrapper">
                        <div class="blur-overlay" style="background-image: url('${escapeHtml(thumb)}');"></div>
                        ${dur ? `<span class="badge-duration">${escapeHtml(dur)}</span>` : ''}
                        <img src="${escapeHtml(thumb)}" alt="${safeTitle}" ${priorityAttrs} width="320" height="180" class="loaded">
                    </div>
                    <div class="card-meta">
                        <div class="card-date-views">
                            <span>📅 ${escapeHtml(dateStr)}</span>
                            <span class="card-views" data-views="${escapeHtml(viewsStr)}">👁 ${escapeHtml(viewsStr)}</span>
                        </div>
                        <div class="card-title">${safeTitle}</div>
                    </div>
                </a>`;
  }).join('\n');

  // Build homepage ItemList schema
  const itemListSchema = createItemListSchema(
    'Featured Free 18+ HD Videos | LustHub',
    'Trending US, European, Asian, Amateur, and JAV HD videos available on lusthub.my.id.',
    candidates.map(({ state: s, enriched: e }) => ({
      title: cleanSourceTitle(s.title) || s.title,
      url: `/v/${s.id}-${slugify(s.title, 80, s.id)}`,
      image: e.thumbnail || s.thumbnail,
    }))
  );
  const schemaHtml = `    <script id="homeItemListSchema" type="application/ld+json">${JSON.stringify(itemListSchema).replace(/</g, '\\u003c')}</script>`;

  let updated = replaceBetweenMarkers(indexHtml, 'HOME_CATEGORIES', categoryPillsHtml);
  updated = replaceBetweenMarkers(updated, 'HOME_GRID', cardsHtml);
  updated = replaceBetweenMarkers(updated, 'HOME_SCHEMA', schemaHtml);

  if (updated !== indexHtml) {
    await writeFile(INDEX_PATH, updated, 'utf8');
    console.log(`Updated index.html SSR: ${HOME_FEATURED_CATEGORIES.length} category pills, ${candidates.length} video cards, ${(Buffer.byteLength(updated, 'utf8') / 1024).toFixed(1)} KB total.`);
  } else {
    console.log('index.html SSR content unchanged.');
  }
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exitCode = 1;
});
