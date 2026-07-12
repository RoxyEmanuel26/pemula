/**
 * =============================================
 *  AD-MANAGER.JS — Centralized Ad Logic
 * =============================================
 *  Handles Lazy Loading via IntersectionObserver,
 *  Frequency Capping for popunders, Fallbacks,
 *  and CWV-safe same-origin iframe injections.
 * =============================================
 */

(function () {
    'use strict';

    // ==========================================
    //  1. CONFIGURATION
    // ==========================================

    const isMobile = window.innerWidth <= 768;

    const CONFIG = {
        popLimit: 3, // Max popunders per session/cooldown
        popCooldown: 6 * 60 * 60 * 1000, // 6 hours in milliseconds
        
        // Adsterra Banners (Responsive: Desktop vs Mobile)
        banners: {
            'adBannerHeader': isMobile ? { key: 'b4098414038eec40a67a510f705d522d', w: 320, h: 50 } : { key: 'a22a095a961b0e9bf7dca3a14c69934c', w: 728, h: 90 },
            'adBannerContent': { key: '7b1a83c331bba9ffca5578fa5f7e56c7', w: 300, h: 250 },
            'adBannerIngrid': isMobile ? { key: '7b1a83c331bba9ffca5578fa5f7e56c7', w: 300, h: 250 } : { key: 'a22a095a961b0e9bf7dca3a14c69934c', w: 728, h: 90 },
            'playerAdTop': isMobile ? { key: 'b4098414038eec40a67a510f705d522d', w: 320, h: 50 } : { key: 'a22a095a961b0e9bf7dca3a14c69934c', w: 728, h: 90 },
            'playerAdBottom': isMobile ? { key: 'b4098414038eec40a67a510f705d522d', w: 320, h: 50 } : { key: 'a22a095a961b0e9bf7dca3a14c69934c', w: 728, h: 90 },
            'playerAdSide': { key: '7b1a83c331bba9ffca5578fa5f7e56c7', w: 300, h: 250 }
        },

        // External Scripts
        scripts: {
            popunder: ['https://glamournakedemployee.com/c4/71/78/c47178ac0d23a0bd87322accefde9fc7.js'],
            socialbar: ['https://glamournakedemployee.com/88/d7/20/88d720634f18389c613c9ccab28cea5f.js'],
            monetag: 'https://al5sm.com/tag.min.js'
        },

        // Fallbacks (Anti-Adblock)
        fallbacks: {
            image: 'https://i.ibb.co/PvhvpsJM/ezgif-com-animated-gif-maker.gif',
            link: 'https://www.teraboxpage.com/myknow/lusthub.my.id1'
        }
    };

    function kLog(msg, data) {
        console.log('[AdManager] ' + msg, data || '');
    }

    // ==========================================
    //  2. FREQUENCY CAPPING
    // ==========================================

    function shouldShowPopunder() {
        try {
            let stats = JSON.parse(localStorage.getItem('lusthub_ad_stats') || '{"count": 0, "timestamp": 0}');
            let now = Date.now();
            
            // Reset if cooldown passed
            if (now - stats.timestamp > CONFIG.popCooldown) {
                stats.count = 0;
                stats.timestamp = now;
            }
            
            if (stats.count < CONFIG.popLimit) {
                stats.count++;
                stats.timestamp = now; // update timestamp to extend cooldown relative to last pop
                localStorage.setItem('lusthub_ad_stats', JSON.stringify(stats));
                return true;
            }
            return false;
        } catch (e) {
            // Fallback if localStorage blocked
            return true;
        }
    }

    // ==========================================
    //  3. EXTERNAL SCRIPT INJECTION (POP/SOCIAL)
    // ==========================================

    function injectExternalScripts() {
        if (!shouldShowPopunder()) {
            kLog('Popunder frequency cap reached. Skipping pops.');
            return;
        }
        
        kLog('Injecting Popunder & Social Bar...');

        // Popunder
        CONFIG.scripts.popunder.forEach(url => {
            const s = document.createElement('script');
            s.src = url;
            s.async = true;
            s.setAttribute('data-cfasync', 'false');
            document.body.appendChild(s);
        });

        // Social Bar
        CONFIG.scripts.socialbar.forEach(url => {
            const s = document.createElement('script');
            s.src = url;
            s.async = true;
            s.setAttribute('data-cfasync', 'false');
            document.body.appendChild(s);
        });

        // Monetag
        const m = document.createElement('script');
        m.src = CONFIG.scripts.monetag;
        m.dataset.zone = '10921359';
        document.body.appendChild(m);
    }

    // ==========================================
    //  4. SAME-ORIGIN IFRAME INJECTION (CWV SAFE)
    // ==========================================

    function loadAdsterraDeferred(containerId, key, width, height) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Reset
        container.innerHTML = '';
        container.style.cssText = `display:flex; justify-content:center; align-items:center; min-height:${height}px; max-width:100%; overflow:hidden;`;

        const iframe = document.createElement('iframe');
        iframe.style.width = width + 'px';
        iframe.style.height = height + 'px';
        iframe.style.border = 'none';
        iframe.style.overflow = 'hidden';
        iframe.style.background = 'transparent';
        iframe.title = 'Advertisement';
        iframe.setAttribute('scrolling', 'no');
        
        container.appendChild(iframe);

        try {
            const idoc = iframe.contentWindow.document;
            idoc.open();
            idoc.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <style>body{margin:0;padding:0;overflow:hidden;background:transparent;display:flex;justify-content:center;align-items:center;}</style>
                </head>
                <body>
                    <script type="text/javascript">
                        atOptions = {
                            'key' : '${key}',
                            'format' : 'iframe',
                            'height' : ${height},
                            'width' : ${width},
                            'params' : {}
                        };
                    </script>
                    <script type="text/javascript" src="//glamournakedemployee.com/${key}/invoke.js"></script>
                </body>
                </html>
            `);
            idoc.close();
        } catch (e) {
            kLog('Iframe injection blocked (Cross-Origin or Adblock). Triggering fallback.', e);
            injectFallbackBanner(container);
        }
        
        // Monitor if iframe failed to render content (Adblock blocked network request inside iframe)
        setTimeout(() => {
            try {
                const idoc = iframe.contentWindow.document;
                if (!idoc.body || idoc.body.innerHTML.indexOf('iframe') === -1) {
                    // Script invoke.js didn't inject anything inside the same-origin iframe
                    // Likely blocked by network adblocker
                    injectFallbackBanner(container);
                }
            } catch(e) {
                // Cross origin means it loaded something external, which is good (Adsterra took over)
            }
        }, 3500);
    }

    // ==========================================
    //  5. FALLBACK BANNERS (ANTI-ADBLOCK)
    // ==========================================

    function injectFallbackBanner(container) {
        if (!container) return;
        
        // Cek apakah sudah fallback
        if (container.dataset.fallback === '1') return;
        container.dataset.fallback = '1';

        container.innerHTML = '';
        
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'width:100%; display:flex; justify-content:center; align-items:center;';

        const link = document.createElement('a');
        link.href = CONFIG.fallbacks.link;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.cssText = 'display:block; max-width:100%; text-decoration:none; border-radius:10px; overflow:hidden; cursor:pointer; transition: transform 0.3s ease;';
        
        const img = document.createElement('img');
        img.src = CONFIG.fallbacks.image;
        img.alt = 'Premium Content';
        img.style.cssText = 'width:100%; height:auto; display:block; border-radius:10px;';
        img.loading = 'lazy';

        link.addEventListener('mouseenter', () => link.style.transform = 'translateY(-2px)');
        link.addEventListener('mouseleave', () => link.style.transform = 'translateY(0)');
        
        link.appendChild(img);
        wrapper.appendChild(link);
        container.appendChild(wrapper);
        
        kLog('Fallback banner injected for container:', container.id);
    }

    // ==========================================
    //  6. INTERSECTION OBSERVER (VIEWABILITY)
    // ==========================================

    let adObserver = null;

    function initLazyAds() {
        if (!('IntersectionObserver' in window)) {
            // Fallback for very old browsers
            Object.keys(CONFIG.banners).forEach(id => {
                const conf = CONFIG.banners[id];
                if (document.getElementById(id)) {
                    loadAdsterraDeferred(id, conf.key, conf.w, conf.h);
                }
            });
            return;
        }

        adObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const container = entry.target;
                    const id = container.id;
                    const conf = CONFIG.banners[id];
                    
                    if (conf && !container.dataset.adLoaded) {
                        container.dataset.adLoaded = 'true';
                        kLog('Banner entering viewport, loading:', id);
                        loadAdsterraDeferred(id, conf.key, conf.w, conf.h);
                    }
                    observer.unobserve(container);
                }
            });
        }, {
            rootMargin: '200px 0px', // Load 200px before coming into view
            threshold: 0.01
        });

        // Observe existing banners on page
        Object.keys(CONFIG.banners).forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                adObserver.observe(el);
            }
        });
    }

    // ==========================================
    //  7. TELEGRAM BUTTON
    // ==========================================

    function injectTelegramButton() {
        if (document.getElementById('tgFloatBtn')) return;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes tg-pulse {
                0% { box-shadow: 0 0 0 0 rgba(36, 161, 222, 0.6); }
                70% { box-shadow: 0 0 0 12px rgba(36, 161, 222, 0); }
                100% { box-shadow: 0 0 0 0 rgba(36, 161, 222, 0); }
            }
            .tg-float-btn {
                position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
                background: linear-gradient(135deg, #24A1DE, #1E88E5);
                color: white !important; padding: 12px 24px; border-radius: 50px;
                display: flex; align-items: center; justify-content: center; gap: 10px;
                text-decoration: none !important; z-index: 999999;
                font-family: "Inter", system-ui, sans-serif; font-size: 14px; font-weight: 700;
                animation: tg-pulse 2s infinite; white-space: nowrap;
                border: 1px solid rgba(255,255,255,0.2); transition: all 0.3s ease;
                box-shadow: 0 4px 15px rgba(36, 161, 222, 0.3);
            }
            .tg-float-btn:hover {
                transform: translateX(-50%) translateY(-3px);
                background: linear-gradient(135deg, #2ab3f2, #24A1DE);
                box-shadow: 0 6px 20px rgba(36, 161, 222, 0.5);
            }
            .tg-icon { width: 18px; height: 18px; fill: currentColor; flex-shrink: 0; }
            @media (max-width: 480px) {
                .tg-float-btn { padding: 10px 18px; font-size: 13px; bottom: 16px; }
            }
        `;
        document.head.appendChild(style);

        const btn = document.createElement('a');
        btn.id = 'tgFloatBtn';
        btn.href = 'https://t.me/missav_jav_english';
        btn.target = '_blank';
        btn.rel = 'noopener noreferrer';
        btn.className = 'tg-float-btn';
        btn.innerHTML = `
            <svg class="tg-icon" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.2-.02-.08.02-1.3 1.83-3.68 3.44-.35.24-.67.36-.95.35-.31-.01-.9-.18-1.34-.32-.54-.18-.97-.27-.93-.57.02-.16.24-.32.66-.49 2.58-1.12 4.31-1.87 5.17-2.23 2.47-.99 2.98-1.17 3.31-1.17.07 0 .24.02.35.1.09.07.12.17.13.27 0 .04-.01.12-.02.16z"/>
            </svg>
            <span>Join Telegram: JAV & Viral Video!</span>
        `;
        document.body.appendChild(btn);
    }

    // ==========================================
    //  8. PUBLIC API EXPORT (Single Source of Truth)
    // ==========================================
    
    // Dipanggil oleh gallery.js saat elemen dinamis (seperti pop-up player modal) dibuat
    window.LusthubAds = {
        observe: function(containerId) {
            const el = document.getElementById(containerId);
            if (!el) return;

            const conf = CONFIG.banners[containerId];
            if (!conf) {
                kLog('Unknown ad unit ID: ' + containerId);
                return;
            }

            if (el.dataset.adLoaded) {
                // If modal is reopened, we might need to reset
                el.dataset.adLoaded = '';
                el.innerHTML = '';
            }

            if (adObserver) {
                adObserver.observe(el);
            } else {
                loadAdsterraDeferred(containerId, conf.key, conf.w, conf.h);
            }
        },
        loadImmediate: loadAdsterraDeferred
    };

    // ==========================================
    //  9. INITIALIZATION
    // ==========================================

    function init() {
        kLog('Initializing Ad Manager...');
        initLazyAds();
        injectTelegramButton();

        // Delay popup scripts slightly to prioritize content
        setTimeout(injectExternalScripts, 3000);
    }

    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }

})();
