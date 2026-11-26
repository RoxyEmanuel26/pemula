import {
  BASE_URL,
  SITE_DOMAIN,
  PRIMARY_GLOBAL_CATEGORIES,
  US_EU_CATEGORIES,
  escapeHtml,
  formatCategoryName,
  slugify,
  createBreadcrumbSchema,
  createItemListSchema,
} from '../lib/schema.js';
import { getRuntimeIndex, getCardsByIds } from '../lib/runtime-store.js';
import { ICONS, renderPageShell, renderVideoCard } from '../lib/ui-shell.js';
import { COMPOUND_HUB_DEFS, COMPOUND_GROUPS, MIN_COMPOUND_VIDEOS } from '../lib/taxonomy.js';

function renderGridWithMidAd(cards) {
  if (!cards.length) {
    return '<div class="lh-empty-box">No verified HD videos available right now. <a href="/" style="color:var(--accent);">Return Home</a></div>';
  }
  const firstHalf = cards.slice(0, 12).map((c, idx) => renderVideoCard(c, idx)).join('\n          ');
  const secondHalf = cards.slice(12).map((c, idx) => renderVideoCard(c, idx + 12)).join('\n          ');
  return `<div class="lh-grid">
          ${firstHalf}
          <div class="lh-ad-slot-content ad-space" id="adBannerIngrid" style="grid-column:1 / -1;margin:8px 0;"></div>
          ${secondHalf}
        </div>`;
}

function setEdgeHeaders(res, { isIndexable = true, contentType = 'text/html; charset=utf-8', sMaxAge = 86400 } = {}) {
  res.statusCode = 200;
  res.setHeader('Content-Type', contentType);
  if (!isIndexable) {
    res.setHeader('X-Robots-Tag', 'noindex, follow');
  }
  res.setHeader('Rating', 'RTA-5042-1996-1400-1577-RTA');
  res.setHeader('Cache-Control', `public, max-age=300, s-maxage=${sMaxAge}, stale-while-revalidate=604800`);
  res.setHeader('CDN-Cache-Control', `public, s-maxage=${sMaxAge}, stale-while-revalidate=604800`);
  res.setHeader('Vercel-CDN-Cache-Control', `public, s-maxage=${sMaxAge}, stale-while-revalidate=604800`);
}

async function handleSuggest(req, res, index) {
  const rawQ = String(req.query?.q || '').trim();
  const q = rawQ.toLowerCase();
  if (q.length < 2) {
    setEdgeHeaders(res, { isIndexable: false, contentType: 'application/json; charset=utf-8', sMaxAge: 3600 });
    return res.end(JSON.stringify({ q: rawQ, hubs: [], items: [] }));
  }

  const compoundCounts = index?.compoundCounts || {};
  const hubs = [];
  for (const slug of PRIMARY_GLOBAL_CATEGORIES) {
    const label = formatCategoryName(slug);
    if (slug.includes(q) || label.toLowerCase().includes(q)) {
      hubs.push({
        title: label,
        href: `/c/${slug}`,
        badge: `${index?.tagCounts?.[slug] || 'HD'}`,
      });
    }
    if (hubs.length >= 4) break;
  }

  for (const cDef of COMPOUND_HUB_DEFS) {
    const cnt = compoundCounts[cDef.slug] || 0;
    if (cnt < MIN_COMPOUND_VIDEOS) continue;
    if (cDef.slug.includes(q) || cDef.name.toLowerCase().includes(q)) {
      hubs.push({
        title: cDef.name,
        href: `/c/${cDef.slug}`,
        badge: `${cnt}`,
      });
    }
    if (hubs.length >= 8) break;
  }

  const items = [];
  const qCompact = q.replace(/[-\s]+/g, '');
  const cardsObj = index?.cards || {};
  for (const [id, c] of Object.entries(cardsObj)) {
    const tLow = String(c.t || '').toLowerCase();
    const tCompact = tLow.replace(/[-\s]+/g, '');
    if (tLow.includes(q) || (qCompact.length >= 4 && tCompact.includes(qCompact)) || (Array.isArray(c.tg) && c.tg.some(t => t.includes(q)))) {
      items.push({
        id,
        title: c.t,
        href: `/v/${id}-${c.s || slugify(c.t, 80, id)}`,
        badge: /\b4k\b/i.test(c.t) ? '4K' : 'HD',
      });
      if (items.length >= 8) break;
    }
  }

  setEdgeHeaders(res, { isIndexable: false, contentType: 'application/json; charset=utf-8', sMaxAge: 3600 });
  return res.end(JSON.stringify({ q: rawQ, hubs: hubs.slice(0, 6), items }));
}

