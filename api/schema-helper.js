/**
 * Schema.org JSON-LD Helper for lusthub.my.id
 * Generates Google Rich Results compliant structured data.
 */

export const BASE_URL = 'https://www.lusthub.my.id';

export function createWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    'name': 'lusthub.my.id',
    'alternateName': 'lusthub.my.id Gallery',
    'url': `${BASE_URL}/`,
    'description': 'Premium 18+ NSFW Gallery — Instant high-speed streaming of viral video leaks and adult content in full HD.',
    'inLanguage': 'en',
    'potentialAction': {
      '@type': 'SearchAction',
      'target': {
        '@type': 'EntryPoint',
        'urlTemplate': `${BASE_URL}/c/{search_term_string}`
      },
      'query-input': 'required name=search_term_string'
    }
  };
}

export function createOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    'name': 'lusthub.my.id',
    'url': `${BASE_URL}/`,
    'logo': {
      '@type': 'ImageObject',
      'url': `${BASE_URL}/assets/icons/android-chrome-512x512.png`,
      'width': 512,
      'height': 512
    },
    'description': 'The largest premium 18+ adult content gallery and viral video platform.',
    'foundingDate': '2026'
  };
}

/**
 * Creates BreadcrumbList schema
 * @param {Array<{ name: string, url: string }>} items
 */
export function createBreadcrumbSchema(items = []) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': items.map((item, index) => ({
      '@type': 'ListItem',
      'position': index + 1,
      'name': item.name,
      'item': item.url.startsWith('http') ? item.url : `${BASE_URL}${item.url.startsWith('/') ? '' : '/'}${item.url}`
    }))
  };
}

/**
 * Creates VideoObject schema for single video pages
 * @param {Object} video
 * @param {Object} options
 */
export function createVideoObjectSchema(video = {}, options = {}) {
  const canonicalUrl = options.canonicalUrl || `${BASE_URL}/v/${video.id}`;
  const title = options.title || video.title || 'Adult Video';
  const description = options.description || `Watch ${title} in full HD on lusthub.my.id.`;
  
  let thumbUrl = options.thumbnailUrl || video.default_thumb?.src || (video.thumbs && video.thumbs[0]?.src) || `${BASE_URL}/assets/icons/og-image.png`;
  if (!thumbUrl.startsWith('http')) {
    thumbUrl = `${BASE_URL}${thumbUrl.startsWith('/') ? '' : '/'}${thumbUrl}`;
  }

  let uploadISO = '2026-01-01T00:00:00Z';
  if (video.added) {
    const formatted = String(video.added).replace(' ', 'T');
    uploadISO = formatted.includes('Z') || formatted.includes('+') ? formatted : `${formatted}Z`;
  }

  const durationSec = Number(video.length_sec || 0);
  const durationISO = durationSec > 0 ? `PT${durationSec}S` : undefined;
  const embedUrl = video.embed || options.embedUrl || undefined;
  const viewCount = Number(video.views || 0);

  const schema = {
    '@type': 'VideoObject',
    'name': title,
    'description': description,
    'thumbnailUrl': [thumbUrl],
    'uploadDate': uploadISO,
    'contentUrl': canonicalUrl,
    'isFamilyFriendly': false,
    'publisher': {
      '@type': 'Organization',
      'name': 'lusthub.my.id',
      'logo': {
        '@type': 'ImageObject',
        'url': `${BASE_URL}/assets/icons/android-chrome-512x512.png`
      }
    }
  };

  if (durationISO) schema.duration = durationISO;
  if (embedUrl) schema.embedUrl = embedUrl;
  if (viewCount > 0) {
    schema.interactionStatistic = {
      '@type': 'InteractionCounter',
      'interactionType': { '@type': 'WatchAction' },
      'userInteractionCount': viewCount
    };
  }

  return schema;
}

/**
 * Creates ItemList schema for category and collection pages
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
      const fullUrl = item.url.startsWith('http') ? item.url : `${BASE_URL}${item.url.startsWith('/') ? '' : '/'}${item.url}`;
      return {
        '@type': 'ListItem',
        'position': index + 1,
        'name': item.title,
        'url': fullUrl
      };
    })
  };
}

/**
 * Helper to serialize schema objects into safe HTML script tag
 * @param {Object|Array} schema
 */
export function serializeSchema(schema) {
  const json = JSON.stringify(schema, null, 2).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}
