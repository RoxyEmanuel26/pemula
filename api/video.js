import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BASE_URL,
  SITE_DOMAIN,
  CURATED_CATEGORIES,
  US_EU_CATEGORIES,
  normalizeUrl,
  escapeHtml,
  decodeMojibake,
  slugify,
  cleanSourceTitle,
  isSpamVideoTitle,
  formatCategoryName,
  formatHumanDuration,
  formatDurationBadge,
  formatCompactViews,
  createOrganizationSchema,
  createVideoObjectSchema,
  createBreadcrumbSchema,
} from '../lib/schema.js';
import {
  getRuntimeIndex,
  getOrderedPosition,
  getEnrichedVideoById,
  getCardsByIds,
} from '../lib/runtime-store.js';
import { ICONS, renderPageShell, renderVideoCard } from '../lib/ui-shell.js';

const CURATED_SET = new Set(CURATED_CATEGORIES);
const VIDEO_CACHE = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;
let cachedCategoryDescs = null;

async function getCategoryDescriptions() {
  if (!cachedCategoryDescs) {
    try {
      const raw = await readFile(path.join(process.cwd(), 'data', 'category-descriptions.json'), 'utf8');
      cachedCategoryDescs = JSON.parse(raw);
    } catch {
      cachedCategoryDescs = {};
    }
  }
  return cachedCategoryDescs;
}

function buildVideoTitle(title, tag) {
  const brand = ' | LustHub';
  const maxTitlePart = 60 - brand.length;
  const cleaned = cleanSourceTitle(title) || String(title || '').trim();
  if (cleaned.length > maxTitlePart) {
    let truncated = cleaned.slice(0, maxTitlePart).trim();
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 20) truncated = truncated.slice(0, lastSpace);
    return `${truncated}${brand}`;
  }
  const tagName = tag ? formatCategoryName(slugify(tag, 40, 'hd')) : 'HD';
  const candidates = [
    `${cleaned} — ${tagName} Full HD${brand}`,
    `${cleaned} - ${tagName} Video${brand}`,
    `Watch ${cleaned} in HD${brand}`,
    `${cleaned} Full HD${brand}`,
    `${cleaned}${brand}`,
  ];
  for (const c of candidates) {
    if (c.length >= 34 && c.length <= 62) return c;
  }
  return `${cleaned} - ${tagName} HD${brand}`.slice(0, 62);
}

/**
 * Strongly-connected ring mesh + O(1) topical tag lookup returning 12 related AI-enriched video IDs.
 * Mathematical guarantee: every alive AI video in orderedIds has in-degree >= 4 (0.00% orphans!).
 */
export function selectRelatedVideoIds(index, currentVideoId, candidateTags, primaryCatSlug) {
  const orderedIds = Array.isArray(index?.orderedIds) ? index.orderedIds : [];
  const byTag = index?.byTag || {};
  const featured = Array.isArray(index?.featured) ? index.featured : [];

  const pickedIds = [];
  const pickedSet = new Set([currentVideoId]);
  const addId = (id) => {
    if (!id || pickedSet.has(id)) return false;
    pickedSet.add(id);
    pickedIds.push(id);
    return true;
  };

  // 1. Strongly-connected global ring neighbors (+1, +2, +3, -1)
  if (orderedIds.length > 4) {
    const cachedPos = getOrderedPosition(currentVideoId);
    const pos = cachedPos >= 0 ? cachedPos : orderedIds.indexOf(currentVideoId);
    if (pos !== -1) {
      const n = orderedIds.length;
      for (const offset of [1, 2, 3, n - 1]) {
        addId(orderedIds[(pos + offset) % n]);
      }
    }
  }

  // 2. Cyclic topical siblings inside primary curated category
  const primaryBucket = Array.isArray(byTag[primaryCatSlug]) ? byTag[primaryCatSlug] : [];
  if (primaryBucket.length > 1) {
    const tPos = primaryBucket.indexOf(currentVideoId);
    const startIdx = tPos >= 0 ? tPos + 1 : 0;
    let addedTopical = 0;
    for (let step = 0; step < primaryBucket.length && addedTopical < 4 && pickedIds.length < 12; step++) {
      if (addId(primaryBucket[(startIdx + step) % primaryBucket.length])) addedTopical++;
    }
  }

  // 3. Top multi-tag overlap candidates
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

  // 4. Pad from featured
  for (const fid of featured) {
    if (pickedIds.length >= 12) break;
    addId(fid);
  }

  return pickedIds.slice(0, 12);
}

