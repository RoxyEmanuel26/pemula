/**
 * =============================================
 *  LOADER.JS — Anti-Adblock & Ad Recovery System
 * =============================================
 *  Mendeteksi adblock dan memastikan iklan tetap tampil.
 *
 *  Strategi:
 *  1. Deteksi adblock dengan bait element + fetch test
 *  2. Obfuscate URL domain iklan agar tidak ter-filter
 *  3. Tampilkan adblock wall jika terdeteksi
 *  4. Self-hosted popunder fallback
 *  5. Recovery: re-inject iklan yang diblokir
 * =============================================
 */

(function () {
    'use strict';

    // ==========================================
    //  URL OBFUSCATION UTILITIES
    //  Encode URL agar tidak terdeteksi filter list
    // ==========================================

    /**
     * Decode obfuscated URL — URL disimpan dalam bentuk
     * base64 agar tidak cocok dengan filter list adblock
     * @param {string} encoded - Base64 encoded URL
     * @returns {string} Decoded URL
     */
    function _d(encoded) {
        try {
            return atob(encoded);
        } catch (e) {
            return '';
        }
    }

    /**
     * Encode URL ke base64 (untuk referensi saat menambah URL baru)
     * Panggil dari console: _encodeAdUrl('https://example.com/script.js')
     */
    window._encodeAdUrl = function (url) {
        console.log('Encoded:', btoa(url));
        return btoa(url);
    };

    // ==========================================
    //  OBFUSCATED AD CONFIG
    //  Semua URL dienkode agar lolos filter
    // ==========================================

    // Adsterra invoke domain: glamournakedemployee.com
    var _invokeDomain = _d('Z2xhbW91cm5ha2VkZW1wbG95ZWUuY29t');

    // Adsterra banner keys
    var _bannerConfigs = [
        {
            containerId: 'adBannerHeader',
            key: _d('Y2ZmYWMyN2Y2MGYwMjZmODRlMDIzODY3ODhjMWEwNmI='),
            format: 'iframe',
            height: 90,
            width: 728
        },
        {
            containerId: 'adBannerContent',
            key: _d('YWMwMzBmYTAyM2M3ZGIyY2E4Yjc0ZDI4ZjY2YWFjY2I='),
            format: 'iframe',
            height: 250,
            width: 300
        }
    ];

    // Custom banner (image-based, not blocked by adblock)
    var _customBanners = [
        {
            containerId: 'adBannerCustom',
            imageUrl: 'https://i.ibb.co/PvhvpsJM/ezgif-com-animated-gif-maker.gif',
            linkUrl: _d('aHR0cHM6Ly8xMDI0dGVyYWJveC5jb20vcy8xdFpneGhIdlBUVGZhMkRGRTJGUzY0QQ=='),
            alt: 'Download Terabox'
        }
    ];

    // Popunder script URLs (obfuscated)
    var _popunderUrls = [
        _d('aHR0cHM6Ly9wbDI4OTQ2NjE5LnByb2ZpdGFibGVjcG1yYXRlbmV0d29yay5jb20vN2YvZjEvYjMvN2ZmMWIzNTY1ZDA5ODIyYjE5NDI2NDE5ZjZkOTI5MjIuanM=')
    ];

    // Monetag popunder (obfuscated)
    var _monetagDomain = _d('aHR0cHM6Ly9hbDVzbS5jb20vdGFnLm1pbi5qcw==');
    var _monetagZone = '10921359';

    // ==========================================
    //  ADBLOCK DETECTION
    //  Multi-layer detection
    // ==========================================

    var adblockDetected = false;

    /**
     * Layer 1: Bait element detection
     * Buat element dengan class/ID yang biasa diblokir adblock
     */
    function detectWithBait() {
        return new Promise(function (resolve) {
            var bait = document.createElement('div');
            bait.innerHTML = '&nbsp;';
            bait.className = 'adsbox ad-placement carbon-ads';
            bait.setAttribute('id', 'ad-test-bait');
            bait.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;';
            document.body.appendChild(bait);

            setTimeout(function () {
                var detected = false;

                // Check if element was removed or hidden
                if (!bait.offsetParent && bait.offsetHeight === 0 && bait.offsetWidth === 0) {
                    detected = true;
                }

                // Check computed style
                var style = window.getComputedStyle(bait);
                if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
                    detected = true;
                }

                // Cleanup
                if (bait.parentNode) {
                    bait.parentNode.removeChild(bait);
                }

                resolve(detected);
            }, 200);
        });
    }

    /**
     * Layer 2: Fetch test — coba fetch URL ad script
     * Jika gagal/blocked → adblock terdeteksi
     */
    function detectWithFetch() {
        return new Promise(function (resolve) {
            // Coba fetch domain iklan yang biasanya di-block
            var testUrl = '//' + _invokeDomain + '/favicon.ico?_=' + Date.now();

            var img = new Image();
            img.onload = function () { resolve(false); };
            img.onerror = function () { resolve(true); };

            // Timeout 3 detik
            setTimeout(function () { resolve(true); }, 3000);

            img.src = testUrl;
        });
    }

    /**
     * Layer 3: Check jika script diblokir
     * Cek apakah ads script berhasil dimuat
     */
    function detectScriptBlock() {
        return new Promise(function (resolve) {
            var s = document.createElement('script');
            s.src = '//' + _invokeDomain + '/favicon.ico?t=' + Date.now();
            s.onerror = function () {
                resolve(true);
                if (s.parentNode) s.parentNode.removeChild(s);
            };
            s.onload = function () {
                resolve(false);
                if (s.parentNode) s.parentNode.removeChild(s);
            };
            setTimeout(function () {
                resolve(true);
                if (s.parentNode) s.parentNode.removeChild(s);
            }, 3000);
            document.head.appendChild(s);
        });
    }

    /**
     * Jalankan semua layer detection
     * @returns {Promise<boolean>} true jika adblock terdeteksi
     */
    async function runAdblockDetection() {
        try {
            var results = await Promise.all([
                detectWithBait(),
                detectWithFetch(),
                detectScriptBlock()
            ]);

            // Jika salah satu layer mendeteksi → adblock aktif
            adblockDetected = results.some(function (r) { return r === true; });
            console.log('[loader] Adblock detection results:', results, '→', adblockDetected);
            return adblockDetected;
        } catch (e) {
            console.log('[loader] Detection error:', e);
            return true; // Assume blocked on error
        }
    }

    // ==========================================
    //  ADBLOCK WALL — Tampilkan pesan jika adblock aktif
    // ==========================================

    function showAdblockWall() {
        // Jangan tampilkan kalau sudah ada
        if (document.getElementById('kl-ab-wall')) return;

        var wall = document.createElement('div');
        wall.id = 'kl-ab-wall';
        wall.style.cssText = [
            'position:fixed',
            'top:0',
            'left:0',
            'width:100vw',
            'height:100vh',
            'background:rgba(0,0,0,0.92)',
            'z-index:999999',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'padding:20px',
            'box-sizing:border-box',
            'backdrop-filter:blur(8px)',
            '-webkit-backdrop-filter:blur(8px)'
        ].join(';');

        wall.innerHTML =
            '<div style="' +
            'background:linear-gradient(145deg,#1a1a2e,#16213e);' +
            'border:1px solid rgba(232,168,0,0.3);' +
            'border-radius:16px;' +
            'padding:32px 28px;' +
            'max-width:440px;' +
            'width:100%;' +
            'text-align:center;' +
            'box-shadow:0 20px 60px rgba(0,0,0,0.5),0 0 40px rgba(232,168,0,0.1);' +
            'font-family:Inter,sans-serif;' +
            '">' +
            '<div style="font-size:48px;margin-bottom:16px;">🛡️</div>' +
            '<h2 style="color:#e8a800;font-size:20px;font-weight:700;margin:0 0 12px;">AdBlock Terdeteksi</h2>' +
            '<p style="color:rgba(255,255,255,0.8);font-size:14px;line-height:1.6;margin:0 0 20px;">' +
            'Website ini didukung oleh iklan. Mohon matikan AdBlock untuk mendukung kami dan menikmati konten secara penuh. 🙏' +
            '</p>' +
            '<div style="display:flex;flex-direction:column;gap:10px;">' +
            '<button id="kl-ab-refresh" style="' +
            'background:linear-gradient(135deg,#e8a800,#ff6b00);' +
            'color:#000;' +
            'border:none;' +
            'padding:12px 24px;' +
            'border-radius:8px;' +
            'font-size:15px;' +
            'font-weight:700;' +
            'cursor:pointer;' +
            'transition:transform 0.2s,box-shadow 0.2s;' +
            'font-family:Inter,sans-serif;' +
            '">🔄 Sudah Matikan AdBlock — Refresh</button>' +
            '<button id="kl-ab-continue" style="' +
            'background:transparent;' +
            'color:rgba(255,255,255,0.5);' +
            'border:1px solid rgba(255,255,255,0.15);' +
            'padding:10px 20px;' +
            'border-radius:8px;' +
            'font-size:13px;' +
            'cursor:pointer;' +
            'font-family:Inter,sans-serif;' +
            '">Lanjutkan tanpa mematikan AdBlock</button>' +
            '</div>' +
            '</div>';

        document.body.appendChild(wall);

        // Refresh button
        document.getElementById('kl-ab-refresh').addEventListener('click', function () {
            location.reload();
        });

        // Continue anyway — tutup wall, tapi tetap coba inject fallback ads
        document.getElementById('kl-ab-continue').addEventListener('click', function () {
            wall.style.opacity = '0';
            wall.style.transition = 'opacity 0.3s ease';
            setTimeout(function () {
                if (wall.parentNode) wall.parentNode.removeChild(wall);
            }, 300);

            // Inject fallback self-hosted popunder
            initSelfHostedPopunder();
        });

        // Prevent scroll behind wall
        document.body.style.overflow = 'hidden';
    }

    function removeAdblockWall() {
        var wall = document.getElementById('kl-ab-wall');
        if (wall && wall.parentNode) {
            wall.parentNode.removeChild(wall);
        }
        document.body.style.overflow = '';
    }

    // ==========================================
    //  SELF-HOSTED POPUNDER FALLBACK
    //  Berjalan tanpa external script — tidak bisa diblokir
    // ==========================================

    var _popunderFired = false;

    function initSelfHostedPopunder() {
        if (_popunderFired) return;

        // Daftar URL target popunder (obfuscated)
        var popTargets = [
            _d('aHR0cHM6Ly9nbGFtb3VybmFrZWRlbXBsb3llZS5jb20vZGt0eXl2aGh2cz9rZXk9MjEzNWI4MDg2YWQ1NjEyNTlkNTlhMzVlNzRkNGRhZTM='),
            _d('aHR0cHM6Ly9nbGFtb3VybmFrZWRlbXBsb3llZS5jb20vYnhqOXY4eHM/a2V5PWJiY2MwMzU0MTcyMWZlNTk1ZjZkMGExOTkwODZjNjI4'),
            _d('aHR0cHM6Ly9nbGFtb3VybmFrZWRlbXBsb3llZS5jb20vZDF5ZHlnbjQ/a2V5PWFlMDRkYjk3NThmNjZkNTcxYTJkMTIyYjA4NjM1YWYz'),
            _d('aHR0cHM6Ly9vbWcxMC5jb20vNC8xMDgwNjcyMQ=='),
            _d('aHR0cHM6Ly9vbWcxMC5jb20vNC8xMDgwNjczNg=='),
            _d('aHR0cHM6Ly9vbWcxMC5jb20vNC8xMDgwNjcxOQ==')
        ];

        function doPopunder() {
            if (_popunderFired) return;
            _popunderFired = true;

            var target = popTargets[Math.floor(Math.random() * popTargets.length)];

            try {
                // Teknik: buka tab baru, lalu focus kembali ke halaman utama
                var w = window.open(target, '_blank');
                if (w) {
                    // Focus kembali ke halaman utama (popunder effect)
                    setTimeout(function () {
                        try { window.focus(); } catch (e) { }
                    }, 100);
                }
            } catch (e) {
                console.log('[loader] Popunder fallback failed');
            }
        }

        // Trigger pada klik pertama user (hanya 1x)
        document.addEventListener('click', function popHandler() {
            doPopunder();
            document.removeEventListener('click', popHandler, true);
        }, true);
    }

    // ==========================================
    //  AD INJECTION (OBFUSCATED)
    //  Inject banner ads dengan URL yang sudah di-encode
    // ==========================================

    function injectObfuscatedBanner(config) {
        var container = document.getElementById(config.containerId);
        if (!container) return;

        container.innerHTML = '';

        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'width:100%;display:flex;justify-content:center;align-items:center;min-height:' + config.height + 'px;';
        container.appendChild(wrapper);

        // Set atOptions secara dinamis
        window.atOptions = {
            'key': config.key,
            'format': config.format,
            'height': config.height,
            'width': config.width,
            'params': {}
        };

        // Buat script URL secara dinamis (bukan hardcoded string)
        var scriptEl = document.createElement('script');
        scriptEl.type = 'text/javascript';

        // Bangun URL secara programatis agar tidak terdeteksi filter
        var parts = ['//', _invokeDomain, '/', config.key, '/invoke.js'];
        scriptEl.src = parts.join('');

        scriptEl.onerror = function () {
            // Fallback: tampilkan placeholder
            wrapper.innerHTML = '<div style="width:' + config.width + 'px;max-width:100%;height:' + config.height + 'px;background:linear-gradient(135deg,#1a1a2e,#222);border-radius:8px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.3);font-size:12px;">Ad Space</div>';
        };

        wrapper.appendChild(scriptEl);
    }

    function injectObfuscatedCustomBanner(config) {
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
            container.innerHTML = '<div style="width:100%;height:90px;background:linear-gradient(135deg,#1a1a2e,#222);border-radius:12px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.3);font-size:12px;">Ad Space</div>';
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

    function injectObfuscatedPopunder() {
        _popunderUrls.forEach(function (url) {
            if (!url) return;
            var s = document.createElement('script');
            s.src = url;
            s.async = true;
            s.setAttribute('data-cfasync', 'false');
            s.onerror = function () {
                console.log('[loader] External popunder blocked, using fallback');
                initSelfHostedPopunder();
            };
            document.body.appendChild(s);
        });
    }

    function injectMonetag() {
        if (!_monetagDomain) return;
        var s = document.createElement('script');
        s.dataset.zone = _monetagZone;
        s.src = _monetagDomain;
        s.onerror = function () {
            console.log('[loader] Monetag blocked, using fallback');
            initSelfHostedPopunder();
        };
        ([document.documentElement, document.body].filter(Boolean).pop()).appendChild(s);
    }

    // ==========================================
    //  BANNER ADS SEQUENTIAL INJECTION
    //  Inject satu per satu dengan delay
    // ==========================================

    function injectBannersSequentially(banners, index) {
        if (index >= banners.length) return;

        injectObfuscatedBanner(banners[index]);

        setTimeout(function () {
            injectBannersSequentially(banners, index + 1);
        }, 1500);
    }

    // ==========================================
    //  PERIODIC AD RECOVERY
    //  Cek berkala apakah iklan masih tampil
    //  Jika dihapus/disembunyikan oleh adblock → re-inject
    // ==========================================

    function startAdRecovery() {
        setInterval(function () {
            _bannerConfigs.forEach(function (config) {
                var container = document.getElementById(config.containerId);
                if (!container) return;

                // Cek apakah container masih berisi iklan
                var hasContent = container.children.length > 0;
                var isVisible = container.offsetHeight > 0;

                if (!hasContent || !isVisible) {
                    console.log('[loader] Recovering ad:', config.containerId);
                    injectObfuscatedBanner(config);
                }
            });

            _customBanners.forEach(function (config) {
                var container = document.getElementById(config.containerId);
                if (!container) return;

                if (container.children.length === 0 || container.offsetHeight === 0) {
                    console.log('[loader] Recovering custom banner:', config.containerId);
                    injectObfuscatedCustomBanner(config);
                }
            });
        }, 10000); // Cek setiap 10 detik
    }

    // ==========================================
    //  MAIN INIT
    // ==========================================

    async function init() {
        console.log('[loader] Initializing anti-adblock system...');

        // Detect adblock
        var blocked = await runAdblockDetection();

        if (blocked) {
            console.log('[loader] AdBlock DETECTED — using silent fallback');

            // Tetap coba inject iklan (beberapa mungkin lolos)
            injectBannersSequentially(_bannerConfigs, 0);
            _customBanners.forEach(function (config) {
                injectObfuscatedCustomBanner(config);
            });

            // Self-hosted popunder sebagai fallback (tanpa notif)
            initSelfHostedPopunder();

        } else {
            console.log('[loader] No adblock — loading all ads normally');

            // Inject banner ads dengan URL obfuscated
            injectBannersSequentially(_bannerConfigs, 0);

            // Custom banners
            _customBanners.forEach(function (config) {
                injectObfuscatedCustomBanner(config);
            });

            // External popunder scripts
            injectObfuscatedPopunder();

            // Monetag popunder
            injectMonetag();
        }

        // Start periodic ad recovery
        startAdRecovery();

        console.log('[loader] Init complete.');
    }

    // Run when page is ready
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }

})();
