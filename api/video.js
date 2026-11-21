import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BASE_URL,
  CURATED_CATEGORIES,
  US_EU_CATEGORIES,
  normalizeUrl,
  escapeHtml,
  decodeMojibake,
  slugify,
  cleanSourceTitle,
  isSpamVideoTitle,
  formatCategoryName,
  expandRuntimeVideo,
  createOrganizationSchema,
  createVideoObjectSchema,
  createBreadcrumbSchema,
} from './schema-helper.js';

let cachedTemplate = null;
let cached404 = null;
let cachedEnriched = null;
let cachedCategoryDescs = null;
let cachedOrderedIndex = null;
const CURATED_SET = new Set(CURATED_CATEGORIES);
const VIDEO_CACHE = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour server-side in-memory cache

async function getEnrichedDatabase() {
  if (!cachedEnriched) {
    try {
      const raw = await readFile(path.join(process.cwd(), 'data', 'enriched-runtime.json'), 'utf8');
      cachedEnriched = JSON.parse(raw);
    } catch {
      try {
        const raw = await readFile(path.join(process.cwd(), 'data', 'enriched-videos.json'), 'utf8');
        cachedEnriched = JSON.parse(raw);
      } catch {
        cachedEnriched = { videos: {}, byTag: {}, featured: [], orderedIds: [] };
      }
    }
    if (Array.isArray(cachedEnriched.orderedIds)) {
      cachedOrderedIndex = new Map(cachedEnriched.orderedIds.map((id, i) => [id, i]));
    }
  }
  return cachedEnriched;
}

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

/**
 * Builds a concise word-boundary-safe SEO title (target 45-60 chars).
 */
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
  for (const candidate of candidates) {
    if (candidate.length >= 34 && candidate.length <= 62) return candidate;
  }
  return `${cleaned} - ${tagName} HD${brand}`.slice(0, 62);
}

/**
 * Formats view counts cleanly for international US/EU readers.
 */
function formatViews(val) {
  const num = parseInt(String(val || '0').replace(/\D/g, ''), 10) || 0;
  return num.toLocaleString('en-US');
}

/**
 * Formats duration seconds into human-readable runtime (e.g. "4h 32m 50s" or "14m 46s").
 */
