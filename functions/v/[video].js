// ==========================================================
// Cloudflare Pages Function — Edge SSR for video pages
// Intercepts /v/* requests to serve pre-rendered SEO tags
// ==========================================================

export async function onRequest(context) {
    const { request, env, params } = context;
    const url = new URL(request.url);
    
    // Extract video ID from path parameter [video]
    const videoParam = params.video || '';
    let videoId = videoParam;
    if (videoId && videoId.includes('-')) {
        videoId = videoId.split('-')[0];
    }
    
    // Fetch the original static video.html asset
    const videoPageUrl = new URL('/video.html', request.url);
    const originalResponse = await env.ASSETS.fetch(videoPageUrl);
    
    if (!videoId) {
        return originalResponse;
    }
    
    try {
        // Fetch video metadata from Eporner API
        const apiResponse = await fetch(`https://www.eporner.com/api/v2/video/id/?id=${encodeURIComponent(videoId)}&format=json`);
        if (!apiResponse.ok) {
            return originalResponse;
        }
        
        const video = await apiResponse.json();
        if (!video || video.error || (Array.isArray(video) && video.length === 0)) {
            return originalResponse;
        }
        
        // Helper to decode UTF-8 Mojibake from Eporner API
        function decodeMojibake(str) {
            if (!str) return '';
            try {
                const bytes = new Uint8Array(str.split('').map(c => {
                    const code = c.charCodeAt(0);
                    return code < 256 ? code : 0x3F;
                }));
                return new TextDecoder('utf-8').decode(bytes);
            } catch (e) {
                return str;
            }
        }
        
        const decodedTitle = decodeMojibake(video.title) || 'Untitled';
        const displayTitle = decodedTitle.length > 60 
            ? decodedTitle.substring(0, 57) + '...' 
            : decodedTitle;
            
        const titleText = `${displayTitle} — lusthub.my.id`;
        const templates = [
            `Watch ${decodedTitle} for free in full HD quality on lusthub.my.id. Enjoy this exclusive premium video with zero interruptions.`,
            `Experience the best of ${decodedTitle} only on lusthub.my.id. Stream it now in high definition for free.`,
            `Check out ${decodedTitle} for free on lusthub.my.id, your ultimate destination for high-speed adult streaming.`,
            `Don't miss out on ${decodedTitle}. Watch it for free in full HD quality right here on lusthub.my.id.`,
            `Stream ${decodedTitle} instantly in full HD. lusthub.my.id provides the best viral content completely free.`
        ];
        
        // Use video ID to pick a deterministic template
        let hash = 0;
        if (video.id) {
            for (let i = 0; i < video.id.length; i++) {
                hash = video.id.charCodeAt(i) + ((hash << 5) - hash);
            }
        }
        const templateIndex = Math.abs(hash) % templates.length;
        const descriptionText = templates[templateIndex];
        
        let uniqueParagraph = descriptionText;
        if (video.keywords && video.keywords.length > 0) {
            const topTags = video.keywords.slice(0, 3).join(', ');
            uniqueParagraph += ` This highly-rated video features ${topTags} and is trending across our network.`;
        }
        
        const thumbUrl = (video.default_thumb && video.default_thumb.src) ? video.default_thumb.src : '';
        
        // Generate clean URL slug
        const cleanSlug = decodedTitle.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().substring(0, 80);
        const canonicalUrl = `${url.origin}/v/${video.id}-${cleanSlug}`;
        
        // Format upload date per ISO 8601
        let uploadISO = new Date().toISOString().split('.')[0] + 'Z';
        if (video.added) {
            uploadISO = video.added.replace(' ', 'T');
            if (!uploadISO.includes('Z') && !uploadISO.includes('+')) {
                uploadISO += 'Z';
            }
        }
        
        const thumbUrlFinal = thumbUrl || `${url.origin}/assets/icons/og-image.png`;
        
        // Structured Data Schema
        const videoSchema = {
            "@type": "VideoObject",
            "name": decodedTitle,
            "description": descriptionText,
            "thumbnailUrl": [thumbUrlFinal],
            "uploadDate": uploadISO,
            "duration": "PT" + (video.length_sec || 0) + "S",
            "embedUrl": video.embed || request.url,
            "interactionStatistic": {
                "@type": "InteractionCounter",
                "interactionType": { "@type": "WatchAction" },
                "userInteractionCount": parseInt(video.views) || 0
            },
            "publisher": {
                "@type": "Organization",
                "name": "lusthub.my.id",
                "logo": {
                    "@type": "ImageObject",
                    "url": `${url.origin}/assets/icons/android-chrome-512x512.png`
                }
            }
        };

        const breadcrumbSchema = {
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
                    "name": decodedTitle || "Video",
                    "item": canonicalUrl
                }
            ]
        };

        const graphSchema = {
            "@context": "https://schema.org",
            "@graph": [videoSchema, breadcrumbSchema]
        };

        // Extract Keywords for Related Content Graph
        let seoTagsHtml = '';
        if (video.keywords && video.keywords.length > 0) {
            let tagLinks = video.keywords.map(tag => {
                return `<a href="/c/${encodeURIComponent(tag)}" style="color: #e8a800; text-decoration: none; background: #222; padding: 5px 10px; border-radius: 4px;">${tag}</a>`;
            });
            seoTagsHtml = tagLinks.join(' ');
        }
        
        // Generate the <script> block for the schema
        const schemaScript = `<script type="application/ld+json">${JSON.stringify(graphSchema)}</script>`;
        
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
            .on('#seo-h1', {
                element(el) {
                    el.setContent(decodedTitle);
                }
            })
            .on('#seo-desc', {
                element(el) {
                    el.setContent(uniqueParagraph);
                }
            })
            .on('#ogTitle', {
                element(el) {
                    el.setAttribute('content', decodedTitle);
                }
            })
            .on('#ogDesc', {
                element(el) {
                    el.setAttribute('content', descriptionText);
                }
            })
            .on('#ogImage', {
                element(el) {
                    el.setAttribute('content', thumbUrl);
                }
            })
            .on('#ogUrl', {
                element(el) {
                    el.setAttribute('content', canonicalUrl);
                }
            })
            .on('#twitterTitle', {
                element(el) {
                    el.setAttribute('content', decodedTitle);
                }
            })
            .on('#twitterDesc', {
                element(el) {
                    el.setAttribute('content', descriptionText);
                }
            })
            .on('#twitterImage', {
                element(el) {
                    el.setAttribute('content', thumbUrl);
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
            .on('#seo-tags', {
                element(el) {
                    if (seoTagsHtml) {
                        el.setContent(seoTagsHtml, { html: true });
                    }
                }
            })
            .transform(originalResponse);
            
    } catch (err) {
        console.error('Edge SSR Error:', err);
        return originalResponse;
    }
}
