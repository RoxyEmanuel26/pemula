/**
 * Shared Schema.org JSON-LD, HTML escaping, URL normalization, hreflang,
 * anti-spam filtering, and SSR helpers for lusthub.my.id.
 * Used across Vercel serverless handlers and build scripts as a single source of truth.
 */

export const BASE_URL = (process.env.SITEMAP_BASE_URL || 'https://www.lusthub.my.id').replace(/\/$/, '');

/** Supported European localized prefixes served under /{lang} and /{lang}/c/:slug. */
export const EU_LOCALES = ['de', 'fr', 'es', 'it'];
export const ALL_LOCALES = ['en', ...EU_LOCALES];

export const LOCALE_OG_MAP = {
  en: 'en_US',
  de: 'de_DE',
  fr: 'fr_FR',
  es: 'es_ES',
  it: 'it_IT',
};

export const LOCALE_LABELS = {
  en: { code: 'EN', name: 'English', flag: '🇺🇸' },
  de: { code: 'DE', name: 'Deutsch', flag: '🇩🇪' },
  fr: { code: 'FR', name: 'Français', flag: '🇫🇷' },
  es: { code: 'ES', name: 'Español', flag: '🇪🇸' },
  it: { code: 'IT', name: 'Italiano', flag: '🇮🇹' },
};

/** High-priority international US & EU English category slugs ordered by global demand (48 hubs). */
export const US_EU_CATEGORIES = [
  'milf', 'blonde', 'brunette', 'latina', 'ebony', 'amateur', 'pov', 'onlyfans', 'european',
  'british', 'german', 'french', 'spanish', 'italian', 'czech', 'russian', 'petite',
  'stepmom', 'stepsis', 'massage', 'casting', 'squirt', 'deepthroat', 'bbw', 'college',
  'big-tits', 'big-ass', 'pawg', 'anal', 'double-penetration', 'blowjob', 'handjob',
  'cumshot', 'hardcore', 'lesbian', 'threesome', 'group-sex', 'creampie', 'interracial',
  'hotwife', 'cuckold', 'pornstar', 'solo', 'lingerie', 'redhead', '4k-uhd', 'cosplay', 'public',
];

/** Complete curated category hubs (72 total: 48 US/EU + 24 Asian/Viral/Regional). */
export const CURATED_CATEGORIES = [
  ...US_EU_CATEGORIES,
  'asian', 'indian', 'celebrity', 'couple', 'dance', 'hijab', 'homemade',
  'indonesia', 'japanese', 'korean', 'live-cam', 'mature', 'outdoor', 'student',
  'viral', 'bokep-indo', 'mahasiswi', 'pasutri', 'rumahan', 'artis-indo',
  'pantai', 'hotel', 'tiktok-viral', 'hot-indo',
];

const NON_JAV_PREFIXES = new Set([
  'HD', 'SD', 'VR', 'TV', 'UK', 'US', 'EU', 'RTA', 'POV', 'MILF', 'BBW', 'PAWG', 'FPS', 'UHD',
  'EP', 'PT', 'NO', 'VOL', 'PART', 'CH',
]);

/**
 * Collapses redundant slashes while keeping protocol prefixes intact (https://).
 * @param {string} url
 * @returns {string}
 */
export function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  return url.trim().replace(/(https?:\/\/)|(\/)+/g, (m, proto) => proto || '/');
}

/**
 * Escapes HTML special characters for safe attribute and text interpolation.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Recovers UTF-8 text corrupted by Latin-1 mojibake from upstream API responses.
 * @param {string} text
 * @returns {string}
 */
export function decodeMojibake(text) {
  const str = String(text || '').trim();
  if (!/[ÃÂâ]/.test(str)) return str;
  try {
    const decoded = Buffer.from(str, 'latin1').toString('utf8');
    return decoded.includes('\uFFFD') ? str : decoded;
  } catch {
    return str;
  }
}

/**
 * Converts text into a normalized lowercase hyphenated URL slug.
 * @param {string} text
 * @param {number} [maxLen=80]
 * @param {string} [fallback='video']
 * @returns {string}
 */