async function renderCollectionView({
  view,
  pathUrl,
  title,
  h1Html,
  subtitle,
  description,
  activeNav,
  ids,
  index,
  extraBannerHtml = '',
  editorialTitle,
  editorialParagraphs,
  faqs = [],
}) {
  const canonicalUrl = `${BASE_URL}${pathUrl}`;
  const pickedCards = await getCardsByIds(ids.slice(0, 36));
  const cards = pickedCards.map(c => ({ ...c, nofollow: false }));

  const schemas = [
    createBreadcrumbSchema([{ name: 'Home', url: '/' }, { name: title.split(' | ')[0], url: pathUrl }]),
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      'name': title.split(' | ')[0],
      'description': description,
      'url': canonicalUrl,
      'inLanguage': 'en',
    },
    createItemListSchema(
      title.split(' | ')[0],
      description,
      cards.slice(0, 24).map(c => ({ title: c.title, url: `/v/${c.id}-${c.slug}`, image: c.thumbnail }))
    ),
  ];

  let faqHtml = '';
  if (faqs.length > 0) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      'inLanguage': 'en',
      'mainEntity': faqs.map(f => ({
        '@type': 'Question',
        'name': f.question,
        'acceptedAnswer': { '@type': 'Answer', 'text': f.answer },
      })),
    });
    faqHtml = `<div class="lh-faq-grid">
          ${faqs.map(f => `<div class="lh-faq-item"><h3>${escapeHtml(f.question)}</h3><p>${escapeHtml(f.answer)}</p></div>`).join('\n          ')}
        </div>`;
  }

  const discoveryPills = [
    { href: '/trending', label: 'Trending Now', key: 'trending' },
    { href: '/top-rated', label: 'Top Rated', key: 'top-rated' },
    { href: '/longest', label: 'Longest 20m+ Movies', key: 'longest' },
    { href: '/jav', label: 'JAV Code Index', key: 'jav' },
    { href: '/categories', label: 'All Categories', key: 'categories' },
    { href: '/c/4k-uhd', label: '4K UHD', key: '4k' },
    { href: '/c/european', label: 'European', key: 'eu' },
    { href: '/c/onlyfans', label: 'OnlyFans', key: 'of' },
  ];

  const bodyHtml = `
        <nav class="lh-breadcrumb" aria-label="Breadcrumb">
          <a href="/">Home</a>
          <span>/</span>
          <span style="color:var(--text-secondary);">${escapeHtml(title.split(' | ')[0])}</span>
        </nav>

        <section class="lh-hero-bar">
          <div>
            <h1 class="lh-page-title">${h1Html}</h1>
            <p class="lh-page-subtitle">${escapeHtml(subtitle)}</p>
          </div>
          <div class="lh-stats-row">
            <span class="lh-stat-chip">${ids.length.toLocaleString('en-US')} Verified HD</span>
            <span class="lh-stat-chip">1080p &amp; 4K</span>
            <span class="lh-stat-chip">Zero Signup</span>
          </div>
        </section>

        <nav class="lh-rail-scroll" aria-label="Discovery Hubs">
          ${discoveryPills.map(p => `<a href="${p.href}" class="lh-cat-pill${p.key === view ? ' is-active' : ''}">${escapeHtml(p.label)}</a>`).join('')}
        </nav>

        ${extraBannerHtml}

        <section aria-label="${escapeHtml(title.split(' | ')[0])} Video Grid">
          ${renderGridWithMidAd(cards)}
        </section>

        <section class="lh-section-card">
          <h2>${escapeHtml(editorialTitle)}</h2>
          ${editorialParagraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('\n          ')}
          <div style="margin-top:16px;">
            <span style="display:block;font-size:0.78rem;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Top US &amp; European Hubs</span>
            <div class="lh-dir-pills">
              ${US_EU_CATEGORIES.slice(0, 18).map(s => `<a href="/c/${escapeHtml(s)}" class="lh-dir-pill">${escapeHtml(formatCategoryName(s))}</a>`).join('')}
            </div>
          </div>
          ${faqHtml}
        </section>`;

  return renderPageShell({
    lang: 'en',
    title,
    description,
    canonicalUrl,
    ogImage: cards[0]?.thumbnail || `${BASE_URL}/assets/icons/og-image.png`,
    schemas,
    activeNav,
    showHeaderAd: true,
    showBottomAd: true,
    bodyHtml,
  });
}

