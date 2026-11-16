import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BASE_URL,
  US_EU_CATEGORIES,
  normalizeUrl,
  escapeHtml,
  decodeMojibake,
  slugify,
  createBreadcrumbSchema,
  createItemListSchema,
} from './schema-helper.js';

let cachedTemplate = null;
let cachedDescriptions = null;
let cachedEnriched = null;
const CATEGORY_CACHE = new Map();
const CAT_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes server-side in-memory cache
const ALLOWED_ORDERS = new Set(['most-popular', 'top-rated', 'latest', 'longest']);

async function getEnrichedCatalog() {
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

function formatCategoryName(slug) {
  if (!slug) return 'All';
  const uppercaseWords = new Set(['fps', 'hd', 'jav', 'pov', 'bbw', 'vr', 'milf', '4k', 'uhd']);
  return slug
    .split('-')
    .map(word => uppercaseWords.has(word.toLowerCase())
      ? word.toUpperCase()
      : word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function buildSsrPagination(slug, currentPage, totalPages) {
  if (totalPages <= 1) return '';
  const maxVisible = 7;
  let pages = [];
  if (totalPages <= maxVisible) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages = [1];
    if (currentPage > 3) pages.push('...');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  const pageHref = p => p <= 1 ? `/c/${slug}` : `/c/${slug}?page=${p}`;
  const parts = [];
  if (currentPage > 1) {
    parts.push(`<a class="page-btn" href="${pageHref(currentPage - 1)}" data-page="${currentPage - 1}">← Prev</a>`);
  }
  for (const p of pages) {
    if (p === '...') {
      parts.push('<span style="color:#555;padding:0 5px;line-height:40px">…</span>');
    } else {
      const cls = p === currentPage ? 'page-btn active' : 'page-btn';
      parts.push(`<a class="${cls}" href="${pageHref(p)}" data-page="${p}">${p}</a>`);
    }
  }
  if (currentPage < totalPages) {
    parts.push(`<a class="page-btn" href="${pageHref(currentPage + 1)}" data-page="${currentPage + 1}">Next →</a>`);
  }
  return parts.join('\n');
}

export default async function handler(req, res) {
  const { slug, page: rawPageParam, order: rawOrderParam } = req.query;
  let decodedSlug = String(slug || '').trim();
  try {
    decodedSlug = decodeURIComponent(decodedSlug);
  } catch {
    // Keep raw value if malformed percent-encoding
  }
  const cleanSlug = slugify(decodedSlug, 60, 'viral');
  const currentPage = Math.max(1, Math.min(100, parseInt(String(rawPageParam || '1'), 10) || 1));
  const order = ALLOWED_ORDERS.has(String(rawOrderParam || '')) ? String(rawOrderParam) : 'most-popular';
  const domain = BASE_URL;

  // Permanent 301 redirect when URL contains spaces, uppercase, or non-canonical punctuation (e.g. /c/big%20tits -> /c/big-tits)
  if (slug && String(slug).trim() !== cleanSlug) {
    const targetUrl = normalizeUrl(`${domain}/c/${cleanSlug}${currentPage > 1 ? `?page=${currentPage}` : ''}`);
    res.statusCode = 301;
    res.setHeader('Location', targetUrl);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.end();
  }

  const categoryName = formatCategoryName(cleanSlug);
  const queryTerm = cleanSlug.replace(/-/g, ' ');

  const pageSuffix = currentPage > 1 ? ` — Page ${currentPage}` : '';
  const pageTitle = `Free ${categoryName} HD Videos${pageSuffix} | LustHub`;
  const metaDesc = currentPage > 1
    ? `Watch page ${currentPage} of free ${categoryName} adult videos in full 1080p HD on lusthub.my.id. Fast mobile streaming with zero account signups.`
    : `Watch the best free ${categoryName} adult videos and trending HD leaks on lusthub.my.id. Instant US & EU streaming with zero signups.`;

  // Google pagination best practice: self-referencing canonical per paginated URL (ignoring sort params)
  const canonicalUrl = normalizeUrl(
    currentPage > 1
      ? `${domain}/c/${cleanSlug}?page=${currentPage}`
      : `${domain}/c/${cleanSlug}`
  );

  if (!cachedTemplate) {
    cachedTemplate = await readFile(path.join(process.cwd(), 'category.html'), 'utf8');
  }

  let categoryVideos = [];
  let totalPages = 1;
  let totalCount = 0;

  const cacheKey = `${queryTerm}:p${currentPage}:${order}`;
  const cachedEntry = CATEGORY_CACHE.get(cacheKey);
  if (cachedEntry && (Date.now() - cachedEntry.ts < CAT_CACHE_TTL_MS)) {
    categoryVideos = cachedEntry.videos;
    totalPages = cachedEntry.totalPages;
    totalCount = cachedEntry.totalCount;
  } else {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const apiUrl = `https://www.eporner.com/api/v2/video/search/?query=${encodeURIComponent(queryTerm)}&per_page=24&page=${currentPage}&order=${encodeURIComponent(order)}&thumbsize=big&gay=0&lq=1&format=json`;
      const apiRes = await fetch(apiUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'lusthub-bot/2.0 (+https://www.lusthub.my.id/robots.txt)' },
      });
      clearTimeout(timeout);
      if (apiRes.ok) {
        const json = await apiRes.json();
        if (json && Array.isArray(json.videos)) {
          categoryVideos = json.videos;
          totalPages = Math.min(Number(json.total_pages) || 1, 100);
          totalCount = Number(json.total_count) || categoryVideos.length;
          CATEGORY_CACHE.set(cacheKey, { videos: categoryVideos, totalPages, totalCount, ts: Date.now() });
        }
      }
    } catch {
      // Upstream timeout or network error — gracefully degrade
    }
  }

  const descriptions = await getCategoryDescriptions();
  const isCurated = Boolean(descriptions[cleanSlug]);

  // Resilient fallback: if Eporner upstream times out on a curated hub, serve curated enriched catalog matches (prevents empty Soft-404 crawls)
  if (categoryVideos.length === 0 && isCurated) {
    try {
      const enrichedDb = await getEnrichedCatalog();
      const all = Object.values(enrichedDb?.videos || {}).filter(
        v => v.status === 'enriched' && v.model && v.model !== 'mock-enricher' && v.title && v.thumbnail
      );
      const qLower = queryTerm.toLowerCase();
      const terms = qLower.split(/\s+/).filter(Boolean);
      const matched = all.filter(v => {
        const hay = `${v.title} ${(Array.isArray(v.tags) ? v.tags.join(' ') : '')}`.toLowerCase();
        return hay.includes(qLower) || (terms.length > 0 && terms.every(t => hay.includes(t)));
      });
      const pool = matched.length >= 6 ? matched : [...matched, ...all.filter(v => !matched.includes(v))];
      const start = (currentPage - 1) * 24;
      const sliced = pool.slice(start, start + 24);
      categoryVideos = sliced.map(v => ({
        id: v.video_id,
        title: v.title,
        default_thumb: { src: v.thumbnail },
        added: v.generated_at || '',
        length_min: '',
        views: 0,
      }));
      totalCount = matched.length || pool.length;
      totalPages = Math.max(1, Math.min(100, Math.ceil(totalCount / 24)));
    } catch {
      // Ignore fallback read errors cleanly
    }
  }

  const hasNoindexParam = Boolean(req.query?.ref || req.query?.q);
  const isIndexable = order === 'most-popular' && !hasNoindexParam && (isCurated || categoryVideos.length >= 4);
  const robotsMeta = isIndexable
    ? '<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">'
    : '<meta name="robots" content="noindex, follow">';

  const breadcrumbItems = [
    { name: 'Home', url: '/' },
    { name: `${categoryName} Videos`, url: `/c/${cleanSlug}` },
  ];
  if (currentPage > 1) {
    breadcrumbItems.push({ name: `Page ${currentPage}`, url: canonicalUrl });
  }
  const breadcrumbSchema = createBreadcrumbSchema(breadcrumbItems);

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': `${categoryName} Videos${pageSuffix}`,
    'description': metaDesc,
    'url': canonicalUrl,
    'inLanguage': 'en',
  };

  const schemaItems = categoryVideos.slice(0, 24).map(v => {
    const title = decodeMojibake(v.title || 'Untitled');
    const vSlug = slugify(title, 80, v.id);
    return {
      title,
      url: `/v/${v.id}-${vSlug}`,
      image: v.default_thumb?.src || (v.thumbs && v.thumbs[0]?.src) || undefined,
    };
  });

  const itemListSchema = createItemListSchema(
    `${categoryName} Videos${pageSuffix}`,
    metaDesc,
    schemaItems
  );

  // Editorial & FAQ only rendered fully on Page 1 to prevent paginated duplicate boilerplate
  let faqSchemaScript = '';
  let faqHtml = '';
  let editorialHtml = '';

  const crossLinksHtml = US_EU_CATEGORIES
    .filter(s => s !== cleanSlug)
    .slice(0, 14)
    .map(s => `<a href="/c/${s}" style="display:inline-block;padding:4px 10px;border-radius:999px;background:rgba(232,168,0,0.12);color:#e8a800;font-size:0.8rem;font-weight:600;text-decoration:none;border:1px solid rgba(232,168,0,0.25);">${escapeHtml(formatCategoryName(s))}</a>`)
    .join('\n            ');

  if (currentPage === 1) {
    const editorial = descriptions[cleanSlug] || {
      title: `Explore Free ${categoryName} HD Videos & Leaks`,
      paragraphs: [
        `Browse our curated collection of ${categoryName} adult videos and viral leaks on lusthub.my.id. Stream verified clips and top-rated uploads daily in 1080p high definition.`,
        `Enjoy rapid mobile and desktop streaming with zero account registration or mandatory downloads. Sort videos by Most Popular, Top Rated, Latest, or Longest.`,
      ],
    };

    editorialHtml = `
    <section class="category-editorial" id="categoryEditorial">
        <h2>${escapeHtml(editorial.title)}</h2>
        ${editorial.paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('\n        ')}
        <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
            <span style="color:#888;font-size:0.8rem;font-weight:600;margin-right:4px;">Explore Hubs:</span>
            ${crossLinksHtml}
        </div>
    </section>`;

    const normalizedFaq = Array.isArray(editorial.faq)
      ? editorial.faq
          .map(item => ({
            question: item.question || item.q || '',
            answer: item.answer || item.a || '',
          }))
          .filter(item => item.question && item.answer)
      : [];

    if (normalizedFaq.length > 0) {
      const faqSchema = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        'mainEntity': normalizedFaq.map(item => ({
          '@type': 'Question',
          'name': item.question,
          'acceptedAnswer': {
            '@type': 'Answer',
            'text': item.answer,
          },
        })),
      };
      faqSchemaScript = `\n    <script type="application/ld+json">${JSON.stringify(faqSchema).replace(/</g, '\\u003c')}</script>`;

      const faqItemsHtml = normalizedFaq.map(item => `
        <div class="faq-item">
            <h3 class="faq-question">${escapeHtml(item.question)}</h3>
            <p class="faq-answer">${escapeHtml(item.answer)}</p>
        </div>`).join('');

      faqHtml = `
    <section class="category-faq-section" id="categoryFaq">
        <h2>Frequently Asked Questions</h2>
        <div class="faq-list">
${faqItemsHtml}
        </div>
    </section>`;
    }
  } else {
    editorialHtml = `
    <section class="category-editorial" id="categoryEditorial">
        <h2>${escapeHtml(categoryName)} Videos — Page ${currentPage} of ${totalPages}</h2>
        <p>Viewing page ${currentPage} of curated ${escapeHtml(categoryName)} HD videos on lusthub.my.id. <a href="/c/${escapeHtml(cleanSlug)}" style="color:#e8a800;">Return to Page 1</a> for full category highlights and FAQs.</p>
        <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
            <span style="color:#888;font-size:0.8rem;font-weight:600;margin-right:4px;">Related Hubs:</span>
            ${crossLinksHtml}
        </div>
    </section>`;
  }

  const schemaScript = `
    <script type="application/ld+json">${JSON.stringify(breadcrumbSchema).replace(/</g, '\\u003c')}</script>
    <script type="application/ld+json">${JSON.stringify(collectionSchema).replace(/</g, '\\u003c')}</script>
    <script type="application/ld+json">${JSON.stringify(itemListSchema).replace(/</g, '\\u003c')}</script>${faqSchemaScript}
  `;

  let html = cachedTemplate;

  html = html.replace(/<meta\s+name=["']robots["']\s+content=["'][\s\S]*?["']\s*>/i, robotsMeta);
  html = html.replace(/<title\s+id=["']pageTitle["'][^>]*>.*?<\/title>/i, `<title id="pageTitle">${escapeHtml(pageTitle)}</title>`);
  html = html.replace(/<meta\s+id=["']pageDesc["']\s+name=["']description["']\s+content=["'][\s\S]*?["']\s*>/i, `<meta id="pageDesc" name="description" content="${escapeHtml(metaDesc)}">`);
  html = html.replace(/<link\s+id=["']canonicalTag["']\s+rel=["']canonical["']\s+href=["'][\s\S]*?["']\s*>/i, `<link id="canonicalTag" rel="canonical" href="${canonicalUrl}">`);

  const topThumb = normalizeUrl(
    categoryVideos[0]?.default_thumb?.src ||
    categoryVideos[0]?.thumbs?.[0]?.src ||
    `${domain}/assets/icons/og-image.png`
  );

  html = html.replace(/<meta\s+id=["']ogTitle["'][^>]*>/i, `<meta id="ogTitle" property="og:title" content="${escapeHtml(pageTitle)}">`);
  html = html.replace(/<meta\s+id=["']ogDesc["'][^>]*>/i, `<meta id="ogDesc" property="og:description" content="${escapeHtml(metaDesc)}">`);
  html = html.replace(/<meta\s+id=["']ogUrl["'][^>]*>/i, `<meta id="ogUrl" property="og:url" content="${canonicalUrl}">`);
  html = html.replace(/<meta\s+id=["']ogImage["'][^>]*>/i, `<meta id="ogImage" property="og:image" content="${escapeHtml(topThumb)}">`);
  html = html.replace(/<meta\s+id=["']twitterTitle["'][^>]*>/i, `<meta id="twitterTitle" name="twitter:title" content="${escapeHtml(pageTitle)}">`);
  html = html.replace(/<meta\s+id=["']twitterDesc["'][^>]*>/i, `<meta id="twitterDesc" name="twitter:description" content="${escapeHtml(metaDesc)}">`);
  html = html.replace(/<meta\s+id=["']twitterImage["'][^>]*>/i, `<meta id="twitterImage" name="twitter:image" content="${escapeHtml(topThumb)}">`);

  html = html.replace(
    /<h1\s+id=["']heroTitle["'][^>]*>[\s\S]*?<\/h1>/i,
    `<h1 id="heroTitle">Free <span>${escapeHtml(categoryName)}</span> Videos${pageSuffix}</h1>`
  );
  html = html.replace(
    /<p\s+id=["']heroDesc["'][^>]*>[\s\S]*?<\/p>/i,
    `<p id="heroDesc">${escapeHtml(metaDesc)}</p>`
  );
  html = html.replace(
    /<span\s+id=["']breadcrumbKeyword["'][^>]*>[\s\S]*?<\/span>/i,
    `<span id="breadcrumbKeyword">${escapeHtml(categoryName)}</span>`
  );

  if (totalCount > 0) {
    html = html.replace(
      /<div class="category-stats" id="categoryStats" style="display:none">[\s\S]*?<\/div>/i,
      `<div class="category-stats" id="categoryStats">
            <div>Total: <span id="statTotal">${totalCount.toLocaleString('en-US')}</span> videos</div>
            <div>Page: <span id="statPage">${currentPage} / ${totalPages}</span></div>
            <div>Free HD Streaming</div>
        </div>`
    );
  }

  html = html.replace(
    /<section\s+class=["']category-editorial["']\s+id=["']categoryEditorial["'][^>]*>[\s\S]*?<\/section>/i,
    editorialHtml
  );

  if (faqHtml) {
    html = html.replace(
      /<section\s+class=["']category-faq-section["']\s+id=["']categoryFaq["'][^>]*><\/section>/i,
      faqHtml
    );
  }

  if (categoryVideos.length > 0) {
    const cardsHtml = categoryVideos.map((v, idx) => {
      const title = escapeHtml(decodeMojibake(v.title || 'Untitled'));
      const vSlug = slugify(v.title, 80, v.id);
      const href = `/v/${v.id}-${vSlug}`;
      const thumb = v.default_thumb?.src || (v.thumbs && v.thumbs[0]?.src) || '/assets/icons/favicon-32x32.png';
      const dur = v.length_min || '';
      const viewsNum = parseInt(String(v.views || '0').replace(/\D/g, ''), 10) || 0;
      const metaParts = [v.added ? escapeHtml(v.added.slice(0, 10)) : '', viewsNum > 0 ? `👁 ${viewsNum.toLocaleString('en-US')}` : ''].filter(Boolean).join(' • ');
      const priorityAttr = idx < 4 ? 'fetchpriority="high"' : 'loading="lazy"';
      return `
        <a href="${href}" class="video-card" aria-label="${title}">
          <div class="video-thumb-wrap">
            <img src="${escapeHtml(thumb)}" alt="${title}" ${priorityAttr} width="320" height="180" decoding="async" style="aspect-ratio: 16/9; width: 100%; height: auto; object-fit: cover;">
            ${dur ? `<span class="video-duration">${escapeHtml(dur)}</span>` : ''}
          </div>
          <div class="video-card-body">
            <div class="video-card-title">${title}</div>
            <div class="video-card-meta">${metaParts}</div>
          </div>
        </a>`;
    }).join('\n');

    html = html.replace(
      /(<div[^>]*id=["']videoGrid["'][^>]*>)/i,
      `$1\n${cardsHtml}`
    );

    // Hide client-side spinner when SSR cards are already populated
    html = html.replace(
      '<div id="loadingState" class="loading-state">',
      '<div id="loadingState" class="loading-state" style="display:none">'
    );

    const paginationHtml = buildSsrPagination(cleanSlug, currentPage, totalPages);
    if (paginationHtml) {
      html = html.replace(
        '<div class="pagination" id="pagination"></div>',
        `<div class="pagination" id="pagination">\n${paginationHtml}\n</div>`
      );
    }
  }

  // Add rel="prev" / rel="next" hints cleanly alongside structured data in head
  const relLinks = [];
  if (currentPage > 1) {
    const prevHref = currentPage === 2 ? `${domain}/c/${cleanSlug}` : `${domain}/c/${cleanSlug}?page=${currentPage - 1}`;
    relLinks.push(`<link rel="prev" href="${prevHref}">`);
  }
  if (currentPage < totalPages) {
    relLinks.push(`<link rel="next" href="${domain}/c/${cleanSlug}?page=${currentPage + 1}">`);
  }

  html = html.replace('</head>', `${relLinks.join('\n    ')}\n${schemaScript}\n</head>`);

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