export function slugify(text, maxLen = 80, fallback = 'video') {
  const clean = decodeMojibake(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
    .replace(/-+$/g, '');
  return clean || String(fallback || 'video');
}

/**
 * Strips common random 4-char uploader suffix hashes from source video titles (e.g. "O9xf", "Dt3r").
 * Preserves authentic titles while removing noisy trailing alphanumeric junk.
 * @param {string} title
 * @returns {string}
 */
export function cleanSourceTitle(title) {
  const decoded = decodeMojibake(title).replace(/\s+/g, ' ').trim();
  if (!decoded) return '';
  return decoded.replace(/\s+(?=[a-zA-Z]*\d)(?=\d*[a-zA-Z])[A-Za-z0-9]{4}$/, '').trim();
}

/**
 * Extracts a genuine JAV release code (e.g. NSPS-826, SONE-335, FC2-PPV-1234567) when present.
 * @param {string} title
 * @returns {string|null}
 */
export function extractJavCode(title) {
  const raw = decodeMojibake(title);
  if (!raw) return null;

  const fc2Match = raw.match(/\bFC2[-\s]?PPV[-\s]?(\d{5,8})\b/i);
  if (fc2Match) return `FC2-PPV-${fc2Match[1]}`;

  // Handle asterisk-obfuscated JAV prefixes like A*B*P-410
  const maskedMatch = raw.match(/\b([A-Z]\*[A-Z](?:\*[A-Z]){1,3})-(\d{3,5})\b/i);
  if (maskedMatch) {
    const cleanPrefix = maskedMatch[1].replace(/\*/g, '').toUpperCase();
    if (!NON_JAV_PREFIXES.has(cleanPrefix)) {
      return `${cleanPrefix}-${maskedMatch[2]}`;
    }
  }

  const codeMatch = raw.match(/\b([A-Z]{2,5})-(\d{3,5})\b/i);
  if (codeMatch) {
    const prefix = codeMatch[1].toUpperCase();
    if (!NON_JAV_PREFIXES.has(prefix)) {
      return `${prefix}-${codeMatch[2]}`;
    }
  }
  return null;
}

/**
 * Detects spam, link-in-bio bait, or meaningless uploader titles that should be excluded from indexable sitemaps.
 * @param {string} title
 * @returns {boolean}
 */
export function isSpamVideoTitle(title) {
  const cleaned = cleanSourceTitle(title).trim();
  if (!cleaned) return true;
  const alnum = cleaned.replace(/[^a-z0-9]/gi, '');
  if (alnum.length < 5) return true;
  if (/^\d+$/.test(alnum)) return true;
  if (/\b(?:sex|porn|xxx|vid|video|clip)\d{3,}\b/i.test(cleaned)) return true;
  if (/\b(?:link\s+in\s+bio|check\s+(?:my\s+)?bio|dm\s+(?:me\s+)?for\s+full|telegram\s+link|whatsapp\s+number|click\s+(?:the\s+)?link)\b/i.test(cleaned)) return true;
  if (/^(?:https?:\/\/|www\.)/i.test(cleaned)) return true;
  if (/\b(\w{2,})\b(?:\s+\1\b){3,}/i.test(cleaned)) return true;
  return false;
}

/**
 * Formats seconds into canonical ISO 8601 duration (e.g. 16370 -> PT4H32M50S).
 * @param {number|string} seconds
 * @returns {string|undefined}
 */
export function formatIsoDuration(seconds) {
  const total = Math.floor(Number(seconds) || 0);
  if (!Number.isFinite(total) || total <= 0) return undefined;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  let out = 'PT';
  if (hours > 0) out += `${hours}H`;
  if (minutes > 0) out += `${minutes}M`;
  if (secs > 0 || out === 'PT') out += `${secs}S`;
  return out;
}

/**
 * Formats a category slug into display title case (respecting common acronyms).
 * @param {string} slug
 * @returns {string}
 */
export function formatCategoryName(slug) {
  if (!slug) return 'All';
  const uppercaseWords = new Set(['fps', 'hd', 'jav', 'pov', 'bbw', 'vr', 'milf', '4k', 'uhd', 'pawg']);
  const specialLabels = {
    'onlyfans': 'OnlyFans',
    'tiktok-viral': 'TikTok Viral',
    '4k-uhd': '4K UHD',
  };
  if (specialLabels[slug]) return specialLabels[slug];
  return slug
    .split('-')
    .map(word => uppercaseWords.has(word.toLowerCase())
      ? word.toUpperCase()
      : word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Builds canonical localized URL for a given language ('en'|'de'|'fr'|'es'|'it') and path suffix ('' or '/c/milf').
 * @param {string} lang
 * @param {string} [pathSuffix='']
 * @returns {string}
 */
export function buildLocalizedUrl(lang, pathSuffix = '') {
  const cleanSuffix = pathSuffix && pathSuffix !== '/'
    ? (pathSuffix.startsWith('/') ? pathSuffix : `/${pathSuffix}`)
    : '';
  if (!lang || lang === 'en') {
    return normalizeUrl(cleanSuffix ? `${BASE_URL}${cleanSuffix}` : `${BASE_URL}/`);
  }
  return normalizeUrl(`${BASE_URL}/${lang}${cleanSuffix}`);
}

/**
 * Builds the full 6-entry symmetric hreflang cluster (en, de, fr, es, it, x-default).
 * @param {string} [pathSuffix='']
 * @returns {Array<{ hreflang: string, href: string }>}
 */
export function buildHreflangEntries(pathSuffix = '') {
  const entries = ALL_LOCALES.map(locale => ({
    hreflang: locale,
    href: buildLocalizedUrl(locale, pathSuffix),
  }));
  entries.push({
    hreflang: 'x-default',
    href: buildLocalizedUrl('en', pathSuffix),
  });
  return entries;
}

/**
 * Renders HTML <link rel="alternate" hreflang="..."> tags for <head>.
 * @param {string} [pathSuffix='']
 * @returns {string}
 */
export function buildHreflangHtml(pathSuffix = '') {
  return buildHreflangEntries(pathSuffix)
    .map(({ hreflang, href }) => `    <link rel="alternate" hreflang="${escapeHtml(hreflang)}" href="${escapeHtml(href)}">`)
    .join('\n');
}

/**
 * Renders Open Graph og:locale and og:locale:alternate meta tags.
 * @param {string} activeLang
 * @returns {string}
 */
export function buildOgLocaleMetaHtml(activeLang = 'en') {
  const current = LOCALE_OG_MAP[activeLang] || 'en_US';
  const alternates = ALL_LOCALES
    .filter(l => l !== activeLang)
    .map(l => `    <meta property="og:locale:alternate" content="${LOCALE_OG_MAP[l]}">`)
    .join('\n');
  return `    <meta property="og:locale" content="${current}">\n${alternates}`;
}

/**
 * Renders a compact crawlable language switcher bar for homepages and category hubs.
 * @param {string} activeLang
 * @param {string} [pathSuffix='']
 * @returns {string}
 */
export function buildLanguageSwitcherHtml(activeLang = 'en', pathSuffix = '') {
  const links = ALL_LOCALES.map(locale => {
    const meta = LOCALE_LABELS[locale];
    const href = buildLocalizedUrl(locale, pathSuffix).replace(BASE_URL, '') || '/';
    const isActive = locale === activeLang;
    const style = isActive
      ? 'padding:4px 9px;border-radius:6px;background:#e8a800;color:#000;font-weight:700;font-size:0.78rem;text-decoration:none;'
      : 'padding:4px 9px;border-radius:6px;background:rgba(255,255,255,0.06);color:#ccc;font-weight:600;font-size:0.78rem;text-decoration:none;border:1px solid rgba(255,255,255,0.12);';
    return `<a href="${escapeHtml(href)}" hreflang="${escapeHtml(locale)}" title="${escapeHtml(meta.name)}"${isActive ? ' aria-current="page"' : ''} style="${style}">${meta.code}</a>`;
  }).join('\n                ');

  return `<nav class="lang-switcher" aria-label="Language" style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;">
                ${links}
            </nav>`;
}

/**
 * Creates WebSite JSON-LD schema with sitewide SearchAction.
 * @param {Object} [options]
 */
export function createWebSiteSchema(options = {}) {
  const lang = options.lang || 'en';
  const url = normalizeUrl(options.url || buildLocalizedUrl(lang, ''));
  const searchPrefix = lang === 'en' ? '' : `/${lang}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${BASE_URL}/#website`,
    'name': 'lusthub.my.id',
    'alternateName': 'LustHub',
    'url': url,
    'description': options.description || 'Fast, mobile-first 18+ NSFW streaming gallery featuring trending US, European, Asian, and amateur HD videos with instant playback.',
    'inLanguage': lang,
    'potentialAction': {
      '@type': 'SearchAction',
      'target': {
        '@type': 'EntryPoint',
        'urlTemplate': `${BASE_URL}${searchPrefix}/c/{search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * Creates Organization JSON-LD schema with stable @id reference.
 */
export function createOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${BASE_URL}/#organization`,
    'name': 'lusthub.my.id',
    'alternateName': 'LustHub',
    'url': `${BASE_URL}/`,
    'logo': {
      '@type': 'ImageObject',
      'url': `${BASE_URL}/assets/icons/android-chrome-512x512.png`,
      'width': 512,
      'height': 512,
    },
    'description': 'High-speed mobile-first 18+ adult video gallery and curated viral archive.',
    'foundingDate': '2026',
  };
}

/**
 * Creates BreadcrumbList JSON-LD schema.
 * @param {Array<{ name: string, url: string }>} items
 */
export function createBreadcrumbSchema(items = []) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': items.map((item, index) => {
      const fullUrl = item.url.startsWith('http')
        ? item.url
        : `${BASE_URL}${item.url.startsWith('/') ? '' : '/'}${item.url}`;
      return {
        '@type': 'ListItem',
        'position': index + 1,
        'name': item.name,
        'item': normalizeUrl(fullUrl),
      };
    }),
  };
}

