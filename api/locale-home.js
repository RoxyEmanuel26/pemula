import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BASE_URL,
  EU_LOCALES,
  CURATED_CATEGORIES,
  normalizeUrl,
  escapeHtml,
  decodeMojibake,
  cleanSourceTitle,
  slugify,
  expandRuntimeVideo,
  formatCategoryName,
  buildHreflangHtml,
  buildOgLocaleMetaHtml,
  buildLanguageSwitcherHtml,
  createWebSiteSchema,
  createItemListSchema,
} from './schema-helper.js';

const SUPPORTED_SET = new Set(EU_LOCALES);

const HOME_FEATURED_CATEGORIES = [
  'milf', 'blonde', 'brunette', 'latina', 'ebony', 'amateur', 'pov', 'onlyfans', 'european',
  'british', 'german', 'french', 'spanish', 'italian', 'czech', 'stepmom', 'massage',
  'big-tits', 'big-ass', 'anal', 'hardcore', '4k-uhd', 'pornstar', 'japanese',
];

const DIRECTORY_GROUPS = [
  ['milf', 'blonde', 'brunette', 'latina', 'ebony', 'european', 'british', 'german', 'french', 'spanish', 'italian', 'czech', 'russian', 'redhead', 'petite', 'bbw', 'pawg'],
  ['stepmom', 'stepsis', 'amateur', 'pov', 'massage', 'casting', 'squirt', 'deepthroat', 'big-tits', 'big-ass', 'anal', 'double-penetration', 'blowjob', 'handjob', 'cumshot', 'hardcore', 'lesbian', 'threesome', 'group-sex', 'creampie', 'interracial'],
  ['onlyfans', 'pornstar', 'hotwife', 'cuckold', 'solo', '4k-uhd', 'homemade', 'lingerie', 'cosplay', 'public', 'college', 'live-cam', 'couple', 'mature', 'outdoor', 'celebrity', 'dance', 'hotel'],
  ['japanese', 'asian', 'indian', 'korean', 'viral', 'tiktok-viral', 'hijab', 'student', 'indonesia', 'bokep-indo', 'mahasiswi', 'pasutri', 'rumahan', 'artis-indo', 'pantai', 'hot-indo'],
];

let cachedIndexTemplate = null;
let cached404 = null;
let cachedLocales = null;
let cachedRuntime = null;

async function getAssets() {
  if (!cachedIndexTemplate) {
    cachedIndexTemplate = await readFile(path.join(process.cwd(), 'index.html'), 'utf8');
  }
  if (!cachedLocales) {
    const raw = await readFile(path.join(process.cwd(), 'data', 'eu-locales.json'), 'utf8');
    cachedLocales = JSON.parse(raw);
  }
  if (!cachedRuntime) {
    try {
      const raw = await readFile(path.join(process.cwd(), 'data', 'enriched-runtime.json'), 'utf8');
      cachedRuntime = JSON.parse(raw);
    } catch {
      try {
        const raw = await readFile(path.join(process.cwd(), 'data', 'enriched-videos.json'), 'utf8');
        cachedRuntime = JSON.parse(raw);
      } catch {
        cachedRuntime = { videos: {}, byTag: {}, featured: [] };
      }
    }
  }
  return { template: cachedIndexTemplate, locales: cachedLocales, runtime: cachedRuntime };
}

function replaceBetweenMarkers(html, markerName, innerContent) {
  const startMarker = `<!-- SSR:${markerName}:START -->`;
  const endMarker = `<!-- SSR:${markerName}:END -->`;
  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return html;
  return `${html.slice(0, startIdx + startMarker.length)}\n${innerContent}\n${html.slice(endIdx)}`;
}

