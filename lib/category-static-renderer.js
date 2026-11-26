/**
 * lib/category-static-renderer.js
 * Pure static Page-1 pre-renderer for all 72 Core EN hubs, 172 Compound hubs,
 * and 448 Localized EU hubs (692 static HTML files -> 0 Vercel Function Invocations!).
 * Page 2+ and Sort work 100% client-side in app-v2.js directly against Eporner API.
 */

import {
  BASE_URL,
  SITE_DOMAIN,
  EU_LOCALIZED_CATEGORIES,
  US_EU_CATEGORIES,
  normalizeUrl,
  escapeHtml,
  formatCategoryName,
  slugify,
  createBreadcrumbSchema,
  createItemListSchema,
} from './schema.js';
import { renderPageShell, renderVideoCard } from './ui-shell.js';
import {
  COMPOUND_BY_SLUG,
  COMPOUNDS_BY_PARENT,
  COMPOUND_HUB_DEFS,
  buildCompoundEditorial,
} from './taxonomy.js';

const EU_LOCALIZED_SET = new Set(EU_LOCALIZED_CATEGORIES);

function interpolate(pattern, vars) {
  return String(pattern || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

export function renderStaticCategoryPage({
  slug,
  lang = 'en',
  localeCfg = null,
  descriptions = {},
  index = {},
  allCardsById = null,
}) {
  const cleanSlug = slug;
  const langPrefix = lang === 'en' ? '' : `/${lang}`;
  const isCurated = Boolean(descriptions[cleanSlug]);
  const compoundDef = !isCurated ? (COMPOUND_BY_SLUG.get(cleanSlug) || null) : null;
  const compoundVerifiedCount = compoundDef ? Number(index?.compoundCounts?.[cleanSlug] || 0) : 0;
  const isActiveCompound = Boolean(compoundDef && compoundVerifiedCount >= 12);

  const englishName = compoundDef?.name || formatCategoryName(cleanSlug);
  const localeCatEntry = localeCfg?.categories?.[cleanSlug] || null;
  const categoryName = localeCatEntry?.name || englishName;
  const queryTerm = compoundDef?.query || cleanSlug.replace(/-/g, ' ');

  const pageTitle = localeCfg
    ? interpolate(localeCfg.categoryTitlePattern, { name: categoryName, pageSuffix: '' })
    : `Free ${categoryName} HD Videos | LustHub`;

  const metaDesc = localeCfg
    ? interpolate(localeCfg.categoryDescPattern, { name: categoryName })
    : `Watch the best free ${categoryName} adult videos and trending 4K/HD clips on ${SITE_DOMAIN}. Instant US & EU streaming with zero signups.`;

  const canonicalUrl = normalizeUrl(`${BASE_URL}${langPrefix}/c/${cleanSlug}`);

  // Pick up to 24 alive verified AI-enriched videos directly from pre-built index & card map
  const bucketIds = [...(index?.byTag?.[cleanSlug] || [])];
  if (bucketIds.length < 24) {
    for (const fid of (index?.featured || [])) {
      if (bucketIds.length >= 24) break;
      if (!bucketIds.includes(fid)) bucketIds.push(fid);
    }
  }

  const cards = [];
  const seen = new Set();
  for (const id of bucketIds) {
    if (cards.length >= 24) break;
    if (seen.has(id)) continue;
    const raw = (allCardsById && allCardsById.get(id)) || index?.cards?.[id];
    if (!raw || !raw.t || !raw.th) continue;
    seen.add(id);
    cards.push({
      id,
      title: raw.t,
      slug: raw.s || slugify(raw.t, 80, id),
      thumbnail: raw.th,
      duration: Number(raw.du || 0),
      views: Number(raw.vw || 0),
      date: raw.at || '',
      nofollow: false,
    });
  }

  const totalCount = Number(index?.tagCounts?.[cleanSlug] || index?.compoundCounts?.[cleanSlug] || cards.length);
  const homeLabel = localeCfg?.homeBreadcrumb || 'Home';
  const videosWord = localeCfg?.videosWord || 'Videos';
  const homeHref = lang === 'en' ? '/' : `/${lang}`;

  const schemas = [
    createBreadcrumbSchema([
      { name: homeLabel, url: homeHref },
      { name: `${categoryName} ${videosWord}`, url: `${langPrefix}/c/${cleanSlug}` },
    ]),
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      'name': `${categoryName} ${videosWord}`,
      'description': metaDesc,
      'url': canonicalUrl,
      'inLanguage': lang,
    },
    Object.assign(
      createItemListSchema(
        `${categoryName} ${videosWord}`,
        metaDesc,
        cards.map(c => ({ title: c.title, url: `/v/${c.id}-${c.slug}`, image: c.thumbnail }))
      ),
      { inLanguage: lang }
    ),
  ];

  // Sub-niches & topical silo links
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
    .map(s => `<a href="${langPrefix}/c/${escapeHtml(s)}" class="lh-dir-pill">${escapeHtml(localeCfg?.categories?.[s]?.name || formatCategoryName(s))}</a>`)
    .join('');

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
    faqGridHtml = `<h3 style="font-family:var(--font-display);font-size:1.05rem;font-weight:700;margin-top:22px;">${escapeHtml(localeCfg?.faqHeading || 'Frequently Asked Questions')}</h3><div class="lh-faq-grid">${normalizedFaq.map(f => `<div class="lh-faq-item"><h3>${escapeHtml(f.question)}</h3><p>${escapeHtml(f.answer)}</p></div>`).join('')}</div>`;
  }

  const sortLabels = localeCfg?.sortOptions || {
    'most-popular': 'Most Popular',
    'top-rated': 'Top Rated',
    'latest': 'Latest',
    'longest': 'Longest',
  };
  const sortOptionsHtml = ['most-popular', 'top-rated', 'latest', 'longest']
    .map(ord => `<option value="${ord}"${ord === 'most-popular' ? ' selected' : ''}>${escapeHtml(sortLabels[ord])}</option>`)
    .join('');

  const firstHalf = cards.slice(0, 12).map((c, idx) => renderVideoCard(c, idx)).join('');
  const secondHalf = cards.slice(12).map((c, idx) => renderVideoCard(c, idx + 12)).join('');
  const heroPrefix = localeCfg?.categoryHeroPrefix || 'Free ';
  const heroSuffix = localeCfg?.categoryHeroSuffix || ' Videos';
  const loadMoreLabel = localeCfg?.loadMoreLabel || 'Load More HD Videos';

  const bodyHtml = `
        <nav class="lh-breadcrumb" aria-label="Breadcrumb"><a href="${escapeHtml(homeHref)}">${escapeHtml(homeLabel)}</a><span>/</span><span style="color:var(--text-secondary);">${escapeHtml(categoryName)}</span></nav>
        <section class="lh-hero-bar">
          <div>
            <h1 class="lh-page-title">${escapeHtml(heroPrefix)}<span>${escapeHtml(categoryName)}</span>${escapeHtml(heroSuffix)}</h1>
            <p class="lh-page-subtitle">${escapeHtml(metaDesc)}</p>
          </div>
          <div class="lh-stats-row">
            ${totalCount > 0 ? `<span class="lh-stat-chip">${totalCount.toLocaleString('en-US')}+ ${escapeHtml(videosWord.toLowerCase())}</span>` : ''}
            <span class="lh-stat-chip">1080p &amp; 4K</span>
            <select class="lh-select" id="lhCatSortSelect" aria-label="Sort videos">${sortOptionsHtml}</select>
          </div>
        </section>
        <nav class="lh-rail-scroll" aria-label="Related Categories">
          ${US_EU_CATEGORIES.slice(0, 18).map(s => `<a href="${langPrefix}/c/${escapeHtml(s)}" class="lh-cat-pill${s === cleanSlug ? ' is-active' : ''}">${escapeHtml(localeCfg?.categories?.[s]?.name || formatCategoryName(s))}</a>`).join('')}
        </nav>
        ${subNichePillsHtml ? `<section class="lh-subniche-bar" aria-label="Sub-Niches"><span class="lh-subniche-label">${escapeHtml(isActiveCompound ? (localeCfg?.relatedNichesLabel || 'Related Niches:') : (localeCfg?.popularNichesPattern ? interpolate(localeCfg.popularNichesPattern, { name: categoryName }) : `Popular ${categoryName} Niches:`))}</span><div class="lh-dir-pills">${subNichePillsHtml}</div></section>` : ''}
        <section aria-label="${escapeHtml(categoryName)} Video Grid">
          <div class="lh-grid" id="lhCatGrid" data-cat-query="${escapeHtml(queryTerm)}">${firstHalf}<div class="lh-ad-slot-content ad-space" id="adBannerIngrid" style="grid-column:1 / -1;margin:8px 0;"></div>${secondHalf}</div>
          <div style="display:flex;justify-content:center;margin-top:26px;"><button type="button" class="lh-btn lh-btn-primary" id="lhCatLoadMoreBtn">${escapeHtml(loadMoreLabel)}</button></div>
        </section>
        <section class="lh-section-card">
          <h2>${escapeHtml(editorial.title)}</h2>
          ${editorial.paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('')}
          <div style="margin-top:16px;"><span style="display:block;font-size:0.78rem;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">${escapeHtml(localeCfg?.exploreHubsLabel || 'Explore Related Hubs')}</span><div class="lh-dir-pills">${crossLinksHtml}</div></div>
          ${faqGridHtml}
        </section>`;

  return renderPageShell({
    lang,
    title: pageTitle,
    description: metaDesc,
    canonicalUrl,
    ogType: 'website',
    ogImage: cards[0]?.thumbnail || `${BASE_URL}/assets/icons/og-image.png`,
    robots: 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1',
    hreflangPath: EU_LOCALIZED_SET.has(cleanSlug) ? `/c/${cleanSlug}` : null,
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
}
