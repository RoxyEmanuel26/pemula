import { readFile } from 'node:fs/promises';
import path from 'node:path';

let cachedTemplate = null;
let cached404 = null;

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function decodeMojibake(text) {
  const str = String(text || '').trim();
  if (!/[ÃÂâ]/.test(str)) return str;
  try {
    const bytes = Buffer.from(str, 'latin1');
    const decoded = bytes.toString('utf8');
    return decoded.includes('\uFFFD') ? str : decoded;
  } catch {
    return str;
  }
}

function slugify(text) {
  return decodeMojibake(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

function buildVideoTitle(title, tag) {
  const brand = ' | lusthub.my.id'; // 16 chars
  const maxTitlePart = 60 - brand.length; // 44 chars
  let t = title.trim();

  // If title alone is already too long (> 44 chars)
  if (t.length > maxTitlePart) {
    let truncated = t.slice(0, maxTitlePart - 3).trim();
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 25) truncated = truncated.slice(0, lastSpace);
    return `${truncated}...${brand}`;
  }

  const tagName = tag ? (tag.charAt(0).toUpperCase() + tag.slice(1)) : 'Viral';
  
  // Try pattern A: "Watch {title} - {tag} HD Video | lusthub.my.id" (target 50-60 chars)
  let candidate = `Watch ${t} - ${tagName} HD Video${brand}`;
  if (candidate.length >= 50 && candidate.length <= 60) return candidate;

  // Try pattern B: "{title} - {tag} Viral Video HD | lusthub.my.id"
  candidate = `${t} - ${tagName} Viral Video HD${brand}`;
  if (candidate.length >= 50 && candidate.length <= 60) return candidate;

  // Try pattern C: "{title} - {tag} HD Video Streaming | lusthub.my.id"
  candidate = `${t} - ${tagName} HD Video Streaming${brand}`;
  if (candidate.length >= 50 && candidate.length <= 60) return candidate;

  // Try pattern D: "{title} - {tag} HD Video${brand}"
  candidate = `${t} - ${tagName} HD Video${brand}`;
  if (candidate.length >= 50 && candidate.length <= 60) return candidate;

  // Try pattern E: "Watch {title} in Full HD Free Online | lusthub.my.id"
  candidate = `Watch ${t} in Full HD Free Online${brand}`;
  if (candidate.length >= 50 && candidate.length <= 60) return candidate;

  // Try pattern F: "{title} - {tag} HD${brand}"
  candidate = `${t} - ${tagName} HD${brand}`;
  if (candidate.length >= 45 && candidate.length <= 60) return candidate;

  // Fallback:
  candidate = `${t}${brand}`;
  if (candidate.length > 60) {
    return `${t.slice(0, maxTitlePart - 3)}...${brand}`;
  }
  return candidate;
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

  // Extract video ID (e.g. from "hYtUKcGMlRS-ahyon-3" -> "hYtUKcGMlRS")
  const videoId = rawSlug.split('-')[0];
  const domain = 'https://www.lusthub.my.id';

  // Read base template once (cached in memory)
  if (!cachedTemplate) {
    cachedTemplate = await readFile(path.join(process.cwd(), 'video.html'), 'utf8');
  }

  let videoData = null;
  let videoNotFound = false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const apiUrl = `https://www.eporner.com/api/v2/video/id/?id=${encodeURIComponent(videoId)}&thumbsize=big&format=json`;
    const apiRes = await fetch(apiUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'lusthub-bot/1.0 (+https://www.lusthub.my.id/robots.txt)' }
    });
    clearTimeout(timeout);

    if (apiRes.ok) {
      const json = await apiRes.json();
      if (json && !json.error && !Array.isArray(json) && json.id) {
        videoData = json;
      } else if (Array.isArray(json) && json.length === 0) {
        videoNotFound = true;
      } else if (json && json.error) {
        videoNotFound = true;
      }
    } else if (apiRes.status === 404) {
      videoNotFound = true;
    }
  } catch (err) {
    // API timeout or network error - will fall back to slug-derived metadata if video was not confirmed non-existent
  }

  // If video explicitly does not exist or was removed
  if (videoNotFound || (!videoData && (!videoId || videoId.length < 5))) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    if (!cached404) {
      cached404 = await readFile(path.join(process.cwd(), '404.html'), 'utf8');
    }
    return res.end(cached404);
  }

  // Primary category / tag from API keywords
  let primaryTag = '';
  if (videoData?.keywords) {
    const kList = typeof videoData.keywords === 'string'
      ? videoData.keywords.split(',').map(s => s.trim()).filter(Boolean)
      : (Array.isArray(videoData.keywords) ? videoData.keywords : []);
    if (kList.length > 0) primaryTag = kList[0];
  }

  // Derive title strictly 50-60 chars
  const rawTitle = videoData?.title || rawSlug.split('-').slice(1).join(' ') || `Video ${videoId}`;
  const decodedTitle = decodeMojibake(rawTitle) || 'Premium Adult Video';
  const pageTitle = buildVideoTitle(decodedTitle, primaryTag);

  const videoSlug = videoData?.title ? slugify(videoData.title) : rawSlug.split('-').slice(1).join('-') || videoId;
  const canonicalUrl = `${domain}/v/${videoId}-${videoSlug}`;

  // Description strictly 120-155 characters
  const catSlug = primaryTag ? slugify(primaryTag) : 'viral';
  const catName = primaryTag ? (primaryTag.charAt(0).toUpperCase() + primaryTag.slice(1)) : 'Viral';
  let metaDesc = `Watch ${decodedTitle} in full HD on lusthub.my.id. Stream trending adult videos and viral leaks with fast loading and zero signups required.`;
  if (metaDesc.length > 155) {
    metaDesc = `Watch ${decodedTitle} on lusthub.my.id. Stream free viral adult videos in full HD with fast loading and no signup.`;
    if (metaDesc.length > 155) {
      metaDesc = metaDesc.slice(0, 152).trim() + '...';
    }
  } else if (metaDesc.length < 120) {
    metaDesc = `Watch ${decodedTitle} in high definition full HD on lusthub.my.id. Stream free trending adult videos and leaks with fast loading and zero signups required.`;
  }

  // Thumbnail
  const thumbUrl = videoData?.default_thumb?.src || 
    (videoData?.thumbs && videoData.thumbs[0]?.src) || 
    `${domain}/assets/icons/og-image.png`;

  // ISO Dates & Duration
  let uploadISO = '2026-01-01T00:00:00Z';
  if (videoData?.added) {
    const formatted = videoData.added.replace(' ', 'T');
    uploadISO = formatted.includes('Z') || formatted.includes('+') ? formatted : `${formatted}Z`;
  }
  const durationSec = Number(videoData?.length_sec || 0);
  const durationISO = `PT${durationSec}S`;
  const embedUrl = videoData?.embed || `https://www.eporner.com/embed/${videoId}/`;
  const viewCount = Number(videoData?.views || 0);

  // Structured Data Schema
  const graphSchema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'VideoObject',
        'name': decodedTitle,
        'description': metaDesc,
        'thumbnailUrl': [thumbUrl],
        'uploadDate': uploadISO,
        'duration': durationISO,
        'embedUrl': embedUrl,
        'interactionStatistic': {
          '@type': 'InteractionCounter',
          'interactionType': { '@type': 'WatchAction' },
          'userInteractionCount': viewCount
        },
        'publisher': {
          '@type': 'Organization',
          'name': 'lusthub.my.id',
          'logo': {
            '@type': 'ImageObject',
            'url': `${domain}/assets/icons/android-chrome-512x512.png`
          }
        }
      },
      {
        '@type': 'BreadcrumbList',
        'itemListElement': [
          {
            '@type': 'ListItem',
            'position': 1,
            'name': 'Home',
            'item': `${domain}/`
          },
          {
            '@type': 'ListItem',
            'position': 2,
            'name': `${catName} Videos`,
            'item': `${domain}/c/${catSlug}`
          },
          {
            '@type': 'ListItem',
            'position': 3,
            'name': decodedTitle,
            'item': canonicalUrl
          }
        ]
      }
    ]
  };

  const schemaScript = `<script id="jsonLdScript" type="application/ld+json">${JSON.stringify(graphSchema).replace(/</g, '\\u003c')}</script>`;

  // Visible initial Breadcrumbs, H1 heading, and summary for crawlers
  const visibleSeoMarkup = `
    <div class="video-initial-seo" style="margin-bottom: 20px;">
        <nav class="video-breadcrumbs" aria-label="Breadcrumb" style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 0.9rem; margin-bottom: 16px; color: #888;">
            <a href="/" style="color: #e8a800; text-decoration: none;">🏠 Home</a>
            <span style="color: #555;">›</span>
            <a href="/c/${catSlug}" style="color: #e8a800; text-decoration: none;">${escapeHtml(catName)}</a>
            <span style="color: #555;">›</span>
            <span style="color: #bbb;">${escapeHtml(decodedTitle)}</span>
        </nav>
        <h1 class="video-title" style="font-size: 1.6rem; color: #fff; margin-bottom: 10px; font-weight: 700;">${escapeHtml(decodedTitle)}</h1>
        <p style="color: #aaa; font-size: 0.95rem; line-height: 1.5; margin-bottom: 15px;">${escapeHtml(metaDesc)}</p>
    </div>
  `;

  let html = cachedTemplate;

  // Replace Title & Meta Description
  html = html.replace(/<title>.*?<\/title>/i, `<title>${escapeHtml(pageTitle)}</title>`);
  html = html.replace(/<meta\s+name=["']description["']\s+content=["'].*?["']>/i, `<meta name="description" content="${escapeHtml(metaDesc)}">`);
  
  // Replace Canonical Link
  html = html.replace(/<link\s+rel=["']canonical["']\s+href=["'].*?["']>/i, `<link rel="canonical" href="${canonicalUrl}">`);

  // Replace Open Graph Tags
  html = html.replace(/<meta\s+id=["']ogTitle["'][^>]*>/i, `<meta id="ogTitle" property="og:title" content="${escapeHtml(pageTitle)}">`);
  html = html.replace(/<meta\s+id=["']ogDesc["'][^>]*>/i, `<meta id="ogDesc" property="og:description" content="${escapeHtml(metaDesc)}">`);
  html = html.replace(/<meta\s+id=["']ogImage["'][^>]*>/i, `<meta id="ogImage" property="og:image" content="${thumbUrl}">`);
  
  const ogVideoExtra = embedUrl ? `\n    <meta property="og:video" content="${escapeHtml(embedUrl)}">\n    <meta property="og:video:url" content="${escapeHtml(embedUrl)}">\n    <meta property="og:video:secure_url" content="${escapeHtml(embedUrl)}">\n    <meta property="og:video:type" content="text/html">\n    <meta property="og:video:width" content="1280">\n    <meta property="og:video:height" content="720">` : '';
  html = html.replace(/<meta\s+id=["']ogUrl["'][^>]*>/i, `<meta id="ogUrl" property="og:url" content="${canonicalUrl}">${ogVideoExtra}`);

  // Replace Twitter Card Tags
  html = html.replace(/<meta\s+id=["']twitterTitle["'][^>]*>/i, `<meta id="twitterTitle" name="twitter:title" content="${escapeHtml(pageTitle)}">`);
  html = html.replace(/<meta\s+id=["']twitterDesc["'][^>]*>/i, `<meta id="twitterDesc" name="twitter:description" content="${escapeHtml(metaDesc)}">`);
  html = html.replace(/<meta\s+id=["']twitterImage["'][^>]*>/i, `<meta id="twitterImage" name="twitter:image" content="${thumbUrl}">`);

  // Inject Structured Data Schema Script
  html = html.replace(/<script\s+id=["']jsonLdScript["'][^>]*>[\s\S]*?<\/script>/i, schemaScript);

  // Inject visible H1 right before loader inside main container
  html = html.replace(
    /(<main[^>]*id=["']videoContainer["'][^>]*>)/i,
    `$1\n${visibleSeoMarkup}`
  );

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=2592000, stale-while-revalidate=86400');
  return res.end(html);
}