function formatHumanDuration(sec) {
  const total = Math.floor(Number(sec) || 0);
  if (!Number.isFinite(total) || total <= 0) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

/**
 * Strongly-connected ring mesh + O(1) topical tag-bucket lookup for 12 related AI-enriched videos:
 * - 4 deterministic global ring neighbors (guarantees 100% reachability & 0% orphaned enriched videos!)
 * - 4 cyclic same-category ring siblings (distributes topical authority across the entire category!)
 * - 4 top multi-tag similarity picks (maximizes relevance & user CTR)
 */
export function getRelatedVideos(enrichedDb, currentVideoId, candidateTags, primaryCatSlug) {
  const videosMap = enrichedDb?.videos || {};
  const byTag = enrichedDb?.byTag || {};
  const featured = Array.isArray(enrichedDb?.featured) ? enrichedDb.featured : [];
  const orderedIds = Array.isArray(enrichedDb?.orderedIds) ? enrichedDb.orderedIds : [];

  const pickedIds = [];
  const pickedSet = new Set([currentVideoId]);
  const addId = (id) => {
    if (!id || pickedSet.has(id) || !videosMap[id]) return false;
    pickedSet.add(id);
    pickedIds.push(id);
    return true;
  };

  // 1. Strongly-connected global ring neighbors (step +1, +2, +3, -1 => in-degree >= 4 for EVERY node!)
  if (orderedIds.length > 4) {
    const pos = cachedOrderedIndex?.has(currentVideoId)
      ? cachedOrderedIndex.get(currentVideoId)
      : orderedIds.indexOf(currentVideoId);
    if (pos !== -1) {
      const n = orderedIds.length;
      for (const offset of [1, 2, 3, n - 1]) {
        addId(orderedIds[(pos + offset) % n]);
      }
    }
  }

  // 2. Cyclic topical siblings inside primary curated category bucket (up to 4)
  const primaryBucket = Array.isArray(byTag[primaryCatSlug]) ? byTag[primaryCatSlug] : [];
  if (primaryBucket.length > 1) {
    const tPos = primaryBucket.indexOf(currentVideoId);
    const startIdx = tPos >= 0 ? tPos + 1 : 0;
    let addedTopical = 0;
    for (let step = 0; step < primaryBucket.length && addedTopical < 4 && pickedIds.length < 12; step++) {
      if (addId(primaryBucket[(startIdx + step) % primaryBucket.length])) {
        addedTopical++;
      }
    }
  }

  // 3. Top multi-tag overlap candidates from O(1) buckets
  if (pickedIds.length < 12 && byTag && typeof byTag === 'object') {
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

  // 4. Pad from featured pool if fewer than 12
  for (const fid of featured) {
    if (pickedIds.length >= 12) break;
    addId(fid);
  }

  return pickedIds
    .slice(0, 12)
    .map(vid => expandRuntimeVideo(videosMap[vid]))
    .filter(v => v && v.title && v.slug);
}

export default async function handler(req, res) {
  const { slug } = req.query;
  const rawSlug = String(slug || '').trim();

  if (!rawSlug) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, follow');
    if (!cached404) {
      cached404 = await readFile(path.join(process.cwd(), '404.html'), 'utf8');
    }
    return res.end(cached404);
  }

  const videoId = rawSlug.split('-')[0];
  const domain = BASE_URL;

  if (!cachedTemplate) {
    cachedTemplate = await readFile(path.join(process.cwd(), 'video.html'), 'utf8');
  }

  let videoData = null;
  let videoNotFound = false;

  const cachedEntry = VIDEO_CACHE.get(videoId);
  if (cachedEntry && (Date.now() - cachedEntry.ts < CACHE_TTL_MS)) {
    videoData = cachedEntry.data;
  } else {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const apiUrl = `https://www.eporner.com/api/v2/video/id/?id=${encodeURIComponent(videoId)}&thumbsize=big&format=json`;
      const apiRes = await fetch(apiUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'lusthub-bot/2.0 (+https://www.lusthub.my.id/robots.txt)' },
      });
      clearTimeout(timeout);

      if (apiRes.ok) {
        const json = await apiRes.json();
        if (json && !json.error && !Array.isArray(json) && json.id) {
          videoData = json;
          VIDEO_CACHE.set(videoId, { data: json, ts: Date.now() });
        } else if ((Array.isArray(json) && json.length === 0) || (json && json.error)) {
          videoNotFound = true;
        }
      } else if (apiRes.status === 404 || apiRes.status === 410) {
        videoNotFound = true;
      }
    } catch {
      // Upstream timeout or transient error: fall back to local enriched/slug metadata
    }
  }

  // Return HTTP 410 Gone for confirmed upstream deletions so Google drops dead URLs rapidly instead of keeping them in GSC
  if (videoNotFound || (!videoData && (!videoId || videoId.length < 5))) {
    res.statusCode = videoNotFound ? 410 : 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, follow');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    if (!cached404) {
      cached404 = await readFile(path.join(process.cwd(), '404.html'), 'utf8');
    }
    return res.end(cached404);
  }

  // Extract raw keywords list
  const rawKeywords = videoData?.keywords
    ? (typeof videoData.keywords === 'string'
      ? videoData.keywords.split(',').map(s => decodeMojibake(s).trim()).filter(Boolean)
      : (Array.isArray(videoData.keywords) ? videoData.keywords.map(k => decodeMojibake(k).trim()).filter(Boolean) : []))
    : [];

  // Load Enriched Content & Category Descriptions in parallel
  const [enrichedDb, categoryDescs] = await Promise.all([
    getEnrichedDatabase(),
    getCategoryDescriptions(),
  ]);
  const enrichedData = expandRuntimeVideo(enrichedDb.videos?.[videoId]);

  // Match best primary curated category (for breadcrumbs & clean category linking)
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

  const videoSlug = slugify(videoData?.title || enrichedData?.title || rawSlug.split('-').slice(1).join('-'), 80, videoId);
  const canonicalUrl = normalizeUrl(`${domain}/v/${videoId}-${videoSlug}`);

  const catSlug = CURATED_SET.has(slugify(primaryTag, 40, ''))
    ? slugify(primaryTag, 40, 'viral')
    : 'viral';
  const catName = formatCategoryName(catSlug);

  let metaDesc = `Watch ${decodedTitle} free in full HD on lusthub.my.id. Instant mobile-ready streaming with fast cloud loading and zero account signup.`;
  if (metaDesc.length > 155) {
    metaDesc = metaDesc.slice(0, 152).replace(/\s+\S*$/, '').trim() + '...';
  }
  if (enrichedData?.meta_description && enrichedData.meta_description.length >= 110 && enrichedData.meta_description.length <= 165) {
    metaDesc = enrichedData.meta_description;
  }

  // Quality Gate: Only genuine non-spam AI-enriched videos without tracking/search params are indexable
  const hasNoindexParam = Boolean(req.query?.ref || req.query?.q || req.query?.order);
  const isSpam = isSpamVideoTitle(rawTitle);
  const isIndexable = Boolean(enrichedData) && !isSpam && !hasNoindexParam;
  const robotsValue = isIndexable
    ? 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1'
    : 'noindex, follow';
  const robotsMeta = `<meta name="robots" content="${robotsValue}">`;

  const thumbUrl = normalizeUrl(
    videoData?.default_thumb?.src ||
    (videoData?.thumbs && videoData.thumbs[0]?.src) ||
    enrichedData?.thumbnail ||
    `${domain}/assets/icons/og-image.png`
  );

  const embedUrl = normalizeUrl(videoData?.embed || `https://www.eporner.com/embed/${videoId}/`);
  const durationSec = Number(videoData?.length_sec || enrichedData?.duration || 0);
  const viewCountRaw = videoData?.views ?? enrichedData?.views ?? 0;
  const uploadDateRaw = videoData?.added || enrichedData?.generated_at || '';

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
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': f.answer,
        },
      })),
    });
  }

  const graphSchema = {
    '@context': 'https://schema.org',
    '@graph': graphItems,
  };
  const schemaScript = `<script id="jsonLdScript" type="application/ld+json">${JSON.stringify(graphSchema).replace(/</g, '\\u003c')}</script>`;

  // Build SSR clickable topic tag pills (curated hubs pass clean authority; non-curated search uses button)
  const uniqueTags = [];
  const seenTagSlugs = new Set();
  for (const tag of allCandidateTags) {
    const cleanT = String(tag || '').trim();
    if (!cleanT || cleanT.length > 35 || cleanT.toLowerCase() === decodedTitle.toLowerCase()) continue;
    const tSlug = slugify(cleanT, 40, '');
    if (!tSlug || seenTagSlugs.has(tSlug)) continue;
    seenTagSlugs.add(tSlug);
    uniqueTags.push({ label: cleanT, slug: tSlug, isCurated: CURATED_SET.has(tSlug) });
    if (uniqueTags.length >= 6) break;
  }

  const tagPillsHtml = uniqueTags.length > 0
    ? `<div class="video-tags" style="display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0;">
        ${uniqueTags.map(t => t.isCurated
          ? `<a href="/c/${escapeHtml(t.slug)}" class="video-tag">${escapeHtml(t.label)}</a>`
          : `<button type="button" class="video-tag video-tag-search" data-search="${escapeHtml(t.label)}" style="cursor:pointer;">${escapeHtml(t.label)}</button>`
        ).join('\n        ')}
      </div>`
    : '';

  let enrichedHtml = '';
  if (enrichedData) {
    const highlightsLi = (enrichedData.highlights || [])
      .map(h => `<li style="position: relative; padding-left: 20px; color: #bbb; font-size: 0.9rem;"><span style="position: absolute; left: 0; color: #e8a800; font-weight: 700;">✓</span> ${escapeHtml(h)}</li>`)
      .join('\n          ');

    const faqItems = (enrichedData.faq || [])
      .map(f => `
        <div class="faq-item" style="background: #1c1c1c; padding: 14px 18px; border-radius: 8px; border: 1px solid #292929; margin-bottom: 10px;">
          <strong style="display: block; color: #e8a800; font-size: 0.95rem; margin-bottom: 6px;">${escapeHtml(f.question)}</strong>
          <p style="margin: 0; color: #aaa; font-size: 0.9rem; line-height: 1.5;">${escapeHtml(f.answer)}</p>
        </div>
      `).join('');

    const humanDur = formatHumanDuration(durationSec);
    const formattedViews = formatViews(viewCountRaw);
    const publishedDay = uploadDateRaw ? String(uploadDateRaw).slice(0, 10) : '';
    const catEditorialPara = categoryDescs?.[catSlug]?.paragraphs?.[0] || '';
    const siblingHubsHtml = US_EU_CATEGORIES
      .filter(s => s !== catSlug)
      .slice(0, 6)
      .map(s => `<a href="/c/${escapeHtml(s)}" style="color:#e8a800;text-decoration:none;font-size:0.84rem;background:rgba(232,168,0,0.1);padding:3px 9px;border-radius:999px;border:1px solid rgba(232,168,0,0.22);">${escapeHtml(formatCategoryName(s))}</a>`)
      .join('\n            ');

    const specItems = [
      `<div><span style="color:#888;">Category:</span> <a href="/c/${escapeHtml(catSlug)}" style="color:#e8a800;text-decoration:none;font-weight:600;">${escapeHtml(catName)}</a></div>`,
      humanDur ? `<div><span style="color:#888;">Runtime:</span> <strong style="color:#ddd;">${escapeHtml(humanDur)}</strong></div>` : '',
      Number(viewCountRaw) > 0 ? `<div><span style="color:#888;">Views:</span> <strong style="color:#ddd;">${escapeHtml(formattedViews)}</strong></div>` : '',
      videoData?.rate ? `<div><span style="color:#888;">Rating:</span> <strong style="color:#ddd;">${escapeHtml(String(videoData.rate))}</strong></div>` : '',
      publishedDay ? `<div><span style="color:#888;">Published:</span> <strong style="color:#ddd;">${escapeHtml(publishedDay)}</strong></div>` : '',
      `<div><span style="color:#888;">Playback:</span> <strong style="color:#ddd;">1080p HD HTML5 &bull; 18+ RTA</strong></div>`,
    ].filter(Boolean).join('\n          ');

    const summaryParagraphs = String(enrichedData.summary || '')
      .split(/\n+/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => `<p style="color: #ccc; font-size: 0.95rem; line-height: 1.65; margin-bottom: 14px;">${escapeHtml(p)}</p>`)
      .join('\n        ');

    enrichedHtml = `
      <div class="video-enriched-block" style="margin-top: 25px; background: #141414; padding: 22px; border-radius: 12px; border: 1px solid #222;">
        <h2 style="font-size: 1.15rem; color: #fff; margin-bottom: 10px; font-weight: 700; border-left: 3px solid #e8a800; padding-left: 10px;">Video Overview</h2>
        ${summaryParagraphs}

        <h3 style="font-size: 1.05rem; color: #fff; margin: 16px 0 10px; font-weight: 700; border-left: 3px solid #e8a800; padding-left: 10px;">Scene Details &amp; Specifications</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;background:#1a1a1a;padding:14px 16px;border-radius:8px;border:1px solid #262626;margin-bottom:18px;font-size:0.88rem;">
          ${specItems}
        </div>
        
        <h3 style="font-size: 1.05rem; color: #fff; margin-bottom: 10px; font-weight: 700; border-left: 3px solid #e8a800; padding-left: 10px;">Key Highlights</h3>
        <ul class="enriched-highlights" style="list-style: none; padding: 0; margin: 0 0 20px; display: grid; gap: 8px;">
          ${highlightsLi}
        </ul>

        ${catEditorialPara ? `<div style="margin: 0 0 20px; padding: 14px 16px; background: #181818; border-radius: 8px; border: 1px solid #252525;">
          <h3 style="font-size: 0.98rem; color: #fff; margin: 0 0 8px; font-weight: 700;">About ${escapeHtml(catName)} HD Collection</h3>
          <p style="margin: 0; color: #aaa; font-size: 0.88rem; line-height: 1.6;">${escapeHtml(catEditorialPara)}</p>
        </div>` : ''}

        <h3 style="font-size: 1.05rem; color: #fff; margin-bottom: 10px; font-weight: 700; border-left: 3px solid #e8a800; padding-left: 10px;">Frequently Asked Questions</h3>
        <div class="enriched-faq">
          ${faqItems}
        </div>
        <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid #262626; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; font-size: 0.85rem; color: #999;">
          <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
            <span style="color:#888;">More Hubs:</span>
            ${siblingHubsHtml}
          </div>
          <a href="/c/${escapeHtml(catSlug)}" style="color: #e8a800; text-decoration: none; font-weight: 600;">Browse All ${escapeHtml(catName)} HD Videos &rarr;</a>
        </div>
      </div>
    `;
  }

  const metaStatsHtml = videoData
    ? `<div class="video-meta" style="margin: 10px 0;">
        <span>⏱ ${escapeHtml(videoData.length_min || '0:00')}</span>
        <span>👁 ${formatViews(videoData.views)} views</span>
        ${videoData.rate ? `<span>⭐ ${escapeHtml(String(videoData.rate))} rating</span>` : ''}
      </div>`
    : '';

  const visibleSeoMarkup = `
    <div class="video-initial-seo" data-ssr-page="1" style="margin-bottom: 20px;">
        <nav class="video-breadcrumbs" aria-label="Breadcrumb" style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 0.9rem; margin-bottom: 16px; color: #888;">
            <a href="/" style="color: #e8a800; text-decoration: none;">🏠 Home</a>
            <span style="color: #555;">›</span>
            <a href="/c/${escapeHtml(catSlug)}" style="color: #e8a800; text-decoration: none;">${escapeHtml(catName)}</a>
            <span style="color: #555;">›</span>
            <span style="color: #bbb;">${escapeHtml(decodedTitle)}</span>
        </nav>
        <div class="video-wrapper" itemscope itemtype="https://schema.org/VideoObject" style="position: relative; margin-bottom: 25px;">
            <meta itemprop="name" content="${escapeHtml(decodedTitle)}">
            <meta itemprop="description" content="${escapeHtml(metaDesc)}">
            <meta itemprop="uploadDate" content="${escapeHtml(videoObject.uploadDate)}">
            ${videoObject.duration ? `<meta itemprop="duration" content="${escapeHtml(videoObject.duration)}">` : ''}
            <link itemprop="thumbnailUrl" href="${escapeHtml(thumbUrl)}">
            ${embedUrl ? `<link itemprop="embedUrl" href="${escapeHtml(embedUrl)}">` : ''}
            <div class="video-facade" role="button" tabindex="0" data-ssr-video="1" data-video-id="${escapeHtml(videoId)}" data-embed="${escapeHtml(embedUrl)}" data-title="${escapeHtml(decodedTitle)}" data-canonical="${escapeHtml(canonicalUrl)}" aria-label="Play ${escapeHtml(decodedTitle)}">
                <img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(decodedTitle)}" class="video-facade-img" fetchpriority="high" width="1280" height="720">
                <button type="button" class="video-facade-play" aria-label="Play Video">▶</button>
                ${videoData?.length_min ? `<span class="video-facade-duration">⏱ ${escapeHtml(videoData.length_min)}</span>` : ''}
            </div>
            ${embedUrl ? `<noscript><iframe src="${escapeHtml(embedUrl)}" frameborder="0" allowfullscreen loading="lazy" title="${escapeHtml(decodedTitle)}" style="position:absolute;inset:0;width:100%;height:100%;"></iframe></noscript>` : ''}
        </div>
        <div class="video-details" style="margin-bottom: 20px;">
            <h1 class="video-title" style="font-size: 1.6rem; color: #fff; margin-bottom: 10px; font-weight: 700;">${escapeHtml(decodedTitle)}</h1>
            ${metaStatsHtml}
            <p style="color: #aaa; font-size: 0.95rem; line-height: 1.5; margin-bottom: 10px;">${escapeHtml(metaDesc)}</p>
            ${tagPillsHtml}
            <div id="ssrVideoActionsSlot"></div>
        </div>
        ${enrichedHtml}
    </div>
  `;

  let html = cachedTemplate;

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(pageTitle)}</title>`);
  html = html.replace(/<meta\s+name=["']description["']\s+content=["'][\s\S]*?["']\s*>/i, `<meta name="description" content="${escapeHtml(metaDesc)}">`);
  html = html.replace(/<meta\s+name=["']robots["']\s+content=["'][\s\S]*?["']\s*>/i, robotsMeta);
  html = html.replace(/<link\s+rel=["']canonical["']\s+href=["'][\s\S]*?["']\s*>/i, `<link rel="canonical" href="${canonicalUrl}">`);

  html = html.replace(/<meta\s+id=["']ogTitle["'][^>]*>/i, `<meta id="ogTitle" property="og:title" content="${escapeHtml(pageTitle)}">`);
  html = html.replace(/<meta\s+id=["']ogDesc["'][^>]*>/i, `<meta id="ogDesc" property="og:description" content="${escapeHtml(metaDesc)}">`);
  html = html.replace(/<meta\s+id=["']ogImage["'][^>]*>/i, `<meta id="ogImage" property="og:image" content="${escapeHtml(thumbUrl)}">`);

  const ogVideoExtra = embedUrl
    ? `\n    <meta property="og:video" content="${escapeHtml(embedUrl)}">\n    <meta property="og:video:url" content="${escapeHtml(embedUrl)}">\n    <meta property="og:video:secure_url" content="${escapeHtml(embedUrl)}">\n    <meta property="og:video:type" content="text/html">\n    <meta property="og:video:width" content="1280">\n    <meta property="og:video:height" content="720">`
    : '';
  html = html.replace(/<meta\s+id=["']ogUrl["'][^>]*>/i, `<meta id="ogUrl" property="og:url" content="${canonicalUrl}">${ogVideoExtra}`);

  html = html.replace(/<meta\s+id=["']twitterTitle["'][^>]*>/i, `<meta id="twitterTitle" name="twitter:title" content="${escapeHtml(pageTitle)}">`);
  html = html.replace(/<meta\s+id=["']twitterDesc["'][^>]*>/i, `<meta id="twitterDesc" name="twitter:description" content="${escapeHtml(metaDesc)}">`);
  html = html.replace(/<meta\s+id=["']twitterImage["'][^>]*>/i, `<meta id="twitterImage" name="twitter:image" content="${escapeHtml(thumbUrl)}">`);

  html = html.replace(/<script\s+id=["']jsonLdScript["'][^>]*>[\s\S]*?<\/script>/i, schemaScript);
  if (html.includes('<div class="loader" id="videoLoader"></div>')) {
    html = html.replace('<div class="loader" id="videoLoader"></div>', visibleSeoMarkup);
  } else {
    html = html.replace(/(<main[^>]*id=["']videoContainer["'][^>]*>)/i, `$1\n${visibleSeoMarkup}`);
  }

  // Inject SSR Similar Videos Mesh via strongly-connected ring + O(1) topical buckets (0% orphan rate!)
  const relatedList = getRelatedVideos(enrichedDb, videoId, allCandidateTags, catSlug);
  let similarCardsHtml = '';
  if (relatedList.length > 0) {
    similarCardsHtml = relatedList.map(v => {
      const title = escapeHtml(cleanSourceTitle(v.title) || decodeMojibake(v.title || 'Untitled'));
      const href = `/v/${v.video_id}-${v.slug}`;
      const thumb = v.thumbnail || '/assets/icons/favicon-32x32.png';
      return `
        <a href="${href}" class="card" style="text-decoration: none;" aria-label="${title}">
          <div class="card-img-wrapper">
            <img src="${escapeHtml(thumb)}" alt="${title}" class="card-img loaded" loading="lazy" width="320" height="180" style="aspect-ratio: 16/9; width: 100%; height: auto; object-fit: cover;">
          </div>
          <div class="card-meta">
            <div class="card-title">${title}</div>
          </div>
        </a>`;
    }).join('\n');
  }

  if (similarCardsHtml) {
    html = html.replace(
      'id="similarVideosSection" style="margin-top: 40px; display: none;"',
      'id="similarVideosSection" style="margin-top: 40px; display: block;"'
    );
    html = html.replace(
      /(<div[^>]*id=["']similarVideoGrid["'][^>]*>)/i,
      `$1\n${similarCardsHtml}`
    );
  }

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
