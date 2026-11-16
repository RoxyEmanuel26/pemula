import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BASE_URL,
  CURATED_CATEGORIES,
  normalizeUrl,
  escapeHtml,
  decodeMojibake,
  slugify,
  cleanSourceTitle,
  createVideoObjectSchema,
  createBreadcrumbSchema,
} from './schema-helper.js';

let cachedTemplate = null;
let cached404 = null;
let cachedEnriched = null;
const CURATED_SET = new Set(CURATED_CATEGORIES);
const VIDEO_CACHE = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour server-side in-memory cache

async function getEnrichedDatabase() {
  if (!cachedEnriched) {
    try {
      const raw = await readFile(path.join(process.cwd(), 'data', 'enriched-videos.json'), 'utf8');
      cachedEnriched = JSON.parse(raw);
    } catch {
      cachedEnriched = { videos: {} };
    }
  }
  return cachedEnriched;
}

/**
 * Builds a concise word-boundary-safe SEO title (target 45-60 chars).
 */
function buildVideoTitle(title, tag) {
  const brand = ' | LustHub'; // Compact brand suffix preserves room for keywords
  const maxTitlePart = 60 - brand.length;
  const cleaned = cleanSourceTitle(title) || String(title || '').trim();

  if (cleaned.length > maxTitlePart) {
    let truncated = cleaned.slice(0, maxTitlePart).trim();
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 20) truncated = truncated.slice(0, lastSpace);
    return `${truncated}${brand}`;
  }

  const tagName = tag ? (tag.charAt(0).toUpperCase() + tag.slice(1)) : 'HD';
  const candidates = [
    `${cleaned} - ${tagName} Full HD${brand}`,
    `Watch ${cleaned} in HD${brand}`,
    `${cleaned} Full HD${brand}`,
    `${cleaned}${brand}`,
  ];
  for (const candidate of candidates) {
    if (candidate.length >= 42 && candidate.length <= 60) return candidate;
  }
  return `${cleaned}${brand}`.slice(0, 60);
}

/**
 * Formats view counts cleanly for international US/EU readers.
 */
function formatViews(val) {
  const num = parseInt(String(val || '0').replace(/\D/g, ''), 10) || 0;
  return num.toLocaleString('en-US');
}

