/**
 * lib/schema.js
 * Shared Schema.org JSON-LD, HTML escaping, URL normalization, hreflang,
 * anti-spam filtering, duration formatting, and 1-variable global domain helpers.
 * Kept outside api/ so it does not consume Vercel serverless function slots.
 */

export const BASE_URL = (
  process.env.SITE_BASE_URL ||
  process.env.SITEMAP_BASE_URL ||
  'https://www.lusthub.my.id'
).replace(/\/$/, '');

export const SITE_NAME = 'LustHub';
export const SITE_DOMAIN = new URL(BASE_URL).hostname.replace(/^www\./, '');

/** Supported European localized prefixes served under /{lang} and /{lang}/c/:slug. */
export const EU_LOCALES = ['de', 'fr', 'es', 'it', 'nl', 'pt', 'pl'];
export const ALL_LOCALES = ['en', ...EU_LOCALES];

export const LOCALE_OG_MAP = {
  en: 'en_US',
  de: 'de_DE',
  fr: 'fr_FR',
  es: 'es_ES',
  it: 'it_IT',
  nl: 'nl_NL',
  pt: 'pt_PT',
  pl: 'pl_PL',
};

export const LOCALE_LABELS = {
  en: { code: 'EN', name: 'English', region: 'US / UK' },
  de: { code: 'DE', name: 'Deutsch', region: 'DE / AT / CH' },
  fr: { code: 'FR', name: 'Français', region: 'FR / BE / CH' },
  es: { code: 'ES', name: 'Español', region: 'ES / US' },
  it: { code: 'IT', name: 'Italiano', region: 'IT / CH' },
  nl: { code: 'NL', name: 'Nederlands', region: 'NL / BE' },
  pt: { code: 'PT', name: 'Português', region: 'PT / BR' },
  pl: { code: 'PL', name: 'Polski', region: 'PL' },
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

/** Regional ID hubs kept live for existing URLs but moved out of prime US/EU above-the-fold UI. */
export const REGIONAL_ARCHIVE_HUBS = [
  'indonesia', 'bokep-indo', 'mahasiswi', 'pasutri', 'rumahan', 'artis-indo', 'pantai', 'hot-indo',
];

/** Complete curated category hubs (72 total: 48 US/EU + 16 Global/Asian/Lifestyle + 8 Regional). */
export const CURATED_CATEGORIES = [
  ...US_EU_CATEGORIES,
  'asian', 'indian', 'celebrity', 'couple', 'dance', 'hijab', 'homemade',
  'japanese', 'korean', 'live-cam', 'mature', 'outdoor', 'student',
  'viral', 'hotel', 'tiktok-viral',
  ...REGIONAL_ARCHIVE_HUBS,
];

/** Primary international hubs showcased on US & European homepages (64 hubs, excluding empty ID regional hubs). */
export const PRIMARY_GLOBAL_CATEGORIES = CURATED_CATEGORIES.filter(s => !REGIONAL_ARCHIVE_HUBS.includes(s));

const NON_JAV_PREFIXES = new Set([
  'HD', 'SD', 'VR', 'TV', 'UK', 'US', 'EU', 'RTA', 'POV', 'MILF', 'BBW', 'PAWG', 'FPS', 'UHD',
  'EP', 'PT', 'NO', 'VOL', 'PART', 'CH',
]);

export function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  return url.trim().replace(/(https?:\/\/)|(\/)+/g, (m, proto) => proto || '/');
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

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

export function cleanSourceTitle(title) {
  const decoded = decodeMojibake(title).replace(/\s+/g, ' ').trim();
  if (!decoded) return '';
  return decoded.replace(/\s+(?=[a-zA-Z]*\d)(?=\d*[a-zA-Z])[A-Za-z0-9]{4}$/, '').trim();
}

export function extractJavCode(title) {
  const raw = decodeMojibake(title);
  if (!raw) return null;

  const fc2Match = raw.match(/\bFC2[-\s]?PPV[-\s]?(\d{5,8})\b/i);
  if (fc2Match) return `FC2-PPV-${fc2Match[1]}`;

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

export function formatDurationBadge(sec) {
  const total = Math.floor(Number(sec) || 0);
  if (!Number.isFinite(total) || total <= 0) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatHumanDuration(sec) {
  const total = Math.floor(Number(sec) || 0);
  if (!Number.isFinite(total) || total <= 0) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

export function formatCompactViews(val) {
  const num = parseInt(String(val || '0').replace(/\D/g, ''), 10) || 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return num > 0 ? String(num) : '';
}

export function formatCategoryName(slug) {
  if (!slug) return 'All';
  const uppercaseWords = new Set(['fps', 'hd', 'jav', 'pov', 'bbw', 'vr', 'milf', '4k', 'uhd', 'pawg', 'dp', 'bbc']);
  const specialLabels = {
    'onlyfans': 'OnlyFans',
    'tiktok-viral': 'TikTok Viral',
    '4k-uhd': '4K UHD',
    'english-sub-jav': 'English Sub JAV',
  };
  if (specialLabels[slug]) return specialLabels[slug];
  return slug
    .split('-')
    .map(word => uppercaseWords.has(word.toLowerCase())
      ? word.toUpperCase()
      : word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function buildLocalizedUrl(lang, pathSuffix = '') {
  const cleanSuffix = pathSuffix && pathSuffix !== '/'
    ? (pathSuffix.startsWith('/') ? pathSuffix : `/${pathSuffix}`)
    : '';
  if (!lang || lang === 'en') {
    return normalizeUrl(cleanSuffix ? `${BASE_URL}${cleanSuffix}` : `${BASE_URL}/`);
  }
  return normalizeUrl(`${BASE_URL}/${lang}${cleanSuffix}`);
}

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

export function buildHreflangHtml(pathSuffix = '') {
  return buildHreflangEntries(pathSuffix)
    .map(({ hreflang, href }) => `    <link rel="alternate" hreflang="${escapeHtml(hreflang)}" href="${escapeHtml(href)}">`)
    .join('\n');
}

export function buildOgLocaleMetaHtml(activeLang = 'en') {
  const current = LOCALE_OG_MAP[activeLang] || 'en_US';
  const alternates = ALL_LOCALES
    .filter(l => l !== activeLang)
    .map(l => `    <meta property="og:locale:alternate" content="${LOCALE_OG_MAP[l]}">`)
    .join('\n');
  return `    <meta property="og:locale" content="${current}">\n${alternates}`;
}

export function buildLanguageSwitcherHtml(activeLang = 'en', pathSuffix = '') {
  const links = ALL_LOCALES.map(locale => {
    const meta = LOCALE_LABELS[locale];
    const href = buildLocalizedUrl(locale, pathSuffix).replace(BASE_URL, '') || '/';
    const isActive = locale === activeLang;
    return `<a href="${escapeHtml(href)}" hreflang="${escapeHtml(locale)}" class="lh-lang-pill${isActive ? ' is-active' : ''}" title="${escapeHtml(meta.name)}"${isActive ? ' aria-current="page"' : ''}>${meta.code}</a>`;
  }).join('');
  return `<nav class="lh-lang-bar" aria-label="Language">${links}</nav>`;
}

export function createWebSiteSchema(options = {}) {
  const lang = options.lang || 'en';
  const url = normalizeUrl(options.url || buildLocalizedUrl(lang, ''));
  const searchPrefix = lang === 'en' ? '' : `/${lang}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${BASE_URL}/#website`,
    'name': SITE_DOMAIN,
    'alternateName': SITE_NAME,
    'url': url,
    'description': options.description || 'Fast, mobile-first 18+ HD streaming platform featuring curated US, European, Asian, and amateur videos with instant playback.',
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

export function createOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${BASE_URL}/#organization`,
    'name': SITE_DOMAIN,
    'alternateName': SITE_NAME,
    'url': `${BASE_URL}/`,
    'logo': {
      '@type': 'ImageObject',
      'url': `${BASE_URL}/assets/icons/android-chrome-512x512.png`,
      'width': 512,
      'height': 512,
    },
    'description': 'High-speed mobile-first 18+ adult streaming platform and curated HD video archive.',
    'foundingDate': '2026',
  };
}

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

export function createVideoObjectSchema(video = {}, options = {}) {
  const canonicalUrl = normalizeUrl(options.canonicalUrl || `${BASE_URL}/v/${video.id}`);
  const title = options.title || video.title || 'Adult Video';
  const description = options.description || `Watch ${title} in full HD on ${SITE_DOMAIN}.`;

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
      'name': SITE_DOMAIN,
      'logo': {
        '@type': 'ImageObject',
        'url': `${BASE_URL}/assets/icons/android-chrome-512x512.png`,
      },
    },
  };

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

export function serializeSchema(schema) {
  const json = JSON.stringify(schema).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

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
