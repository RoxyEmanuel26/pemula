/**
 * lib/ui-shell.js
 * Unified V2.0 Cinema Obsidian SSR Layout Engine for LustHub.
 * Shared across Home (/), Localized Home (/de, /fr, /es, /it...),
 * Category Hubs, Watch Pages, and Discovery Hubs.
 * Preserves 100% of Adsterra Popunder, Social Bar, Banners, Monetag, and RTA compliance.
 */

import {
  BASE_URL,
  SITE_DOMAIN,
  ALL_LOCALES,
  LOCALE_LABELS,
  REGIONAL_ARCHIVE_HUBS,
  escapeHtml,
  formatCategoryName,
  formatDurationBadge,
  formatCompactViews,
  buildLocalizedUrl,
  buildHreflangHtml,
  buildOgLocaleMetaHtml,
  buildLanguageSwitcherHtml,
} from './schema.js';

export const ICONS = {
  play: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  playLg: '<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>',
  home: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  flame: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2c.5 3.5-2 5.5-2 8.5a4 4 0 0 0 8 0c0-2.5-1.5-4.5-2.5-5.5.5 2-1 3-2 3 1-2.5-.5-5-1.5-6z"/><path d="M8.5 14.5A5.5 5.5 0 0 0 12 22a6 6 0 0 0 6-6"/></svg>',
  grid: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  film: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 4v16M17 4v16M2 9h5M17 9h5M2 15h5M17 15h5"/></svg>',
  bookmark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
  globe: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  moon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>',
  sun: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
  eye: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  expand: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/></svg>',
  share: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
};

/**
 * Renders a unified 16:9 Cinema Obsidian video card.
 */
export function renderVideoCard(card, idx = 0) {
  const id = escapeHtml(card.id);
  const title = escapeHtml(card.title || 'Untitled');
  const href = escapeHtml(card.href || `/v/${card.id}-${card.slug || card.id}`);
  const thumb = escapeHtml(card.thumbnail || '/assets/icons/favicon-32x32.png');
  const dur = escapeHtml(card.durationText || formatDurationBadge(card.duration));
  const views = escapeHtml(card.viewsText || formatCompactViews(card.views));
  const date = escapeHtml(String(card.date || '').slice(0, 10));
  const priorityAttr = idx < 4 ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"';
  const relAttr = card.nofollow ? ' rel="nofollow"' : '';
  const badgeLabel = card.badge || (/\b4k\b/i.test(card.title || '') ? '4K' : 'HD');

  return `<article class="lh-card" data-ssr="1" data-video-id="${id}" data-title="${title}" data-href="${href}" data-thumb="${thumb}" data-duration="${dur}">
      <div class="lh-thumb-wrap">
        <a href="${href}"${relAttr} aria-label="${title}">
          <img src="${thumb}" alt="${title}" ${priorityAttr} width="320" height="180">
        </a>
        <div class="lh-thumb-badges-top"><span class="lh-badge-hd">${escapeHtml(badgeLabel)}</span></div>
        ${dur ? `<span class="lh-badge-dur">${dur}</span>` : ''}
        <button type="button" class="lh-save-btn" data-save-id="${id}" aria-label="Save video" aria-pressed="false">${ICONS.bookmark}</button>
      </div>
      <div class="lh-card-body">
        <a href="${href}"${relAttr} class="lh-card-title">${title}</a>
        <div class="lh-card-meta">
          ${views ? `<span class="lh-meta-item">${ICONS.eye} ${views}</span>` : ''}
          ${date ? `<span class="lh-meta-item">${date}</span>` : ''}
        </div>
      </div>
    </article>`;
}

/**
 * Renders the full V2.0 document shell (Head, Sticky Header, Adsterra Header Slot,
 * Main Content, Adsterra Footer/Content Slots, Footer, Mobile Bottom Nav, Deferred JS).
 */
