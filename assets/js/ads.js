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
            key: 'b0b78cb9bbfa0e129e5e6adc1338e387',
            format: 'iframe',
            height: 90,
            width: 728
        },
        {
            containerId: 'adBannerContent',
            key: '65a1753ffe6db0bf1bb656cf7ab30a02',
            format: 'iframe',
            height: 250,
            width: 300
        }
    ];

    // ==========================================
    //  KONFIGURASI CUSTOM BANNER ADS
    //  Banner gambar sendiri (bukan Adsterra)
    // ==========================================
    var CUSTOM_BANNER_ADS = [
        {
            containerId: 'adBannerCustom',
            imageUrl: 'https://i.ibb.co/PvhvpsJM/ezgif-com-animated-gif-maker.gif',
            linkUrl: 'https://www.kumpulenak.my.id/',
            alt: 'Download Terabox'
        }
    ];

    // ==========================================
    //  DAFTAR SCRIPT POPUNDER
    // ==========================================
    var POPUNDER_SCRIPTS = [
        'https://glamournakedemployee.com/a1/f9/2e/a1f92eeaac6d494d099c19d936768302.js',
    ];

    // ==========================================
    //  DAFTAR SCRIPT SOCIAL BAR
    // ==========================================
    var SOCIALBAR_SCRIPTS = [
         'https://glamournakedemployee.com/b9/9c/76/b99c766634c3328f9a3691434f4f1bcb.js',
    ];

    // ==========================================
    //  FUNCTION: Inject Banner Ad into Container
    //  Adsterra requires atOptions in window scope
    //  BEFORE invoke.js is loaded. We set window.atOptions
    //  then append invoke.js to <body> (not to container).
    //  invoke.js will automatically inject iframe below script.
    //  So we create wrapper div inside container, then
    //  append scripts to that wrapper.
    // ==========================================
    function injectBannerAd(config) {
        var container = document.getElementById(config.containerId);
        if (!container) {
            console.warn('[ads.js] Container #' + config.containerId + ' not found');
            return;
        }

        // Clear container
        container.innerHTML = '';

        // Create wrapper div for ad
        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'width:100%;display:flex;justify-content:center;align-items:center;min-height:' + config.height + 'px;';
        container.appendChild(wrapper);

        // Set atOptions in window scope — required for Adsterra
        window.atOptions = {
            'key': config.key,
            'format': config.format,
            'height': config.height,
            'width': config.width,
            'params': {}
        };

        // Create invoke.js script and append to wrapper
        // invoke.js will read window.atOptions and inject iframe
        var invokeScript = document.createElement('script');
        invokeScript.type = 'text/javascript';
        invokeScript.src = '//glamournakedemployee.com/' + config.key + '/invoke.js';

        invokeScript.onerror = function () {
            console.warn('[ads.js] Failed to load banner: ' + config.containerId);
            // Show fallback/placeholder if failed
            wrapper.innerHTML = '<div style="width:' + config.width + 'px;max-width:100%;height:' + config.height + 'px;background:linear-gradient(135deg,#1a1a2e,#222);border-radius:8px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.3);font-size:12px;">Ad Space</div>';
        };

        wrapper.appendChild(invokeScript);
    }

    // ==========================================
    //  FUNCTION: Inject Custom Image Banner
    //  Static image banner with click link
    // ==========================================
    function injectCustomBanner(config) {
        var container = document.getElementById(config.containerId);
        if (!container) {
            console.warn('[ads.js] Container #' + config.containerId + ' not found');
            return;
        }

        container.innerHTML = '';

        var link = document.createElement('a');
        link.href = config.linkUrl;
        link.style.cssText = 'display:block;width:100%;text-decoration:none;border-radius:12px;overflow:hidden;transition:transform 0.3s ease, box-shadow 0.3s ease;';

        var img = document.createElement('img');
        img.src = config.imageUrl;
        img.alt = config.alt || 'Banner Ad';
        img.style.cssText = 'width:100%;height:auto;display:block;border-radius:12px;';

        img.onerror = function () {
            console.warn('[ads.js] Failed to load custom banner: ' + config.containerId);
            container.innerHTML = '<div style="width:100%;height:90px;background:linear-gradient(135deg,#1a1a2e,#222);border-radius:12px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.3);font-size:12px;">Ad Space</div>';
        };

        // Prevent popunder triggering on custom banner click
        link.addEventListener('click', function (e) {
            e.stopPropagation();
            e.stopImmediatePropagation();
        }, true);

        // Hover effect
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

    // ==========================================
    //  FUNCTION: Inject Banner Ads sequentially
    //  Adsterra uses a single global atOptions,
    //  so we must inject one by one with delay
    //  so invoke.js has time to read atOptions before
    //  we override for the next banner
    // ==========================================
    function injectBannerAdsSequentially(ads, index) {
        if (index >= ads.length) return;

        injectBannerAd(ads[index]);

        // Delay 1.5 seconds before injecting next banner
        // so invoke.js for first banner has time to read atOptions
        setTimeout(function () {
            injectBannerAdsSequentially(ads, index + 1);
        }, 1500);
    }

    // ==========================================
    //  FUNCTION: Load External Scripts (async)
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
    //  INIT — Load all ads
    // ==========================================
    function initAds() {
        console.log('[ads.js] Starting ad injection...');

        // 1. Inject banner ads sequentially
        injectBannerAdsSequentially(BANNER_ADS, 0);

        // 1b. Inject custom banner ads (custom images)
        CUSTOM_BANNER_ADS.forEach(function (config) {
            injectCustomBanner(config);
        });

        // 2. Load popunder scripts
        loadScripts(POPUNDER_SCRIPTS);

        // 3. Load social bar scripts
        loadScripts(SOCIALBAR_SCRIPTS);

        console.log('[ads.js] All ads loaded.');
    }

    if (document.readyState === 'complete') {
        initAds();
    } else {
        window.addEventListener('load', initAds);
    }
})();