function renderNotFoundPage(isGone) {
  const quickHubs = US_EU_CATEGORIES.slice(0, 16)
    .map(s => `<a href="/c/${escapeHtml(s)}" class="lh-dir-pill">${escapeHtml(formatCategoryName(s))}</a>`)
    .join('');

  return renderPageShell({
    lang: 'en',
    title: isGone ? `Video Removed (410) | LustHub` : `Page Not Found (404) | LustHub`,
    description: `This video is no longer available on ${SITE_DOMAIN}. Browse thousands of live verified 1080p HD videos.`,
    canonicalUrl: `${BASE_URL}/`,
    robots: 'noindex, follow',
    showHeaderAd: false,
    bodyHtml: `
      <section class="lh-empty-box" style="max-width:680px;margin:24px auto;">
        <h1 class="lh-page-title" style="margin-bottom:10px;">${isGone ? 'Video Removed (410)' : 'Video Not Found (404)'}</h1>
        <p style="color:var(--text-secondary);margin-bottom:20px;">This video has been removed by its upstream source. Explore our live verified US, European, and JAV HD collections below.</p>
        <div style="display:flex;justify-content:center;gap:10px;margin-bottom:24px;flex-wrap:wrap;">
          <a href="/" class="lh-btn lh-btn-primary">Back to Home</a>
          <a href="/c/milf" class="lh-btn">Browse MILF</a>
          <a href="/c/european" class="lh-btn">Browse European</a>
        </div>
        <div class="lh-dir-pills" style="justify-content:center;">${quickHubs}</div>
      </section>`,
  });
}