async function renderCategoriesDirectory(index) {
  const canonicalUrl = `${BASE_URL}/categories`;
  const tagCounts = index?.tagCounts || {};
  const compoundCounts = index?.compoundCounts || {};
  const hubThumbs = index?.hubThumbs || {};

  const coreTilesHtml = PRIMARY_GLOBAL_CATEGORIES.map((slug, idx) => {
    const label = formatCategoryName(slug);
    const cnt = Number(tagCounts[slug] || 0);
    const thumb = hubThumbs[slug] || '/assets/icons/og-image.png';
    const loadAttr = idx < 8 ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"';
    return `<a href="/c/${escapeHtml(slug)}" class="lh-cat-tile">
            <img src="${escapeHtml(thumb)}" alt="${escapeHtml(label)} HD videos" ${loadAttr} width="320" height="180">
            <div class="lh-cat-tile-overlay">
              <span class="lh-cat-tile-title">${escapeHtml(label)}</span>
              ${cnt > 0 ? `<span class="lh-cat-tile-count">${cnt.toLocaleString('en-US')}</span>` : ''}
            </div>
          </a>`;
  }).join('\n          ');

  const activeCompounds = COMPOUND_HUB_DEFS
    .filter(c => (compoundCounts[c.slug] || 0) >= MIN_COMPOUND_VIDEOS)
    .sort((a, b) => (compoundCounts[b.slug] || 0) - (compoundCounts[a.slug] || 0));

  const groupKeys = Object.keys(COMPOUND_GROUPS);
  const compoundGroupsHtml = groupKeys.map(gk => {
    const items = activeCompounds.filter(c => c.group === gk);
    if (!items.length) return '';
    return `<div class="lh-dir-group">
            <h3>${escapeHtml(COMPOUND_GROUPS[gk])} (${items.length})</h3>
            <div class="lh-dir-pills">
              ${items.map(c => `<a href="/c/${escapeHtml(c.slug)}" class="lh-dir-pill">${escapeHtml(c.name)} <span style="color:var(--text-muted);font-family:var(--font-mono);font-size:0.72rem;margin-left:3px;">${compoundCounts[c.slug]}</span></a>`).join('')}
            </div>
          </div>`;
  }).filter(Boolean).join('\n          ');

  const totalHubs = PRIMARY_GLOBAL_CATEGORIES.length + activeCompounds.length;
  const title = `All ${totalHubs}+ 18+ HD Categories & Long-Tail Niches | LustHub`;
  const description = `Browse ${PRIMARY_GLOBAL_CATEGORIES.length} core US & European 18+ HD hubs plus ${activeCompounds.length} curated long-tail niches (4K, German, French, Czech, JAV, MILF, Amateur) on ${SITE_DOMAIN}.`;

  const schemas = [
    createBreadcrumbSchema([{ name: 'Home', url: '/' }, { name: 'All Categories', url: '/categories' }]),
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      'name': `All ${totalHubs}+ HD Categories`,
      'description': description,
      'url': canonicalUrl,
      'inLanguage': 'en',
    },
    createItemListSchema(
      'Core 18+ HD Categories',
      description,
      PRIMARY_GLOBAL_CATEGORIES.slice(0, 24).map(s => ({
        title: `${formatCategoryName(s)} Videos`,
        url: `/c/${s}`,
        image: hubThumbs[s] || `${BASE_URL}/assets/icons/og-image.png`,
      }))
    ),
  ];

  const bodyHtml = `
        <nav class="lh-breadcrumb" aria-label="Breadcrumb">
          <a href="/">Home</a>
          <span>/</span>
          <span style="color:var(--text-secondary);">All Categories</span>
        </nav>

        <section class="lh-hero-bar">
          <div>
            <h1 class="lh-page-title">All <span>${totalHubs}+</span> US, European &amp; JAV HD Hubs</h1>
            <p class="lh-page-subtitle">Direct visual gateway to every verified category and high-intent long-tail niche on ${escapeHtml(SITE_DOMAIN)}.</p>
          </div>
          <div class="lh-stats-row">
            <span class="lh-stat-chip">${PRIMARY_GLOBAL_CATEGORIES.length} Core Hubs</span>
            <span class="lh-stat-chip">${activeCompounds.length} Long-Tail Niches</span>
            <span class="lh-stat-chip">${Number(index?.n || 0).toLocaleString('en-US')}+ Videos</span>
          </div>
        </section>

        <section aria-label="Core Category Visual Directory">
          <div class="lh-cat-grid">
            ${coreTilesHtml}
          </div>
        </section>

        <div class="lh-ad-slot-content ad-space" id="adBannerIngrid" style="margin:24px 0;"></div>

        <section class="lh-section-card" aria-label="Curated Long-Tail Niche Index">
          <h2>${activeCompounds.length} Verified Long-Tail Compound Hubs</h2>
          <p>Every long-tail niche below is backed by at least ${MIN_COMPOUND_VIDEOS} live-verified 1080p/4K streams and refreshed twice daily across North American, European, and Japanese catalogs.</p>
          <div class="lh-dir-grid" style="margin-top:16px;">
            ${compoundGroupsHtml}
          </div>
        </section>`;

  return renderPageShell({
    lang: 'en',
    title,
    description,
    canonicalUrl,
    schemas,
    activeNav: 'categories',
    showHeaderAd: true,
    showBottomAd: true,
    bodyHtml,
  });
}

