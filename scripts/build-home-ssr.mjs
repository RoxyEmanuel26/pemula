#!/usr/bin/env node
/**
 * scripts/build-home-ssr.mjs
 * Statically pre-renders bidirectional hreflang + og:locale:alternate,
 * language switcher bar, curated US/EU category links, top 24 clean English
 * US/EU AI-enriched video cards, complete 72-hub internal linking directory,
 * and Homepage ItemList + FAQPage schema directly into index.html.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CURATED_CATEGORIES,
  escapeHtml,
  decodeMojibake,
  cleanSourceTitle,
  isSpamVideoTitle,
  slugify,
  normalizeUrl,
  formatCategoryName,
  buildHreflangHtml,
  buildOgLocaleMetaHtml,
  buildLanguageSwitcherHtml,
  createItemListSchema,
} from '../api/schema-helper.js';

const ROOT = process.cwd();
const INDEX_PATH = path.join(ROOT, 'index.html');
const STATE_PATH = path.join(ROOT, 'data', 'sitemap-state.json');
const ENRICHED_PATH = path.join(ROOT, 'data', 'enriched-videos.json');

const HOME_FEATURED_CATEGORIES = [
  'milf', 'blonde', 'brunette', 'latina', 'ebony', 'amateur', 'pov', 'onlyfans', 'european',
  'british', 'german', 'french', 'spanish', 'italian', 'czech', 'stepmom', 'massage',
  'big-tits', 'big-ass', 'anal', 'hardcore', '4k-uhd', 'pornstar', 'japanese',
];

const CATEGORY_LABELS = {
  'milf': 'MILF',
  'pov': 'POV',
  'bbw': 'BBW',
  'pawg': 'PAWG',
  'onlyfans': 'OnlyFans',
  '4k-uhd': '4K UHD',
  'big-tits': 'Big Tits',
  'big-ass': 'Big Ass',
  'japanese': 'Japanese JAV',
  'live-cam': 'Live Cam',
  'tiktok-viral': 'TikTok Viral',
  'bokep-indo': 'Bokep Indo',
  'artis-indo': 'Artis Indo',
  'hot-indo': 'Hot Indo',
  'double-penetration': 'Double Penetration',
  'group-sex': 'Group Sex',
};

const DIRECTORY_GROUPS = [
  {
    title: 'US & European Favorites',
    slugs: ['milf', 'blonde', 'brunette', 'latina', 'ebony', 'european', 'british', 'german', 'french', 'spanish', 'italian', 'czech', 'russian', 'redhead', 'petite', 'bbw', 'pawg'],
  },
  {
    title: 'Popular Niches & Fantasies',
    slugs: ['stepmom', 'stepsis', 'amateur', 'pov', 'massage', 'casting', 'squirt', 'deepthroat', 'big-tits', 'big-ass', 'anal', 'double-penetration', 'blowjob', 'handjob', 'cumshot', 'hardcore', 'lesbian', 'threesome', 'group-sex', 'creampie', 'interracial'],
  },
  {
    title: 'Creators, 4K & Lifestyle',
    slugs: ['onlyfans', 'pornstar', 'hotwife', 'cuckold', 'solo', '4k-uhd', 'homemade', 'lingerie', 'cosplay', 'public', 'college', 'live-cam', 'couple', 'mature', 'outdoor', 'celebrity', 'dance', 'hotel'],
  },
  {
    title: 'Asian, JAV & Regional Hubs',
    slugs: ['japanese', 'asian', 'indian', 'korean', 'viral', 'tiktok-viral', 'hijab', 'student', 'indonesia', 'bokep-indo', 'mahasiswi', 'pasutri', 'rumahan', 'artis-indo', 'pantai', 'hot-indo'],
  },
];

const HOME_FAQS = [
  {
    question: 'Can I stream 1080p HD & 4K adult videos free across the US and Europe?',
    answer: 'Yes. All 72 curated categories and AI-enriched HD watch pages stream completely free across the United States, United Kingdom, Germany, France, Spain, Italy, and worldwide without subscriptions or signup walls.',
  },
  {
    question: 'Does lusthub.my.id support European languages and instant mobile playback?',
    answer: 'Yes. Dedicated localized portals in English (/), Deutsch (/de), Français (/fr), Español (/es), and Italiano (/it) load immediately inside Chrome, Safari, Firefox, and Edge without app downloads.',
  },
  {
    question: 'Is lusthub.my.id RTA compliant and updated with new US/EU & JAV releases?',
    answer: 'Yes. Every route carries the 18+ RTA-5042-1996-1400-1577-RTA label alongside automated twice-daily catalog updates covering US, European, creator, and JAV releases.',
  },
];

function formatCategoryLabel(slug) {
  if (CATEGORY_LABELS[slug]) return CATEGORY_LABELS[slug];
  return formatCategoryName(slug);
}

function formatDurationBadge(sec) {
  const s = Number(sec || 0);
  if (!Number.isFinite(s) || s <= 0) return '';
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function isCleanUsEuHomeCandidate(video, enriched) {
  const title = cleanSourceTitle(video.title || enriched?.title || '');
  if (!title || title.length < 16) return false;
  if (isSpamVideoTitle(title)) return false;
  if (/[^\x00-\x7F]/.test(title)) return false;
  if (/^[a-z0-9\-_*]{3,14}$/i.test(title.replace(/\s+/g, ''))) return false;
  if (/\b(indo|bokep|mertua|mantu|ngewe|memek|kontol|colmek|ngentot|jilbab|pasutri|mahasiswi|tante|abg|rumahan|pantai|tamil|bhabhi|desis?|mallu|hindi)\b/i.test(title)) {
    return false;
  }
  const combinedTags = `${title} ${(enriched?.tags || []).join(' ')} ${video.keywords || ''}`;
  if (/\b(indonesian|indonesia|tamil|indian)\b/i.test(combinedTags)) return false;
  return title.split(/\s+/).filter(Boolean).length >= 3;
}

function scoreHomeVideo(video, enriched) {
  const title = cleanSourceTitle(video.title || enriched?.title || '');
  const combined = `${title} ${(enriched?.tags || []).join(' ')} ${video.keywords || ''}`;
  let score = Math.log10((Number(video.views) || 0) + 1) * 18;
  if (/\b(milf|blonde|brunette|latina|ebony|amateur|pov|onlyfans|fansly|4k|anal|lesbian|threesome|creampie|european|british|german|french|spanish|italian|czech|stepmom|massage|casting|squirt|pawg|hardcore|pornstar)\b/i.test(combined)) {
    score += 24;
  }
  if (video.thumbnail && video.thumbnail.includes('_360')) score += 14;
  if (title.length >= 24 && title.length <= 75) score += 10;
  if (enriched?.summary && enriched.summary.length >= 140) score += 8;
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

function buildDirectoryHtml() {
  const renderedSet = new Set();
  const groupHtml = DIRECTORY_GROUPS.map((grp) => {
    const pills = grp.slugs
      .filter((s) => CURATED_CATEGORIES.includes(s))
      .map((s) => {
        renderedSet.add(s);
        return `<a href="/c/${escapeHtml(s)}" class="home-dir-pill">${escapeHtml(formatCategoryLabel(s))}</a>`;
      })
      .join('\n                        ');
    return `                    <div class="home-dir-group">
                        <h3>${escapeHtml(grp.title)}</h3>
                        <div class="home-dir-links">
                        ${pills}
                        </div>
                    </div>`;
  }).join('\n');

  const remainingSlugs = CURATED_CATEGORIES.filter((s) => !renderedSet.has(s));
  const extraHtml = remainingSlugs.length > 0
    ? `                    <div class="home-dir-group">
                        <h3>More Categories</h3>
                        <div class="home-dir-links">
                        ${remainingSlugs.map((s) => `<a href="/c/${escapeHtml(s)}" class="home-dir-pill">${escapeHtml(formatCategoryLabel(s))}</a>`).join('\n                        ')}
                        </div>
                    </div>`
    : '';

  const faqHtml = HOME_FAQS.map((f) => `                    <div class="home-faq-item">
                        <strong>${escapeHtml(f.question)}</strong>
                        <p>${escapeHtml(f.answer)}</p>
                    </div>`).join('\n');

  return `            <section class="home-seo-directory" aria-label="Explore All Adult Video Categories & FAQs">
                <div class="home-seo-directory-header">
                    <h2>Browse All ${CURATED_CATEGORIES.length} US, European &amp; Global 18+ Categories</h2>
                    <p>Explore fast-loading, no-signup 1080p HD &amp; 4K adult streaming hubs curated across American, British, German, French, Spanish, Italian, Czech, creator leaks, and Japanese JAV releases.</p>
                </div>
                <div class="home-dir-groups">
${groupHtml}${extraHtml ? '\n' + extraHtml : ''}
                </div>
                <div class="home-faq-grid">
${faqHtml}
                </div>
            </section>`;
}

async function main() {
  const indexHtml = await readFile(INDEX_PATH, 'utf8');
  const state = JSON.parse(await readFile(STATE_PATH, 'utf8'));
  const enrichedDb = JSON.parse(await readFile(ENRICHED_PATH, 'utf8'));

  const stateMap = new Map(state.videos.map(v => [v.id, v]));
  const enrichedVideos = Object.values(enrichedDb.videos || {}).filter(
    e => e.status === 'enriched' && e.model && e.model !== 'mock-enricher' && !isSpamVideoTitle(e.title) && stateMap.has(e.video_id)
  );

  const filtered = enrichedVideos.map(e => {
    const s = stateMap.get(e.video_id);
    return { state: s, enriched: e, isClean: isCleanUsEuHomeCandidate(s, e), score: scoreHomeVideo(s, e) };
  });

  const cleanUsEu = filtered.filter(x => x.isClean);
  const pool = cleanUsEu.length >= 24 ? cleanUsEu : filtered;
  const candidates = pool
    .sort((a, b) => b.score - a.score || b.state.published.localeCompare(a.state.published))
    .slice(0, 24);

  const categoryPillsHtml = HOME_FEATURED_CATEGORIES
    .map(slug => `                <a href="/c/${escapeHtml(slug)}" class="ssr-cat-pill">${escapeHtml(formatCategoryLabel(slug))}</a>`)
    .join('\n');

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

  const itemListSchema = createItemListSchema(
    'Featured Free 18+ HD Videos | LustHub',
    'Trending US, European, UK, creator, and JAV HD videos available on lusthub.my.id.',
    candidates.map(({ state: s, enriched: e }) => ({
      title: cleanSourceTitle(s.title) || s.title,
      url: `/v/${s.id}-${slugify(s.title, 80, s.id)}`,
      image: e.thumbnail || s.thumbnail,
    }))
  );
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': HOME_FAQS.map((f) => ({
      '@type': 'Question',
      'name': f.question,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': f.answer,
      },
    })),
  };

  const hreflangBlock = `${buildOgLocaleMetaHtml('en')}\n${buildHreflangHtml('')}`;
  const langSwitcherHtml = buildLanguageSwitcherHtml('en', '');
  const schemaHtml = `    <script id="homeItemListSchema" type="application/ld+json">${JSON.stringify(itemListSchema).replace(/</g, '\\u003c')}</script>\n    <script id="homeFaqSchema" type="application/ld+json">${JSON.stringify(faqSchema).replace(/</g, '\\u003c')}</script>`;
  const directoryHtml = buildDirectoryHtml();

  let updated = replaceBetweenMarkers(indexHtml, 'HOME_HREFLANG', hreflangBlock);
  updated = replaceBetweenMarkers(updated, 'HOME_LANG_SWITCHER', langSwitcherHtml);
  updated = replaceBetweenMarkers(updated, 'HOME_CATEGORIES', categoryPillsHtml);
  updated = replaceBetweenMarkers(updated, 'HOME_GRID', cardsHtml);
  updated = replaceBetweenMarkers(updated, 'HOME_DIRECTORY', directoryHtml);
  updated = replaceBetweenMarkers(updated, 'HOME_SCHEMA', schemaHtml);

  if (updated !== indexHtml) {
    await writeFile(INDEX_PATH, updated, 'utf8');
    console.log(`Updated index.html SSR: ${HOME_FEATURED_CATEGORIES.length} featured pills, ${CURATED_CATEGORIES.length} directory hubs, ${candidates.length} clean US/EU cards, ${(Buffer.byteLength(updated, 'utf8') / 1024).toFixed(1)} KB total.`);
  } else {
    console.log('index.html SSR content unchanged.');
  }
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exitCode = 1;
});