/**
 * Creates Google Search Central compliant VideoObject JSON-LD schema.
 * Only sets contentUrl if an explicit direct media file (.mp4/.webm/.m3u8) is provided;
 * otherwise relies on embedUrl (player iframe) + url (watch page) per Google spec.
 * @param {Object} video
 * @param {Object} options
 */
export function createVideoObjectSchema(video = {}, options = {}) {
  const canonicalUrl = normalizeUrl(options.canonicalUrl || `${BASE_URL}/v/${video.id}`);
  const title = options.title || video.title || 'Adult Video';
  const description = options.description || `Watch ${title} in full HD on lusthub.my.id.`;

  let thumbUrl =
    options.thumbnailUrl ||
    video.default_thumb?.src ||
    (video.thumbs && video.thumbs[0]?.src) ||
    `${BASE_URL}/assets/icons/og-image.png`;
  if (!thumbUrl.startsWith('http')) {
    thumbUrl = `${BASE_URL}${thumbUrl.startsWith('/') ? '' : '/'}${thumbUrl}`;
  }
  thumbUrl = normalizeUrl(thumbUrl);

  let uploadISO = '2026-01-01T00:00:00Z';
  const rawDate = options.uploadDate || video.added || video.published;
  if (rawDate) {
    const formatted = String(rawDate).replace(' ', 'T');
    uploadISO = formatted.includes('Z') || formatted.includes('+') ? formatted : `${formatted}Z`;
  }

  const durationSec = Number(options.durationSec || video.length_sec || video.duration || 0);
  const durationISO = formatIsoDuration(durationSec);
  const rawEmbed = options.embedUrl || video.embed || video.player || undefined;
  const embedUrl = rawEmbed ? normalizeUrl(rawEmbed) : undefined;
  const viewCount = parseInt(String(options.views ?? video.views ?? '0').replace(/\D/g, ''), 10) || 0;

  const schema = {
    '@type': 'VideoObject',
    '@id': `${canonicalUrl}#video`,
    'name': title,
    'description': description,
    'thumbnailUrl': [thumbUrl],
    'uploadDate': uploadISO,
    'url': canonicalUrl,
    'mainEntityOfPage': { '@id': `${canonicalUrl}#webpage` },
    'inLanguage': options.inLanguage || 'en',
    'isFamilyFriendly': false,
    'publisher': {
      '@type': 'Organization',
      '@id': `${BASE_URL}/#organization`,
      'name': 'lusthub.my.id',
      'logo': {
        '@type': 'ImageObject',
        'url': `${BASE_URL}/assets/icons/android-chrome-512x512.png`,
      },
    },
  };

  // Only include contentUrl when a genuine direct media file URL is supplied
  if (options.contentUrl && /\.(mp4|webm|m3u8)(\?|$)/i.test(options.contentUrl)) {
    schema.contentUrl = normalizeUrl(options.contentUrl);
  }
  if (durationISO) schema.duration = durationISO;
  if (embedUrl) schema.embedUrl = embedUrl;
  if (Array.isArray(options.keywords) && options.keywords.length > 0) {
    schema.keywords = options.keywords.join(', ');
  } else if (typeof options.keywords === 'string' && options.keywords.trim()) {
    schema.keywords = options.keywords.trim();
  }
  if (viewCount > 0) {
    schema.interactionStatistic = {
      '@type': 'InteractionCounter',
      'interactionType': { '@type': 'WatchAction' },
      'userInteractionCount': viewCount,
    };
  }

  return schema;
}