export default async function handler(req, res) {
  const { slug } = req.query;
  const rawSlug = String(slug || '').trim();

  if (!rawSlug) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, follow');
    return res.end(renderNotFoundPage(false));
  }

  const videoId = rawSlug.split('-')[0];
  const domain = BASE_URL;

  // Fetch Eporner upstream metadata + local 120KB sharded record + index + category descriptions in parallel
  const fetchUpstream = async () => {
    const cached = VIDEO_CACHE.get(videoId);
    if (cached && (Date.now() - cached.ts < CACHE_TTL_MS)) {
      return { data: cached.data, notFound: false };
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const apiUrl = `https://www.eporner.com/api/v2/video/id/?id=${encodeURIComponent(videoId)}&thumbsize=big&format=json`;
      const apiRes = await fetch(apiUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'lusthub-bot/3.0 (+https://www.lusthub.my.id/robots.txt)' },
      });
      clearTimeout(timeout);
      if (apiRes.ok) {
        const json = await apiRes.json();
        if (json && !json.error && !Array.isArray(json) && json.id) {
          VIDEO_CACHE.set(videoId, { data: json, ts: Date.now() });
          return { data: json, notFound: false };
        }
        if ((Array.isArray(json) && json.length === 0) || (json && json.error)) {
          return { data: null, notFound: true };
        }
      } else if (apiRes.status === 404 || apiRes.status === 410) {
        return { data: null, notFound: true };
      }
    } catch {
      // Upstream transient error — fallback to sharded metadata cleanly
    }
    return { data: null, notFound: false };
  };

  const [upstream, enrichedData, index, categoryDescs] = await Promise.all([
    fetchUpstream(),
    getEnrichedVideoById(videoId),
    getRuntimeIndex(),
    getCategoryDescriptions(),
  ]);

  const videoData = upstream.data;
  const videoNotFound = upstream.notFound;

  if (videoNotFound || (!videoData && !enrichedData && (!videoId || videoId.length < 5))) {
    res.statusCode = videoNotFound ? 410 : 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, follow');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.end(renderNotFoundPage(videoNotFound));
  }

  const rawKeywords = videoData?.keywords
    ? (typeof videoData.keywords === 'string'
      ? videoData.keywords.split(',').map(s => decodeMojibake(s).trim()).filter(Boolean)
      : (Array.isArray(videoData.keywords) ? videoData.keywords.map(k => decodeMojibake(k).trim()).filter(Boolean) : []))
    : [];

  const allCandidateTags = [...(enrichedData?.tags || []), ...rawKeywords];
  let primaryTag = rawKeywords[0] || enrichedData?.tags?.[0] || 'viral';
  for (const candidate of allCandidateTags) {
    const candidateSlug = slugify(candidate, 40, '');
    if (CURATED_SET.has(candidateSlug)) {
      primaryTag = candidate;
      break;
    }
  }

  const rawTitle = videoData?.title || enrichedData?.title || rawSlug.split('-').slice(1).join(' ') || `Video ${videoId}`;
  const decodedTitle = cleanSourceTitle(rawTitle) || decodeMojibake(rawTitle) || 'HD Adult Video';

  let pageTitle = buildVideoTitle(decodedTitle, primaryTag);
  if (enrichedData?.seo_title && enrichedData.seo_title.length >= 28 && enrichedData.seo_title.length <= 65) {
    const barePrefix = `${decodedTitle} |`.toLowerCase();
    if (!enrichedData.seo_title.toLowerCase().startsWith(barePrefix) || decodedTitle.length >= 26) {
      pageTitle = enrichedData.seo_title;
    }
  }

  const videoSlug = enrichedData?.slug || slugify(videoData?.title || rawSlug.split('-').slice(1).join('-'), 80, videoId);
  const canonicalUrl = normalizeUrl(`${domain}/v/${videoId}-${videoSlug}`);

  const catSlug = CURATED_SET.has(slugify(primaryTag, 40, ''))
    ? slugify(primaryTag, 40, 'viral')
    : 'viral';
  const catName = formatCategoryName(catSlug);

  let metaDesc = `Watch ${decodedTitle} free in full HD on ${SITE_DOMAIN}. Instant mobile-ready streaming with fast cloud loading and zero account signup.`;
  if (metaDesc.length > 155) {
    metaDesc = metaDesc.slice(0, 152).replace(/\s+\S*$/, '').trim() + '...';
  }
  if (enrichedData?.meta_description && enrichedData.meta_description.length >= 110 && enrichedData.meta_description.length <= 165) {
    metaDesc = enrichedData.meta_description;
  }

  const hasNoindexParam = Boolean(req.query?.ref || req.query?.q || req.query?.order);
  const isSpam = isSpamVideoTitle(rawTitle);
  const isIndexable = Boolean(enrichedData) && !isSpam && !hasNoindexParam;
  const robotsValue = isIndexable
    ? 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1'
    : 'noindex, follow';

  const thumbUrl = normalizeUrl(
    videoData?.default_thumb?.src ||
    (videoData?.thumbs && videoData.thumbs[0]?.src) ||
    enrichedData?.thumbnail ||
    `${domain}/assets/icons/og-image.png`
  );

  const embedUrl = normalizeUrl(videoData?.embed || `https://www.eporner.com/embed/${videoId}/`);
  const durationSec = Number(videoData?.length_sec || enrichedData?.duration || 0);
  const durationBadge = videoData?.length_min || formatDurationBadge(durationSec);
  const humanDur = formatHumanDuration(durationSec);
  const viewCountRaw = videoData?.views ?? enrichedData?.views ?? 0;
  const uploadDateRaw = videoData?.added || enrichedData?.generated_at || '';
  const publishedDay = uploadDateRaw ? String(uploadDateRaw).slice(0, 10) : '';

  // JSON-LD @graph
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
  const videoObject = createVideoObjectSchema(videoData || {}, {
    canonicalUrl,
    title: decodedTitle,
    description: metaDesc,
    thumbnailUrl: thumbUrl,
    embedUrl,
    keywords: enrichedData?.tags || rawKeywords.slice(0, 6),
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
  if (enrichedData && Array.isArray(enrichedData.faq) && enrichedData.faq.length > 0) {
    graphItems.push({
      '@type': 'FAQPage',
      'mainEntity': enrichedData.faq.map(f => ({
        '@type': 'Question',
        'name': f.question,
        'acceptedAnswer': { '@type': 'Answer', 'text': f.answer },
      })),
    });
  }
  const graphSchema = { '@context': 'https://schema.org', '@graph': graphItems };

  // Fetch 12 strongly-connected related AI videos in parallel via sharded store
  const relatedIds = selectRelatedVideoIds(index, videoId, allCandidateTags, catSlug);
  const relatedCards = await getCardsByIds(relatedIds);

  // Build topic pills (curated = dofollow, uncurated = rel="nofollow")
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
    ? `<div class="lh-dir-pills" style="margin:14px 0;">
        ${uniqueTags.map(t => `<a href="/c/${escapeHtml(t.slug)}"${t.isCurated ? '' : ' rel="nofollow"'} class="lh-dir-pill">${escapeHtml(t.label)}</a>`).join('')}
      </div>`
    : '';

  // Rich Editorial + Scene Details + FAQs
  let enrichedSectionHtml = '';
  if (enrichedData) {
    const summaryParas = String(enrichedData.summary || '')
      .split(/\n+/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => `<p>${escapeHtml(p)}</p>`)
      .join('\n          ');

    const highlightsLi = (enrichedData.highlights || [])
      .map(h => `<li style="padding:6px 0 6px 18px;position:relative;color:var(--text-secondary);font-size:0.9rem;"><span style="position:absolute;left:0;color:var(--accent);font-weight:700;">&#8226;</span>${escapeHtml(h)}</li>`)
      .join('\n            ');

    const faqHtml = (enrichedData.faq || [])
      .map(f => `<div class="lh-faq-item"><h3>${escapeHtml(f.question)}</h3><p>${escapeHtml(f.answer)}</p></div>`)
      .join('\n            ');

    const catEditorialPara = categoryDescs?.[catSlug]?.paragraphs?.[0] || '';
    const siblingHubsHtml = US_EU_CATEGORIES
      .filter(s => s !== catSlug)
      .slice(0, 8)
      .map(s => `<a href="/c/${escapeHtml(s)}" class="lh-dir-pill">${escapeHtml(formatCategoryName(s))}</a>`)
      .join('');

    enrichedSectionHtml = `
      <section class="lh-section-card" style="margin-top:20px;">
        <h2>Video Overview</h2>
        ${summaryParas}

        <div class="lh-specs-grid">
          <div class="lh-spec-tile"><span class="lh-spec-label">Category</span><a href="/c/${escapeHtml(catSlug)}" class="lh-spec-value" style="color:var(--accent);">${escapeHtml(catName)}</a></div>
          ${humanDur ? `<div class="lh-spec-tile"><span class="lh-spec-label">Runtime</span><span class="lh-spec-value">${escapeHtml(humanDur)}</span></div>` : ''}
          ${Number(viewCountRaw) > 0 ? `<div class="lh-spec-tile"><span class="lh-spec-label">Views</span><span class="lh-spec-value">${Number(viewCountRaw).toLocaleString('en-US')}</span></div>` : ''}
          ${videoData?.rate ? `<div class="lh-spec-tile"><span class="lh-spec-label">Rating</span><span class="lh-spec-value">${escapeHtml(String(videoData.rate))}</span></div>` : ''}
          ${publishedDay ? `<div class="lh-spec-tile"><span class="lh-spec-label">Published</span><span class="lh-spec-value">${escapeHtml(publishedDay)}</span></div>` : ''}
          <div class="lh-spec-tile"><span class="lh-spec-label">Stream Format</span><span class="lh-spec-value">1080p HD &bull; 18+ RTA</span></div>
        </div>

        <h3 style="font-family:var(--font-display);font-size:1rem;font-weight:700;margin:16px 0 8px;">Key Highlights</h3>
        <ul style="list-style:none;margin-bottom:18px;">
          ${highlightsLi}
        </ul>

        ${catEditorialPara ? `<div style="padding:14px 16px;border-radius:var(--radius-ctrl);background:var(--bg-elev-2);border:1px solid var(--border);margin-bottom:18px;">
          <h3 style="font-family:var(--font-display);font-size:0.95rem;font-weight:700;margin-bottom:6px;">About ${escapeHtml(catName)} HD Collection</h3>
          <p style="margin:0;font-size:0.86rem;">${escapeHtml(catEditorialPara)}</p>
        </div>` : ''}

        ${faqHtml ? `<h3 style="font-family:var(--font-display);font-size:1rem;font-weight:700;margin:16px 0 8px;">Frequently Asked Questions</h3>
        <div class="lh-faq-grid" style="margin-top:8px;">
          ${faqHtml}
        </div>` : ''}

        <div style="margin-top:20px;padding-top:14px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div class="lh-dir-pills">${siblingHubsHtml}</div>
          <a href="/c/${escapeHtml(catSlug)}" style="color:var(--accent);font-weight:700;font-size:0.86rem;white-space:nowrap;">All ${escapeHtml(catName)} Videos &rarr;</a>
        </div>
      </section>`;
  }

  // Up Next sidebar mini-cards (first 4 related) + full 12 related grid below
  const sidebarUpNextHtml = relatedCards.slice(0, 4).map(c => {
    const href = `/v/${c.id}-${c.slug}`;
    const dur = formatDurationBadge(c.duration);
    const views = formatCompactViews(c.views);
    return `<a href="${escapeHtml(href)}" style="display:grid;grid-template-columns:132px minmax(0,1fr);gap:10px;align-items:start;">
      <div style="position:relative;aspect-ratio:16/9;border-radius:7px;overflow:hidden;background:var(--bg-elev-2);border:1px solid var(--border);">
        <img src="${escapeHtml(c.thumbnail)}" alt="${escapeHtml(c.title)}" loading="lazy" width="160" height="90" style="width:100%;height:100%;object-fit:cover;">
        ${dur ? `<span class="lh-badge-dur" style="font-size:0.65rem;padding:1px 5px;right:4px;bottom:4px;">${escapeHtml(dur)}</span>` : ''}
      </div>
      <div style="min-width:0;">
        <div style="font-size:0.82rem;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(c.title)}</div>
        ${views ? `<div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-muted);margin-top:4px;">${escapeHtml(views)} views</div>` : ''}
      </div>
    </a>`;
  }).join('\n          ');

  const relatedGridHtml = relatedCards.map((c, idx) => renderVideoCard(c, idx + 4)).join('\n          ');

  const ogVideoMeta = embedUrl
    ? `    <meta property="og:video" content="${escapeHtml(embedUrl)}">\n    <meta property="og:video:url" content="${escapeHtml(embedUrl)}">\n    <meta property="og:video:secure_url" content="${escapeHtml(embedUrl)}">\n    <meta property="og:video:type" content="text/html">\n    <meta property="og:video:width" content="1280">\n    <meta property="og:video:height" content="720">`
    : '';

  const bodyHtml = `
        <nav class="lh-breadcrumb" aria-label="Breadcrumb">
          <a href="/">Home</a>
          <span>/</span>
          <a href="/c/${escapeHtml(catSlug)}">${escapeHtml(catName)}</a>
          <span>/</span>
          <span style="color:var(--text-secondary);">${escapeHtml(decodedTitle)}</span>
        </nav>

        <div class="lh-watch-layout" id="lhWatchLayout">
          <div class="lh-watch-primary">
            <!-- Adsterra Player Top Banner (Preserved 100%) -->
            <div class="lh-ad-slot-player-bar ad-space" id="playerAdTop"></div>

            <div class="lh-player-shell" itemscope itemtype="https://schema.org/VideoObject">
              <meta itemprop="name" content="${escapeHtml(decodedTitle)}">
              <meta itemprop="description" content="${escapeHtml(metaDesc)}">
              <meta itemprop="uploadDate" content="${escapeHtml(videoObject.uploadDate)}">
              ${videoObject.duration ? `<meta itemprop="duration" content="${escapeHtml(videoObject.duration)}">` : ''}
              <link itemprop="thumbnailUrl" href="${escapeHtml(thumbUrl)}">
              ${embedUrl ? `<link itemprop="embedUrl" href="${escapeHtml(embedUrl)}">` : ''}
              <div class="lh-player-facade" role="button" tabindex="0" data-lh-player-facade="1" data-video-id="${escapeHtml(videoId)}" data-embed="${escapeHtml(embedUrl)}" data-title="${escapeHtml(decodedTitle)}" data-duration="${escapeHtml(durationBadge)}" aria-label="Play ${escapeHtml(decodedTitle)}">
                <img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(decodedTitle)}" fetchpriority="high" width="1280" height="720">
                <button type="button" class="lh-play-circle" aria-label="Play HD Video">${ICONS.playLg}</button>
                ${durationBadge ? `<span class="lh-badge-dur" style="font-size:0.84rem;padding:4px 10px;right:12px;bottom:12px;">${escapeHtml(durationBadge)}</span>` : ''}
              </div>
              ${embedUrl ? `<noscript><iframe src="${escapeHtml(embedUrl)}" allowfullscreen loading="lazy" title="${escapeHtml(decodedTitle)}"></iframe></noscript>` : ''}
            </div>

            <div style="margin-top:16px;">
              <h1 class="lh-page-title" style="font-size:clamp(1.25rem,2.1vw,1.65rem);">${escapeHtml(decodedTitle)}</h1>

              <div class="lh-watch-actions">
                <div class="lh-stats-row">
                  ${durationBadge ? `<span class="lh-stat-chip">${escapeHtml(durationBadge)}</span>` : ''}
                  ${Number(viewCountRaw) > 0 ? `<span class="lh-stat-chip">${Number(viewCountRaw).toLocaleString('en-US')} views</span>` : ''}
                  ${videoData?.rate ? `<span class="lh-stat-chip">Rating ${escapeHtml(String(videoData.rate))}</span>` : ''}
                  ${publishedDay ? `<span class="lh-stat-chip">${escapeHtml(publishedDay)}</span>` : ''}
                </div>
                <div class="lh-action-group">
                  <button type="button" class="lh-btn" id="lhTheaterBtn" aria-pressed="false" title="Toggle Theater Mode (T)">${ICONS.expand}<span>Theater</span></button>
                  <button type="button" class="lh-btn" data-save-id="${escapeHtml(videoId)}" data-save-title="${escapeHtml(decodedTitle)}" data-save-href="${escapeHtml(`/v/${videoId}-${videoSlug}`)}" data-save-thumb="${escapeHtml(thumbUrl)}" data-save-duration="${escapeHtml(durationBadge)}" aria-pressed="false">${ICONS.bookmark}<span>Save</span></button>
                  <button type="button" class="lh-btn" id="lhShareCopyBtn" data-copy-url="${escapeHtml(canonicalUrl)}">${ICONS.share}<span>Share</span></button>
                </div>
              </div>

              <p style="color:var(--text-secondary);font-size:0.93rem;line-height:1.6;">${escapeHtml(metaDesc)}</p>
              ${tagsHtml}
            </div>

            <!-- Adsterra Player Bottom Banner (Preserved 100%) -->
            <div class="lh-ad-slot-player-bar ad-space" id="playerAdBottom"></div>

            ${enrichedSectionHtml}
          </div>

          <aside class="lh-watch-sidebar" aria-label="Up Next and Sponsored">
            <!-- Adsterra Sticky 300x250 Sidebar Slot (Preserved 100%) -->
            <div class="lh-ad-slot-player-side ad-space" id="playerAdSide"></div>

            ${sidebarUpNextHtml ? `<div class="lh-section-card" style="margin-top:0;padding:16px;">
              <h2 style="font-size:0.98rem;margin-bottom:12px;">Up Next in ${escapeHtml(catName)}</h2>
              <div style="display:flex;flex-direction:column;gap:12px;">
                ${sidebarUpNextHtml}
              </div>
            </div>` : ''}

            <div class="lh-ad-slot-player-side ad-space" id="adBannerContent"></div>
          </aside>
        </div>

        ${relatedGridHtml ? `<section style="margin-top:34px;" aria-label="Similar HD Videos">
          <div class="lh-hero-bar" style="margin-bottom:14px;">
            <h2 style="font-family:var(--font-display);font-size:1.3rem;font-weight:800;letter-spacing:-0.02em;">Related <span style="color:var(--accent);">${escapeHtml(catName)}</span> HD Videos</h2>
            <a href="/c/${escapeHtml(catSlug)}" class="lh-btn">Browse All &rarr;</a>
          </div>
          <div class="lh-grid">
            ${relatedGridHtml}
          </div>
        </section>` : ''}`;

  const html = renderPageShell({
    lang: 'en',
    title: pageTitle,
    description: metaDesc,
    canonicalUrl,
    ogType: 'video.other',
    ogImage: thumbUrl,
    ogExtraMeta: ogVideoMeta,
    robots: robotsValue,
    hreflangPath: null,
    schemas: [graphSchema],
    activeNav: catSlug === 'japanese' ? 'jav' : 'home',
    showHeaderAd: true,
    showBottomAd: false,
    bodyHtml,
  });

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!isIndexable) {
    res.setHeader('X-Robots-Tag', 'noindex, follow');
  }
  res.setHeader('Rating', 'RTA-5042-1996-1400-1577-RTA');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  return res.end(html);
}
