/**
 * lib/home-renderer.js
 * Shared V2.0 Homepage renderer for static EN index.html AND localized EU portals (/de, /fr, /es, /it...).
 * Reads bounded data/runtime/index.json (O(1) startup) and renders via lib/ui-shell.js.
 */

import {
  BASE_URL,
  SITE_DOMAIN,
  PRIMARY_GLOBAL_CATEGORIES,
  escapeHtml,
  cleanSourceTitle,
  slugify,
  formatCategoryName,
  buildLocalizedUrl,
  createWebSiteSchema,
  createOrganizationSchema,
  createBreadcrumbSchema,
  createItemListSchema,
} from './schema.js';
import { renderPageShell, renderVideoCard } from './ui-shell.js';

const HOME_FEATURED_CATEGORIES = [
  'milf', 'blonde', 'brunette', 'latina', 'ebony', 'amateur', 'pov', 'onlyfans', 'european',
  'british', 'german', 'french', 'spanish', 'italian', 'czech', 'stepmom', 'massage',
  'big-tits', 'big-ass', 'anal', 'hardcore', '4k-uhd', 'pornstar', 'japanese',
];

const DIRECTORY_GROUPS_EN = [
  {
    title: 'US & European Favorites',
    slugs: ['milf', 'blonde', 'brunette', 'latina', 'ebony', 'european', 'british', 'german', 'french', 'spanish', 'italian', 'czech', 'russian', 'redhead', 'petite', 'bbw', 'pawg'],
  },
  {
    title: 'Popular Niches & Fantasies',
    slugs: ['stepmom', 'stepsis', 'amateur', 'pov', 'massage', 'casting', 'squirt', 'deepthroat', 'big-tits', 'big-ass', 'anal', 'double-penetration', 'blowjob', 'handjob', 'cumshot', 'hardcore', 'lesbian', 'threesome', 'group-sex', 'creampie', 'interracial'],
  },
  {
    title: 'Creators, 4K & Lifestyle',
    slugs: ['onlyfans', 'pornstar', 'hotwife', 'cuckold', 'solo', '4k-uhd', 'homemade', 'lingerie', 'cosplay', 'public', 'college', 'live-cam', 'couple', 'mature', 'outdoor', 'celebrity', 'dance', 'hotel'],
  },
  {
    title: 'Asian, JAV & Global Trending',
    slugs: ['japanese', 'asian', 'indian', 'korean', 'viral', 'tiktok-viral', 'hijab', 'student'],
  },
];

const EN_HOME_FAQS = [
  {
    question: 'Can I stream 1080p HD & 4K adult videos free across the US and Europe?',
    answer: `Yes. All curated US, European, and JAV hubs on ${SITE_DOMAIN} stream completely free in 1080p HD and 4K across the United States, UK, Germany, France, Spain, Italy, and worldwide without subscriptions or signup walls.`,
  },
  {
    question: 'Do I need an account to save favorites or watch videos on mobile?',
    answer: 'No registration or app install is required. Bookmark videos directly into your local Saved list and play instantly in Safari, Chrome, Firefox, or Edge.',
  },
  {
    question: 'Is LustHub RTA compliant and updated daily with verified live videos?',
    answer: 'Yes. Every route carries the 18+ RTA-5042-1996-1400-1577-RTA rating alongside twice-daily automated catalog updates and live dead-link pruning.',
  },
];

function pickHomeCards(index, priorityTerms = []) {
  const cardsMap = index?.cards || {};
  const byTag = index?.byTag || {};
  const featured = Array.isArray(index?.featured) ? index.featured : [];
  const picked = [];
  const seen = new Set();

  const tryAdd = (id) => {
    if (!id || seen.has(id)) return false;
    const c = cardsMap[id];
    if (!c || !c.t || !c.th) return false;
    const cleanTitle = cleanSourceTitle(c.t) || c.t;
    seen.add(id);
    picked.push({
      id,
      title: cleanTitle,
      slug: c.s || slugify(cleanTitle, 80, id),
      thumbnail: c.th,
      duration: Number(c.du || 0),
      views: Number(c.vw || 0),
      date: c.at || '',
    });
    return true;
  };

  for (const term of priorityTerms) {
    const bucket = byTag[slugify(term, 40, '')];
    if (!Array.isArray(bucket)) continue;
    for (const id of bucket) {
      if (tryAdd(id) && picked.length >= 24) return picked;
    }
  }

  for (const id of featured) {
    if (tryAdd(id) && picked.length >= 24) return picked;
  }

  for (const id of Object.keys(cardsMap)) {
    if (tryAdd(id) && picked.length >= 24) break;
  }

  return picked;
}