function renderSavedView() {
  const canonicalUrl = `${BASE_URL}/saved`;
  const bodyHtml = `
        <nav class="lh-breadcrumb" aria-label="Breadcrumb">
          <a href="/">Home</a>
          <span>/</span>
          <span style="color:var(--text-secondary);">Saved &amp; History</span>
        </nav>

        <section class="lh-hero-bar">
          <div>
            <h1 class="lh-page-title">Your <span>Saved</span> Videos &amp; Watch History</h1>
            <p class="lh-page-subtitle">100% private &amp; local to your browser — zero accounts, zero cloud tracking, instant one-tap resume.</p>
          </div>
          <div class="lh-stats-row">
            <button type="button" class="lh-btn lh-btn-ghost" id="lhClearSavedBtn">Clear Active List</button>
          </div>
        </section>

        <div class="lh-toolbar">
          <div class="lh-filter-tabs" id="lhSavedTabs" role="tablist">
            <button type="button" class="lh-filter-btn is-active" data-saved-tab="favorites">Saved Favorites (<span data-saved-count>0</span>)</button>
            <button type="button" class="lh-filter-btn" data-saved-tab="history">Watch History (<span data-history-count>0</span>)</button>
          </div>
        </div>

        <section aria-label="Saved Videos">
          <div class="lh-grid" id="lhSavedGrid">
            <div class="lh-empty-box" style="grid-column:1/-1;">Loading your private browser bookmarks...</div>
          </div>
        </section>

        <div class="lh-ad-slot-content ad-space" id="adBannerIngrid" style="margin:24px 0;"></div>`;

  return renderPageShell({
    lang: 'en',
    title: 'Saved Favorites & Watch History | LustHub',
    description: 'Access your private browser-stored Favorites and Watch History on LustHub with zero registration.',
    canonicalUrl,
    robots: 'noindex, follow',
    schemas: [createBreadcrumbSchema([{ name: 'Home', url: '/' }, { name: 'Saved', url: '/saved' }])],
    activeNav: 'saved',
    showHeaderAd: true,
    showBottomAd: true,
    bodyHtml,
  });
}