export function renderPageShell(options = {}) {
  const {
    lang = 'en',
    title = `${SITE_DOMAIN} — Free 18+ HD Streaming`,
    description = `Stream trending US, European, and JAV 18+ HD videos free on ${SITE_DOMAIN}.`,
    canonicalUrl = `${BASE_URL}/`,
    ogType = 'website',
    ogImage = `${BASE_URL}/assets/icons/og-image.png`,
    ogExtraMeta = '',
    robots = 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1',
    hreflangPath = null, // '' for home, '/c/slug' for curated hubs, null to omit
    relLinksHtml = '',
    schemas = [],
    activeNav = 'home', // 'home' | 'trending' | 'categories' | 'jav' | 'saved'
    navLabels = {},
    footerConfig = {},
    searchPlaceholder = 'Search videos, categories, JAV codes...',
    showHeaderAd = true,
    showBottomAd = false,
    headExtra = '',
    bodyHtml = '',
  } = options;

  const langPrefix = lang === 'en' ? '' : `/${lang}`;
  const homeHref = lang === 'en' ? '/' : `/${lang}`;
  const currentLangMeta = LOCALE_LABELS[lang] || LOCALE_LABELS.en;
  const isDefaultOgImg = String(ogImage || '').includes('/assets/icons/og-image.png');
  const ogImgW = isDefaultOgImg ? 1200 : 640;
  const ogImgH = isDefaultOgImg ? 630 : 360;

  const labels = {
    home: navLabels.home || 'Home',
    trending: navLabels.trending || 'Trending',
    categories: navLabels.categories || 'Categories',
    jav: navLabels.jav || 'JAV',
    longest: navLabels.longest || 'Full Movies',
    saved: navLabels.saved || 'Saved',
  };

  const fLinks = footerConfig.links || {};
  const footerTagline = footerConfig.tagline || 'High-speed, mobile-first 18+ HD streaming across the US & Europe. Zero signup walls, instant HTML5 playback, RTA compliant.';
  const footerDisclaimer = footerConfig.disclaimer || 'All external media is owned by its respective creators.';
  const showRegionalArchives = footerConfig.showRegionalArchives !== undefined ? footerConfig.showRegionalArchives : (lang === 'en');

  const langOptionsHtml = ALL_LOCALES.map(code => {
    const meta = LOCALE_LABELS[code];
    const targetPath = hreflangPath !== null ? hreflangPath : '';
    const href = buildLocalizedUrl(code, targetPath).replace(BASE_URL, '') || '/';
    const isActive = code === lang;
    return `<a href="${escapeHtml(href)}" hreflang="${escapeHtml(code)}" class="lh-lang-option${isActive ? ' is-active' : ''}"${isActive ? ' aria-current="page"' : ''}><span>${escapeHtml(meta.name)}</span><span class="lh-lang-code">${meta.code}</span></a>`;
  }).join('');

  const hreflangHtml = hreflangPath !== null ? buildHreflangHtml(hreflangPath) : '';
  const ogLocaleHtml = buildOgLocaleMetaHtml(lang);

  const schemaScripts = schemas
    .filter(Boolean)
    .map(s => `    <script type="application/ld+json">${JSON.stringify(s).replace(/</g, '\\u003c')}</script>`)
    .join('\n');

  const regionalLinksHtml = REGIONAL_ARCHIVE_HUBS
    .map(s => `<a href="/c/${escapeHtml(s)}">${escapeHtml(formatCategoryName(s))}</a>`)
    .join(' &middot; ');

  const footerLangSwitcher = buildLanguageSwitcherHtml(lang, hreflangPath !== null ? hreflangPath : '');

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" data-theme="dark" prefix="og: https://ogp.me/ns#">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="content-language" content="${escapeHtml(lang)}">
    <meta name="google-site-verification" content="KqJ4iydBmKwnynnKXW38T5qhAnGlFD5UEpwvauUYnxs">
    <meta name="yandex-verification" content="a25cbe2b4f64ad3a">
    <meta name="monetag" content="c5240c8ad473e704d58388500859e307">
    <meta name="6a97888e-site-verification" content="1cd93613746bd1833ecef2a834e4e8da">
    <meta name="juicyads-site-verification" content="5dc740ce483c4df37680bffdf66261ad">
    <meta name="rating" content="RTA-5042-1996-1400-1577-RTA">
    <meta name="robots" content="${escapeHtml(robots)}">
    <meta name="theme-color" content="#09090b">
    <meta name="format-detection" content="telephone=no">

    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
${canonicalUrl ? `    <link rel="canonical" href="${escapeHtml(canonicalUrl)}">\n` : ''}${hreflangHtml ? `${hreflangHtml}\n` : ''}${relLinksHtml ? `${relLinksHtml}\n` : ''}    <link rel="alternate" type="application/rss+xml" title="${escapeHtml(SITE_DOMAIN)} Latest HD Videos" href="${BASE_URL}/feed.xml">

    <!-- Open Graph -->
${ogLocaleHtml}
    <meta property="og:type" content="${escapeHtml(ogType)}">
    <meta property="og:site_name" content="${escapeHtml(SITE_DOMAIN)}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
${canonicalUrl ? `    <meta property="og:url" content="${escapeHtml(canonicalUrl)}">\n` : ''}    <meta property="og:image" content="${escapeHtml(ogImage)}">
    <meta property="og:image:width" content="${ogImgW}">
    <meta property="og:image:height" content="${ogImgH}">
${ogExtraMeta ? `${ogExtraMeta}\n` : ''}
    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${escapeHtml(ogImage)}">

    <!-- Performance Preconnects -->
    <link rel="preconnect" href="https://static-ca-cdn.eporner.com" crossorigin>
    <link rel="preconnect" href="https://www.eporner.com" crossorigin>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&family=Outfit:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
    <noscript><link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&family=Outfit:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"></noscript>

    <!-- Favicon & PWA -->
    <link rel="apple-touch-icon" sizes="180x180" href="/assets/icons/apple-touch-icon.png">
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/icons/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/assets/icons/favicon-16x16.png">
    <link rel="shortcut icon" href="/favicon.ico">
    <link rel="manifest" href="/assets/icons/site.webmanifest">

    <!-- Unified Cinema Obsidian CSS -->
    <link rel="preload" href="/assets/css/lusthub-v2.css?v=203" as="style" fetchpriority="high">
    <link rel="stylesheet" href="/assets/css/lusthub-v2.css?v=203">

    <!-- Structured Data -->
${schemaScripts}
${headExtra}
    <!-- Analytics Config -->
    <script>window.YANDEX_METRICA_ID='';window.GA4_MEASUREMENT_ID='';</script>

    <!-- Adsterra Popunder (Preserved 100%) -->
    <script data-cfasync="false" src="https://benchform.org/1/c47178ac0d23a0bd87322accefde9fc7"></script>
</head>
<body>
    <header class="lh-header">
      <div class="lh-container lh-header-inner">
        <a href="${escapeHtml(homeHref)}" class="lh-brand" aria-label="LustHub Home">
          <span class="lh-brand-mark">${ICONS.play}</span>
          <span>Lust<span class="lh-brand-accent">Hub</span><span class="lh-brand-domain" style="font-weight:500;font-size:0.75rem;color:var(--text-muted);margin-left:3px;">.my.id</span></span>
        </a>

        <nav class="lh-nav" aria-label="Primary">
          <a href="${escapeHtml(homeHref)}" class="lh-nav-link${activeNav === 'home' ? ' is-active' : ''}">${escapeHtml(labels.home)}</a>
          <a href="/trending" class="lh-nav-link${activeNav === 'trending' ? ' is-active' : ''}">${escapeHtml(labels.trending)}</a>
          <a href="/categories" class="lh-nav-link${activeNav === 'categories' ? ' is-active' : ''}">${escapeHtml(labels.categories)}</a>
          <a href="/jav" class="lh-nav-link${activeNav === 'jav' ? ' is-active' : ''}">${escapeHtml(labels.jav)}</a>
          <a href="/longest" class="lh-nav-link">${escapeHtml(labels.longest)}</a>
          <a href="/saved" class="lh-nav-link${activeNav === 'saved' ? ' is-active' : ''}" data-saved-nav>${escapeHtml(labels.saved)} <span class="lh-badge-count" data-saved-count>0</span></a>
        </nav>

        <div class="lh-search-wrap">
          <form class="lh-search-form" id="lhSearchForm" role="search">
            <span class="lh-search-icon">${ICONS.search}</span>
            <input type="search" id="lhSearchInput" class="lh-search-input" placeholder="${escapeHtml(searchPlaceholder)}" autocomplete="off" aria-label="Search videos and categories">
            <span class="lh-search-kbd">/</span>
          </form>
          <div class="lh-search-dropdown" id="lhSearchDropdown" role="listbox" aria-label="Search suggestions"></div>
        </div>

        <div class="lh-controls">
          <div class="lh-lang-dropdown">
            <button type="button" class="lh-icon-btn" id="lhLangBtn" aria-expanded="false" aria-haspopup="true" aria-label="Select Language">
              ${ICONS.globe}
              <span>${escapeHtml(currentLangMeta.code)}</span>
            </button>
            <div class="lh-lang-menu" id="lhLangMenu" role="menu">
              ${langOptionsHtml}
            </div>
          </div>

          <button type="button" class="lh-icon-btn" data-theme-toggle aria-label="Toggle color theme" title="Toggle Dark/Light Theme">
            <span data-icon-dark>${ICONS.moon}</span>
            <span data-icon-light style="display:none;">${ICONS.sun}</span>
          </button>
        </div>
      </div>
    </header>

    ${showHeaderAd ? `<div class="lh-ad-band">
      <div class="lh-container">
        <div class="lh-ad-slot-header ad-space" id="adBannerHeader"></div>
      </div>
    </div>` : ''}

    <main class="lh-main">
      <div class="lh-container">
${bodyHtml}
${showBottomAd ? `        <div class="lh-ad-slot-content ad-space" id="adBannerContent"></div>` : ''}
      </div>
    </main>

    <footer class="lh-footer">
      <div class="lh-container">
        <div class="lh-footer-top">
          <div>
            <a href="${escapeHtml(homeHref)}" class="lh-brand" style="margin-bottom:8px;">
              <span class="lh-brand-mark">${ICONS.play}</span>
              <span>Lust<span class="lh-brand-accent">Hub</span></span>
            </a>
            <p style="font-size:0.82rem;color:var(--text-muted);max-width:46ch;">${escapeHtml(footerTagline)}</p>
          </div>
          <div style="display:flex;flex-direction:column;gap:12px;align-items:flex-end;">
            ${footerLangSwitcher}
            <nav class="lh-footer-links" aria-label="Footer">
              <a href="/trending">${escapeHtml(fLinks.trending || 'Trending')}</a>
              <a href="/top-rated">${escapeHtml(fLinks.topRated || 'Top Rated')}</a>
              <a href="/longest">${escapeHtml(fLinks.longest || 'Longest')}</a>
              <a href="/jav">${escapeHtml(fLinks.jav || 'JAV Index')}</a>
              <a href="/categories">${escapeHtml(fLinks.categories || 'All Categories')}</a>
              <a href="/about">${escapeHtml(fLinks.about || 'About')}</a>
              <a href="/howto">${escapeHtml(fLinks.howto || 'How to Watch')}</a>
              <a href="/contact">${escapeHtml(fLinks.contact || 'Contact')}</a>
              <a href="/dmca">${escapeHtml(fLinks.dmca || 'DMCA')}</a>
              <a href="/privacy">${escapeHtml(fLinks.privacy || 'Privacy Policy')}</a>
              <a href="/terms">${escapeHtml(fLinks.terms || 'Terms')}</a>
              <a href="/feed.xml">${escapeHtml(fLinks.rss || 'RSS Feed')}</a>
            </nav>
          </div>
        </div>
        ${showRegionalArchives ? `<div class="lh-footer-regional">
          <span>Regional Archives:</span>
          ${regionalLinksHtml}
        </div>` : ''}
        <div class="lh-footer-copy">
          <span>&copy; 2026 ${escapeHtml(SITE_DOMAIN)} &bull; 18+ &bull; RTA-5042-1996-1400-1577-RTA</span>
          <span>${escapeHtml(footerDisclaimer)}</span>
        </div>
      </div>
    </footer>

    <!-- Mobile Bottom Navigation Bar -->
    <nav class="lh-mobile-nav" aria-label="Mobile Navigation">
      <div class="lh-mobile-nav-inner">
        <a href="${escapeHtml(homeHref)}" class="lh-mobile-nav-item${activeNav === 'home' ? ' is-active' : ''}">${ICONS.home}<span>${escapeHtml(labels.home)}</span></a>
        <a href="/trending" class="lh-mobile-nav-item${activeNav === 'trending' ? ' is-active' : ''}">${ICONS.flame}<span>${escapeHtml(labels.trending)}</span></a>
        <a href="/categories" class="lh-mobile-nav-item${activeNav === 'categories' ? ' is-active' : ''}">${ICONS.grid}<span>${escapeHtml(labels.categories)}</span></a>
        <a href="/jav" class="lh-mobile-nav-item${activeNav === 'jav' ? ' is-active' : ''}">${ICONS.film}<span>${escapeHtml(labels.jav)}</span></a>
        <a href="/saved" class="lh-mobile-nav-item${activeNav === 'saved' ? ' is-active' : ''}">${ICONS.bookmark}<span>${escapeHtml(labels.saved)}</span></a>
      </div>
    </nav>

    <!-- Deferred V2.0 Client + Preserved Adsterra & Analytics Scripts -->
    <script src="/assets/js/app-v2.js?v=203" defer></script>
    <script src="/assets/js/ad-manager.min.js?v=203" defer></script>
    <script src="/assets/js/analytics.min.js?v=203" defer></script>
    <!-- Adsterra Social Bar (Preserved 100%) -->
    <script data-cfasync="false" src="https://biomanos.org/14/88d720634f18389c613c9ccab28cea5f"></script>
</body>
</html>`;
}
