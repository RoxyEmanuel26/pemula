import { readFile } from 'node:fs/promises';
import path from 'node:path';

let cachedTemplate = null;

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatCategoryName(slug) {
  if (!slug) return 'All';
  return slug
    .split('-')
    .map(word => {
      const lower = word.toLowerCase();
      if (lower === 'fps') return 'FPS';
      if (lower === 'hd') return 'HD';
      if (lower === 'jav') return 'JAV';
      if (lower === 'pov') return 'POV';
      if (lower === 'bbw') return 'BBW';
      if (lower === 'vr') return 'VR';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

export default async function handler(req, res) {
  const { slug } = req.query;
  const rawSlug = String(slug || '').trim().toLowerCase();
  const cleanSlug = rawSlug.replace(/[^a-z0-9\-]/g, '');

  const domain = 'https://www.lusthub.my.id';
  const categoryName = formatCategoryName(cleanSlug || 'viral');
  const pageTitle = `Watch ${categoryName} Viral Videos in HD — lusthub.my.id`;
  const metaDesc = `Browse the best free ${categoryName} adult videos and trending leaks in full HD on lusthub.my.id. Fast streaming with no signups.`;
  const canonicalUrl = `${domain}/c/${cleanSlug || 'viral'}`;

  if (!cachedTemplate) {
    cachedTemplate = await readFile(path.join(process.cwd(), 'category.html'), 'utf8');
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      {
        '@type': 'ListItem',
        'position': 1,
        'name': 'Home',
        'item': `${domain}/`
      },
      {
        '@type': 'ListItem',
        'position': 2,
        'name': `${categoryName} Videos`,
        'item': canonicalUrl
      }
    ]
  };

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': `${categoryName} Videos`,
    'description': metaDesc,
    'url': canonicalUrl
  };

  const schemaScript = `
    <script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
    <script type="application/ld+json">${JSON.stringify(collectionSchema)}</script>
  `;

  let html = cachedTemplate;

  // Replace Title & Description
  html = html.replace(/<title\s+id=["']pageTitle["'][^>]*>.*?<\/title>/i, `<title id="pageTitle">${escapeHtml(pageTitle)}</title>`);
  html = html.replace(/<meta\s+id=["']pageDesc["']\s+name=["']description["']\s+content=["'].*?["']>/i, `<meta id="pageDesc" name="description" content="${escapeHtml(metaDesc)}">`);

  // Replace Canonical Link
  html = html.replace(/<link\s+id=["']canonicalTag["']\s+rel=["']canonical["']\s+href=["'].*?["']>/i, `<link id="canonicalTag" rel="canonical" href="${canonicalUrl}">`);

  // Replace Open Graph Tags
  html = html.replace(/<meta\s+id=["']ogTitle["'][^>]*>/i, `<meta id="ogTitle" property="og:title" content="${escapeHtml(pageTitle)}">`);
  html = html.replace(/<meta\s+id=["']ogDesc["'][^>]*>/i, `<meta id="ogDesc" property="og:description" content="${escapeHtml(metaDesc)}">`);
  html = html.replace(/<meta\s+id=["']ogUrl["'][^>]*>/i, `<meta id="ogUrl" property="og:url" content="${canonicalUrl}">`);

  // Replace Twitter Card Tags
  html = html.replace(/<meta\s+id=["']twitterTitle["'][^>]*>/i, `<meta id="twitterTitle" name="twitter:title" content="${escapeHtml(pageTitle)}">`);
  html = html.replace(/<meta\s+id=["']twitterDesc["'][^>]*>/i, `<meta id="twitterDesc" name="twitter:description" content="${escapeHtml(metaDesc)}">`);

  // Replace H1 Heading
  html = html.replace(
    /<h1\s+id=["']heroTitle["'][^>]*>[\s\S]*?<\/h1>/i,
    `<h1 id="heroTitle">${escapeHtml(categoryName)} <span>Videos</span></h1>`
  );

  // Replace Hero Description
  html = html.replace(
    /<p\s+id=["']heroDesc["'][^>]*>[\s\S]*?<\/p>/i,
    `<p id="heroDesc">${escapeHtml(metaDesc)}</p>`
  );

  // Append Structured Data Schema before </head>
  html = html.replace('</head>', `${schemaScript}\n</head>`);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=2592000, stale-while-revalidate=86400');
  return res.end(html);
}