/**
 * Creates ItemList JSON-LD schema for homepage, category, and collection hubs.
 * @param {string} name
 * @param {string} description
 * @param {Array<{ title: string, url: string, image?: string }>} items
 */
export function createItemListSchema(name, description, items = []) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    'name': name,
    'description': description,
    'numberOfItems': items.length,
    'itemListElement': items.map((item, index) => {
      const fullUrl = item.url.startsWith('http')
        ? item.url
        : `${BASE_URL}${item.url.startsWith('/') ? '' : '/'}${item.url}`;
      const entry = {
        '@type': 'ListItem',
        'position': index + 1,
        'name': item.title,
        'url': normalizeUrl(fullUrl),
      };
      if (item.image) entry.image = normalizeUrl(item.image);
      return entry;
    }),
  };
}

/**
 * Serializes JSON-LD safely for embedding inside <script type="application/ld+json">.
 * @param {Object|Array} schema
 * @returns {string}
 */
export function serializeSchema(schema) {
  const json = JSON.stringify(schema).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

/**
 * Normalizes either a compact runtime record (data/enriched-runtime.json)
 * or a legacy full record (data/enriched-videos.json) into a unified video shape.
 * @param {Object|null} rec
 * @returns {Object|null}
 */
export function expandRuntimeVideo(rec) {
  if (!rec || typeof rec !== 'object') return null;
  if (rec.video_id) {
    if (rec.status !== 'enriched' || !rec.model || rec.model === 'mock-enricher') return null;
    if (isSpamVideoTitle(rec.title)) return null;
    return rec;
  }
  if (!rec.id) return null;
  return {
    video_id: rec.id,
    title: rec.t || '',
    slug: rec.s || rec.id,
    thumbnail: rec.th || '',
    seo_title: rec.st || '',
    meta_description: rec.md || '',
    summary: rec.sm || '',
    highlights: Array.isArray(rec.hl) ? rec.hl : [],
    tags: Array.isArray(rec.tg) ? rec.tg : [],
    faq: Array.isArray(rec.fq)
      ? rec.fq.map(pair => Array.isArray(pair) ? { question: pair[0], answer: pair[1] } : pair)
      : [],
    generated_at: rec.at || '',
    views: Number(rec.vw || 0),
    duration: Number(rec.du || 0),
    status: 'enriched',
    model: 'runtime',
  };
}
