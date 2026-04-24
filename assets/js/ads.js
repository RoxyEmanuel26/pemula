/**
 * =============================================
 *  ADS.JS — Script Iklan Eksternal
 * =============================================
 *  Dimuat oleh gallery.js untuk semua pengunjung
 *
 *  Jenis iklan yang dimuat:
 *  1. Banner Ads — inject ke #adBannerHeader dan #adBannerContent
 *  2. Popunder Ads — script eksternal
 *  3. Social Bar Ads — script eksternal
 * =============================================
 */

(function () {
    'use strict';

    // ==========================================
    //  KONFIGURASI BANNER ADS (Adsterra)
    //  Inject ke div container yang sudah ada di HTML
    // ==========================================
    var BANNER_ADS = [
        {
            containerId: 'adBannerHeader',
            key: 'cffac27f60f026f84e02386788c1a06b',
            format: 'iframe',
            height: 90,
            width: 728
        },
        {
            containerId: 'adBannerContent',
            key: 'ac030fa023c7db2ca8b74d28f66aaccb',
            format: 'iframe',
            height: 250,
            width: 300
        }
    ];

    // ==========================================
    //  DAFTAR SCRIPT POPUNDER
    // ==========================================
    var POPUNDER_SCRIPTS = [
        'https://pl28946619.profitablecpmratenetwork.com/7f/f1/b3/7ff1b3565d09822b19426419f6d92922.js',
    ];

    // ==========================================
    //  DAFTAR SCRIPT SOCIAL BAR
    // ==========================================
    var SOCIALBAR_SCRIPTS = [
        // 'https://pl28946631.profitablecpmratenetwork.com/db/38/e3/db38e32a6ae0d31a9974402fe848e234.js',
    ];

    // ==========================================
    //  FUNGSI: Inject Banner Ad ke Container
    //  Adsterra membutuhkan atOptions di window scope
    //  SEBELUM invoke.js dimuat. Kita set window.atOptions
    //  lalu append invoke.js ke <body> (bukan ke container).
    //  invoke.js akan otomatis inject iframe di bawah script.
    //  Jadi kita buat wrapper div di dalam container, lalu
    //  append script-script ke wrapper tsb.
    // ==========================================
    function injectBannerAd(config) {
        var container = document.getElementById(config.containerId);
        if (!container) {
            console.warn('[ads.js] Container #' + config.containerId + ' tidak ditemukan');
            return;
        }

        // Bersihkan container
        container.innerHTML = '';

        // Buat wrapper div untuk ad
        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'width:100%;display:flex;justify-content:center;align-items:center;min-height:' + config.height + 'px;';
        container.appendChild(wrapper);

        // Set atOptions di window scope — ini WAJIB untuk Adsterra
        window.atOptions = {
            'key': config.key,
            'format': config.format,
            'height': config.height,
            'width': config.width,
            'params': {}
        };

        // Buat invoke.js script dan append ke wrapper
        // invoke.js akan membaca window.atOptions dan inject iframe
        var invokeScript = document.createElement('script');
        invokeScript.type = 'text/javascript';
        invokeScript.src = '//glamournakedemployee.com/' + config.key + '/invoke.js';

        invokeScript.onerror = function () {
            console.warn('[ads.js] Gagal memuat banner: ' + config.containerId);
            // Tampilkan fallback/placeholder jika gagal
            wrapper.innerHTML = '<div style="width:' + config.width + 'px;max-width:100%;height:' + config.height + 'px;background:linear-gradient(135deg,#1a1a2e,#222);border-radius:8px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.3);font-size:12px;">Ad Space</div>';
        };

        wrapper.appendChild(invokeScript);
    }

    // ==========================================
    //  FUNGSI: Inject Banner Ads secara berurutan
    //  Adsterra menggunakan satu global atOptions,
    //  jadi kita harus inject satu per satu dengan delay
    //  agar invoke.js sempat membaca atOptions sebelum
    //  kita override untuk banner berikutnya
    // ==========================================
    function injectBannerAdsSequentially(ads, index) {
        if (index >= ads.length) return;

        injectBannerAd(ads[index]);

        // Delay 1.5 detik sebelum inject banner berikutnya
        // agar invoke.js banner pertama sempat membaca atOptions
        setTimeout(function () {
            injectBannerAdsSequentially(ads, index + 1);
        }, 1500);
    }

    // ==========================================
    //  FUNGSI: Muat Script Eksternal (async)
    // ==========================================
    function loadScripts(scriptUrls) {
        scriptUrls.forEach(function (url) {
            if (!url || url.trim() === '') return;
            var s = document.createElement('script');
            s.src = url;
            s.async = true;
            s.setAttribute('data-cfasync', 'false');
            document.body.appendChild(s);
        });
    }

    // ==========================================
    //  INIT — Muat semua iklan
    // ==========================================
    function initAds() {
        console.log('[ads.js] Memulai inject iklan...');

        // 1. Inject banner ads secara berurutan (sequential)
        injectBannerAdsSequentially(BANNER_ADS, 0);

        // 2. Muat popunder scripts
        loadScripts(POPUNDER_SCRIPTS);

        // 3. Muat social bar scripts
        loadScripts(SOCIALBAR_SCRIPTS);

        console.log('[ads.js] Semua iklan dimuat.');
    }

    if (document.readyState === 'complete') {
        initAds();
    } else {
        window.addEventListener('load', initAds);
    }
})();
