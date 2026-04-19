/**
 * =============================================
 *  ADS.JS — Script Iklan Eksternal
 * =============================================
 *  File ini HANYA dimuat untuk visitor non-admin
 *  (dimuat secara conditional oleh gallery.js)
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
            key: '2e8603e8d49f282cb2b6c51077745034',
            format: 'iframe',
            height: 50,
            width: 320
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
        'https://pl28946631.profitablecpmratenetwork.com/db/38/e3/db38e32a6ae0d31a9974402fe848e234.js',
    ];

    // ==========================================
    //  FUNGSI: Inject Banner Ad ke Container
    //  Membuat script atOptions + invoke.js
    // ==========================================
    function injectBannerAd(config) {
        var container = document.getElementById(config.containerId);
        if (!container) return;

        // Buat script atOptions
        var optionsScript = document.createElement('script');
        optionsScript.textContent =
            'atOptions = {' +
            "'key': '" + config.key + "'," +
            "'format': '" + config.format + "'," +
            "'height': " + config.height + "," +
            "'width': " + config.width + "," +
            "'params': {}" +
            '};';
        container.appendChild(optionsScript);

        // Buat script invoke.js dari Adsterra
        var invokeScript = document.createElement('script');
        invokeScript.src = 'https://glamournakedemployee.com/' + config.key + '/invoke.js';
        container.appendChild(invokeScript);
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
        // 1. Inject banner ads ke container HTML
        BANNER_ADS.forEach(function (ad) {
            injectBannerAd(ad);
        });

        // 2. Muat popunder scripts
        loadScripts(POPUNDER_SCRIPTS);

        // 3. Muat social bar scripts
        loadScripts(SOCIALBAR_SCRIPTS);
    }

    if (document.readyState === 'complete') {
        initAds();
    } else {
        window.addEventListener('load', initAds);
    }
})();
