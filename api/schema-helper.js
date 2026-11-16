/**
 * Shared Schema.org JSON-LD, HTML escaping, URL normalization, and SSR helpers for lusthub.my.id.
 * Used across Vercel serverless handlers and build scripts as a single source of truth.
 */

export const BASE_URL = (process.env.SITEMAP_BASE_URL || 'https://www.lusthub.my.id').replace(/\/$/, '');

/** High-priority international US & EU English category slugs ordered by global demand. */
export const US_EU_CATEGORIES = [
  'milf', 'blonde', 'latina', 'ebony', 'amateur', 'pov', 'onlyfans', 'european',
  'british', 'german', 'french', 'spanish', 'italian', 'czech', 'russian', 'petite',
  'stepmom', 'stepsis', 'massage', 'casting', 'squirt', 'deepthroat', 'bbw', 'college',
  'big-tits', 'big-ass', 'anal', 'blowjob', 'lesbian', 'threesome', 'creampie',
  'interracial', 'lingerie', 'redhead', '4k-uhd', 'cosplay', 'public',
];

/** Complete curated category hubs (60 total: 37 US/EU + 23 Asian/Viral/Regional). */
export const CURATED_CATEGORIES = [
  ...US_EU_CATEGORIES,
  'asian', 'celebrity', 'couple', 'dance', 'hijab', 'homemade',
  'indonesia', 'japanese', 'korean', 'live-cam', 'mature', 'outdoor', 'student',
  'viral', 'bokep-indo', 'mahasiswi', 'pasutri', 'rumahan', 'artis-indo',
  'pantai', 'hotel', 'tiktok-viral', 'hot-indo',
];

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
  // Remove trailing 4-char mixed-case/digit hashes only when preceded by space and containing digits+letters
  return decoded.replace(/\s+(?=[a-zA-Z]*\d)(?=\d*[a-zA-Z])[A-Za-z0-9]{4}$/, '').trim();
}

/**
 * Creates WebSite JSON-LD schema with sitewide SearchAction.
 */
export function createWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    'name': 'lusthub.my.id',
    'alternateName': 'LustHub',
    'url': `${BASE_URL}/`,
    'description': 'Fast, mobile-first 18+ NSFW streaming gallery featuring trending US, European, Asian, and amateur HD videos with instant playback.',
    'inLanguage': 'en',
    'potentialAction': {
      '@type': 'SearchAction',
      'target': {
        '@type': 'EntryPoint',
        'urlTemplate': `${BASE_URL}/c/{search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * Creates Organization JSON-LD schema.
 */
export function createOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
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
  const durationISO = durationSec > 0 ? `PT${durationSec}S` : undefined;
  const rawEmbed = options.embedUrl || video.embed || video.player || undefined;
  const embedUrl = rawEmbed ? normalizeUrl(rawEmbed) : undefined;
  const viewCount = parseInt(String(options.views ?? video.views ?? '0').replace(/\D/g, ''), 10) || 0;

  const schema = {
    '@type': 'VideoObject',
    'name': title,
    'description': description,
    'thumbnailUrl': [thumbUrl],
    'uploadDate': uploadISO,
    'url': canonicalUrl,
    'inLanguage': 'en',
    'isFamilyFriendly': false,
    'publisher': {
      '@type': 'Organization',
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