export default async function handler(req, res) {
  const { slug } = req.query;
  const rawSlug = String(slug || '').trim();

  if (!rawSlug) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
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
      } else if (apiRes.status === 404) {
        videoNotFound = true;
      }
    } catch {
      // Upstream timeout or transient error: fall back to local enriched/slug metadata
    }
  }

  if (videoNotFound || (!videoData && (!videoId || videoId.length < 5))) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
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

  // Load Enriched Content from background Gemini pipeline
  const enrichedDb = await getEnrichedDatabase();
  const rawEnriched = enrichedDb.videos?.[videoId];
  const enrichedData = (rawEnriched?.status === 'enriched' && rawEnriched?.model !== 'mock-enricher')
    ? rawEnriched
    : null;

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
  if (enrichedData?.seo_title && enrichedData.seo_title.length >= 20 && enrichedData.seo_title.length <= 65) {
    pageTitle = enrichedData.seo_title;
  }

  const videoSlug = slugify(videoData?.title || enrichedData?.title || rawSlug.split('-').slice(1).join('-'), 80, videoId);
  const canonicalUrl = normalizeUrl(`${domain}/v/${videoId}-${videoSlug}`);

  const catSlug = CURATED_SET.has(slugify(primaryTag, 40, ''))
    ? slugify(primaryTag, 40, 'viral')
    : 'viral';
  const catName = catSlug.split('-').map(w => (w === '4k' || w === 'uhd' || w === 'hd' || w === 'pov' || w === 'milf') ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  let metaDesc = `Watch ${decodedTitle} free in full HD on lusthub.my.id. Instant mobile-ready streaming with fast cloud loading and zero account signup.`;
  if (metaDesc.length > 155) {
    metaDesc = metaDesc.slice(0, 152).replace(/\s+\S*$/, '').trim() + '...';
  }
  if (enrichedData?.meta_description && enrichedData.meta_description.length >= 110 && enrichedData.meta_description.length <= 165) {
    metaDesc = enrichedData.meta_description;
  }

  // Quality Gate: Only genuine AI-enriched videos are indexable (excludes mock-enricher & thin pages)
  const robotsMeta = enrichedData
    ? '<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">'
    : '<meta name="robots" content="noindex, follow">';

  const thumbUrl = normalizeUrl(
    videoData?.default_thumb?.src ||
    (videoData?.thumbs && videoData.thumbs[0]?.src) ||
    enrichedData?.thumbnail ||
    `${domain}/assets/icons/og-image.png`
  );

  const embedUrl = normalizeUrl(videoData?.embed || `https://www.eporner.com/embed/${videoId}/`);

  const videoObject = createVideoObjectSchema(videoData || {}, {
    canonicalUrl,
    title: decodedTitle,
    description: metaDesc,
    thumbnailUrl: thumbUrl,
    embedUrl,
    keywords: enrichedData?.tags || rawKeywords.slice(0, 6),
    durationSec: videoData?.length_sec,
    uploadDate: videoData?.added,
    views: videoData?.views,
  });

  const breadcrumbList = createBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: `${catName} Videos`, url: `/c/${catSlug}` },
    { name: decodedTitle, url: canonicalUrl },
  ]);

  const graphItems = [videoObject, breadcrumbList];
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

  // Build SSR clickable topic tag pills (curated hubs pass clean authority; non-curated search fallback uses rel="nofollow")
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
          : `<a href="/?q=${encodeURIComponent(t.label)}" rel="nofollow" class="video-tag">${escapeHtml(t.label)}</a>`
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

    enrichedHtml = `
      <div class="video-enriched-block" style="margin-top: 25px; background: #141414; padding: 22px; border-radius: 12px; border: 1px solid #222;">
        <h2 style="font-size: 1.15rem; color: #fff; margin-bottom: 10px; font-weight: 700; border-left: 3px solid #e8a800; padding-left: 10px;">Video Overview</h2>
        <p style="color: #ccc; font-size: 0.95rem; line-height: 1.6; margin-bottom: 18px;">${escapeHtml(enrichedData.summary || '')}</p>
        
        <h3 style="font-size: 1.1rem; color: #fff; margin-bottom: 10px; font-weight: 700; border-left: 3px solid #e8a800; padding-left: 10px;">Key Highlights</h3>
        <ul class="enriched-highlights" style="list-style: none; padding: 0; margin: 0 0 20px; display: grid; gap: 8px;">
          ${highlightsLi}
        </ul>

        <h3 style="font-size: 1.1rem; color: #fff; margin-bottom: 10px; font-weight: 700; border-left: 3px solid #e8a800; padding-left: 10px;">Frequently Asked Questions</h3>
        <div class="enriched-faq">
          ${faqItems}
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
    <div class="video-initial-seo" style="margin-bottom: 20px;">
        <nav class="video-breadcrumbs" aria-label="Breadcrumb" style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 0.9rem; margin-bottom: 16px; color: #888;">
            <a href="/" style="color: #e8a800; text-decoration: none;">🏠 Home</a>
            <span style="color: #555;">›</span>
            <a href="/c/${escapeHtml(catSlug)}" style="color: #e8a800; text-decoration: none;">${escapeHtml(catName)}</a>
            <span style="color: #555;">›</span>
            <span style="color: #bbb;">${escapeHtml(decodedTitle)}</span>
        </nav>
        <div class="video-wrapper" style="position: relative; margin-bottom: 25px;">
            <div class="video-facade" role="button" aria-label="Play ${escapeHtml(decodedTitle)}">
                <img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(decodedTitle)}" class="video-facade-img" fetchpriority="high" width="1280" height="720">
                <button class="video-facade-play" aria-label="Play Video">▶</button>
                ${videoData?.length_min ? `<span class="video-facade-duration">⏱ ${escapeHtml(videoData.length_min)}</span>` : ''}
            </div>
        </div>
        <h1 class="video-title" style="font-size: 1.6rem; color: #fff; margin-bottom: 10px; font-weight: 700;">${escapeHtml(decodedTitle)}</h1>
        ${metaStatsHtml}
        <p style="color: #aaa; font-size: 0.95rem; line-height: 1.5; margin-bottom: 10px;">${escapeHtml(metaDesc)}</p>
        ${tagPillsHtml}
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
  html = html.replace(/(<main[^>]*id=["']videoContainer["'][^>]*>)/i, `$1\n${visibleSeoMarkup}`);

  // Inject SSR Similar Videos Mesh (genuine AI-enriched videos only)
  let similarCardsHtml = '';
  if (enrichedDb?.videos) {
    const allEnriched = Object.values(enrichedDb.videos).filter(
      v => v.video_id !== videoId && v.status === 'enriched' && v.model !== 'mock-enricher' && v.title && v.slug
    );

    const currentTags = allCandidateTags.map(t => String(t || '').trim().toLowerCase()).filter(Boolean);
    const scored = allEnriched.map(v => {
      let score = 0;
      if (Array.isArray(v.tags)) {
        for (const t of v.tags) {
          if (currentTags.includes(String(t).toLowerCase())) score++;
        }
      }
      return { video: v, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const relatedList = scored.slice(0, 8).map(s => s.video);

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
  res.setHeader('Rating', 'RTA-5042-1996-1400-1577-RTA');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  return res.end(html);
}