export default async function handler(req, res) {
  const view = String(req.query?.view || 'trending').trim().toLowerCase();
  const index = await getRuntimeIndex();

  if (view === 'suggest') {
    return handleSuggest(req, res, index);
  }

  if (view === 'saved') {
    const html = renderSavedView();
    setEdgeHeaders(res, { isIndexable: false, sMaxAge: 86400 });
    return res.end(html);
  }

  if (view === 'categories') {
    const html = await renderCategoriesDirectory(index);
    setEdgeHeaders(res, { isIndexable: true, sMaxAge: 86400 });
    return res.end(html);
  }

  if (view === 'jav') {
    const javIds = Array.isArray(index?.javIds) && index.javIds.length > 0
      ? index.javIds
      : (index?.byTag?.japanese || []);
    const prefixes = Array.isArray(index?.javPrefixes) ? index.javPrefixes : [];
    const studioBarHtml = prefixes.length > 0
      ? `<section class="lh-subniche-bar" aria-label="JAV Studio Codes">
          <span class="lh-subniche-label">JAV Studio Codes &amp; Sub-Hubs:</span>
          <div class="lh-dir-pills">
            <a href="/c/english-sub-jav" class="lh-dir-pill" style="border-color:rgba(245,158,11,0.45);color:var(--accent);">English Sub JAV</a>
            <a href="/c/uncensored-jav" class="lh-dir-pill" style="border-color:rgba(245,158,11,0.45);color:var(--accent);">Uncensored JAV</a>
            <a href="/c/japanese-milf" class="lh-dir-pill">Japanese MILF</a>
            <a href="/c/japanese-creampie" class="lh-dir-pill">Japanese Creampie</a>
            <a href="/c/japanese-big-tits" class="lh-dir-pill">Japanese Big Tits</a>
            ${prefixes.slice(0, 18).map(p => `<a href="/c/${escapeHtml(p.prefix.toLowerCase())}" class="lh-dir-pill" style="font-family:var(--font-mono);">${escapeHtml(p.prefix)} <span style="color:var(--text-muted);font-size:0.7rem;">${p.count}</span></a>`).join('')}
          </div>
        </section>`
      : '';

    const html = await renderCollectionView({
      view: 'jav',
      pathUrl: '/jav',
      title: 'JAV Code Index — Uncensored & Eng Sub HD Videos | LustHub',
      h1Html: 'Japanese <span>JAV</span> Code Index — Uncensored &amp; English Sub HD',
      subtitle: 'Direct index of verified Japanese JAV releases by studio code (SSIS, SONE, START, IPZZ, MIDV, JUR, FC2), English subtitles, and uncensored HD streams.',
      description: `Browse ${javIds.length}+ verified Japanese JAV releases by studio code, English subtitles, and uncensored 1080p HD streams on ${SITE_DOMAIN}.`,
      activeNav: 'jav',
      ids: javIds,
      index,
      extraBannerHtml: studioBarHtml,
      editorialTitle: 'Japanese JAV Studio Code Directory & Instant HD Streaming',
      editorialParagraphs: [
        `The ${SITE_DOMAIN} JAV Index organizes high-demand Japanese adult releases by official studio prefix codes alongside dedicated English Subtitled, Uncensored, Japanese MILF, and Creampie sub-hubs.`,
        `Every JAV watch page preserves exact release codes in titles and structured metadata so viewers searching specific studio series across the US, Europe, and Asia find live-verified streams immediately.`,
      ],
      faqs: [
        {
          question: 'How do I search for a specific JAV code on LustHub?',
          answer: 'Type any JAV studio code (such as SSIS-123, START-284, or SONE-101) directly into the top Command Search bar or tap a studio prefix above.',
        },
        {
          question: 'Are English Subtitled and Uncensored JAV videos free to watch?',
          answer: `Yes. All Japanese JAV releases on ${SITE_DOMAIN} stream free in adaptive 1080p HD on mobile and desktop without accounts.`,
        },
      ],
    });
    setEdgeHeaders(res, { isIndexable: true, sMaxAge: 86400 });
    return res.end(html);
  }

  if (view === 'top-rated') {
    const ids = Array.isArray(index?.topViewed) && index.topViewed.length > 0 ? index.topViewed : (index?.featured || []);
    const html = await renderCollectionView({
      view: 'top-rated',
      pathUrl: '/top-rated',
      title: 'Top Rated & Most Viewed 18+ HD Videos | LustHub',
      h1Html: '<span>Top Rated</span> &amp; Most Viewed 18+ HD Videos',
      subtitle: 'The highest-viewed US, European, and global 1080p/4K adult releases ranked by verified community engagement.',
      description: `Stream the highest-viewed and top-rated 18+ HD & 4K adult videos on ${SITE_DOMAIN}. Updated twice daily for US & European viewers with zero signup.`,
      activeNav: 'trending',
      ids,
      index,
      editorialTitle: 'Highest-Rated Free 1080p & 4K Adult Streams',
      editorialParagraphs: [
        `This leaderboard ranks the most watched US, UK, German, French, Spanish, Italian, and international HD scenes on ${SITE_DOMAIN}.`,
        `Unlike unverified aggregators filled with broken embeds, every single video on Top Rated is live-verified and refreshed twice daily for instant playback.`,
      ],
    });
    setEdgeHeaders(res, { isIndexable: true, sMaxAge: 86400 });
    return res.end(html);
  }

  if (view === 'longest') {
    const ids = Array.isArray(index?.longest) && index.longest.length > 0 ? index.longest : (index?.featured || []);
    const html = await renderCollectionView({
      view: 'longest',
      pathUrl: '/longest',
      title: 'Longest Full-Length 18+ HD Movies (20+ Min) | LustHub',
      h1Html: '<span>Longest</span> Full-Length 18+ HD Movies (20+ Min)',
      subtitle: 'Uninterrupted full-length 20-minute to 2-hour+ HD adult movies and extended compilation scenes — zero teaser cuts.',
      description: `Watch free full-length 20+ minute 18+ HD adult movies and extended uncut releases on ${SITE_DOMAIN}. Fast US & EU streaming with zero signups.`,
      activeNav: 'trending',
      ids,
      index,
      editorialTitle: 'Full-Length Uncut HD Adult Movies Without Paywalls',
      editorialParagraphs: [
        `Tired of 3-minute preview clips? Our Longest Movies collection filters exclusively for full-length 20+ minute scenes, extended studio productions, and complete European & Japanese features.`,
        `Switch on Cinema Theater Mode (press T on desktop) for distraction-free widescreen playback and save long movies locally to resume anytime.`,
      ],
    });
    setEdgeHeaders(res, { isIndexable: true, sMaxAge: 86400 });
    return res.end(html);
  }

  // Default: /trending
  const ids = Array.isArray(index?.featured) ? index.featured : [];
  const html = await renderCollectionView({
    view: 'trending',
    pathUrl: '/trending',
    title: 'Trending 18+ HD & 4K Videos Right Now | LustHub',
    h1Html: '<span>Trending</span> 18+ HD &amp; 4K Videos Right Now',
    subtitle: 'Today’s fastest-rising US, European, OnlyFans, Amateur, MILF, and 4K UHD releases — live-verified and ready for instant playback.',
    description: `Watch today's trending free 18+ HD & 4K adult videos across the United States and Europe on ${SITE_DOMAIN}. Updated twice daily with zero registration.`,
    activeNav: 'trending',
    ids,
    index,
    editorialTitle: 'Daily Trending US & European HD Releases',
    editorialParagraphs: [
      `Updated automatically every 12 hours, our Trending chart surfaces the cleanest, highest-definition uploads across North America and Europe — spanning MILF, Amateur, POV, 4K UHD, European, and Japanese JAV niches.`,
      `Bookmark favorite scenes locally with one tap (zero account needed) and explore 230+ dedicated core and long-tail category hubs from our visual directory.`,
    ],
  });
  setEdgeHeaders(res, { isIndexable: true, sMaxAge: 86400 });
  return res.end(html);
}
