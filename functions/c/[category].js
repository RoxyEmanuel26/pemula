// ==========================================================
// Cloudflare Pages Function — Edge SSR for category pages
// Intercepts /c/* requests to serve pre-rendered SEO tags
// ==========================================================

export async function onRequest(context) {
    const { request, env, params } = context;
    const url = new URL(request.url);
    
    // Extract category from path parameter
    let category = params.category || 'all';
    
    // Decode if URL encoded
    category = decodeURIComponent(category);
    
    // Format category for display
    const displayCat = category.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    
    // Fetch the original static index.html asset
    const indexUrl = new URL('/index.html', request.url);
    const originalResponse = await env.ASSETS.fetch(indexUrl);
    
    const titleText = `Watch ${displayCat} Viral Videos for Free — lusthub.my.id`;
    const descriptionText = `Browse the best free ${displayCat} adult videos on lusthub.my.id. Enjoy instant streaming, high-quality viral leaks, and premium content with no subscription.`;
    const canonicalUrl = `${url.origin}/c/${encodeURIComponent(category)}`;
    
    // Try to fetch API to populate ItemList schema natively on Edge
    let itemListElements = [];
    try {
        const apiResponse = await fetch(`https://www.eporner.com/api/v2/video/search/?query=${encodeURIComponent(category)}&per_page=24&page=1&thumbsize=big&order=most-popular&gay=0&lq=1&format=json`);
        if (apiResponse.ok) {
            const data = await apiResponse.json();
            if (data && data.videos && Array.isArray(data.videos)) {
                itemListElements = data.videos.map((vid, idx) => {
                    // Clean title for slug
                    const cleanTitle = (vid.title || 'Untitled').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().substring(0, 80);
                    const cleanSlug = vid.id ? vid.id + '-' + cleanTitle : cleanTitle;
                    const vidUrl = `${url.origin}/v/${cleanSlug}`;
                    return {
                        "@type": "ListItem",
                        "position": idx + 1,
                        "item": {
                            "@type": "VideoObject",
                            "name": vid.title || "Untitled",
                            "url": vidUrl,
                            "thumbnailUrl": (vid.default_thumb && vid.default_thumb.src) ? vid.default_thumb.src : ""
                        }
                    };
                });
            }
        }
    } catch (e) {
        // Silently fail API fetch and just use basic schema
    }

    const schemaData = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {
                        "@type": "ListItem",
                        "position": 1,
                        "name": "Home",
                        "item": `${url.origin}/`
                    },
                    {
                        "@type": "ListItem",
                        "position": 2,
                        "name": displayCat,
                        "item": canonicalUrl
                    }
                ]
            }
        ]
    };
    
    if (itemListElements.length > 0) {
        schemaData["@graph"].push({
            "@type": "ItemList",
            "name": `${displayCat} Videos`,
            "itemListElement": itemListElements
        });
    }
    
    // Generate the <script> block for the schema
    const schemaScript = `<script type="application/ld+json">${JSON.stringify(schemaData)}</script>`;
    
    // Rewrite the HTML using Cloudflare HTMLRewriter
    return new HTMLRewriter()
        .on('title', {
            element(el) {
                el.setContent(titleText);
            }
        })
        .on('meta[name="description"]', {
            element(el) {
                el.setAttribute('content', descriptionText);
            }
        })
        .on('meta[property="og:title"]', {
            element(el) {
                el.setAttribute('content', titleText);
            }
        })
        .on('meta[property="og:description"]', {
            element(el) {
                el.setAttribute('content', descriptionText);
            }
        })
        .on('meta[property="og:url"]', {
            element(el) {
                el.setAttribute('content', canonicalUrl);
            }
        })
        .on('meta[name="twitter:title"]', {
            element(el) {
                el.setAttribute('content', titleText);
            }
        })
        .on('meta[name="twitter:description"]', {
            element(el) {
                el.setAttribute('content', descriptionText);
            }
        })
        .on('link[rel="canonical"]', {
            element(el) {
                el.setAttribute('href', canonicalUrl);
            }
        })
        .on('head', {
            append(el) {
                el.append(schemaScript, { html: true });
            }
        })
        .on('#seo-h1', {
            element(el) {
                el.setContent(`Watch ${displayCat} Viral Videos for Free`);
            }
        })
        .transform(originalResponse);
}
