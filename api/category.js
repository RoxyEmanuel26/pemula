import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BASE_URL,
  EU_LOCALES,
  US_EU_CATEGORIES,
  normalizeUrl,
  escapeHtml,
  decodeMojibake,
  slugify,
  formatCategoryName,
  expandRuntimeVideo,
  buildHreflangHtml,
  buildOgLocaleMetaHtml,
  buildLanguageSwitcherHtml,
  createBreadcrumbSchema,
  createItemListSchema,
} from './schema-helper.js';

let cachedTemplate = null;
let cachedDescriptions = null;
let cachedLocales = null;
let cachedEnriched = null;
const CATEGORY_CACHE = new Map();
const CAT_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes server-side in-memory cache
const ALLOWED_ORDERS = new Set(['most-popular', 'top-rated', 'latest', 'longest']);
const EU_SET = new Set(EU_LOCALES);

async function getEnrichedCatalog() {
  if (!cachedEnriched) {
    try {
      const raw = await readFile(path.join(process.cwd(), 'data', 'enriched-runtime.json'), 'utf8');
      cachedEnriched = JSON.parse(raw);
    } catch {
      try {
        const raw = await readFile(path.join(process.cwd(), 'data', 'enriched-videos.json'), 'utf8');
        cachedEnriched = JSON.parse(raw);
      } catch {
        cachedEnriched = { videos: {}, byTag: {}, featured: [] };
      }
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

async function getEuLocales() {
  if (!cachedLocales) {
    try {
      const raw = await readFile(path.join(process.cwd(), 'data', 'eu-locales.json'), 'utf8');
      cachedLocales = JSON.parse(raw);
    } catch {
      cachedLocales = {};
    }
  }
  return cachedLocales;
}

function interpolate(pattern, vars) {
  return String(pattern || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

function formatDurationMin(sec) {
  const s = Number(sec || 0);
  if (!Number.isFinite(s) || s <= 0) return '';
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function buildSsrPagination(langPrefix, slug, currentPage, totalPages, prevLabel, nextLabel) {
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

  const pageHref = p => p <= 1 ? `${langPrefix}/c/${slug}` : `${langPrefix}/c/${slug}?page=${p}`;
  const parts = [];
  if (currentPage > 1) {
    parts.push(`<a class="page-btn" href="${pageHref(currentPage - 1)}" data-page="${currentPage - 1}">${escapeHtml(prevLabel)}</a>`);
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
    parts.push(`<a class="page-btn" href="${pageHref(currentPage + 1)}" data-page="${currentPage + 1}">${escapeHtml(nextLabel)}</a>`);
  }
  return parts.join('\n');
}

export default async function handler(req, res) {
  const { slug, page: rawPageParam, order: rawOrderParam, lang: rawLangParam } = req.query;
  const normalizedLang = String(rawLangParam || 'en').trim().toLowerCase();
  const lang = EU_SET.has(normalizedLang) ? normalizedLang : 'en';
  const langPrefix = lang === 'en' ? '' : `/${lang}`;

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

  // Permanent 301 redirect when URL contains spaces, uppercase, or non-canonical punctuation (preserves locale prefix)
  if (slug && String(slug).trim() !== cleanSlug) {
    const targetUrl = normalizeUrl(`${domain}${langPrefix}/c/${cleanSlug}${currentPage > 1 ? `?page=${currentPage}` : ''}`);
    res.statusCode = 301;
    res.setHeader('Location', targetUrl);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.end();
  }

  const [descriptions, euLocales, enrichedDb] = await Promise.all([
    getCategoryDescriptions(),
    lang === 'en' ? Promise.resolve({}) : getEuLocales(),
    getEnrichedCatalog(),
  ]);
  const localeCfg = lang === 'en' ? null : (euLocales[lang] || null);
  const isCurated = Boolean(descriptions[cleanSlug]);

  const englishName = formatCategoryName(cleanSlug);
  const localeCatEntry = localeCfg?.categories?.[cleanSlug] || null;
  const categoryName = localeCatEntry?.name || englishName;
  const queryTerm = cleanSlug.replace(/-/g, ' ');

  const pageSuffix = currentPage > 1
    ? (localeCfg ? interpolate(localeCfg.categoryPageSuffix, { page: currentPage }) : ` — Page ${currentPage}`)
    : '';

  const pageTitle = localeCfg
    ? interpolate(localeCfg.categoryTitlePattern, { name: categoryName, pageSuffix })
    : `Free ${categoryName} HD Videos${pageSuffix} | LustHub`;

  const metaDesc = localeCfg
    ? (currentPage > 1
      ? interpolate(localeCfg.categoryDescPagePattern, { name: categoryName, page: currentPage })
      : interpolate(localeCfg.categoryDescPattern, { name: categoryName }))
    : (currentPage > 1
      ? `Watch page ${currentPage} of free ${categoryName} adult videos in full 1080p HD on lusthub.my.id. Fast mobile streaming with zero account signups.`
      : `Watch the best free ${categoryName} adult videos and trending HD leaks on lusthub.my.id. Instant US & EU streaming with zero signups.`);

  // Google pagination best practice: self-referencing canonical per paginated URL (ignoring sort params)
  const canonicalUrl = normalizeUrl(
    currentPage > 1
      ? `${domain}${langPrefix}/c/${cleanSlug}?page=${currentPage}`
      : `${domain}${langPrefix}/c/${cleanSlug}`
  );

  if (!cachedTemplate) {
    cachedTemplate = await readFile(path.join(process.cwd(), 'category.html'), 'utf8');
  }

  let liveApiVideos = [];
  let totalPages = 1;
  let totalCount = 0;

  const cacheKey = `${queryTerm}:p${currentPage}:${order}`;
  const cachedEntry = CATEGORY_CACHE.get(cacheKey);
  if (cachedEntry && (Date.now() - cachedEntry.ts < CAT_CACHE_TTL_MS)) {
    liveApiVideos = cachedEntry.videos;
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
          liveApiVideos = json.videos;
          totalPages = Math.min(Number(json.total_pages) || 1, 100);
          totalCount = Number(json.total_count) || liveApiVideos.length;
          CATEGORY_CACHE.set(cacheKey, { videos: liveApiVideos, totalPages, totalCount, ts: Date.now() });
        }
      }
    } catch {
      // Upstream timeout or network error — gracefully degrade
    }
  }

  // Hybrid Enriched-First Grid (eliminates 99% orphaned sitemap videos & crawl budget waste on noindex links):
  // - On Page 1 of curated hubs, lead with up to 16 verified alive AI-enriched videos matching this hub (dofollow)
  // - Deduplicate & pad remaining slots up to 24 with live Eporner results (marked rel="nofollow" when un-enriched)
  const videosMap = enrichedDb?.videos || {};
  const byTag = enrichedDb?.byTag || {};
  const featured = Array.isArray(enrichedDb?.featured) ? enrichedDb.featured : [];

  const isEnrichedId = (id) => Boolean(expandRuntimeVideo(videosMap[id]));

  let categoryVideos = [];
  const seenVideoIds = new Set();

  if (isCurated && currentPage === 1 && order === 'most-popular') {
    const directIds = Array.isArray(byTag[cleanSlug]) ? byTag[cleanSlug] : [];
    const enrichedPicks = directIds
      .slice(0, 16)
      .map(id => expandRuntimeVideo(videosMap[id]))
      .filter(v => v && v.title && v.thumbnail);

    for (const v of enrichedPicks) {
      seenVideoIds.add(v.video_id);
      categoryVideos.push({
        id: v.video_id,
        slug: v.slug,
        title: v.title,
        default_thumb: { src: v.thumbnail },
        added: v.generated_at || '',
        length_min: formatDurationMin(v.duration),
        views: v.views || 0,
        _isEnriched: true,
      });
    }
  }

  for (const v of liveApiVideos) {
    if (categoryVideos.length >= 24) break;
    if (!v || !v.id || seenVideoIds.has(v.id)) continue;
    seenVideoIds.add(v.id);
    categoryVideos.push({
      ...v,
      _isEnriched: isEnrichedId(v.id),
    });
  }

  // Resilient O(1) fallback if upstream Eporner returned 0 results on a curated hub (prevents Soft-404 crawls)
  if (categoryVideos.length === 0 && isCurated) {
    const fallbackIds = [...new Set([...(byTag[cleanSlug] || []), ...featured])];
    const start = (currentPage - 1) * 24;
    const sliced = fallbackIds.slice(start, start + 24)
      .map(id => expandRuntimeVideo(videosMap[id]))
      .filter(Boolean);
    categoryVideos = sliced.map(v => ({
      id: v.video_id,
      slug: v.slug,
      title: v.title,
      default_thumb: { src: v.thumbnail },
      added: v.generated_at || '',
      length_min: formatDurationMin(v.duration),
      views: v.views || 0,
      _isEnriched: true,
    }));
    totalCount = Math.max(totalCount, fallbackIds.length);
    totalPages = Math.max(1, Math.min(100, Math.ceil(totalCount / 24)));
  }

  const hasNoindexParam = Boolean(req.query?.ref || req.query?.q);
  const isIndexable = order === 'most-popular' && !hasNoindexParam && (isCurated || (lang === 'en' && categoryVideos.length >= 4));
  const robotsMeta = isIndexable
    ? '<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">'
    : '<meta name="robots" content="noindex, follow">';

  const homeLabel = localeCfg?.homeBreadcrumb || 'Home';
  const videosWord = localeCfg?.videosWord || 'Videos';
  const pageWord = localeCfg?.pageWord || 'Page';
  const homeHref = lang === 'en' ? '/' : `/${lang}`;

  const breadcrumbItems = [
    { name: homeLabel, url: homeHref },
    { name: `${categoryName} ${videosWord}`, url: `${langPrefix}/c/${cleanSlug}` },
  ];
  if (currentPage > 1) {
    breadcrumbItems.push({ name: `${pageWord} ${currentPage}`, url: canonicalUrl });
  }
  const breadcrumbSchema = createBreadcrumbSchema(breadcrumbItems);

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': `${categoryName} ${videosWord}${pageSuffix}`,
    'description': metaDesc,
    'url': canonicalUrl,
    'inLanguage': lang,
  };

  // Prefer verified indexable AI-enriched items in ItemList JSON-LD so structured data matches sitemaps
  const enrichedForSchema = categoryVideos.filter(v => v._isEnriched);
  const schemaPool = enrichedForSchema.length >= 6 ? enrichedForSchema : categoryVideos;
  const schemaItems = schemaPool.slice(0, 24).map(v => {
    const title = decodeMojibake(v.title || 'Untitled');
    const vSlug = v.slug || slugify(title, 80, v.id);
    return {
      title,
      url: `/v/${v.id}-${vSlug}`,
      image: v.default_thumb?.src || (v.thumbs && v.thumbs[0]?.src) || undefined,
    };
  });

  const itemListSchema = createItemListSchema(
    `${categoryName} ${videosWord}${pageSuffix}`,
    metaDesc,
    schemaItems
  );
  itemListSchema.inLanguage = lang;

  // Editorial & FAQ only rendered fully on Page 1 to prevent paginated duplicate boilerplate
  let faqSchemaScript = '';
  let faqHtml = '';
  let editorialHtml = '';

  const crossLinksHtml = US_EU_CATEGORIES
    .filter(s => s !== cleanSlug)
    .slice(0, 14)
    .map(s => {
      const label = localeCfg?.categories?.[s]?.name || formatCategoryName(s);
      return `<a href="${langPrefix}/c/${s}" style="display:inline-block;padding:4px 10px;border-radius:999px;background:rgba(232,168,0,0.12);color:#e8a800;font-size:0.8rem;font-weight:600;text-decoration:none;border:1px solid rgba(232,168,0,0.25);">${escapeHtml(label)}</a>`;
    })
    .join('\n            ');

  const exploreLabel = localeCfg?.exploreHubsLabel || 'Explore Hubs:';
  const relatedLabel = localeCfg?.relatedHubsLabel || 'Related Hubs:';
  const faqHeading = localeCfg?.faqHeading || 'Frequently Asked Questions';

  if (currentPage === 1) {
    let editorial;
    if (localeCfg) {
      const topicNote = localeCatEntry?.topic || `${categoryName} HD`;
      editorial = {
        title: interpolate(localeCfg.editorialTitlePattern, { name: categoryName }),
        paragraphs: (localeCfg.editorialParagraphs || []).map(p => interpolate(p, { name: categoryName, topicNote })),
        faq: (localeCfg.categoryFaqs || []).map(f => ({
          question: interpolate(f.question, { name: categoryName, topicNote }),
          answer: interpolate(f.answer, { name: categoryName, topicNote }),
        })),
      };
    } else {
      editorial = descriptions[cleanSlug] || {
        title: `Explore Free ${categoryName} HD Videos & Leaks`,
        paragraphs: [
          `Browse our curated collection of ${categoryName} adult videos and viral leaks on lusthub.my.id. Stream verified clips and top-rated uploads daily in 1080p high definition.`,
          `Enjoy rapid mobile and desktop streaming with zero account registration or mandatory downloads. Sort videos by Most Popular, Top Rated, Latest, or Longest.`,
        ],
      };
    }

    editorialHtml = `
    <section class="category-editorial" id="categoryEditorial">
        <h2>${escapeHtml(editorial.title)}</h2>
        ${editorial.paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('\n        ')}
        <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
            <span style="color:#888;font-size:0.8rem;font-weight:600;margin-right:4px;">${escapeHtml(exploreLabel)}</span>
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
        'inLanguage': lang,
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
        <h2>${escapeHtml(faqHeading)}</h2>
        <div class="faq-list">
${faqItemsHtml}
        </div>
    </section>`;
    }
  } else {
    const returnText = localeCfg?.returnPage1Text || 'Return to Page 1';
    editorialHtml = `
    <section class="category-editorial" id="categoryEditorial">
        <h2>${escapeHtml(categoryName)} ${escapeHtml(videosWord)} — ${escapeHtml(pageWord)} ${currentPage} / ${totalPages}</h2>
        <p>${escapeHtml(metaDesc)} <a href="${langPrefix}/c/${escapeHtml(cleanSlug)}" style="color:#e8a800;">${escapeHtml(returnText)}</a></p>
        <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
            <span style="color:#888;font-size:0.8rem;font-weight:600;margin-right:4px;">${escapeHtml(relatedLabel)}</span>
            ${crossLinksHtml}
        </div>
    </section>`;
  }

  const schemaScript = `
    <script type="application/ld+json">${JSON.stringify(breadcrumbSchema).replace(/</g, '\\u003c')}</script>
    <script type="application/ld+json">${JSON.stringify(collectionSchema).replace(/</g, '\\u003c')}</script>
    <script type="application/ld+json">${JSON.stringify(itemListSchema).replace(/</g, '\\u003c')}</script>${faqSchemaScript}
  `;

  // Emit bidirectional hreflang ONLY for Page 1 indexable curated hubs
  const hreflangTags = (isIndexable && isCurated && currentPage === 1)
    ? buildHreflangHtml(`/c/${cleanSlug}`)
    : '';
  const ogLocaleTags = buildOgLocaleMetaHtml(lang);

  // Pass safe locale metadata to category.html client-side pagination/sorting script
  const clientLocalePayload = {
    lang,
    langPrefix,
    categoryName,
    videosWord,
    pageWord,
    prevLabel: localeCfg?.prevLabel || '← Prev',
    nextLabel: localeCfg?.nextLabel || 'Next →',
    titlePattern: localeCfg?.categoryTitlePattern || 'Free {name} HD Videos{pageSuffix} | LustHub',
    pageSuffixPattern: localeCfg?.categoryPageSuffix || ' — Page {page}',
    heroPrefix: localeCfg?.categoryHeroPrefix || 'Free ',
    heroSuffix: localeCfg?.categoryHeroSuffix || ' Videos',
    homeLabel,
    homeHref,
  };
  const clientLocaleScript = `<script>window.__LOCALE_META__=${JSON.stringify(clientLocalePayload).replace(/</g, '\\u003c')};</script>`;

  let html = cachedTemplate;

  html = html.replace(/<html\s+lang=["'][^"']+["']/i, `<html lang="${lang}"`);
  html = html.replace(/<meta\s+http-equiv=["']content-language["']\s+content=["'][^"']+["']\s*>/i, `<meta http-equiv="content-language" content="${lang}">`);
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

  // Header brand link + language switcher (when curated hub)
  const langSwitcherHtml = isCurated ? buildLanguageSwitcherHtml(lang, `/c/${cleanSlug}`) : '';
  html = html.replace(
    /<div class="header-content">\s*<a href="\/" class="logo">lusthub<span>\.my\.id<\/span><\/a>\s*<\/div>/i,
    `<div class="header-content" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">\n            <a href="${escapeHtml(homeHref)}" class="logo">lusthub<span>.my.id</span></a>\n            ${langSwitcherHtml}\n        </div>`
  );

  const heroPrefix = localeCfg?.categoryHeroPrefix || 'Free ';
  const heroSuffix = localeCfg?.categoryHeroSuffix || ' Videos';
  html = html.replace(
    /<h1\s+id=["']heroTitle["'][^>]*>[\s\S]*?<\/h1>/i,
    `<h1 id="heroTitle">${escapeHtml(heroPrefix)}<span>${escapeHtml(categoryName)}</span>${escapeHtml(heroSuffix)}${escapeHtml(pageSuffix)}</h1>`
  );
  html = html.replace(
    /<p\s+id=["']heroDesc["'][^>]*>[\s\S]*?<\/p>/i,
    `<p id="heroDesc">${escapeHtml(metaDesc)}</p>`
  );
  html = html.replace(
    /<nav class="category-breadcrumb" aria-label="Breadcrumb">[\s\S]*?<\/nav>/i,
    `<nav class="category-breadcrumb" aria-label="Breadcrumb">\n                <a href="${escapeHtml(homeHref)}">${escapeHtml(homeLabel)}</a> &rsaquo; <span id="breadcrumbKeyword">${escapeHtml(categoryName)}</span>\n            </nav>`
  );

  if (localeCfg?.sortOptions) {
    html = html.replace(
      /<select class="sort-select" id="sortSelect" onchange="changeSort\(this\.value\)">[\s\S]*?<\/select>/i,
      `<select class="sort-select" id="sortSelect" onchange="changeSort(this.value)">
                <option value="most-popular"${order === 'most-popular' ? ' selected' : ''}>${escapeHtml(localeCfg.sortOptions['most-popular'])}</option>
                <option value="top-rated"${order === 'top-rated' ? ' selected' : ''}>${escapeHtml(localeCfg.sortOptions['top-rated'])}</option>
                <option value="latest"${order === 'latest' ? ' selected' : ''}>${escapeHtml(localeCfg.sortOptions['latest'])}</option>
                <option value="longest"${order === 'longest' ? ' selected' : ''}>${escapeHtml(localeCfg.sortOptions['longest'])}</option>
            </select>`
    );
  }

  if (totalCount > 0) {
    const totalWord = localeCfg?.totalWord || 'Total';
    const freeHdBadge = localeCfg?.freeHdBadge || 'Free HD Streaming';
    html = html.replace(
      /<div class="category-stats" id="categoryStats" style="display:none">[\s\S]*?<\/div>/i,
      `<div class="category-stats" id="categoryStats">
            <div>${escapeHtml(totalWord)}: <span id="statTotal">${totalCount.toLocaleString('en-US')}</span> ${escapeHtml(videosWord.toLowerCase())}</div>
            <div>${escapeHtml(pageWord)}: <span id="statPage">${currentPage} / ${totalPages}</span></div>
            <div>${escapeHtml(freeHdBadge)}</div>
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
      const vSlug = v.slug || slugify(v.title, 80, v.id);
      const href = `/v/${v.id}-${vSlug}`;
      const thumb = v.default_thumb?.src || (v.thumbs && v.thumbs[0]?.src) || '/assets/icons/favicon-32x32.png';
      const dur = v.length_min || '';
      const viewsNum = parseInt(String(v.views || '0').replace(/\D/g, ''), 10) || 0;
      const metaParts = [v.added ? escapeHtml(v.added.slice(0, 10)) : '', viewsNum > 0 ? `👁 ${viewsNum.toLocaleString('en-US')}` : ''].filter(Boolean).join(' • ');
      const priorityAttr = idx < 4 ? 'fetchpriority="high"' : 'loading="lazy"';
      const relAttr = v._isEnriched ? '' : ' rel="nofollow"';
      return `
        <a href="${href}"${relAttr} class="video-card" aria-label="${title}">
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

    html = html.replace(
      '<div id="loadingState" class="loading-state">',
      '<div id="loadingState" class="loading-state" style="display:none">'
    );

    const paginationHtml = buildSsrPagination(
      langPrefix,
      cleanSlug,
      currentPage,
      totalPages,
      clientLocalePayload.prevLabel,
      clientLocalePayload.nextLabel
    );
    if (paginationHtml) {
      html = html.replace(
        '<div class="pagination" id="pagination"></div>',
        `<div class="pagination" id="pagination">\n${paginationHtml}\n</div>`
      );
    }
  }

  // Add rel="prev" / rel="next", og:locale, hreflang, client locale config, and JSON-LD
  const relLinks = [];
  if (currentPage > 1) {
    const prevHref = currentPage === 2
      ? `${domain}${langPrefix}/c/${cleanSlug}`
      : `${domain}${langPrefix}/c/${cleanSlug}?page=${currentPage - 1}`;
    relLinks.push(`    <link rel="prev" href="${prevHref}">`);
  }
  if (currentPage < totalPages) {
    relLinks.push(`    <link rel="next" href="${domain}${langPrefix}/c/${cleanSlug}?page=${currentPage + 1}">`);
  }

  const headInject = [ogLocaleTags, hreflangTags, relLinks.join('\n'), clientLocaleScript, schemaScript]
    .filter(Boolean)
    .join('\n');

  html = html.replace('</head>', `${headInject}\n</head>`);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Language', lang);
  if (!isIndexable) {
    res.setHeader('X-Robots-Tag', 'noindex, follow');
  }
  res.setHeader('Rating', 'RTA-5042-1996-1400-1577-RTA');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  return res.end(html);
}
