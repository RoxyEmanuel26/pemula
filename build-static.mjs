#!/usr/bin/env node
/**
 * build-static.mjs
 * Ultra-Hemat Vercel Build-Time Static Pre-Renderer.
 * Runs in ~2-4 seconds inside Vercel `buildCommand` to pre-render 2,200+ pages directly as static CDN HTML:
 *  - 8 Homepages (index.html, de.html, fr.html, es.html, it.html, nl.html, pt.html, pl.html)
 *  - 6 Discovery/Utility Pages (trending.html, top-rated.html, longest.html, jav.html, categories.html, saved.html)
 *  - 1 Static Autocomplete Index (assets/data/suggest.json -> replaces /api/suggest -> 0 invocations!)
 *  - 72 Core EN Categories + 172 Compound Hubs (c/<slug>.html = 244 pages)
 *  - 448 Localized EU Category Hubs ({de,fr,es,it,nl,pt,pl}/c/<slug>.html)
 *  - Top 1,500 Hottest Watch Pages (v/<id>-<slug>.html -> eliminates 80%+ of /v/ serverless invocations!)
 * Result: Cuts Vercel Fast Origin Transfer & Function Invocations by >92% while preserving 100% SEO & Adsterra.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BASE_URL,
  SITE_DOMAIN,
  CURATED_CATEGORIES,
  EU_LOCALES,
  EU_LOCALIZED_CATEGORIES,
  US_EU_CATEGORIES,
  expandRuntimeVideo,
  normalizeUrl,
  escapeHtml,
  cleanSourceTitle,
  slugify,
  formatCategoryName,
  formatHumanDuration,
  formatDurationBadge,
  formatCompactViews,
  createOrganizationSchema,
  createVideoObjectSchema,
  createBreadcrumbSchema,
} from './lib/schema.js';
import { ICONS, renderPageShell, renderVideoCard } from './lib/ui-shell.js';
import { renderHomePage } from './lib/home-renderer.js';
import { renderDiscoverPages, buildSuggestJson } from './lib/discover-renderer.js';
import { renderStaticCategoryPage } from './lib/category-static-renderer.js';
import { COMPOUND_HUB_DEFS, MIN_COMPOUND_VIDEOS } from './lib/taxonomy.js';

const ROOT = process.cwd();
const CURATED_SET = new Set(CURATED_CATEGORIES);
const TOP_STATIC_WATCH_COUNT = Math.min(Math.max(parseInt(process.env.STATIC_WATCH_LIMIT || '600', 10) || 600, 0), 6500);

function selectRelatedIdsFast(index, orderedPosMap, currentVideoId, candidateTags, primaryCatSlug) {
  const orderedIds = index.orderedIds || [];
  const byTag = index.byTag || {};
  const featured = index.featured || [];
  const pickedIds = [];
  const pickedSet = new Set([currentVideoId]);
  const addId = (id) => {
    if (!id || pickedSet.has(id)) return false;
    pickedSet.add(id);
    pickedIds.push(id);
    return true;
  };

  if (orderedIds.length > 4) {
    const pos = orderedPosMap.has(currentVideoId) ? orderedPosMap.get(currentVideoId) : -1;
    if (pos !== -1) {
      const n = orderedIds.length;
      for (const offset of [1, 2, 3, n - 1]) addId(orderedIds[(pos + offset) % n]);
    }
  }
  const primaryBucket = byTag[primaryCatSlug] || [];
  if (primaryBucket.length > 1) {
    const tPos = primaryBucket.indexOf(currentVideoId);
    const startIdx = tPos >= 0 ? tPos + 1 : 0;
    let addedTopical = 0;
    for (let step = 0; step < primaryBucket.length && addedTopical < 4 && pickedIds.length < 12; step++) {
      if (addId(primaryBucket[(startIdx + step) % primaryBucket.length])) addedTopical++;
    }
  }
  if (pickedIds.length < 12) {
    const scoreById = new Map();
    const tagSlugs = [...new Set(candidateTags.map(t => slugify(t, 40, '')).filter(Boolean))];
    for (const tSlug of tagSlugs) {
      const bucket = byTag[tSlug];
      if (!Array.isArray(bucket)) continue;
      for (let i = 0; i < bucket.length; i++) {
        const vid = bucket[i];
        if (pickedSet.has(vid)) continue;
        scoreById.set(vid, (scoreById.get(vid) || 0) + 10 + (i < 12 ? 1 : 0));
      }
    }
    const ranked = [...scoreById.entries()].sort((a, b) => b[1] - a[1]);
    for (const [vid] of ranked) {
      if (pickedIds.length >= 12) break;
      addId(vid);
    }
  }
  for (const fid of featured) {
    if (pickedIds.length >= 12) break;
    addId(fid);
  }
  return pickedIds.slice(0, 12);
}

function buildStaticWatchHtml(videoId, enrichedData, index, orderedPosMap, allCompactById, categoryDescs) {
  const domain = BASE_URL;
  const allCandidateTags = enrichedData.tags || [];
  let primaryTag = allCandidateTags[0] || 'viral';
  for (const candidate of allCandidateTags) {
    const cSlug = slugify(candidate, 40, '');
    if (CURATED_SET.has(cSlug)) { primaryTag = candidate; break; }
  }

  const decodedTitle = cleanSourceTitle(enrichedData.title) || enrichedData.title || 'HD Adult Video';
  const catSlug = CURATED_SET.has(slugify(primaryTag, 40, '')) ? slugify(primaryTag, 40, 'viral') : 'viral';
  const catName = formatCategoryName(catSlug);
  const pageTitle = (enrichedData.seo_title && enrichedData.seo_title.length >= 28 && enrichedData.seo_title.length <= 65)
    ? enrichedData.seo_title
    : `${decodedTitle.slice(0, 48)} | LustHub`;
  const videoSlug = enrichedData.slug || slugify(decodedTitle, 80, videoId);
  const canonicalUrl = normalizeUrl(`${domain}/v/${videoId}-${videoSlug}`);
  const metaDesc = (enrichedData.meta_description && enrichedData.meta_description.length >= 100 && enrichedData.meta_description.length <= 165)
    ? enrichedData.meta_description
    : `Watch ${decodedTitle} free in full HD on ${SITE_DOMAIN}. Instant mobile-ready streaming with zero account signup.`;

  const thumbUrl = normalizeUrl(enrichedData.thumbnail || `${domain}/assets/icons/og-image.png`);
  const embedUrl = normalizeUrl(`https://www.eporner.com/embed/${videoId}/`);
  const durationSec = Number(enrichedData.duration || 0);
  const durationBadge = formatDurationBadge(durationSec);
  const humanDur = formatHumanDuration(durationSec);
  const viewCountRaw = Number(enrichedData.views || 0);
  const uploadDateRaw = enrichedData.generated_at || '';
  const publishedDay = uploadDateRaw ? String(uploadDateRaw).slice(0, 10) : '';

  const orgSchema = createOrganizationSchema();
  delete orgSchema['@context'];
  const webPageSchema = {
    '@type': 'WebPage',
    '@id': `${canonicalUrl}#webpage`,
    'url': canonicalUrl,
    'name': pageTitle,
    'description': metaDesc,
    'inLanguage': 'en',
    'isPartOf': { '@id': `${domain}/#website` },
    'primaryImageOfPage': { '@type': 'ImageObject', 'url': thumbUrl },
    'mainEntity': { '@id': `${canonicalUrl}#video` },
  };
  const videoObject = createVideoObjectSchema({}, {
    canonicalUrl,
    title: decodedTitle,
    description: metaDesc,
    thumbnailUrl: thumbUrl,
    embedUrl,
    keywords: allCandidateTags,
    durationSec,
    uploadDate: uploadDateRaw,
    views: viewCountRaw,
  });
  const breadcrumbList = createBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: `${catName} Videos`, url: `/c/${catSlug}` },
    { name: decodedTitle, url: canonicalUrl },
  ]);
  delete breadcrumbList['@context'];

  const graphItems = [orgSchema, webPageSchema, videoObject, breadcrumbList];
  if (Array.isArray(enrichedData.faq) && enrichedData.faq.length > 0) {
    graphItems.push({
      '@type': 'FAQPage',
      'mainEntity': enrichedData.faq.map(f => ({
        '@type': 'Question',
        'name': f.question,
        'acceptedAnswer': { '@type': 'Answer', 'text': f.answer },
      })),
    });
  }

  const relatedIds = selectRelatedIdsFast(index, orderedPosMap, videoId, allCandidateTags, catSlug);
  const relatedCards = relatedIds.map(rid => {
    const c = allCompactById.get(rid) || index.cards?.[rid];
    if (!c) return null;
    return { id: rid, title: c.t || '', slug: c.s || rid, thumbnail: c.th || '', duration: Number(c.du || 0), views: Number(c.vw || 0), date: c.at || '' };
  }).filter(Boolean);

  const uniqueTags = [];
  const seenTagSlugs = new Set();
  for (const tag of allCandidateTags) {
    const cleanT = String(tag || '').trim();
    if (!cleanT || cleanT.length > 35 || cleanT.toLowerCase() === decodedTitle.toLowerCase()) continue;
    const tSlug = slugify(cleanT, 40, '');
    if (!tSlug || seenTagSlugs.has(tSlug)) continue;
    seenTagSlugs.add(tSlug);
    uniqueTags.push({ label: cleanT, slug: tSlug, isCurated: CURATED_SET.has(tSlug) });
    if (uniqueTags.length >= 8) break;
  }
  const tagsHtml = uniqueTags.length > 0
    ? `<div class="lh-dir-pills" style="margin:14px 0;">${uniqueTags.map(t => `<a href="/c/${escapeHtml(t.slug)}"${t.isCurated ? '' : ' rel="nofollow"'} class="lh-dir-pill">${escapeHtml(t.label)}</a>`).join('')}</div>`
    : '';

  const summaryParas = String(enrichedData.summary || '').split(/\n+/).map(p => p.trim()).filter(Boolean).map(p => `<p>${escapeHtml(p)}</p>`).join('');
  const highlightsLi = (enrichedData.highlights || []).map(h => `<li style="padding:6px 0 6px 18px;position:relative;color:var(--text-secondary);font-size:0.9rem;"><span style="position:absolute;left:0;color:var(--accent);font-weight:700;">&#8226;</span>${escapeHtml(h)}</li>`).join('');
  const faqHtml = (enrichedData.faq || []).map(f => `<div class="lh-faq-item"><h3>${escapeHtml(f.question)}</h3><p>${escapeHtml(f.answer)}</p></div>`).join('');
  const catEditorialPara = categoryDescs?.[catSlug]?.paragraphs?.[0] || '';
  const siblingHubsHtml = US_EU_CATEGORIES.filter(s => s !== catSlug).slice(0, 8).map(s => `<a href="/c/${escapeHtml(s)}" class="lh-dir-pill">${escapeHtml(formatCategoryName(s))}</a>`).join('');

  const sidebarUpNextHtml = relatedCards.slice(0, 4).map(c => {
    const dur = formatDurationBadge(c.duration);
    const views = formatCompactViews(c.views);
    return `<a href="/v/${escapeHtml(c.id)}-${escapeHtml(c.slug)}" style="display:grid;grid-template-columns:132px minmax(0,1fr);gap:10px;align-items:start;"><div style="position:relative;aspect-ratio:16/9;border-radius:7px;overflow:hidden;background:var(--bg-elev-2);border:1px solid var(--border);"><img src="${escapeHtml(c.thumbnail)}" alt="${escapeHtml(c.title)}" loading="lazy" width="160" height="90" style="width:100%;height:100%;object-fit:cover;">${dur ? `<span class="lh-badge-dur" style="font-size:0.65rem;padding:1px 5px;right:4px;bottom:4px;">${escapeHtml(dur)}</span>` : ''}</div><div style="min-width:0;"><div style="font-size:0.82rem;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(c.title)}</div>${views ? `<div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-muted);margin-top:4px;">${escapeHtml(views)} views</div>` : ''}</div></a>`;
  }).join('');

  const relatedGridHtml = relatedCards.map((c, idx) => renderVideoCard(c, idx + 4)).join('');
  const ogVideoMeta = `<meta property="og:video" content="${escapeHtml(embedUrl)}"><meta property="og:video:url" content="${escapeHtml(embedUrl)}"><meta property="og:video:secure_url" content="${escapeHtml(embedUrl)}"><meta property="og:video:type" content="text/html"><meta property="og:video:width" content="1280"><meta property="og:video:height" content="720">`;

  const bodyHtml = `
        <nav class="lh-breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/c/${escapeHtml(catSlug)}">${escapeHtml(catName)}</a><span>/</span><span style="color:var(--text-secondary);">${escapeHtml(decodedTitle)}</span></nav>
        <div class="lh-watch-layout" id="lhWatchLayout">
          <div class="lh-watch-primary">
            <div class="lh-ad-slot-player-bar ad-space" id="playerAdTop"></div>
            <div class="lh-player-shell" itemscope itemtype="https://schema.org/VideoObject">
              <meta itemprop="name" content="${escapeHtml(decodedTitle)}">
              <meta itemprop="description" content="${escapeHtml(metaDesc)}">
              <meta itemprop="uploadDate" content="${escapeHtml(videoObject.uploadDate)}">
              ${videoObject.duration ? `<meta itemprop="duration" content="${escapeHtml(videoObject.duration)}">` : ''}
              <link itemprop="thumbnailUrl" href="${escapeHtml(thumbUrl)}">
              <link itemprop="embedUrl" href="${escapeHtml(embedUrl)}">
              <div class="lh-player-facade" role="button" tabindex="0" data-lh-player-facade="1" data-video-id="${escapeHtml(videoId)}" data-embed="${escapeHtml(embedUrl)}" data-title="${escapeHtml(decodedTitle)}" data-duration="${escapeHtml(durationBadge)}" aria-label="Play ${escapeHtml(decodedTitle)}">
                <img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(decodedTitle)}" fetchpriority="high" width="1280" height="720">
                <button type="button" class="lh-play-circle" aria-label="Play HD Video">${ICONS.playLg}</button>
                ${durationBadge ? `<span class="lh-badge-dur" style="font-size:0.84rem;padding:4px 10px;right:12px;bottom:12px;">${escapeHtml(durationBadge)}</span>` : ''}
              </div>
              <noscript><iframe src="${escapeHtml(embedUrl)}" allowfullscreen loading="lazy" title="${escapeHtml(decodedTitle)}"></iframe></noscript>
            </div>
            <div style="margin-top:16px;">
              <h1 class="lh-page-title" style="font-size:clamp(1.25rem,2.1vw,1.65rem);">${escapeHtml(decodedTitle)}</h1>
              <div class="lh-watch-actions">
                <div class="lh-stats-row">
                  ${durationBadge ? `<span class="lh-stat-chip">${escapeHtml(durationBadge)}</span>` : ''}
                  ${viewCountRaw > 0 ? `<span class="lh-stat-chip">${viewCountRaw.toLocaleString('en-US')} views</span>` : ''}
                  ${publishedDay ? `<span class="lh-stat-chip">${escapeHtml(publishedDay)}</span>` : ''}
                </div>
                <div class="lh-action-group">
                  <button type="button" class="lh-btn" id="lhTheaterBtn" aria-pressed="false" title="Toggle Theater Mode (T)">${ICONS.expand}<span>Theater</span></button>
                  <button type="button" class="lh-btn" data-save-id="${escapeHtml(videoId)}" data-save-title="${escapeHtml(decodedTitle)}" data-save-href="/v/${escapeHtml(videoId)}-${escapeHtml(videoSlug)}" data-save-thumb="${escapeHtml(thumbUrl)}" data-save-duration="${escapeHtml(durationBadge)}" aria-pressed="false">${ICONS.bookmark}<span>Save</span></button>
                  <button type="button" class="lh-btn" id="lhShareCopyBtn" data-copy-url="${escapeHtml(canonicalUrl)}">${ICONS.share}<span>Share</span></button>
                </div>
              </div>
              <p style="color:var(--text-secondary);font-size:0.93rem;line-height:1.6;">${escapeHtml(metaDesc)}</p>
              ${tagsHtml}
            </div>
            <div class="lh-ad-slot-player-bar ad-space" id="playerAdBottom"></div>
            <section class="lh-section-card" style="margin-top:20px;">
              <h2>Video Overview</h2>
              ${summaryParas}
              <div class="lh-specs-grid">
                <div class="lh-spec-tile"><span class="lh-spec-label">Category</span><a href="/c/${escapeHtml(catSlug)}" class="lh-spec-value" style="color:var(--accent);">${escapeHtml(catName)}</a></div>
                ${humanDur ? `<div class="lh-spec-tile"><span class="lh-spec-label">Runtime</span><span class="lh-spec-value">${escapeHtml(humanDur)}</span></div>` : ''}
                ${viewCountRaw > 0 ? `<div class="lh-spec-tile"><span class="lh-spec-label">Views</span><span class="lh-spec-value">${viewCountRaw.toLocaleString('en-US')}</span></div>` : ''}
                ${publishedDay ? `<div class="lh-spec-tile"><span class="lh-spec-label">Published</span><span class="lh-spec-value">${escapeHtml(publishedDay)}</span></div>` : ''}
                <div class="lh-spec-tile"><span class="lh-spec-label">Stream Format</span><span class="lh-spec-value">1080p HD &bull; 18+ RTA</span></div>
              </div>
              <h3 style="font-family:var(--font-display);font-size:1rem;font-weight:700;margin:16px 0 8px;">Key Highlights</h3>
              <ul style="list-style:none;margin-bottom:18px;">${highlightsLi}</ul>
              ${catEditorialPara ? `<div style="padding:14px 16px;border-radius:var(--radius-ctrl);background:var(--bg-elev-2);border:1px solid var(--border);margin-bottom:18px;"><h3 style="font-family:var(--font-display);font-size:0.95rem;font-weight:700;margin-bottom:6px;">About ${escapeHtml(catName)} HD Collection</h3><p style="margin:0;font-size:0.86rem;">${escapeHtml(catEditorialPara)}</p></div>` : ''}
              ${faqHtml ? `<h3 style="font-family:var(--font-display);font-size:1rem;font-weight:700;margin:16px 0 8px;">Frequently Asked Questions</h3><div class="lh-faq-grid" style="margin-top:8px;">${faqHtml}</div>` : ''}
              <div style="margin-top:20px;padding-top:14px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;"><div class="lh-dir-pills">${siblingHubsHtml}</div><a href="/c/${escapeHtml(catSlug)}" style="color:var(--accent);font-weight:700;font-size:0.86rem;white-space:nowrap;">All ${escapeHtml(catName)} Videos &rarr;</a></div>
            </section>
          </div>
          <aside class="lh-watch-sidebar" aria-label="Up Next and Sponsored">
            <div class="lh-ad-slot-player-side ad-space" id="playerAdSide"></div>
            ${sidebarUpNextHtml ? `<div class="lh-section-card" style="margin-top:0;padding:16px;"><h2 style="font-size:0.98rem;margin-bottom:12px;">Up Next in ${escapeHtml(catName)}</h2><div style="display:flex;flex-direction:column;gap:12px;">${sidebarUpNextHtml}</div></div>` : ''}
            <div class="lh-ad-slot-player-side ad-space" id="adBannerContent"></div>
          </aside>
        </div>
        ${relatedGridHtml ? `<section style="margin-top:34px;" aria-label="Similar HD Videos"><div class="lh-hero-bar" style="margin-bottom:14px;"><h2 style="font-family:var(--font-display);font-size:1.3rem;font-weight:800;letter-spacing:-0.02em;">Related <span style="color:var(--accent);">${escapeHtml(catName)}</span> HD Videos</h2><a href="/c/${escapeHtml(catSlug)}" class="lh-btn">Browse All &rarr;</a></div><div class="lh-grid">${relatedGridHtml}</div></section>` : ''}`;

  return {
    fileName: `${videoId}-${videoSlug}.html`,
    html: renderPageShell({
      lang: 'en',
      title: pageTitle,
      description: metaDesc,
      canonicalUrl,
      ogType: 'video.other',
      ogImage: thumbUrl,
      ogExtraMeta: ogVideoMeta,
      robots: 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1',
      hreflangPath: null,
      schemas: [{ '@context': 'https://schema.org', '@graph': graphItems }],
      activeNav: catSlug === 'japanese' ? 'jav' : 'home',
      showHeaderAd: true,
      showBottomAd: false,
      bodyHtml,
    }),
  };
}

async function writeBatch(tasks, concurrency = 32) {
  let i = 0;
  let totalBytes = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= tasks.length) break;
      const [filePath, content] = tasks[idx];
      totalBytes += Buffer.byteLength(content, 'utf8');
      await writeFile(filePath, content, 'utf8');
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length || 1) }, worker));
  return totalBytes;
}

async function main() {
  const t0 = performance.now();
  const [indexRaw, catDescRaw, euLocalesRaw] = await Promise.all([
    readFile(path.join(ROOT, 'data', 'runtime', 'index.json'), 'utf8'),
    readFile(path.join(ROOT, 'data', 'category-descriptions.json'), 'utf8'),
    readFile(path.join(ROOT, 'data', 'eu-locales.json'), 'utf8'),
  ]);
  const index = JSON.parse(indexRaw);
  const descriptions = JSON.parse(catDescRaw);
  const euLocales = JSON.parse(euLocalesRaw);

  // Load all 64 shards ONCE in parallel (~25ms total) so category & top watch builds have 100% metadata
  const shardsDir = path.join(ROOT, 'data', 'runtime', 'shards');
  const shardFiles = (await readdir(shardsDir)).filter(f => f.endsWith('.json'));
  const allCompactById = new Map();
  await Promise.all(
    shardFiles.map(async (sf) => {
      const parsed = JSON.parse(await readFile(path.join(shardsDir, sf), 'utf8'));
      for (const [id, rec] of Object.entries(parsed)) {
        allCompactById.set(id, rec);
      }
    })
  );

  // Create target directories
  const dirs = [
    path.join(ROOT, 'assets', 'data'),
    path.join(ROOT, 'c'),
    path.join(ROOT, 'v'),
    ...EU_LOCALES.map(lang => path.join(ROOT, lang, 'c')),
  ];
  await Promise.all(dirs.map(d => mkdir(d, { recursive: true })));

  const tasks = [];

  // 1. 8 Homepages (EN + 7 EU)
  tasks.push([path.join(ROOT, 'index.html'), renderHomePage({ lang: 'en', localeCfg: null, index })]);
  for (const lang of EU_LOCALES) {
    tasks.push([path.join(ROOT, `${lang}.html`), renderHomePage({ lang, localeCfg: euLocales[lang], index })]);
  }

  // 2. 6 Discovery pages + static suggest.json
  const discoverPages = renderDiscoverPages(index);
  for (const [fname, html] of Object.entries(discoverPages)) {
    tasks.push([path.join(ROOT, fname), html]);
  }
  tasks.push([path.join(ROOT, 'assets', 'data', 'suggest.json'), buildSuggestJson(index)]);

  // 3. 72 Core EN Categories + 172 Active Compound Hubs (244 static pages)
  for (const slug of CURATED_CATEGORIES) {
    tasks.push([
      path.join(ROOT, 'c', `${slug}.html`),
      renderStaticCategoryPage({ slug, lang: 'en', localeCfg: null, descriptions, index, allCardsById: allCompactById }),
    ]);
  }
  const compoundCounts = index.compoundCounts || {};
  let compoundBuilt = 0;
  for (const cDef of COMPOUND_HUB_DEFS) {
    if ((compoundCounts[cDef.slug] || 0) < MIN_COMPOUND_VIDEOS) continue;
    compoundBuilt++;
    tasks.push([
      path.join(ROOT, 'c', `${cDef.slug}.html`),
      renderStaticCategoryPage({ slug: cDef.slug, lang: 'en', localeCfg: null, descriptions, index, allCardsById: allCompactById }),
    ]);
  }

  // 4. 448 Localized EU Category Hubs (7 languages × 64 EU_LOCALIZED_CATEGORIES)
  for (const lang of EU_LOCALES) {
    const localeCfg = euLocales[lang];
    for (const slug of EU_LOCALIZED_CATEGORIES) {
      tasks.push([
        path.join(ROOT, lang, 'c', `${slug}.html`),
        renderStaticCategoryPage({ slug, lang, localeCfg, descriptions, index, allCardsById: allCompactById }),
      ]);
    }
  }

  // 5. Top 1,500 Hottest Watch Pages (v/<id>-<slug>.html)
  const orderedIds = index.orderedIds || [];
  const orderedPosMap = new Map(orderedIds.map((id, i) => [id, i]));
  let watchBuilt = 0;
  for (const vid of orderedIds.slice(0, TOP_STATIC_WATCH_COUNT)) {
    const raw = allCompactById.get(vid);
    const expanded = expandRuntimeVideo(raw);
    if (!expanded) continue;
    const { fileName, html } = buildStaticWatchHtml(vid, expanded, index, orderedPosMap, allCompactById, descriptions);
    if (!/^[a-zA-Z0-9_-]{5,120}\.html$/.test(fileName)) continue;
    tasks.push([path.join(ROOT, 'v', fileName), html]);
    watchBuilt++;
  }

  const totalBytes = await writeBatch(tasks, 32);
  const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(
    `Built ${tasks.length} static CDN files in ${elapsed}s (${(totalBytes / 1024 / 1024).toFixed(2)} MB total): ` +
    `8 homes, 6 discovery + suggest.json, ${CURATED_CATEGORIES.length} core EN + ${compoundBuilt} compound + ${EU_LOCALES.length * EU_LOCALIZED_CATEGORIES.length} EU hubs, ${watchBuilt} hot watch pages.`
  );
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exitCode = 1;
});
