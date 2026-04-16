/**
 * =============================================
 *  ADS.JS — Script Iklan Eksternal
 * =============================================
 *  File ini khusus memuat jenis iklan script:
 *  1. Popunder Ads (script eksternal)
 *  2. Social Bar Ads (script eksternal)
 *
 *  Catatan: Iklan Banner ditempatkan langsung
 *  di index.html agar Adsterra script bekerja normal
 *  dan tidak bentrok satu sama lain.
 * =============================================
 */

(function () {
    'use strict';

    // ==========================================
    //  DAFTAR SCRIPT POPUNDER
    // ==========================================
    const POPUNDER_SCRIPTS = [
        'https://pl28946619.profitablecpmratenetwork.com/7f/f1/b3/7ff1b3565d09822b19426419f6d92922.js',
    ];

    // ==========================================
    //  DAFTAR SCRIPT SOCIAL BAR
    // ==========================================
    const SOCIALBAR_SCRIPTS = [
        'https://pl28946631.profitablecpmratenetwork.com/db/38/e3/db38e32a6ae0d31a9974402fe848e234.js',
    ];

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
    //  INIT — Muat popunder & social bar
    // ==========================================
    function initAds() {
        loadScripts(POPUNDER_SCRIPTS);
        loadScripts(SOCIALBAR_SCRIPTS);
    }

    if (document.readyState === 'complete') {
        initAds();
    } else {
        window.addEventListener('load', initAds);
    }
})();
