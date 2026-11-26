import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BASE_URL,
  SITE_DOMAIN,
  EU_LOCALES,
  EU_LOCALIZED_CATEGORIES,
  REGIONAL_ARCHIVE_HUBS,
  US_EU_CATEGORIES,
  normalizeUrl,
  escapeHtml,
  decodeMojibake,
  slugify,
  isSpamVideoTitle,
  formatCategoryName,
  formatDurationBadge,
  formatCompactViews,
  createBreadcrumbSchema,
  createItemListSchema,
} from '../lib/schema.js';
import {
  getRuntimeIndex,
  getCardsByIds,
  isEnrichedVideoId,
} from '../lib/runtime-store.js';
import { renderPageShell, renderVideoCard } from '../lib/ui-shell.js';
import {
  COMPOUND_BY_SLUG,
  COMPOUNDS_BY_PARENT,
  COMPOUND_HUB_DEFS,
  buildCompoundEditorial,
} from '../lib/taxonomy.js';

let cachedDescriptions = null;
let cachedLocales = null;
const CATEGORY_CACHE = new Map();
const CAT_CACHE_TTL_MS = 30 * 60 * 1000;
const ALLOWED_ORDERS = new Set(['most-popular', 'top-rated', 'latest', 'longest']);
const EU_SET = new Set(EU_LOCALES);
const EU_LOCALIZED_SET = new Set(EU_LOCALIZED_CATEGORIES);
const REGIONAL_ARCHIVE_SET = new Set(REGIONAL_ARCHIVE_HUBS);

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

function buildPaginationHtml(langPrefix, slug, order, currentPage, totalPages, prevLabel, nextLabel) {
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

  const orderSuffix = order !== 'most-popular' ? `&order=${encodeURIComponent(order)}` : '';
  const pageHref = p => {
    if (p <= 1) return order !== 'most-popular' ? `${langPrefix}/c/${slug}?order=${encodeURIComponent(order)}` : `${langPrefix}/c/${slug}`;
    return `${langPrefix}/c/${slug}?page=${p}${orderSuffix}`;
  };

  const parts = [];
  if (currentPage > 1) {
    parts.push(`<a class="lh-page-btn" href="${escapeHtml(pageHref(currentPage - 1))}">${escapeHtml(prevLabel)}</a>`);
  }
  for (const p of pages) {
    if (p === '...') {
      parts.push('<span style="color:var(--text-muted);padding:0 4px;">&hellip;</span>');
    } else {
      parts.push(`<a class="lh-page-btn${p === currentPage ? ' is-active' : ''}" href="${escapeHtml(pageHref(p))}"${p === currentPage ? ' aria-current="page"' : ''}>${p}</a>`);
    }
  }
  if (currentPage < totalPages) {
    parts.push(`<a class="lh-page-btn" href="${escapeHtml(pageHref(currentPage + 1))}">${escapeHtml(nextLabel)}</a>`);
  }
  return `<nav class="lh-pagination" aria-label="Pagination">${parts.join('')}</nav>`;
}

