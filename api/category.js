import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createBreadcrumbSchema, createItemListSchema } from './schema-helper.js';

let cachedTemplate = null;
let cachedDescriptions = null;
const CATEGORY_CACHE = new Map();
const CAT_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes server-side in-memory cache

async function getCategoryDescriptions() {
  if (!cachedDescriptions) {
    try {
      const raw = await readFile(path.join(process.cwd(), 'data', 'category-descriptions.json'), 'utf8');
      cachedDescriptions = JSON.parse(raw);
    } catch {
      cachedDescriptions = {};
    }
  }
  return cachedDescriptions;
}

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

function formatCategoryName(slug) {
  if (!slug) return 'All';
  return slug
    .split('-')
    .map(word => {
      const lower = word.toLowerCase();
      if (lower === 'fps') return 'FPS';
      if (lower === 'hd') return 'HD';
      if (lower === 'jav') return 'JAV';
      if (lower === 'pov') return 'POV';
      if (lower === 'bbw') return 'BBW';
      if (lower === 'vr') return 'VR';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

export default async function handler(req, res) {
  const { slug } = req.query;
  const rawSlug = String(slug || '').trim().toLowerCase();
  const cleanSlug = rawSlug.replace(/[^a-z0-9\-]/g, '');

  const domain = 'https://www.lusthub.my.id';
  const categoryName = formatCategoryName(cleanSlug || 'viral');
  const pageTitle = `Watch ${categoryName} Viral Videos in Full HD | lusthub.my.id`;
  const metaDesc = `Browse the best free ${categoryName} adult videos and trending leaks in full HD on lusthub.my.id. Fast mobile streaming with zero signups.`;
  const canonicalUrl = `${domain}/c/${cleanSlug || 'viral'}`;

  if (!cachedTemplate) {
    cachedTemplate = await readFile(path.join(process.cwd(), 'category.html'), 'utf8');
  }

  // Fetch initial videos for ItemList schema and crawlable initial cards with in-memory caching
  let categoryVideos = [];
  const cacheKey = cleanSlug || 'viral';
  const cachedEntry = CATEGORY_CACHE.get(cacheKey);
  if (cachedEntry && (Date.now() - cachedEntry.ts < CAT_CACHE_TTL_MS)) {
    categoryVideos = cachedEntry.videos;
  } else {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const apiUrl = `https://www.eporner.com/api/v2/video/search/?query=${encodeURIComponent(cacheKey)}&per_page=12&format=json`;
      const apiRes = await fetch(apiUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'lusthub-bot/1.0 (+https://www.lusthub.my.id/robots.txt)' }
      });
      clearTimeout(timeout);
      if (apiRes.ok) {
        const json = await apiRes.json();
        if (json && Array.isArray(json.videos)) {
          categoryVideos = json.videos;
          CATEGORY_CACHE.set(cacheKey, { videos: json.videos, ts: Date.now() });
        }
      }
    } catch (err) {
      // API timeout or network error - continue with empty items
    }
  }

  const breadcrumbSchema = createBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: `${categoryName} Videos`, url: `/c/${cleanSlug || 'viral'}` }
  ]);

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': `${categoryName} Videos`,
    'description': metaDesc,
    'url': canonicalUrl
  };

  const schemaItems = categoryVideos.map(v => {
    const title = decodeMojibake(v.title || 'Untitled');
    const vSlug = slugify(title);
    return {
      title,
      url: `/v/${v.id}-${vSlug}`
    };
  });

  const itemListSchema = createItemListSchema(
    `${categoryName} Videos`,
    metaDesc,
    schemaItems
  );

  const schemaScript = `
    <script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
    <script type="application/ld+json">${JSON.stringify(collectionSchema)}</script>
    <script type="application/ld+json">${JSON.stringify(itemListSchema)}</script>
  `;

  let html = cachedTemplate;

  // Replace Title & Description
  html = html.replace(/<title\s+id=["']pageTitle["'][^>]*>.*?<\/title>/i, `<title id="pageTitle">${escapeHtml(pageTitle)}</title>`);
  html = html.replace(/<meta\s+id=["']pageDesc["']\s+name=["']description["']\s+content=["'].*?["']>/i, `<meta id="pageDesc" name="description" content="${escapeHtml(metaDesc)}">`);

  // Replace Canonical Link
  html = html.replace(/<link\s+id=["']canonicalTag["']\s+rel=["']canonical["']\s+href=["'].*?["']>/i, `<link id="canonicalTag" rel="canonical" href="${canonicalUrl}">`);

  // Replace Open Graph Tags
  html = html.replace(/<meta\s+id=["']ogTitle["'][^>]*>/i, `<meta id="ogTitle" property="og:title" content="${escapeHtml(pageTitle)}">`);
  html = html.replace(/<meta\s+id=["']ogDesc["'][^>]*>/i, `<meta id="ogDesc" property="og:description" content="${escapeHtml(metaDesc)}">`);
  html = html.replace(/<meta\s+id=["']ogUrl["'][^>]*>/i, `<meta id="ogUrl" property="og:url" content="${canonicalUrl}">`);

  // Replace Twitter Card Tags
  html = html.replace(/<meta\s+id=["']twitterTitle["'][^>]*>/i, `<meta id="twitterTitle" name="twitter:title" content="${escapeHtml(pageTitle)}">`);
  html = html.replace(/<meta\s+id=["']twitterDesc["'][^>]*>/i, `<meta id="twitterDesc" name="twitter:description" content="${escapeHtml(metaDesc)}">`);

  // Replace H1 Heading
  html = html.replace(
    /<h1\s+id=["']heroTitle["'][^>]*>[\s\S]*?<\/h1>/i,
    `<h1 id="heroTitle">${escapeHtml(categoryName)} <span>Videos</span></h1>`
  );

  // Replace Hero Description
  html = html.replace(
    /<p\s+id=["']heroDesc["'][^>]*>[\s\S]*?<\/p>/i,
    `<p id="heroDesc">${escapeHtml(metaDesc)}</p>`
  );

  // Replace Breadcrumb keyword
  html = html.replace(
    /<span\s+id=["']breadcrumbKeyword["'][^>]*>[\s\S]*?<\/span>/i,
    `<span id="breadcrumbKeyword">${escapeHtml(categoryName)}</span>`
  );

  // Inject Unique Editorial Hub Content (2-3 paragraphs)
  const descriptions = await getCategoryDescriptions();
  const editorial = descriptions[cleanSlug] || {
    title: `Explore Free ${categoryName} Videos & Leaks`,
    paragraphs: [
      `Welcome to our curated collection of ${categoryName} adult videos and trending leaks on lusthub.my.id. Browse through top-rated streaming clips, fresh community uploads, and verified releases updated daily in full HD resolution.`,
      `Enjoy uninterrupted mobile and desktop streaming with zero registration requirements and fast cloud delivery. Use the sorting menu to explore trending videos by popularity, rating, or release date.`
    ]
  };

  const editorialHtml = `
    <section class="category-editorial" id="categoryEditorial">
        <h2>${escapeHtml(editorial.title)}</h2>
        ${editorial.paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('\n        ')}
    </section>`;

  html = html.replace(
    /<section\s+class=["']category-editorial["']\s+id=["']categoryEditorial["'][^>]*>[\s\S]*?<\/section>/i,
    editorialHtml
  );

  // Pre-render initial video cards with LCP optimization (fetchpriority="high" on top 2 cards)
  if (categoryVideos.length > 0) {
    const cardsHtml = categoryVideos.map((v, idx) => {
      const title = escapeHtml(decodeMojibake(v.title || 'Untitled'));
      const vSlug = slugify(v.title);
      const href = `/v/${v.id}-${vSlug}`;
      const thumb = v.default_thumb?.src || (v.thumbs && v.thumbs[0]?.src) || '/assets/icons/favicon-32x32.png';
      const dur = v.length_min || '';
      const priorityAttr = idx < 2 ? 'fetchpriority="high"' : 'loading="lazy"';
      return `
        <a href="${href}" class="video-card" aria-label="${title}">
          <div class="video-thumb-wrap">
            <img src="${escapeHtml(thumb)}" alt="${title}" ${priorityAttr} width="320" height="180" decoding="async" style="aspect-ratio: 16/9; width: 100%; height: auto; object-fit: cover;">
            ${dur ? `<span class="video-duration">${escapeHtml(dur)}</span>` : ''}
          </div>
          <div class="video-card-body">
            <div class="video-card-title">${title}</div>
            <div class="video-card-meta">${v.added ? escapeHtml(v.added.slice(0, 10)) : ''}</div>
          </div>
        </a>`;
    }).join('\n');

    html = html.replace(
      /(<div[^>]*id=["']videoGrid["'][^>]*>)/i,
      `$1\n${cardsHtml}`
    );
  }

  // Append Structured Data Schema before </head>
  html = html.replace('</head>', `${schemaScript}\n</head>`);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=2592000, stale-while-revalidate=86400');
  return res.end(html);
}