function formatDurationBadge(sec) {
  const s = Number(sec || 0);
  if (!Number.isFinite(s) || s <= 0) return '';
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function pickLocaleCards(runtime, priorityTerms = []) {
  const videosMap = runtime?.videos || {};
  const byTag = runtime?.byTag || {};
  const featured = Array.isArray(runtime?.featured) ? runtime.featured : [];
  const picked = [];
  const seen = new Set();

  // 1. Prioritize local-country / EU priority buckets (e.g. german -> european -> milf for /de)
  for (const term of priorityTerms) {
    const key = slugify(term, 40, '');
    const bucket = byTag[key];
    if (!Array.isArray(bucket)) continue;
    for (const vid of bucket) {
      if (seen.has(vid)) continue;
      const v = expandRuntimeVideo(videosMap[vid]);
      if (!v || !v.title || !v.thumbnail) continue;
      seen.add(vid);
      picked.push(v);
      if (picked.length >= 24) return picked;
    }
  }

  // 2. Fill remaining slots from global US/EU featured pool
  for (const vid of featured) {
    if (seen.has(vid)) continue;
    const v = expandRuntimeVideo(videosMap[vid]);
    if (!v || !v.title || !v.thumbnail) continue;
    seen.add(vid);
    picked.push(v);
    if (picked.length >= 24) return picked;
  }

  // 3. Safety fallback across runtime videos map
  for (const raw of Object.values(videosMap)) {
    const v = expandRuntimeVideo(raw);
    if (!v || seen.has(v.video_id) || !v.title || !v.thumbnail) continue;
    seen.add(v.video_id);
    picked.push(v);
    if (picked.length >= 24) break;
  }

  return picked;
}

export default async function handler(req, res) {
  const lang = String(req.query?.lang || '').trim().toLowerCase();
  if (!SUPPORTED_SET.has(lang)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!cached404) {
      cached404 = await readFile(path.join(process.cwd(), '404.html'), 'utf8');
    }
    return res.end(cached404);
  }

  const { template, locales, runtime } = await getAssets();
  const cfg = locales[lang];
  const canonicalUrl = normalizeUrl(`${BASE_URL}/${lang}`);
  const hasNoindexParam = Boolean(req.query?.q || req.query?.page || req.query?.ref || req.query?.order);
  const robotsValue = hasNoindexParam
    ? 'noindex, follow'
    : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';

  const getCatLabel = (slug) => cfg.categories?.[slug]?.name || formatCategoryName(slug);

  // Featured top category pills (localized links -> /{lang}/c/{slug})
  const categoryPillsHtml = HOME_FEATURED_CATEGORIES
    .map(slug => `                <a href="/${lang}/c/${escapeHtml(slug)}" class="ssr-cat-pill">${escapeHtml(getCatLabel(slug))}</a>`)
    .join('\n');

  // Top 24 curated SSR cards
  const cards = pickLocaleCards(runtime, cfg.featuredPriorityTerms);
  const cardsHtml = cards.map((v, idx) => {
    const title = cleanSourceTitle(v.title) || decodeMojibake(v.title || 'Untitled');
    const safeTitle = escapeHtml(title);
    const vSlug = v.slug || slugify(title, 80, v.video_id);
    const href = `/v/${v.video_id}-${vSlug}`;
    const thumb = normalizeUrl(v.thumbnail || '/assets/icons/favicon-32x32.png');
    const dur = formatDurationBadge(v.duration);
    const viewsStr = (Number(v.views) || 0).toLocaleString('en-US');
    const dateStr = String(v.generated_at || '').slice(0, 10);
    const priorityAttrs = idx < 4 ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"';
    const tagsCsv = Array.isArray(v.tags) ? v.tags.slice(0, 4).join(',') : '';

    return `                <a href="${href}" class="card" data-ssr="1" data-index="${idx}" data-video-id="${escapeHtml(v.video_id)}" data-embed="${escapeHtml(`https://www.eporner.com/embed/${v.video_id}/`)}" data-title="${safeTitle}" data-duration="${escapeHtml(dur)}" data-duration-sec="${Number(v.duration) || 0}" data-views="${escapeHtml(viewsStr)}" data-date="${escapeHtml(dateStr)}" data-keywords="${escapeHtml(tagsCsv)}" aria-label="${safeTitle}">
                    <div class="card-img-wrapper">
                        <div class="blur-overlay" style="background-image: url('${escapeHtml(thumb)}');"></div>
                        ${dur ? `<span class="badge-duration">${escapeHtml(dur)}</span>` : ''}
                        <img src="${escapeHtml(thumb)}" alt="${safeTitle}" ${priorityAttrs} width="320" height="180" class="loaded">
                    </div>
                    <div class="card-meta">
                        <div class="card-date-views">
                            <span>📅 ${escapeHtml(dateStr)}</span>
                            <span class="card-views" data-views="${escapeHtml(viewsStr)}">👁 ${escapeHtml(viewsStr)}</span>
                        </div>
                        <div class="card-title">${safeTitle}</div>
                    </div>
                </a>`;
  }).join('\n');

  // Complete 72-hub localized directory + localized FAQs (0 orphaned categories)
  const renderedSet = new Set();
  const groupHtml = DIRECTORY_GROUPS.map((slugs, idx) => {
    const title = cfg.dirGroupTitles?.[idx] || `Group ${idx + 1}`;
    const pills = slugs
      .filter(s => CURATED_CATEGORIES.includes(s))
      .map(s => {
        renderedSet.add(s);
        return `<a href="/${lang}/c/${escapeHtml(s)}" class="home-dir-pill">${escapeHtml(getCatLabel(s))}</a>`;
      })
      .join('\n                        ');
    return `                    <div class="home-dir-group">
                        <h3>${escapeHtml(title)}</h3>
                        <div class="home-dir-links">
                        ${pills}
                        </div>
                    </div>`;
  }).join('\n');

  const remaining = CURATED_CATEGORIES.filter(s => !renderedSet.has(s));
  const extraGroupHtml = remaining.length > 0
    ? `\n                    <div class="home-dir-group">
                        <h3>${escapeHtml(cfg.navCategories || 'Categories')}</h3>
                        <div class="home-dir-links">
                        ${remaining.map(s => `<a href="/${lang}/c/${escapeHtml(s)}" class="home-dir-pill">${escapeHtml(getCatLabel(s))}</a>`).join('\n                        ')}
                        </div>
                    </div>`
    : '';

  const faqHtml = (cfg.homeFaqs || []).map(f => `                    <div class="home-faq-item">
                        <strong>${escapeHtml(f.question)}</strong>
                        <p>${escapeHtml(f.answer)}</p>
                    </div>`).join('\n');

  const directoryHtml = `            <section class="home-seo-directory" aria-label="${escapeHtml(cfg.homeDirectoryTitle)}">
                <div class="home-seo-directory-header">
                    <h2>${escapeHtml(cfg.homeDirectoryTitle)}</h2>
                    <p>${escapeHtml(cfg.homeDirectoryDesc)}</p>
                </div>
                <div class="home-dir-groups">
${groupHtml}${extraGroupHtml}
                </div>
                <div class="home-faq-grid">
${faqHtml}
                </div>
            </section>`;

  // Structured Data (localized WebSite, ItemList, FAQPage)
  const webSiteSchema = createWebSiteSchema({
    lang,
    url: canonicalUrl,
    description: cfg.homeDesc,
  });

  const itemListSchema = createItemListSchema(
    cfg.homeTitle,
    cfg.homeDesc,
    cards.map(v => ({
      title: cleanSourceTitle(v.title) || v.title,
      url: `/v/${v.video_id}-${v.slug || slugify(v.title, 80, v.video_id)}`,
      image: v.thumbnail || undefined,
    }))
  );
  itemListSchema.inLanguage = lang;

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'inLanguage': lang,
    'mainEntity': (cfg.homeFaqs || []).map(f => ({
      '@type': 'Question',
      'name': f.question,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': f.answer,
      },
    })),
  };

  const schemaHtml = [
    `    <script id="homeWebSiteLocaleSchema" type="application/ld+json">${JSON.stringify(webSiteSchema).replace(/</g, '\\u003c')}</script>`,
    `    <script id="homeItemListSchema" type="application/ld+json">${JSON.stringify(itemListSchema).replace(/</g, '\\u003c')}</script>`,
    `    <script id="homeFaqSchema" type="application/ld+json">${JSON.stringify(faqSchema).replace(/</g, '\\u003c')}</script>`,
  ].join('\n');

  const hreflangBlock = hasNoindexParam ? '' : buildHreflangHtml('');
  const ogLocaleBlock = buildOgLocaleMetaHtml(lang);
  const langSwitcherHtml = buildLanguageSwitcherHtml(lang, '');

  let html = template;

  // Language, Title, Meta, Canonical, OG, Twitter
  html = html.replace(/<html\s+lang=["'][^"']+["']/i, `<html lang="${lang}"`);
  html = html.replace(/<meta\s+http-equiv=["']content-language["']\s+content=["'][^"']+["']\s*>/i, `<meta http-equiv="content-language" content="${lang}">`);
  html = html.replace(/<meta\s+name=["']language["']\s+content=["'][^"']+["']\s*>/i, `<meta name="language" content="${escapeHtml(cfg.languageName)}">`);
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(cfg.homeTitle)}</title>`);
  html = html.replace(/<meta\s+name=["']description["']\s+content=["'][\s\S]*?["']\s*>/i, `<meta name="description" content="${escapeHtml(cfg.homeDesc)}">`);
  html = html.replace(/<meta\s+name=["']robots["']\s+content=["'][\s\S]*?["']\s*>/i, `<meta name="robots" content="${robotsValue}">`);
  html = html.replace(/<link\s+rel=["']canonical["']\s+href=["'][\s\S]*?["']\s*>/i, `<link rel="canonical" href="${canonicalUrl}">`);

  html = html.replace(/<meta\s+property=["']og:title["']\s+content=["'][\s\S]*?["']\s*>/i, `<meta property="og:title" content="${escapeHtml(cfg.homeTitle)}">`);
  html = html.replace(/<meta\s+property=["']og:description["']\s+content=["'][\s\S]*?["']\s*>/i, `<meta property="og:description" content="${escapeHtml(cfg.homeDesc)}">`);
  html = html.replace(/<meta\s+property=["']og:url["']\s+content=["'][\s\S]*?["']\s*>/i, `<meta property="og:url" content="${canonicalUrl}">`);
  html = html.replace(/<meta\s+name=["']twitter:title["']\s+content=["'][\s\S]*?["']\s*>/i, `<meta name="twitter:title" content="${escapeHtml(cfg.homeTitle)}">`);
  html = html.replace(/<meta\s+name=["']twitter:description["']\s+content=["'][\s\S]*?["']\s*>/i, `<meta name="twitter:description" content="${escapeHtml(cfg.homeDesc)}">`);

  // Replace SSR markers cleanly
  html = replaceBetweenMarkers(html, 'HOME_HREFLANG', `${ogLocaleBlock}\n${hreflangBlock}`);
  html = replaceBetweenMarkers(html, 'HOME_SCHEMA', schemaHtml);
  html = replaceBetweenMarkers(html, 'HOME_LANG_SWITCHER', langSwitcherHtml);
  html = replaceBetweenMarkers(html, 'HOME_CATEGORIES', categoryPillsHtml);
  html = replaceBetweenMarkers(html, 'HOME_GRID', cardsHtml);
  html = replaceBetweenMarkers(html, 'HOME_DIRECTORY', directoryHtml);

  // Localize visible header/main headings
  html = html.replace(
    /<div class="logo" onclick="window\.location='\/'">lusthub\.my\.id<\/div>/i,
    `<div class="logo" onclick="window.location='/${lang}'">lusthub.my.id</div>`
  );
  html = html.replace(
    /<button class="nav-tab active" data-tab="popular">[\s\S]*?<\/button>/i,
    `<button class="nav-tab active" data-tab="popular">${escapeHtml(cfg.navBest)}</button>`
  );
  html = html.replace(
    /<button class="nav-tab" data-tab="viral">[\s\S]*?<\/button>/i,
    `<button class="nav-tab" data-tab="viral">${escapeHtml(cfg.navViral)}</button>`
  );
  html = html.replace(
    /<button class="nav-tab" data-tab="kategori">[\s\S]*?<\/button>/i,
    `<button class="nav-tab" data-tab="kategori">${escapeHtml(cfg.navCategories)}</button>`
  );
  html = html.replace(
    /<input type="text" placeholder="[^"]*" id="searchInput"/i,
    `<input type="text" placeholder="${escapeHtml(cfg.searchPlaceholder)}" id="searchInput"`
  );
  html = html.replace(
    /<h1 id="seo-h1" class="main-seo-title">[\s\S]*?<\/h1>/i,
    `<h1 id="seo-h1" class="main-seo-title">${escapeHtml(cfg.homeH1)}</h1>`
  );
  html = html.replace(
    /<h2 class="section-label" id="sectionLabel">[\s\S]*?<\/h2>/i,
    `<h2 class="section-label" id="sectionLabel">${escapeHtml(cfg.homeSectionLabel)}</h2>`
  );

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Language', lang);
  if (hasNoindexParam) {
    res.setHeader('X-Robots-Tag', 'noindex, follow');
  }
  res.setHeader('Rating', 'RTA-5042-1996-1400-1577-RTA');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  return res.end(html);
}
