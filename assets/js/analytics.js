/**
 * ==========================================================
 *  ANALYTICS.JS — Unified Event Tracking Library
 * ==========================================================
 *  Handles Google Analytics (GA4) and Yandex Metrica tracking
 *  with auto-tracking for CTA clicks, ads, and video views.
 * ==========================================================
 */

(function () {
    'use strict';

    // Global helper exposed to window
    window.trackEvent = function (eventName, eventParams) {
        eventParams = eventParams || {};
        eventParams.page_path = window.location.pathname;

        // Log to console in development / debug mode
        if (window.DEBUG_ANALYTICS || (!window.GA4_MEASUREMENT_ID && !window.YANDEX_METRICA_ID)) {
            console.log('[Analytics Event]', eventName, eventParams);
        }

        // Send to GA4 (Google Analytics)
        if (typeof gtag === 'function' && window.GA4_MEASUREMENT_ID) {
            gtag('event', eventName, eventParams);
        }

        // Send to Yandex Metrica
        if (window.YANDEX_METRICA_ID && typeof yaCounter !== 'undefined') {
            yaCounter.reachGoal(eventName, eventParams);
        } else if (window.YANDEX_METRICA_ID && typeof ym === 'function') {
            ym(window.YANDEX_METRICA_ID, 'reachGoal', eventName, eventParams);
        }
    };

    // ==========================================
    //  INITIALIZATION
    // ==========================================

    function initGA4() {
        if (!window.GA4_MEASUREMENT_ID || window.GA4_MEASUREMENT_ID === 'YOUR_GA4_ID') return;

        // Load gtag.js script
        var script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=' + window.GA4_MEASUREMENT_ID;
        document.head.appendChild(script);

        window.dataLayer = window.dataLayer || [];
        window.gtag = function () {
            window.dataLayer.push(arguments);
        };
        gtag('js', new Date());
        gtag('config', window.GA4_MEASUREMENT_ID, {
            send_page_view: true
        });
    }

    function initYandexMetrica() {
        if (!window.YANDEX_METRICA_ID || window.YANDEX_METRICA_ID === 'YOUR_YANDEX_ID') return;

        // Load Metrica script
        (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
        (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

        ym(window.YANDEX_METRICA_ID, "init", {
            clickmap:true,
            trackLinks:true,
            accurateTrackBounce:true,
            webvisor:true
        });
    }

    // ==========================================
    //  AUTO-TRACKING INTERACTION HANDLERS
    // ==========================================

    function setupAutoTracking() {
        document.addEventListener('click', function (e) {
            var target = e.target;

            // 1. Track Telegram Floating Buttons & Links
            var telegramLink = target.closest('a[href*="t.me/"]');
            if (telegramLink) {
                window.trackEvent('telegram_join_clicked', {
                    link_url: telegramLink.href,
                    button_text: telegramLink.innerText || telegramLink.textContent || 'Floating Banner'
                });
                return;
            }

            // 2. Track Video Grid Card Clicks
            var videoCard = target.closest('.video-card, .card-grid a, .card-grid-item');
            if (videoCard && !videoCard.closest('#similarVideosSection')) {
                var titleEl = videoCard.querySelector('.card-title, .video-title');
                var videoTitle = titleEl ? (titleEl.innerText || titleEl.textContent) : 'Unknown Title';
                var href = videoCard.getAttribute('href') || '';
                var videoId = 'unknown';
                if (href.includes('/v/')) {
                    var parts = href.split('/v/');
                    videoId = parts[parts.length - 1].split('-')[0];
                }
                window.trackEvent('video_card_clicked', {
                    video_id: videoId,
                    video_title: videoTitle
                });
                return;
            }

            // 3. Track Modal Play Video Actions
            // Download click
            var downloadBtn = target.closest('#playerOpenTab');
            if (downloadBtn) {
                var titleText = document.getElementById('playerTitle') ? document.getElementById('playerTitle').innerText : '';
                window.trackEvent('video_download_clicked', {
                    video_title: titleText
                });
                return;
            }

            // Fullscreen click
            var fullscreenBtn = target.closest('#playerFullPageBtn');
            if (fullscreenBtn) {
                var titleText2 = document.getElementById('playerTitle') ? document.getElementById('playerTitle').innerText : '';
                window.trackEvent('video_fullscreen_clicked', {
                    video_title: titleText2
                });
                return;
            }

            // 4. Track Ad Clicks (fallbacks or ad slots)
            var adLink = target.closest('.ad-space, .player-ad-slot, .banner-img, a[href*="glamournakedemployee.com"], a[href*="ezgif-com-animated-gif-maker"]');
            if (adLink) {
                window.trackEvent('ad_clicked', {
                    ad_container_id: adLink.id || adLink.className || 'unknown-ad-slot',
                    destination_url: adLink.href || ''
                });
                return;
            }
        });

        // 5. Track Search Queries
        // Handle search form submits or search parameter detection
        var urlParams = new URLSearchParams(window.location.search);
        var searchQuery = urlParams.get('q');
        if (searchQuery) {
            // Wait slightly for DOM to settle
            setTimeout(function () {
                window.trackEvent('search_performed', {
                    search_query: searchQuery
                });
            }, 1000);
        }

        // 6. Track Referral Visits (viral sharing attribution)
        var refSource = urlParams.get('ref');
        if (refSource) {
            window.trackEvent('referral_visit', {
                ref_source: refSource,
                landing_url: window.location.href
            });
        }
    }

    // Initialize all tracking systems on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            initGA4();
            initYandexMetrica();
            setupAutoTracking();
        });
    } else {
        initGA4();
        initYandexMetrica();
        setupAutoTracking();
    }

})();
