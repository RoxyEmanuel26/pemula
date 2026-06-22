/**
 * =============================================
 *  LOADER.JS — Anti-Adblock & Ad Recovery System
 * =============================================
 *  Memastikan iklan tetap tampil meskipun adblock aktif.
 *
 *  Strategi:
 *  1. Coba muat iklan Adsterra secara normal (obfuscated URL)
 *  2. Jika diblokir → tampilkan self-hosted fallback banner
 *     (gambar dari domain yang TIDAK diblokir: imgbb, imgur, domain sendiri)
 *  3. Self-hosted popunder — window.open() dari JS sendiri
 *  4. Periodic recovery — re-inject jika dihapus adblock
 *
 *  PENTING: Adblock bekerja di level NETWORK browser.
 *  Request ke domain iklan (glamournakedemployee.com, dll)
 *  akan SELALU diblokir. Solusinya: serve konten dari
 *  domain yang TIDAK ada di filter list.
 * =============================================
 */

(function () {
    'use strict';

    // ==========================================
    //  URL OBFUSCATION UTILITIES
    // ==========================================

    function _d(encoded) {
        try { return atob(encoded); } catch (e) { return ''; }
    }

    // ==========================================
    //  OBFUSCATED AD CONFIG
    // ==========================================

    var _invokeDomain = _d('Z2xhbW91cm5ha2VkZW1wbG95ZWUuY29t');

    // Adsterra banner keys (untuk mode tanpa adblock)
    var _bannerConfigs = [
        {
            containerId: 'adBannerHeader',
            key: _d('YTIyYTA5NWE5NjFiMGU5YmY3ZGNhM2ExNGM2OTkzNGM='), // a22a095a961b0e9bf7dca3a14c69934c
            format: 'iframe',
            height: 90,
            width: 728
        },
        {
            containerId: 'adBannerContent',
            key: _d('N2IxYTgzYzMzMWJiYTlmZmNhNTU3OGZhNWY3ZTU2Yzc='), // 7b1a83c331bba9ffca5578fa5f7e56c7
            format: 'iframe',
            height: 250,
            width: 300
        },
        {
            containerId: 'adBannerIngrid',
            key: _d('YTIyYTA5NWE5NjFiMGU5YmY3ZGNhM2ExNGM2OTkzNGM='), // a22a095a961b0e9bf7dca3a14c69934c
            format: 'iframe',
            height: 90,
            width: 728
        }
    ];

    // Custom banner (image-based)
    var _customBanners = [
        {
            containerId: 'adBannerCustom',
            imageUrl: 'https://i.ibb.co/PvhvpsJM/ezgif-com-animated-gif-maker.gif',
            linkUrl: 'https://www.teraboxpage.com/myknow/kumpulenak1',
            alt: 'Download Terabox'
        }
    ];

    // Popunder script URLs (obfuscated)
    var _popunderUrls = [
        _d('aHR0cHM6Ly9nbGFtb3VybmFrZWRlbXBsb3llZS5jb20vYzQvNzEvNzgvYzQ3MTc4YWMwZDIzYTBiZDg3MzIyYWNjZWZkZTlmYzcuanM=')
    ];

    // Social Bar script URLs (raw or obfuscated)
    var _socialbarUrls = [
        'https://glamournakedemployee.com/88/d7/20/88d720634f18389c613c9ccab28cea5f.js'
    ];

    // Monetag popunder (obfuscated)
    var _monetagDomain = _d('aHR0cHM6Ly9hbDVzbS5jb20vdGFnLm1pbi5qcw==');
    var _monetagZone = '10921359';

    // ==========================================
    //  MONETISASI LINK POOL
    //  Link yang dibuka saat user klik banner fallback
    //  Gambar di-host di imgbb/imgur → TIDAK diblokir adblock
    // ==========================================

    var _monetLinks = [
        _d('aHR0cHM6Ly9nbGFtb3VybmFrZWRlbXBsb3llZS5jb20vcDRwc2pwMmlkZD9rZXk9ZTFjMjM5NWQ2Mjc2NzdhM2U1YzkyODc1NzllMTUxZWE=')
    ];

    function getRandomLink() {
        return _monetLinks[Math.floor(Math.random() * _monetLinks.length)];
    }

    // ==========================================
    //  SELF-HOSTED FALLBACK BANNERS
    //  Gambar dari imgbb/imgur → TIDAK DIBLOKIR adblock
    //  Klik → buka link monetisasi random
    //
    //  Ini yang muncul SAAT ADBLOCK AKTIF sebagai
    //  pengganti banner Adsterra yang diblokir
    // ==========================================

    var _fallbackBanners = {
        // Banner header (leaderboard 728x90)
        adBannerHeader: [
            {
                image: 'https://i.ibb.co/SXRRGnz6/Your-paragraph-text.png',
                linkUrl: 'https://www.teraboxpage.com/myknow/kumpulenak1',
                alt: 'Premium Content'
            },
            {
                image: 'https://i.ibb.co/PvhvpsJM/ezgif-com-animated-gif-maker.gif',
                linkUrl: 'https://www.teraboxpage.com/myknow/kumpulenak1',
                alt: 'Exclusive Download'
            }
        ],
        // Banner content (medium rectangle 300x250)
        adBannerContent: [
            {
                image: 'https://i.ibb.co/SXRRGnz6/Your-paragraph-text.png',
                linkUrl: 'https://www.teraboxpage.com/myknow/kumpulenak1',
                alt: 'Premium Content'
            },
            {
                image: 'https://i.ibb.co/PvhvpsJM/ezgif-com-animated-gif-maker.gif',
                linkUrl: 'https://www.teraboxpage.com/myknow/kumpulenak1',
                alt: 'Exclusive Download'
            }
        ],
        // In-grid banner (leaderboard 728x90)
        adBannerIngrid: [
            {
                image: 'https://i.ibb.co/SXRRGnz6/Your-paragraph-text.png',
                linkUrl: 'https://www.teraboxpage.com/myknow/kumpulenak1',
                alt: 'Premium Content'
            },
            {
                image: 'https://i.ibb.co/PvhvpsJM/ezgif-com-animated-gif-maker.gif',
                linkUrl: 'https://www.teraboxpage.com/myknow/kumpulenak1',
                alt: 'Exclusive Download'
            }
        ]
    };

    /**
     * Inject self-hosted fallback banner ke container
     * Gambar dari imgbb → tidak bisa diblokir adblock
     * Klik → buka link monetisasi di tab baru
     */
    function injectFallbackBanner(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var banners = _fallbackBanners[containerId];
        if (!banners || banners.length === 0) return;

        // Pilih random banner
        var banner = banners[Math.floor(Math.random() * banners.length)];
        var link = banner.linkUrl || getRandomLink();

        container.innerHTML = '';

        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'width:100%;display:flex;justify-content:center;align-items:center;';

        var anchor = document.createElement('a');
        anchor.href = link;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.style.cssText = 'display:block;max-width:100%;text-decoration:none;border-radius:10px;overflow:hidden;transition:transform 0.3s ease,box-shadow 0.3s ease;cursor:pointer;';

        var img = document.createElement('img');
        img.src = banner.image;
        img.alt = banner.alt;
        img.style.cssText = 'width:100%;height:auto;display:block;border-radius:10px;';
        img.loading = 'lazy';

        // Hover effects
        anchor.addEventListener('mouseenter', function () {
            anchor.style.transform = 'translateY(-2px)';
            anchor.style.boxShadow = '0 8px 25px rgba(232,168,0,0.3)';
        });
        anchor.addEventListener('mouseleave', function () {
            anchor.style.transform = 'translateY(0)';
            anchor.style.boxShadow = 'none';
        });

        // Saat klik → buka link monetisasi + ganti href untuk klik berikutnya
        anchor.addEventListener('click', function (e) {
            e.stopPropagation();
            e.stopImmediatePropagation();
            if (!banner.linkUrl) {
                // Ganti link untuk klik berikutnya
                setTimeout(function () {
                    anchor.href = getRandomLink();
                }, 100);
            }
        }, true);

        anchor.appendChild(img);
        wrapper.appendChild(anchor);
        container.appendChild(wrapper);

        // Tandai bahwa ini fallback banner (untuk recovery check)
        container.setAttribute('data-fallback', '1');
    }

    // ==========================================
    //  SELF-HOSTED POPUNDER
    //  Berjalan 100% dari JS lokal — TIDAK bisa diblokir
    // ==========================================

    var _popunderFired = false;
    var _lastPopunderTime = 0; // Waktu terakhir popunder muncul di sesi tab saat ini

    function initSelfHostedPopunder() {
        // Dinonaktifkan atas permintaan pengguna karena tautan Direct Link (Smartlink)
        // sudah memiliki tombol khusus "🔗 DOWNLOAD" di halaman detail video.
    }

    // ==========================================
    //  ADSTERRA BANNER INJECTION (untuk non-adblock)
    // ==========================================

    function injectAdsterraBanner(config, onBlocked) {
        var container = document.getElementById(config.containerId);
        if (!container) return;

        container.innerHTML = '';

        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'width:100%;display:flex;justify-content:center;align-items:center;min-height:' + config.height + 'px;';
        container.appendChild(wrapper);

        // --- STEP 1: TRY DIRECT LOAD (High CPM via same-origin local iframe) ---
        var localIframe = document.createElement('iframe');
        localIframe.width = config.width;
        localIframe.height = config.height;
        localIframe.frameBorder = '0';
        localIframe.scrolling = 'no';
        localIframe.style.cssText = 'border:none;overflow:hidden;background:transparent;width:' + config.width + 'px;height:' + config.height + 'px;max-width:100%;';
        
        var fallbackTriggered = false;
        function triggerFallback() {
            if (fallbackTriggered) return;
            fallbackTriggered = true;
            
            console.log('[loader] Direct banner blocked/failed for', config.containerId, '→ showing self-hosted fallback banner');
            
            wrapper.innerHTML = '';
            
            if (typeof onBlocked === 'function') {
                onBlocked(config.containerId);
            }
        }

        wrapper.appendChild(localIframe);

        try {
            var doc = localIframe.contentWindow.document;
            doc.open();
            doc.write('<!DOCTYPE html><html><head><style>body{margin:0;padding:0;overflow:hidden;background:transparent;}</style></head><body>');
            doc.write('<script>window.atOptions = { "key": "' + config.key + '", "format": "' + config.format + '", "height": ' + config.height + ', "width": ' + config.width + ', "params": {} };<\/script>');
            doc.write('<script src="//glamournakedemployee.com/' + config.key + '/invoke.js"><\/script>');
            doc.write('</body></html>');
            doc.close();

            var directTimeout = setTimeout(function () {
                try {
                    var innerDoc = localIframe.contentWindow.document;
                    var bodyContent = innerDoc.body.innerHTML;
                    // If invoke.js was blocked, body only contains our scripts, no new iframe or ad container
                    if (bodyContent.indexOf('iframe') === -1 && bodyContent.indexOf('img') === -1) {
                        triggerFallback();
                    }
                } catch (e) {
                    // Cross-origin error means Adsterra successfully redirected the iframe to its own domain
                }
            }, 3000);

        } catch (err) {
            triggerFallback();
        }
    }

    function injectCustomBanner(config) {
        var container = document.getElementById(config.containerId);
        if (!container) return;

        container.innerHTML = '';

        var link = document.createElement('a');
        link.href = config.linkUrl;
        link.style.cssText = 'display:block;width:100%;text-decoration:none;border-radius:12px;overflow:hidden;transition:transform 0.3s ease,box-shadow 0.3s ease;';

        var img = document.createElement('img');
        img.src = config.imageUrl;
        img.alt = config.alt || 'Banner';
        img.style.cssText = 'width:100%;height:auto;display:block;border-radius:12px;';
        img.onerror = function () {
            container.innerHTML = '';
        };

        link.addEventListener('click', function (e) {
            e.stopPropagation();
            e.stopImmediatePropagation();
        }, true);

        link.addEventListener('mouseenter', function () {
            link.style.transform = 'translateY(-2px)';
            link.style.boxShadow = '0 8px 25px rgba(232,168,0,0.3)';
        });
        link.addEventListener('mouseleave', function () {
            link.style.transform = 'translateY(0)';
            link.style.boxShadow = 'none';
        });

        link.appendChild(img);
        container.appendChild(link);
    }

    function injectExternalPopunder() {
        _popunderUrls.forEach(function (url) {
            if (!url) return;
            var s = document.createElement('script');
            s.src = url;
            s.async = true;
            s.setAttribute('data-cfasync', 'false');
            s.onerror = function () {
                // External popunder diblokir → gunakan self-hosted
                initSelfHostedPopunder();
            };
            document.body.appendChild(s);
        });
    }

    function injectSocialBar() {
        _socialbarUrls.forEach(function (url) {
            if (!url) return;
            var s = document.createElement('script');
            s.src = url;
            s.async = true;
            s.setAttribute('data-cfasync', 'false');
            document.body.appendChild(s);
        });
    }

    function injectMonetag() {
        if (!_monetagDomain) return;
        var s = document.createElement('script');
        s.dataset.zone = _monetagZone;
        s.src = _monetagDomain;
        s.onerror = function () {
            // Monetag diblokir → gunakan self-hosted
            initSelfHostedPopunder();
        };
        ([document.documentElement, document.body].filter(Boolean).pop()).appendChild(s);
    }

    // ==========================================
    //  BANNER ADS SEQUENTIAL INJECTION
    //  Inject satu per satu dengan delay
    //  Jika Adsterra diblokir → otomatis fallback
    // ==========================================

    function injectBannersSequentially(banners, index) {
        if (index >= banners.length) return;

        injectAdsterraBanner(banners[index], function (containerId) {
            // Callback: Adsterra diblokir → inject self-hosted fallback
            console.log('[loader] Adsterra blocked for', containerId, '→ injecting fallback banner');
            injectFallbackBanner(containerId);
        });

        setTimeout(function () {
            injectBannersSequentially(banners, index + 1);
        }, 1500);
    }

    // ==========================================
    //  PERIODIC AD RECOVERY
    //  Cek berkala apakah iklan masih tampil
    //  Jika dihapus → re-inject (fallback jika Adsterra gagal)
    // ==========================================

    function startAdRecovery() {
        setInterval(function () {
            _bannerConfigs.forEach(function (config) {
                var container = document.getElementById(config.containerId);
                if (!container) return;

                var hasContent = container.children.length > 0;
                var isVisible = container.offsetHeight > 0;

                if (!hasContent || !isVisible) {
                    console.log('[loader] Recovering:', config.containerId);

                    // Jika sebelumnya sudah fallback, langsung inject fallback lagi
                    if (container.getAttribute('data-fallback') === '1') {
                        injectFallbackBanner(config.containerId);
                    } else {
                        // Coba Adsterra dulu, jika gagal → fallback
                        injectAdsterraBanner(config, function (cid) {
                            injectFallbackBanner(cid);
                        });
                    }
                }
            });

            _customBanners.forEach(function (config) {
                var container = document.getElementById(config.containerId);
                if (!container) return;

                if (container.children.length === 0 || container.offsetHeight === 0) {
                    injectCustomBanner(config);
                }
            });
        }, 10000);
    }

    // ==========================================
    //  IN-GRID FALLBACK BANNERS
    //  Re-inject in-grid banners jika original diblokir
    // ==========================================

    function recoverIngridBanners() {
        setInterval(function () {
            var ingridBanners = document.querySelectorAll('.ingrid-banner-ad');
            ingridBanners.forEach(function (banner) {
                if (banner.offsetHeight === 0 || banner.children.length === 0) {
                    // Re-inject in-grid banner
                    banner.innerHTML = '';
                    var link = document.createElement('a');
                    link.href = 'https://www.teraboxpage.com/myknow/kumpulenak1';
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.className = 'ingrid-banner-link';
                    link.addEventListener('click', function (e) {
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                    }, true);

                    var img = document.createElement('img');
                    img.src = 'https://i.ibb.co/SXRRGnz6/Your-paragraph-text.png';
                    img.alt = 'Download Terabox';
                    img.className = 'ingrid-banner-img';
                    img.onerror = function () { banner.style.display = 'none'; };

                    link.appendChild(img);
                    banner.appendChild(link);
                }
            });
        }, 8000);
    }

    // ==========================================
    //  TELEGRAM FLOATING BUTTON (Melayang)
    // ==========================================
    function injectTelegramButton() {
        if (document.getElementById('tgFloatBtn')) return;

        var style = document.createElement('style');
        style.textContent = 
            '@keyframes tg-pulse {' +
            '  0% { box-shadow: 0 0 0 0 rgba(36, 161, 222, 0.6); }' +
            '  70% { box-shadow: 0 0 0 12px rgba(36, 161, 222, 0); }' +
            '  100% { box-shadow: 0 0 0 0 rgba(36, 161, 222, 0); }' +
            '}' +
            '.tg-float-btn {' +
            '  position: fixed;' +
            '  bottom: 24px;' +
            '  left: 50%;' +
            '  transform: translateX(-50%);' +
            '  background: linear-gradient(135deg, #24A1DE, #1E88E5);' +
            '  color: white !important;' +
            '  padding: 12px 24px;' +
            '  border-radius: 50px;' +
            '  display: flex;' +
            '  align-items: center;' +
            '  justify-content: center;' +
            '  gap: 10px;' +
            '  text-decoration: none !important;' +
            '  z-index: 999999;' +
            '  font-family: "Inter", system-ui, -apple-system, sans-serif;' +
            '  font-size: 14px;' +
            '  font-weight: 700;' +
            '  letter-spacing: 0.5px;' +
            '  animation: tg-pulse 2s infinite;' +
            '  white-space: nowrap;' +
            '  border: 1px solid rgba(255, 255, 255, 0.2);' +
            '  transition: all 0.3s ease;' +
            '  box-shadow: 0 4px 15px rgba(36, 161, 222, 0.3);' +
            '}' +
            '.tg-float-btn:hover {' +
            '  transform: translateX(-50%) translateY(-3px);' +
            '  background: linear-gradient(135deg, #2ab3f2, #24A1DE);' +
            '  box-shadow: 0 6px 20px rgba(36, 161, 222, 0.5);' +
            '}' +
            '.tg-icon {' +
            '  width: 18px;' +
            '  height: 18px;' +
            '  fill: currentColor;' +
            '  flex-shrink: 0;' +
            '}' +
            '@media (max-width: 480px) {' +
            '  .tg-float-btn {' +
            '    padding: 10px 18px;' +
            '    font-size: 13px;' +
            '    bottom: 16px;' +
            '  }' +
            '}';
        document.head.appendChild(style);

        var btn = document.createElement('a');
        btn.id = 'tgFloatBtn';
        btn.href = 'https://t.me/missav_jav_english';
        btn.target = '_blank';
        btn.rel = 'noopener noreferrer';
        btn.className = 'tg-float-btn';

        btn.innerHTML = 
            '<svg class="tg-icon" viewBox="0 0 24 24">' +
            '  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.2-.02-.08.02-1.3 1.83-3.68 3.44-.35.24-.67.36-.95.35-.31-.01-.9-.18-1.34-.32-.54-.18-.97-.27-.93-.57.02-.16.24-.32.66-.49 2.58-1.12 4.31-1.87 5.17-2.23 2.47-.99 2.98-1.17 3.31-1.17.07 0 .24.02.35.1.09.07.12.17.13.27 0 .04-.01.12-.02.16z"/>' +
            '</svg>' +
            '<span>Join Telegram: JAV & Viral Video!</span>';


        document.body.appendChild(btn);
    }

    // ==========================================
    //  MAIN INIT
    //  Satu flow untuk semua user (adblock ON/OFF)
    //  Tidak ada wall/notif — iklan selalu muncul
    // ==========================================

    function init() {
        console.log('[loader] Initializing...');

        // 1. Coba inject Adsterra banners
        //    Jika diblokir → callback otomatis inject fallback banner
        injectBannersSequentially(_bannerConfigs, 0);

        // 2. Inject custom banners (dari imgbb → tidak diblokir)
        _customBanners.forEach(function (config) {
            injectCustomBanner(config);
        });

        // 3. Coba external popunder scripts
        //    Jika diblokir → onerror otomatis aktifkan self-hosted popunder
        injectExternalPopunder();

        // 3b. Muat Social Bar
        injectSocialBar();

        // 4. Coba Monetag
        //    Jika diblokir → onerror otomatis aktifkan self-hosted popunder
        injectMonetag();

        // 5. Selalu aktifkan self-hosted popunder sebagai jaga-jaga
        //    (hanya fire 1x karena ada flag _popunderFired)
        setTimeout(function () {
            initSelfHostedPopunder();
        }, 5000);

        // 6. Start periodic ad recovery
        startAdRecovery();

        // 7. Start in-grid banner recovery
        recoverIngridBanners();

        // 8. Inject Telegram Floating Button
        injectTelegramButton();

        console.log('[loader] Init complete — ads will show regardless of adblock.');
    }

    // Expose hybrid ad injector globally
    window.injectAdsterraBanner = injectAdsterraBanner;

    // Run when page is ready
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }

})();
