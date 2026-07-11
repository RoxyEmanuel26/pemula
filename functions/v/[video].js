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
        const descriptionText = `Watch ${decodedTitle} for free in full HD quality on lusthub.my.id.`;
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
            .on('#jsonLdScript', {
                element(el) {
                    el.setContent(JSON.stringify(graphSchema));
                }
            })
            .transform(originalResponse);
            
    } catch (err) {
        console.error('Edge SSR Error:', err);
        return originalResponse;
    }
}