export function renderHomePage({ lang = 'en', localeCfg = null, index, hasNoindexParam = false }) {
  const isEn = lang === 'en' || !localeCfg;
  const langPrefix = isEn ? '' : `/${lang}`;
  const canonicalUrl = buildLocalizedUrl(lang, '');
  const getCatLabel = (slug) => (!isEn && localeCfg?.categories?.[slug]?.name) || formatCategoryName(slug);

  const pageTitle = isEn
    ? `${SITE_DOMAIN} — Free 18+ Adult Gallery & Daily 4K/HD Streaming`
    : localeCfg.homeTitle;
  const pageDesc = isEn
    ? `Stream trending 18+ adult videos, amateur clips, MILF, Blonde, European, OnlyFans, and Japanese JAV releases in 1080p & 4K on ${SITE_DOMAIN}. Fast mobile playback, zero signup.`
    : localeCfg.homeDesc;
  const h1Html = isEn
    ? 'Instant <span>18+ HD</span> Streaming — US, European &amp; JAV Videos'
    : escapeHtml(localeCfg.homeH1);
  const subText = isEn
    ? 'Curated 1080p & 4K adult releases updated twice daily. Zero account walls, instant mobile playback, and live-verified streams.'
    : escapeHtml(localeCfg.homeDirectoryDesc);

  const totalAlive = Number(index?.n || 0);
  const priorityTerms = isEn
    ? ['milf', 'blonde', 'brunette', 'european', 'amateur', 'pov', 'onlyfans']
    : (localeCfg.featuredPriorityTerms || []);

  const cards = pickHomeCards(index, priorityTerms);

  // Featured horizontal category rail
  const catRailHtml = HOME_FEATURED_CATEGORIES
    .map(slug => `<a href="${langPrefix}/c/${escapeHtml(slug)}" class="lh-cat-pill">${escapeHtml(getCatLabel(slug))}</a>`)
    .join('\n          ');

  // Video cards grid with Adsterra mid-grid slot (#adBannerIngrid preserved 100%)
  const firstHalf = cards.slice(0, 12).map((c, idx) => renderVideoCard(c, idx)).join('\n          ');
  const secondHalf = cards.slice(12).map((c, idx) => renderVideoCard(c, idx + 12)).join('\n          ');
  const cardsGridHtml = `${firstHalf}\n          <div class="lh-ad-slot-content ad-space" id="adBannerIngrid" style="grid-column:1 / -1;margin:8px 0;"></div>\n          ${secondHalf}`;

  // Complete international directory (64 primary global hubs — 0 empty Indonesian hubs in main view)
  const renderedSet = new Set();
  const dirGroupsHtml = DIRECTORY_GROUPS_EN.map((grp, idx) => {
    const grpTitle = (!isEn && localeCfg?.dirGroupTitles?.[idx]) || grp.title;
    const pills = grp.slugs
      .filter(s => PRIMARY_GLOBAL_CATEGORIES.includes(s))
      .map(s => {
        renderedSet.add(s);
        return `<a href="${langPrefix}/c/${escapeHtml(s)}" class="lh-dir-pill">${escapeHtml(getCatLabel(s))}</a>`;
      })
      .join('');
    return `<div class="lh-dir-group">
            <h3>${escapeHtml(grpTitle)}</h3>
            <div class="lh-dir-pills">${pills}</div>
          </div>`;
  }).join('\n          ');

  const remainingGlobal = PRIMARY_GLOBAL_CATEGORIES.filter(s => !renderedSet.has(s));
  const extraDirHtml = remainingGlobal.length > 0
    ? `<div class="lh-dir-group">
            <h3>More Categories</h3>
            <div class="lh-dir-pills">${remainingGlobal.map(s => `<a href="${langPrefix}/c/${escapeHtml(s)}" class="lh-dir-pill">${escapeHtml(getCatLabel(s))}</a>`).join('')}</div>
          </div>`
    : '';

  const faqs = isEn ? EN_HOME_FAQS : (localeCfg.homeFaqs || EN_HOME_FAQS);
  const faqHtml = faqs.map(f => `<div class="lh-faq-item">
            <h3>${escapeHtml(f.question)}</h3>
            <p>${escapeHtml(f.answer)}</p>
          </div>`).join('\n          ');

  const dirHeading = isEn
    ? `Browse ${PRIMARY_GLOBAL_CATEGORIES.length} Curated US, European & Global HD Hubs`
    : localeCfg.homeDirectoryTitle;

  const bodyHtml = `
        <section class="lh-hero-bar">
          <div>
            <h1 class="lh-page-title">${h1Html}</h1>
            <p class="lh-page-subtitle">${subText}</p>
          </div>
          <div class="lh-stats-row">
            ${totalAlive > 0 ? `<span class="lh-stat-chip">${totalAlive.toLocaleString('en-US')}+ HD Verified</span>` : ''}
            <span class="lh-stat-chip">1080p &amp; 4K</span>
            <span class="lh-stat-chip">No Signup</span>
          </div>
        </section>

        <nav class="lh-rail-scroll" aria-label="Featured Categories">
          ${catRailHtml}
        </nav>

        <div class="lh-toolbar">
          <div class="lh-filter-tabs" id="lhHomeFilters" role="tablist" aria-label="Quick Filters">
            <button type="button" class="lh-filter-btn is-active" data-ssr-default="1" data-filter-query="all" data-filter-order="top-weekly">${escapeHtml(isEn ? 'Featured' : (localeCfg.navBest || 'Featured'))}</button>
            <button type="button" class="lh-filter-btn" data-filter-query="all" data-filter-order="latest">${escapeHtml(isEn ? 'Latest' : (localeCfg.sortOptions?.latest || 'Latest'))}</button>
            <button type="button" class="lh-filter-btn" data-filter-query="4k" data-filter-order="top-monthly">4K UHD</button>
            <button type="button" class="lh-filter-btn" data-filter-query="all" data-filter-order="longest">${escapeHtml(isEn ? 'Longest' : (localeCfg.sortOptions?.longest || 'Longest'))}</button>
            <button type="button" class="lh-filter-btn" data-filter-query="european" data-filter-order="top-monthly">${escapeHtml(getCatLabel('european'))}</button>
            <button type="button" class="lh-filter-btn" data-filter-query="japanese" data-filter-order="top-monthly">JAV</button>
            <button type="button" class="lh-filter-btn" data-filter-query="onlyfans" data-filter-order="top-monthly">OnlyFans</button>
          </div>
        </div>

        <section aria-label="Featured Videos">
          <div class="lh-grid" id="lhHomeGrid">
            ${cardsGridHtml}
          </div>
          <div style="display:flex;justify-content:center;margin-top:26px;">
            <button type="button" class="lh-btn lh-btn-primary" id="lhLoadMoreBtn">Load More HD Videos</button>
          </div>
        </section>

        <section class="lh-section-card" aria-label="Category Directory and FAQ">
          <h2>${escapeHtml(dirHeading)}</h2>
          <p>${isEn ? 'Direct access to fast-loading, ad-safe 18+ category hubs curated for North America, United Kingdom, Germany, France, Spain, Italy, and global streaming.' : escapeHtml(localeCfg.homeDirectoryDesc)}</p>
          <div class="lh-dir-grid">
            ${dirGroupsHtml}${extraDirHtml}
          </div>
          <div class="lh-faq-grid">
            ${faqHtml}
          </div>
        </section>`;

  // Structured data
  const webSiteSchema = createWebSiteSchema({ lang, url: canonicalUrl, description: pageDesc });
  const orgSchema = createOrganizationSchema();
  const breadcrumbSchema = createBreadcrumbSchema([
    { name: isEn ? 'Home' : (localeCfg.homeBreadcrumb || 'Home'), url: canonicalUrl },
  ]);
  const itemListSchema = createItemListSchema(
    pageTitle,
    pageDesc,
    cards.map(c => ({
      title: c.title,
      url: `/v/${c.id}-${c.slug}`,
      image: c.thumbnail,
    }))
  );
  itemListSchema.inLanguage = lang;

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'inLanguage': lang,
    'mainEntity': faqs.map(f => ({
      '@type': 'Question',
      'name': f.question,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': f.answer,
      },
    })),
  };

  return renderPageShell({
    lang,
    title: pageTitle,
    description: pageDesc,
    canonicalUrl,
    ogType: 'website',
    ogImage: cards[0]?.thumbnail || `${BASE_URL}/assets/icons/og-image.png`,
    robots: hasNoindexParam
      ? 'noindex, follow'
      : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1',
    hreflangPath: hasNoindexParam ? null : '',
    schemas: [webSiteSchema, orgSchema, breadcrumbSchema, itemListSchema, faqSchema],
    activeNav: 'home',
    navLabels: isEn ? {} : {
      home: localeCfg.homeBreadcrumb || 'Home',
      trending: localeCfg.navViral || 'Viral',
      categories: localeCfg.navCategories || 'Categories',
      jav: 'JAV',
      saved: 'Saved',
    },
    searchPlaceholder: isEn ? 'Search videos, categories, JAV codes...' : (localeCfg.searchPlaceholder || 'Search...'),
    showHeaderAd: true,
    showBottomAd: true,
    bodyHtml,
  });
}