export default async function handler(req, res) {
  const { slug, page: rawPageParam, order: rawOrderParam, lang: rawLangParam } = req.query;
  const normalizedLang = String(rawLangParam || 'en').trim().toLowerCase();
  const lang = EU_SET.has(normalizedLang) ? normalizedLang : 'en';
  const langPrefix = lang === 'en' ? '' : `/${lang}`;

  let decodedSlug = String(slug || '').trim();
  try {
    decodedSlug = decodeURIComponent(decodedSlug);
  } catch {}
  const cleanSlug = slugify(decodedSlug, 60, 'viral');
  const currentPage = Math.max(1, Math.min(100, parseInt(String(rawPageParam || '1'), 10) || 1));
  const order = ALLOWED_ORDERS.has(String(rawOrderParam || '')) ? String(rawOrderParam) : 'most-popular';
  const domain = BASE_URL;

  // Permanent 301 redirect for non-canonical slugs (preserves locale prefix)
  if (slug && String(slug).trim() !== cleanSlug) {
    const targetUrl = normalizeUrl(`${domain}${langPrefix}/c/${cleanSlug}${currentPage > 1 ? `?page=${currentPage}` : ''}`);
    res.statusCode = 301;
    res.setHeader('Location', targetUrl);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.end();
  }

  // Keep 8 regional Indonesian archive hubs strictly on English /c/:slug (301 redirect off European portals)
  if (lang !== 'en' && REGIONAL_ARCHIVE_SET.has(cleanSlug)) {
    const targetUrl = normalizeUrl(`${domain}/c/${cleanSlug}`);
    res.statusCode = 301;
    res.setHeader('Location', targetUrl);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.end();
  }

  const [descriptions, euLocales, index] = await Promise.all([
    getCategoryDescriptions(),
    lang === 'en' ? Promise.resolve({}) : getEuLocales(),
    getRuntimeIndex(),
  ]);
  const localeCfg = lang === 'en' ? null : (euLocales[lang] || null);
  const isCurated = Boolean(descriptions[cleanSlug]);
  const compoundDef = !isCurated ? (COMPOUND_BY_SLUG.get(cleanSlug) || null) : null;
  const compoundVerifiedCount = compoundDef ? Number(index?.compoundCounts?.[cleanSlug] || 0) : 0;
  const isActiveCompound = Boolean(compoundDef && compoundVerifiedCount >= 12);
  const isKnownHub = isCurated || isActiveCompound;

  const englishName = compoundDef?.name || formatCategoryName(cleanSlug);
  const localeCatEntry = localeCfg?.categories?.[cleanSlug] || null;
  const categoryName = localeCatEntry?.name || englishName;
  const queryTerm = compoundDef?.query || cleanSlug.replace(/-/g, ' ');

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
      ? `Watch page ${currentPage} of free ${categoryName} adult videos in full 1080p HD on ${SITE_DOMAIN}. Fast mobile streaming with zero signups.`
      : `Watch the best free ${categoryName} adult videos and trending 4K/HD clips on ${SITE_DOMAIN}. Instant US & EU streaming with zero signups.`);

  const canonicalUrl = normalizeUrl(
    currentPage > 1
      ? `${domain}${langPrefix}/c/${cleanSlug}?page=${currentPage}`
      : `${domain}${langPrefix}/c/${cleanSlug}`
  );

  // Fetch live upstream API videos (cached 30 min in memory)
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
        headers: { 'User-Agent': 'lusthub-bot/3.0 (+https://www.lusthub.my.id/robots.txt)' },
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
      // Upstream timeout — gracefully fallback to sharded index
    }
  }

  // Hybrid Enriched-First Grid (up to 16 verified alive AI-enriched videos dofollow on Page 1;
  // un-enriched live API cards carry rel="nofollow" to protect crawl budget!)
  const cards = [];
  const seenIds = new Set();

  if (isKnownHub && currentPage === 1 && order === 'most-popular') {
    const directIds = (index?.byTag?.[cleanSlug] || []).slice(0, 16);
    const enrichedPicks = await getCardsByIds(directIds);
    for (const v of enrichedPicks) {
      if (!v.title || !v.thumbnail || seenIds.has(v.id)) continue;
      seenIds.add(v.id);
      cards.push({
        id: v.id,
        title: v.title,
        slug: v.slug,
        thumbnail: v.thumbnail,
        duration: v.duration,
        views: v.views,
        date: v.date,
        nofollow: false,
        _isEnriched: true,
      });
    }
  }

  for (const v of liveApiVideos) {
    if (cards.length >= 24) break;
    if (!v || !v.id || seenIds.has(v.id)) continue;
    const title = decodeMojibake(v.title || 'Untitled');
    if (isSpamVideoTitle(title)) continue;
    seenIds.add(v.id);
    const enriched = await isEnrichedVideoId(v.id);
    cards.push({
      id: v.id,
      title,
      slug: slugify(title, 80, v.id),
      thumbnail: v.default_thumb?.src || v.thumbs?.[0]?.src || '/assets/icons/favicon-32x32.png',
      durationText: v.length_min || formatDurationBadge(v.length_sec),
      viewsText: formatCompactViews(v.views),
      date: (v.added || '').slice(0, 10),
      nofollow: !enriched,
      _isEnriched: enriched,
    });
  }

  // Resilient O(1) fallback if upstream Eporner returned 0 results on a curated or compound hub
  if (cards.length === 0 && isKnownHub) {
    const fallbackIds = [...new Set([...(index?.byTag?.[cleanSlug] || []), ...(index?.featured || [])])];
    const start = (currentPage - 1) * 24;
    const picked = await getCardsByIds(fallbackIds.slice(start, start + 24));
    for (const v of picked) {
      cards.push({
        id: v.id,
        title: v.title,
        slug: v.slug,
        thumbnail: v.thumbnail,
        duration: v.duration,
        views: v.views,
        date: v.date,
        nofollow: false,
        _isEnriched: true,
      });
    }
    totalCount = Math.max(totalCount, fallbackIds.length);
    totalPages = Math.max(1, Math.min(100, Math.ceil(totalCount / 24)));
  }

  const hasNoindexParam = Boolean(req.query?.ref || req.query?.q);
  const isIndexable = currentPage === 1 && order === 'most-popular' && !hasNoindexParam && (
    isCurated ||
    (lang === 'en' && (isActiveCompound || cards.length >= 4))
  );
  const robotsValue = isIndexable
    ? 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1'
    : 'noindex, follow';

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

  const enrichedForSchema = cards.filter(c => c._isEnriched);
  const schemaPool = enrichedForSchema.length >= 6 ? enrichedForSchema : cards;
  const itemListSchema = createItemListSchema(
    `${categoryName} ${videosWord}${pageSuffix}`,
    metaDesc,
    schemaPool.slice(0, 24).map(c => ({
      title: c.title,
      url: `/v/${c.id}-${c.slug}`,
      image: c.thumbnail,
    }))
  );
  itemListSchema.inLanguage = lang;

  const schemas = [breadcrumbSchema, collectionSchema, itemListSchema];

  // Editorial, topical silo sub-niches & FAQ on Page 1
  const compoundCountsMap = index?.compoundCounts || {};
  const childSubNiches = (COMPOUNDS_BY_PARENT.get(cleanSlug) || [])
    .filter(c => (compoundCountsMap[c.slug] || 0) >= 12)
    .sort((a, b) => (compoundCountsMap[b.slug] || 0) - (compoundCountsMap[a.slug] || 0))
    .slice(0, 14);

  const siblingCompounds = compoundDef
    ? COMPOUND_HUB_DEFS
        .filter(c => c.slug !== cleanSlug && c.group === compoundDef.group && (compoundCountsMap[c.slug] || 0) >= 12)
        .sort((a, b) => (compoundCountsMap[b.slug] || 0) - (compoundCountsMap[a.slug] || 0))
        .slice(0, 12)
    : [];

  const subNichePillsHtml = isActiveCompound
    ? [
        ...compoundDef.parents.map(p => `<a href="${langPrefix}/c/${escapeHtml(p)}" class="lh-dir-pill" style="border-color:rgba(245,158,11,0.45);color:var(--accent);">${escapeHtml(formatCategoryName(p))} Hub</a>`),
        ...siblingCompounds.map(c => `<a href="/c/${escapeHtml(c.slug)}" class="lh-dir-pill">${escapeHtml(c.name)}</a>`),
      ].join('')
    : childSubNiches.map(c => `<a href="/c/${escapeHtml(c.slug)}" class="lh-dir-pill">${escapeHtml(c.name)} <span style="color:var(--text-muted);font-family:var(--font-mono);font-size:0.72rem;margin-left:3px;">${compoundCountsMap[c.slug]}</span></a>`).join('');

  const crossLinksHtml = US_EU_CATEGORIES
    .filter(s => s !== cleanSlug)
    .slice(0, 16)
    .map(s => {
      const label = localeCfg?.categories?.[s]?.name || formatCategoryName(s);
      return `<a href="${langPrefix}/c/${escapeHtml(s)}" class="lh-dir-pill">${escapeHtml(label)}</a>`;
    })
    .join('');

  let editorialSectionHtml = '';
  if (currentPage === 1) {
    let editorial;
    if (isActiveCompound && !localeCfg) {
      editorial = buildCompoundEditorial(compoundDef, compoundVerifiedCount);
    } else if (localeCfg) {
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
        title: `Free ${categoryName} HD Videos & Curated Archive`,
        paragraphs: [
          `Browse our curated collection of ${categoryName} adult videos on ${SITE_DOMAIN}. Stream live-verified clips daily in 1080p high definition.`,
          `Enjoy fast mobile and desktop streaming with zero account registration or mandatory software downloads.`,
        ],
      };
    }

    const normalizedFaq = Array.isArray(editorial.faq)
      ? editorial.faq.map(f => ({ question: f.question || f.q || '', answer: f.answer || f.a || '' })).filter(f => f.question && f.answer)
      : [];

    let faqGridHtml = '';
    if (normalizedFaq.length > 0) {
      schemas.push({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        'inLanguage': lang,
        'mainEntity': normalizedFaq.map(f => ({
          '@type': 'Question',
          'name': f.question,
          'acceptedAnswer': { '@type': 'Answer', 'text': f.answer },
        })),
      });
      faqGridHtml = `<h3 style="font-family:var(--font-display);font-size:1.05rem;font-weight:700;margin-top:22px;">${escapeHtml(localeCfg?.faqHeading || 'Frequently Asked Questions')}</h3>
          <div class="lh-faq-grid">
            ${normalizedFaq.map(f => `<div class="lh-faq-item"><h3>${escapeHtml(f.question)}</h3><p>${escapeHtml(f.answer)}</p></div>`).join('')}
          </div>`;
    }

    editorialSectionHtml = `
        <section class="lh-section-card">
          <h2>${escapeHtml(editorial.title)}</h2>
          ${editorial.paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('\n          ')}
          <div style="margin-top:16px;">
            <span style="display:block;font-size:0.78rem;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">${escapeHtml(localeCfg?.exploreHubsLabel || 'Explore Related Hubs')}</span>
            <div class="lh-dir-pills">${crossLinksHtml}</div>
          </div>
          ${faqGridHtml}
        </section>`;
  } else {
    editorialSectionHtml = `
        <section class="lh-section-card">
          <h2>${escapeHtml(categoryName)} ${escapeHtml(videosWord)} — ${escapeHtml(pageWord)} ${currentPage} / ${totalPages}</h2>
          <p>${escapeHtml(metaDesc)} <a href="${langPrefix}/c/${escapeHtml(cleanSlug)}" style="color:var(--accent);font-weight:600;">${escapeHtml(localeCfg?.returnPage1Text || 'Return to Page 1')}</a></p>
          <div class="lh-dir-pills" style="margin-top:12px;">${crossLinksHtml}</div>
        </section>`;
  }

  const sortLabels = localeCfg?.sortOptions || {
    'most-popular': 'Most Popular',
    'top-rated': 'Top Rated',
    'latest': 'Latest',
    'longest': 'Longest',
  };
  const sortOptionsHtml = ['most-popular', 'top-rated', 'latest', 'longest'].map(ord => {
    const href = ord === 'most-popular' ? `${langPrefix}/c/${cleanSlug}` : `${langPrefix}/c/${cleanSlug}?order=${ord}`;
    return `<option value="${escapeHtml(href)}"${order === ord ? ' selected' : ''}>${escapeHtml(sortLabels[ord])}</option>`;
  }).join('');

  const heroPrefix = localeCfg?.categoryHeroPrefix || 'Free ';
  const heroSuffix = localeCfg?.categoryHeroSuffix || ' Videos';
  let cardsGridHtml;
  if (cards.length > 0) {
    const firstHalf = cards.slice(0, 12).map((c, idx) => renderVideoCard(c, idx)).join('\n          ');
    const secondHalf = cards.slice(12).map((c, idx) => renderVideoCard(c, idx + 12)).join('\n          ');
    cardsGridHtml = `<div class="lh-grid">${firstHalf}\n          <div class="lh-ad-slot-content ad-space" id="adBannerIngrid" style="grid-column:1 / -1;margin:8px 0;"></div>\n          ${secondHalf}</div>`;
  } else {
    cardsGridHtml = `<div class="lh-empty-box">No videos found for ${escapeHtml(categoryName)}. <a href="${escapeHtml(homeHref)}" style="color:var(--accent);">Explore Featured Videos</a></div>`;
  }

  const paginationHtml = buildPaginationHtml(
    langPrefix,
    cleanSlug,
    order,
    currentPage,
    totalPages,
    localeCfg?.prevLabel || 'Prev',
    localeCfg?.nextLabel || 'Next'
  );

  const relLinks = [];
  if (currentPage > 1) {
    const prevHref = currentPage === 2 ? `${domain}${langPrefix}/c/${cleanSlug}` : `${domain}${langPrefix}/c/${cleanSlug}?page=${currentPage - 1}`;
    relLinks.push(`    <link rel="prev" href="${escapeHtml(prevHref)}">`);
  }
  if (currentPage < totalPages) {
    relLinks.push(`    <link rel="next" href="${escapeHtml(`${domain}${langPrefix}/c/${cleanSlug}?page=${currentPage + 1}`)}">`);
  }

  const bodyHtml = `
        <nav class="lh-breadcrumb" aria-label="Breadcrumb">
          <a href="${escapeHtml(homeHref)}">${escapeHtml(homeLabel)}</a>
          <span>/</span>
          <span style="color:var(--text-secondary);">${escapeHtml(categoryName)}</span>
        </nav>

        <section class="lh-hero-bar">
          <div>
            <h1 class="lh-page-title">${escapeHtml(heroPrefix)}<span>${escapeHtml(categoryName)}</span>${escapeHtml(heroSuffix)}${escapeHtml(pageSuffix)}</h1>
            <p class="lh-page-subtitle">${escapeHtml(metaDesc)}</p>
          </div>
          <div class="lh-stats-row">
            ${totalCount > 0 ? `<span class="lh-stat-chip">${totalCount.toLocaleString('en-US')} ${escapeHtml(videosWord.toLowerCase())}</span>` : ''}
            <span class="lh-stat-chip">${escapeHtml(pageWord)} ${currentPage} / ${totalPages}</span>
            <select class="lh-select" aria-label="Sort videos" onchange="if(this.value)window.location.href=this.value">
              ${sortOptionsHtml}
            </select>
          </div>
        </section>

        <nav class="lh-rail-scroll" aria-label="Related Categories">
          ${US_EU_CATEGORIES.slice(0, 18).map(s => `<a href="${langPrefix}/c/${escapeHtml(s)}" class="lh-cat-pill${s === cleanSlug ? ' is-active' : ''}">${escapeHtml(localeCfg?.categories?.[s]?.name || formatCategoryName(s))}</a>`).join('')}
        </nav>

        ${subNichePillsHtml ? `<section class="lh-subniche-bar" aria-label="Sub-Niches">
          <span class="lh-subniche-label">${escapeHtml(isActiveCompound ? (localeCfg?.relatedNichesLabel || 'Related Niches:') : (localeCfg?.popularNichesPattern ? interpolate(localeCfg.popularNichesPattern, { name: categoryName }) : `Popular ${categoryName} Niches:`))}</span>
          <div class="lh-dir-pills">${subNichePillsHtml}</div>
        </section>` : ''}

        <section aria-label="${escapeHtml(categoryName)} Video Grid">
          ${cardsGridHtml}
        </section>

        ${paginationHtml}
        ${editorialSectionHtml}`;

  const html = renderPageShell({
    lang,
    title: pageTitle,
    description: metaDesc,
    canonicalUrl,
    ogType: 'website',
    ogImage: cards[0]?.thumbnail || `${domain}/assets/icons/og-image.png`,
    robots: robotsValue,
    hreflangPath: (isIndexable && EU_LOCALIZED_SET.has(cleanSlug) && currentPage === 1) ? `/c/${cleanSlug}` : null,
    relLinksHtml: relLinks.join('\n'),
    schemas,
    activeNav: cleanSlug === 'japanese' ? 'jav' : (cleanSlug === 'viral' ? 'trending' : 'categories'),
    navLabels: localeCfg ? {
      home: localeCfg.homeBreadcrumb || 'Home',
      trending: localeCfg.navViral || 'Viral',
      categories: localeCfg.navCategories || 'Categories',
      jav: 'JAV',
      longest: localeCfg.navLongest || 'Full Movies',
      saved: localeCfg.navSaved || 'Saved',
    } : {},
    footerConfig: localeCfg ? {
      tagline: localeCfg.footerTagline,
      disclaimer: localeCfg.footerDisclaimer,
      links: localeCfg.footerLinks,
      showRegionalArchives: false,
    } : {},
    searchPlaceholder: localeCfg?.searchPlaceholder || 'Search videos, categories, JAV codes...',
    showHeaderAd: true,
    showBottomAd: true,
    bodyHtml,
  });

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
