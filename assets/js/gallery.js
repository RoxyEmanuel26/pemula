/**
 * ==========================================================
 *  GALLERY.JS — Main logic for kumpulenak gallery page
 * ==========================================================
 *  This file handles:
 *  - Rendering cards from API / local data
 *  - Fully functional pagination
 *  - Dynamic search with debounce
 *  - Tab switching to API
 *  - Video player modal
 *  - Dark/Light mode toggle
 *  - Loading, error, empty states
 *  - In-memory cache, AbortController, XSS escape
 *  - SEO: VideoObject JSON-LD schema injection
 * ==========================================================
 */

// =====================================================
//  CARD DATA — Local card data (fallback)
// =====================================================
let cards = [];

// =====================================================
//  STATE — Global state variables
// =====================================================
let currentTab = 'popular';       // Currently active tab
let currentPage = 1;              // Currently active page
const itemsPerPage = 24;          // Items per page
let currentQuery = '';            // Current search keyword
let isSearchActive = false;       // Whether in search mode
let isLoading = false;            // Whether data is loading
let totalPagesFromAPI = 1;        // Total pages from API response
let currentDisplayCards = [];     // Array of currently displayed cards
let debounceTimer = null;         // Timer for search debounce

/**
 * Data source: "api" for fetching from Eporner API, "local" for local data
 * @type {"api"|"local"}
 */
let DATA_SOURCE = "api";

// =====================================================
//  TAB CONFIG → API PARAMETERS
//  Each tab has its own API parameters
// =====================================================
const TAB_CONFIG = {
    popular: { order: 'top-weekly', query: 'all' },
    viral: { order: 'latest', query: 'all' },
    kategori: { order: 'top-weekly', query: 'all' }
};

// =====================================================
//  INDO MULTI-QUERY — Combined keywords for Indo button
//  API only supports 1 query per request, so we
//  fetch all keywords in parallel and merge results
// =====================================================
const INDO_QUERIES = ['indo', 'cewe', 'bokep', 'mahasiswa', 'hijab', 'goyang'];

// =====================================================
//  VIRAL TAGS — Tag/keyword list for "viral" tab
// =====================================================
const VIRAL_TAGS = [
    { label: '🇮🇩 Indo', query: 'indonesia' },
    { label: '👩 Girl', query: 'cewe' },
    { label: '🔥 Viral', query: 'viral' },
    { label: '📱 Indo Viral', query: 'bokep indo' },
    { label: '🎓 Student', query: 'mahasiswi' },
    { label: '💑 Couple', query: 'pasutri' },
    { label: '🏠 Homemade', query: 'rumahan' },
    { label: '📸 Hijab', query: 'hijab' },
    { label: '🌙 Night', query: 'malam' },
    { label: '💃 Dance', query: 'goyang' },
    { label: '🎥 Live', query: 'live streaming' },
    { label: '⭐ Celebrity', query: 'artis indo' },
    { label: '🏖️ Beach', query: 'pantai' },
    { label: '🏨 Hotel', query: 'hotel' },
    { label: '📲 TikTok', query: 'tiktok viral' },
    { label: '💋 Hot', query: 'hot indo' }
];

// =====================================================
//  CATEGORY LIST — List of all video categories
// =====================================================
const KATEGORI_LIST = [
    { label: '🔥 Most Popular', query: 'all', order: 'most-popular', icon: '🔥' },
    { label: '🆕 Latest', query: 'all', order: 'latest', icon: '🆕' },
    { label: '📈 Top This Week', query: 'all', order: 'top-weekly', icon: '📈' },
    { label: '📅 Top This Month', query: 'all', order: 'top-monthly', icon: '📅' },
    { label: '🇮🇩 Indonesia', query: 'indonesia', order: 'most-popular', icon: '🇮🇩' },
    { label: '👩 Girl', query: 'girl', order: 'most-popular', icon: '👩' },
    { label: '📱 Viral', query: 'viral', order: 'latest', icon: '📱' },
    { label: '🎌 Japan', query: 'japanese', order: 'most-popular', icon: '🎌' },
    { label: '🇰🇷 Korea', query: 'korean', order: 'most-popular', icon: '🇰🇷' },
    { label: '🏠 Amateur', query: 'amateur', order: 'most-popular', icon: '🏠' },
    { label: '🎓 Student', query: 'student', order: 'most-popular', icon: '🎓' },
    { label: '💑 Couple', query: 'couple', order: 'most-popular', icon: '💑' },
    { label: '📸 Hijab', query: 'hijab', order: 'most-popular', icon: '📸' },
    { label: '⭐ Celebrity', query: 'celebrity', order: 'most-popular', icon: '⭐' },
    { label: '🏖️ Outdoor', query: 'outdoor', order: 'most-popular', icon: '🏖️' },
    { label: '💃 Dance', query: 'dance', order: 'most-popular', icon: '💃' },
    { label: '🎥 Live Cam', query: 'live cam', order: 'latest', icon: '🎥' },
    { label: '💋 Mature', query: 'mature', order: 'most-popular', icon: '💋' }
];

// =====================================================
//  CACHE STORE — In-memory cache for API responses
//  Key: "{tab}_{page}_{query}", expires in 5 minutes
// =====================================================
const cacheStore = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in ms

// =====================================================
//  ABORT CONTROLLER — Untuk membatalkan request yang belum selesai
// =====================================================
let currentAbortController = null;

// =====================================================
//  FUNGSI UTILITAS
// =====================================================

/**
 * Escape string HTML untuk mencegah XSS attack
 * @param {string} str - String yang akan di-escape
 * @returns {string} String yang sudah aman dari XSS
 */
function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
}

/**
 * Validasi URL hanya izinkan protokol http:// dan https://
 * @param {string} url
 * @returns {boolean}
 */
function isSafeUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const u = new URL(url);
        return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
        return false;
    }
}

// Decoder untuk memulihkan teks UTF-8 yang mengalami Mojibake dari API Eporner
function decodeMojibake(str) {
    if (!str) return '';
    if (typeof TextDecoder === 'undefined') return str;
    
    // Peta byte Windows-1252 ke Unicode untuk rentang 0x80 - 0x9F
    var win1252Map = {
        0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 
        0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 
        0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 
        0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 
        0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 
        0x017E: 0x9E, 0x0178: 0x9F
    };

    var bytes = new Uint8Array(str.split('').map(function (c) {
        var code = c.charCodeAt(0);
        return win1252Map[code] || (code < 256 ? code : 0x3F);
    }));

    try {
        return new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
        return str;
    }
}

/**
 * Baca cookie berdasarkan nama
 * @param {string} name - Nama cookie
 * @returns {string|null} Nilai cookie atau null jika tidak ditemukan
 */
function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
}

/**
 * Set cookie dengan expire date
 * @param {string} name - Nama cookie
 * @param {string} value - Nilai cookie
 * @param {number} days - Jumlah hari sebelum expire
 */
function setCookie(name, value, days) {
    const d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
}

/**
 * Log pesan ke console dengan prefix [kumpulenak]
 * @param {string} message - Pesan yang akan dilog
 * @param {*} [data] - Data tambahan (opsional)
 */
function kLog(message, data) {
    if (data !== undefined) {
        console.log('[kumpulenak] ' + message, data);
    } else {
        console.log('[kumpulenak] ' + message);
    }
}

// =====================================================
//  DARK/LIGHT MODE — Toggle dark and light theme
// =====================================================

/**
 * Initialize theme based on saved cookie
 * Default: dark mode
 */
function initTheme() {
    const savedTheme = getCookie('kumpulenak_theme');
    const theme = savedTheme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(theme);
    kLog('Theme initialized:', theme);
}

/**
 * Toggle theme between dark and light
 */
function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    setCookie('kumpulenak_theme', next, 30);
    updateThemeIcon(next);
    kLog('Theme switched to:', next);
}

/**
 * Update theme button icon based on active theme
 * @param {string} theme - Active theme ("dark" or "light")
 */
function updateThemeIcon(theme) {
    const btn = document.getElementById('themeToggle');
    if (btn) {
        btn.textContent = theme === 'dark' ? '🌙' : '☀️';
    }
}

// Jalankan inisialisasi tema saat halaman dimuat
initTheme();

// =====================================================
//  IMAGE LAZY LOAD HELPER
// =====================================================

/**
 * Handler ketika gambar selesai dimuat
 * Hapus skeleton dan tampilkan gambar
 * @param {HTMLImageElement} img - Element gambar yang sudah loaded
 */
function handleImageLoad(img) {
    img.classList.add('loaded');
    const skeleton = img.parentElement.querySelector('.img-skeleton');
    if (skeleton) skeleton.remove();
}

// =====================================================
//  EPORNER API v2 — Integrasi fetch data dari API
// =====================================================

/**
 * Fetch video data from Eporner API v2
 * @param {string} query - Search keyword (default: "all")
 * @param {number} page - Page number (default: 1)
 * @param {string} order - Sort order (default: "most-popular")
 * @returns {Promise<Object|null>} API response or null if failed
 */
async function fetchFromAPI(query, page, order) {
    // Create cache key
    const cacheKey = currentTab + '_' + page + '_' + (query || 'all') + '_' + (order || 'latest');

    // Check cache first
    if (cacheStore[cacheKey] && (Date.now() - cacheStore[cacheKey].timestamp < CACHE_DURATION)) {
        kLog('Using cache for:', cacheKey);
        return cacheStore[cacheKey].data;
    }

    // Cancel previous request if still running
    if (currentAbortController) {
        currentAbortController.abort();
        kLog('Previous request cancelled');
    }

    // Create new AbortController
    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    // Build API URL
    const params = new URLSearchParams({
        query: query || 'all',
        per_page: String(itemsPerPage),
        page: String(page),
        thumbsize: 'big',
        order: order || 'most-popular',
        gay: '0',
        lq: '1',
        format: 'json'
    });

    const apiUrl = 'https://www.eporner.com/api/v2/video/search/?' + params.toString();
    kLog('Fetching API:', apiUrl);

    try {
        // Fetch with 10 second timeout
        const response = await Promise.race([
            fetch(apiUrl, { signal: signal }),
            new Promise(function (_, reject) {
                setTimeout(function () {
                    reject(new Error('Timeout: Request exceeded 10 seconds'));
                }, 10000);
            })
        ]);

        if (!response.ok) {
            throw new Error('HTTP Error: ' + response.status);
        }

        const data = await response.json();

        // Save to cache
        cacheStore[cacheKey] = {
            data: data,
            timestamp: Date.now()
        };

        kLog('API response received, total videos:', data.total_count);
        return data;

    } catch (error) {
        // Don't log error if request was intentionally cancelled
        if (error.name === 'AbortError') {
            kLog('Request cancelled by user');
            return null;
        }
        kLog('API error:', error.message);
        throw error;
    }
}

/**
 * Fetch multiple queries in parallel and merge results
 * Used for "Indo" button that combines multiple keywords
 * @param {string[]} queries - Array of keywords to fetch
 * @param {number} page - Page number (client-side pagination)
 * @param {string} order - Sort order
 * @returns {Promise<Object|null>} Merged response in the same format as API
 */
async function fetchMultiQuery(queries, page, order) {
    // Special multi-query cache key
    var cacheKey = 'multi_' + queries.join('+') + '_' + page + '_' + order;

    if (cacheStore[cacheKey] && (Date.now() - cacheStore[cacheKey].timestamp < CACHE_DURATION)) {
        kLog('Using multi-query cache:', cacheKey);
        return cacheStore[cacheKey].data;
    }

    // Calculate videos per query so total ~itemsPerPage
    var perQuery = Math.ceil(itemsPerPage / queries.length);
    // For pagination, offset page per query
    var queryPage = page;

    kLog('Multi-query fetch:', queries.join(', '), '| per_query:', perQuery, '| page:', queryPage);

    // Fetch all queries in parallel
    var fetchPromises = queries.map(function (q) {
        var params = new URLSearchParams({
            query: q,
            per_page: String(perQuery),
            page: String(queryPage),
            thumbsize: 'big',
            order: order || 'most-popular',
            gay: '0',
            lq: '1',
            format: 'json'
        });
        var url = 'https://www.eporner.com/api/v2/video/search/?' + params.toString();

        return fetch(url)
            .then(function (res) { return res.ok ? res.json() : null; })
            .catch(function () { return null; });
    });

    try {
        var results = await Promise.all(fetchPromises);

        // Merge all videos from all queries
        var allVideos = [];
        var seenIds = {};
        var maxTotalPages = 1;

        results.forEach(function (res) {
            if (res && res.videos) {
                res.videos.forEach(function (v) {
                    // Deduplicate based on video ID
                    if (!seenIds[v.id]) {
                        seenIds[v.id] = true;
                        allVideos.push(v);
                    }
                });
                if (res.total_pages > maxTotalPages) {
                    maxTotalPages = res.total_pages;
                }
            }
        });

        // Shuffle order so videos from different queries are mixed
        for (var i = allVideos.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = allVideos[i];
            allVideos[i] = allVideos[j];
            allVideos[j] = temp;
        }

        // Limit to itemsPerPage
        allVideos = allVideos.slice(0, itemsPerPage);

        // Format response like regular API
        var mergedResponse = {
            count: allVideos.length,
            per_page: itemsPerPage,
            page: page,
            total_count: allVideos.length * maxTotalPages,
            total_pages: maxTotalPages,
            videos: allVideos
        };

        // Save to cache
        cacheStore[cacheKey] = {
            data: mergedResponse,
            timestamp: Date.now()
        };

        kLog('Multi-query complete, total unique videos:', allVideos.length);
        return mergedResponse;

    } catch (error) {
        kLog('Multi-query error:', error.message);
        // Fallback: fetch hanya query pertama
        return fetchFromAPI(queries[0], page, order);
    }
}

/**
 * Konversi format video dari API ke format card internal
 * @param {Object} video - Objek video dari response API
 * @returns {Object} Objek card dalam format internal
 */
function mapAPIVideoToCard(video) {
    // Parse keywords string ke array (max 4 tag)
    var keywordsArr = [];
    if (video.keywords) {
        keywordsArr = video.keywords.split(',').map(function (k) { return decodeMojibake(k.trim()); }).filter(function (k) { return k.length > 0 && k.length < 30; }).slice(0, 4);
    }
    // Ambil semua thumbnail URLs
    var thumbsArr = [];
    if (video.thumbs && video.thumbs.length > 0) {
        thumbsArr = video.thumbs.map(function (t) { return t.src; });
    }
    return {
        name: decodeMojibake(video.title || 'Untitled'),
        image: (video.default_thumb && isSafeUrl(video.default_thumb.src)) ? video.default_thumb.src : '',
        link: isSafeUrl(video.url) ? video.url : '#',
        date: video.added ? video.added.slice(0, 10) : '',
        views: video.views ? video.views.toLocaleString('id-ID') : '0',
        length: video.length_min || '',
        lengthSec: video.length_sec || 0,
        embedUrl: video.embed || '',
        videoId: video.id || '',
        rate: video.rate || '',
        keywords: keywordsArr,
        thumbs: thumbsArr
    };
}

// =====================================================
//  RENDER SKELETONS — Loading state
// =====================================================

/**
 * Render N card skeleton ke grid sebagai loading placeholder
 * Skeleton memiliki layout yang sama persis dengan card asli
 * @param {number} count - Jumlah skeleton yang akan ditampilkan
 */
function renderSkeletons(count) {
    const grid = document.getElementById('cardGrid');
    grid.innerHTML = '';

    for (let i = 0; i < count; i++) {
        const skeleton = document.createElement('div');
        skeleton.className = 'card skeleton-card';
        skeleton.style.animationDelay = (i * 0.05) + 's';
        skeleton.innerHTML =
            '<div class="card-img-wrapper">' +
            '<div class="img-skeleton"></div>' +
            '</div>' +
            '<div class="card-meta">' +
            '<div class="card-date-views">' +
            '<span class="skeleton-text" style="width:50px;height:12px;"></span>' +
            '<span class="skeleton-text" style="width:60px;height:12px;"></span>' +
            '</div>' +
            '<div class="skeleton-text" style="width:100%;height:14px;margin-top:4px;"></div>' +
            '<div class="skeleton-text" style="width:70%;height:14px;margin-top:4px;"></div>' +
            '</div>';
        grid.appendChild(skeleton);
    }
}

// =====================================================
//  RENDER EMPTY STATE — Tidak ada hasil
// =====================================================

/**
 * Tampilkan state kosong saat tidak ada hasil pencarian atau API kosong
 * @param {string} message - Pesan yang ditampilkan
 */
function renderEmptyState(message) {
    const grid = document.getElementById('cardGrid');
    grid.innerHTML =
        '<div class="empty-state">' +
        '<svg viewBox="0 0 100 100" class="empty-icon">' +
        '<circle cx="50" cy="50" r="45" fill="none" stroke="#e8a800" stroke-width="5" stroke-dasharray="10 5" opacity="0.3"/>' +
        '<path d="M45 55 C45 45, 75 45, 75 55" stroke="#e8a800" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.6"/>' +
        '<circle cx="48" cy="48" r="3" fill="#e8a800" opacity="0.5"/>' +
        '<circle cx="72" cy="48" r="3" fill="#e8a800" opacity="0.5"/>' +
        '<path d="M40 72 Q60 62, 80 72" stroke="#e8a800" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.5"/>' +
        '</svg>' +
        '<p class="empty-message">' + escapeHTML(message) + '</p>' +
        '</div>';
        
    var emptyDiv = grid.querySelector('.empty-state');
    var btn = document.createElement('button');
    btn.className = 'empty-btn';
    if (isSearchActive) {
        btn.textContent = '🔄 Reset Search';
        btn.addEventListener('click', clearSearch);
    } else {
        btn.textContent = '🔄 Try Again';
        btn.addEventListener('click', retryLoad);
    }
    emptyDiv.appendChild(btn);

    document.getElementById('pagination').innerHTML = '';
}

// =====================================================
//  RENDER API ERROR — Error state
// =====================================================

/**
 * Display error state when API fails
 * @param {string} message - Error message to display
 */
function renderAPIError(message) {
    const grid = document.getElementById('cardGrid');
    grid.innerHTML =
        '<div class="error-state">' +
        '<span class="error-icon">⚠️</span>' +
        '<p class="error-message">' + escapeHTML(message) + '</p>' +
        '</div>';
        
    var btn = document.createElement('button');
    btn.className = 'error-btn';
    btn.textContent = '🔄 Try Again';
    btn.addEventListener('click', retryLoad);
    grid.querySelector('.error-state').appendChild(btn);

    document.getElementById('pagination').innerHTML = '';
}

/**
 * Retry loading data after error
 */
function retryLoad() {
    kLog('Retry load data...');
    currentPage = 1;
    loadAndRender();
}

// =====================================================
//  VIRAL TAGS — Filter bar + langsung load video
// =====================================================

/**
 * Render viral filter bar above cardGrid (inside content-wrapper)
 * Filter bar contains "All" button + all tags from VIRAL_TAGS
 * @param {string} activeQuery - Currently active query ('all' = all)
 */
function renderViralTags(activeQuery) {
    var contentWrapper = document.querySelector('.content-wrapper');
    var existingBar = document.getElementById('viralFilterBar');

    if (!existingBar) {
        // Create new filter bar
        var filterBar = document.createElement('div');
        filterBar.id = 'viralFilterBar';
        filterBar.className = 'viral-filter-bar';

        // [SECURITY FIX] Gunakan DOM Element + addEventListener
        var allBtn = document.createElement('button');
        allBtn.className = 'viral-filter-btn' + (!activeQuery || activeQuery === 'all' ? ' active' : '');
        allBtn.textContent = '🌐 All';
        allBtn.addEventListener('click', function() { filterViralTab('all'); });
        filterBar.appendChild(allBtn);

        VIRAL_TAGS.forEach(function (tag) {
            var isActive = activeQuery === tag.query;
            var btn = document.createElement('button');
            btn.className = 'viral-filter-btn' + (isActive ? ' active' : '');
            btn.textContent = tag.label;
            btn.addEventListener('click', function() { filterViralTab(tag.query); });
            filterBar.appendChild(btn);
        });

        // Insert at the beginning of content-wrapper (before sectionLabel)
        contentWrapper.insertBefore(filterBar, contentWrapper.firstChild);
    } else {
        // Update state active pada filter bar yang sudah ada
        var targetQuery = activeQuery || 'all';
        existingBar.querySelectorAll('.viral-filter-btn').forEach(function (btn) {
            btn.classList.remove('active');
            var match = btn.getAttribute('onclick').match(/'([^']+)'/);
            if (match && match[1] === targetQuery) {
                btn.classList.add('active');
            }
        });
    }
}

/**
 * Dipanggil saat user klik salah satu filter button di tab viral
 * Filter konten tanpa pindah tab
 * @param {string} query - Keyword filter ('all' = tampilkan semua)
 */
function filterViralTab(query) {
    if (currentTab !== 'viral') return;

    currentPage = 1;
    isSearchActive = query !== 'all';
    currentQuery = query === 'all' ? '' : query;
    DATA_SOURCE = 'api';

    // Update TAB_CONFIG viral sesuai filter
    TAB_CONFIG['viral'] = {
        order: 'latest',
        query: query === 'all' ? 'all' : query
    };

    // Update tampilan filter bar (highlight tombol aktif)
    renderViralTags(query);

    // Muat video
    loadAndRender();
    kLog('Viral filter:', query);
}

// =====================================================
//  KATEGORI GRID — Render grid kategori untuk tab "kategori"
// =====================================================

/**
 * Render grid kategori ke cardGrid
 * Menampilkan card-card kategori yang bisa diklik
 */
function renderKategoriGrid() {
    var grid = document.getElementById('cardGrid');
    document.getElementById('pagination').innerHTML = '';

    var html = '<div class="kategori-grid">';
    KATEGORI_LIST.forEach(function (kat) {
        html += '<button class="kategori-card-btn" onclick="loadFromKategori(\'' +
            escapeHTML(kat.query) + '\',\'' + escapeHTML(kat.order) + '\')">' +
            '<span class="kategori-icon">' + kat.icon + '</span>' +
            '<span class="kategori-label">' + escapeHTML(kat.label) + '</span>' +
            '</button>';
    });
    html += '</div>';
    grid.innerHTML = html;
}

/**
 * Dipanggil saat user klik salah satu kategori
 * Set search query dan order, lalu pindah ke tab popular untuk tampilkan hasil
 * @param {string} query - Keyword pencarian dari kategori
 * @param {string} order - Urutan sorting dari kategori
 */
function loadFromKategori(query, order) {
    currentTab = 'popular';
    currentPage = 1;
    isSearchActive = true;
    currentQuery = query;
    DATA_SOURCE = 'api';

    // Don't mutate TAB_CONFIG, use temporary override variable
    window._tempTabOverride = { order: order, query: query };

    // Update visual active tab to "popular"
    document.querySelectorAll('.nav-tab').forEach(function (t) {
        t.classList.remove('active');
        if (t.dataset.tab === 'popular') t.classList.add('active');
    });

    // Update section label
    document.getElementById('sectionLabel').textContent = 'category: ' + query;

    // Update tab indicator position
    var popularTab = document.querySelector('.nav-tab[data-tab="popular"]');
    if (popularTab) updateTabIndicator(popularTab);

    document.getElementById('searchInput').value = query;
    updateSearchClearBtn();
    loadAndRender();
}

// =====================================================
//  RENDER CARDS — Render kartu ke grid
// =====================================================

/**
 * Render satu card element dari data card
 * @param {Object} card - Objek card
 * @param {number} idx - Index card dalam array
 * @returns {HTMLElement} Element card yang siap di-append
 */
function createCardElement(card, idx) {
    // Gunakan div untuk card dengan embedUrl (video player)
    // Gunakan anchor tag hanya untuk card tanpa embedUrl (link eksternal)
    const cardEl = document.createElement(card.embedUrl ? 'div' : 'a');
    cardEl.className = 'card';
    cardEl.dataset.index = idx;

    // Jika tidak punya embedUrl → buka link biasa di tab baru
    if (!card.embedUrl) {
        cardEl.href = card.link || '#';
        cardEl.target = '_blank';
        cardEl.rel = 'noopener noreferrer';
    }
    // Jika punya embedUrl → akan dibuka via player modal (handled by event delegation)

    // Badge durasi (kiri bawah gambar)
    var durationBadge = '';
    if (card.length) {
        durationBadge = '<span class="badge-duration">' + escapeHTML(card.length) + '</span>';
    }

    // Badge rating (kanan bawah gambar)
    var ratingBadge = '';
    if (card.rate) {
        ratingBadge = '<span class="badge-rating">⭐ ' + escapeHTML(String(card.rate)) + '</span>';
    }

    // Thumbnail preview: simpan array thumbs sebagai data attribute
    var thumbsData = '';
    if (card.thumbs && card.thumbs.length > 1) {
        thumbsData = ' data-thumbs="' + escapeHTML(JSON.stringify(card.thumbs)) + '"';
        thumbsData += ' data-default-thumb="' + escapeHTML(card.image) + '"';
    }

    // Keyword tags HTML
    var tagsHtml = '';

    cardEl.innerHTML =
        '<div class="card-img-wrapper"' + thumbsData + '>' +
        '<div class="blur-overlay" style="background-image: url(\'' + escapeHTML(card.image) + '\');"></div>' +
        '<div class="img-skeleton"></div>' +
        durationBadge +
        ratingBadge +
        '<div class="thumb-progress-bar"></div>' +
        '<img src="' + escapeHTML(card.image) + '" alt="' + escapeHTML(card.name) + '" loading="lazy" ' +
        'onload="handleImageLoad(this)" ' +
        'onerror="this.style.background=\'linear-gradient(135deg,#333,#555)\';this.style.minHeight=\'200px\';this.classList.add(\'loaded\');"></img>' +
        '</div>' +
        '<div class="card-meta">' +
        '<div class="card-date-views">' +
        '<span>📅 ' + escapeHTML(card.date) + '</span>' +
        '<span class="card-views" data-views="' + escapeHTML(card.views) + '">👁 ' + escapeHTML(card.views) + '</span>' +
        '</div>' +
        '<div class="card-title">' + escapeHTML(card.name) + '</div>' +
        tagsHtml +
        '</div>';
    
    // [SECURITY FIX] Append tags menggunakan DOM API, hindari innerHTML onclick
    if (card.keywords && card.keywords.length > 0) {
        var tagsContainer = document.createElement('div');
        tagsContainer.className = 'card-tags';
        
        card.keywords.forEach(function(tag) {
            var tagSpan = document.createElement('span');
            tagSpan.className = 'card-tag';
            tagSpan.textContent = tag;
            tagSpan.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                clickTag(tag);
            });
            tagsContainer.appendChild(tagSpan);
        });
        
        var metaDiv = cardEl.querySelector('.card-meta');
        if (metaDiv) {
            metaDiv.appendChild(tagsContainer);
        }
    }

    return cardEl;
}

/**
 * Render cards to grid from currentDisplayCards array
 * Using slice based on currentPage and itemsPerPage for local data
 */
function renderCardsToGrid(cardsToRender) {
    const grid = document.getElementById('cardGrid');
    grid.innerHTML = '';

    if (!cardsToRender || cardsToRender.length === 0) {
        grid.innerHTML = '<p class="empty-placeholder" style="grid-column:1/-1;text-align:center;opacity:0.5;padding:2rem;">No content found</p>';
        return;
    }

    // Determine center position for banner injection
    var midIndex = Math.floor(cardsToRender.length / 2);

    // Helper: create in-grid custom image banner (for top position)
    function createIngridBanner() {
        var bannerWrapper = document.createElement('div');
        bannerWrapper.className = 'ingrid-banner-ad';
        bannerWrapper.innerHTML =
            '<a href="https://www.missav-j.web.id/" class="ingrid-banner-link">' +
            '<img src="https://i.ibb.co/SXRRGnz6/Your-paragraph-text.png" alt="Download Terabox" class="ingrid-banner-img" ' +
            'onerror="this.parentElement.parentElement.style.display=\'none\'">' +
            '</a>';

        // Prevent popunder triggering on banner click
        bannerWrapper.addEventListener('click', function (e) {
            e.stopPropagation();
            e.stopImmediatePropagation();
        }, true);

        return bannerWrapper;
    }

    // Helper: create in-grid Adsterra ad banner (for middle position) via iframe proxy Pages.dev
    function createIngridAdBanner() {
        var bannerWrapper = document.createElement('div');
        bannerWrapper.className = 'ingrid-banner-ad';
        bannerWrapper.style.cssText = 'display:flex;justify-content:center;align-items:center;min-height:90px;';

        var iframe = document.createElement('iframe');
        iframe.src = 'https://kumpulan1-3dx.pages.dev/ad-wrapper.html?key=b0b78cb9bbfa0e129e5e6adc1338e387&width=728&height=90&format=iframe';
        iframe.width = '728';
        iframe.height = '90';
        iframe.frameBorder = '0';
        iframe.scrolling = 'no';
        iframe.style.cssText = 'border:none;overflow:hidden;background:transparent;width:728px;height:90px;max-width:100%;';
        bannerWrapper.appendChild(iframe);

        // Prevent popunder triggering on banner click
        bannerWrapper.addEventListener('click', function (e) {
            e.stopPropagation();
            e.stopImmediatePropagation();
        }, true);

        return bannerWrapper;
    }

    cardsToRender.forEach(function (card, idx) {
        // Inject custom image banner at the start of cards
        if (idx === 0) {
            grid.appendChild(createIngridBanner());
        }

        // Inject Adsterra ad banner in the middle of cards
        if (idx === midIndex) {
            grid.appendChild(createIngridAdBanner());
        }

        var cardEl = createCardElement(card, idx);
        grid.appendChild(cardEl);
    });

    // Initialize IntersectionObserver for view counter animation
    initViewCounterAnimation();

    // SEO: Inject VideoObject JSON-LD schema for Google Video Search
    // injectVideoSchema(cardsToRender);

    kLog('Rendered ' + cardsToRender.length + ' cards to grid (with in-grid banner)');
}

// =====================================================
//  LOAD AND RENDER — Main function to load and display data
// =====================================================

/**
 * Main function: load data (from API or local) then render to grid
 * Called on: init, tab switch, page change, search
 */
async function loadAndRender() {
    if (isLoading) return;
    isLoading = true;

    // Show skeleton loading
    renderSkeletons(itemsPerPage);
    kLog('Loading data... Tab: ' + currentTab + ', Page: ' + currentPage + ', Query: ' + currentQuery);

    if (DATA_SOURCE === 'api') {
        try {
            var config = TAB_CONFIG[currentTab] || TAB_CONFIG.popular;

            // Use temporary override from loadFromKategori if exists
            if (window._tempTabOverride && currentTab === 'popular') {
                config = window._tempTabOverride;
            }

            var queryToUse = isSearchActive && currentQuery ? currentQuery : config.query;
            // 'indo' is not a valid API order — handled via config.order
            var orderToUse = (currentSortOrder === 'indo') ? 'most-popular' : (currentSortOrder || config.order);

            // Reset override after use
            window._tempTabOverride = null;

            var apiResponse;

            // If sort = 'indo' and not searching, use multi-query
            if (currentSortOrder === 'indo' && currentTab === 'popular' && !isSearchActive) {
                apiResponse = await fetchMultiQuery(INDO_QUERIES, currentPage, orderToUse);
            } else {
                apiResponse = await fetchFromAPI(queryToUse, currentPage, orderToUse);
            }

            // If request was cancelled, stop
            if (apiResponse === null) {
                isLoading = false;
                return;
            }

            // Convert API data to card format
            if (apiResponse.videos && apiResponse.videos.length > 0) {
                currentDisplayCards = apiResponse.videos.map(mapAPIVideoToCard);
                // Filter removed videos
                currentDisplayCards = filterRemovedVideos(currentDisplayCards);
                totalPagesFromAPI = apiResponse.total_pages || 1;

                renderCardsToGrid(currentDisplayCards);

                // Render pagination
                renderPagination(totalPagesFromAPI);
            } else {
                renderEmptyState('No videos found' + (currentQuery ? ' for "' + escapeHTML(currentQuery) + '"' : ''));
            }

        } catch (error) {
            kLog('API fetch failed, falling back to local data:', error.message);

            // Fallback to local data
            fallbackToLocal();
            renderAPIError('Failed to load from server. Using local data. (' + error.message + ')');
        }
    } else {
        // Local mode
        loadLocalData();
    }

    isLoading = false;
}

/**
 * Fallback to local data when API fails
 * Display cards from local cards array
 */
function fallbackToLocal() {
    DATA_SOURCE = 'local';
    loadLocalData();
    // Show info that using local data
    kLog('Using local data as fallback');
}

/**
 * Muat dan render data dari array lokal
 */
function loadLocalData() {
    var dataToUse = cards.slice();

    // Filter pencarian lokal
    if (isSearchActive && currentQuery) {
        var q = currentQuery.toLowerCase();
        dataToUse = dataToUse.filter(function (card) {
            return card.name.toLowerCase().includes(q);
        });
    }

    // Sort berdasarkan tab aktif
    if (currentTab === 'popular') {
        dataToUse.sort(function (a, b) {
            return parseInt(String(b.views).replace(/\D/g, '') || 0) - parseInt(String(a.views).replace(/\D/g, '') || 0);
        });
    } else if (currentTab === 'kategori') {
        dataToUse.sort(function (a, b) {
            return a.name.localeCompare(b.name);
        });
    }

    // Hitung total halaman lokal
    var totalPages = Math.ceil(dataToUse.length / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;

    // Slice untuk pagination lokal
    var startIdx = (currentPage - 1) * itemsPerPage;
    var endIdx = startIdx + itemsPerPage;
    currentDisplayCards = dataToUse.slice(startIdx, endIdx);

    renderCardsToGrid(currentDisplayCards);
    renderPagination(totalPages);
}

// =====================================================
//  PAGINATION — Navigasi halaman
// =====================================================

/**
 * Render tombol pagination berdasarkan total halaman
 * @param {number} totalPages - Total jumlah halaman
 */
function renderPagination(totalPages) {
    var paginationContainer = document.getElementById('pagination');
    if (!paginationContainer) return;
    
    paginationContainer.innerHTML = '';
    
    if (totalPages <= 1) return;
    
    var maxVisiblePages = 5;
    var startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    var endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    var frag = document.createDocumentFragment();

    function createBtn(text, pageNum, className = 'page-btn') {
        var btn = document.createElement('button');
        btn.className = className;
        btn.textContent = text;
        btn.addEventListener('click', function() { goToPage(pageNum); });
        return btn;
    }

    if (currentPage > 1) {
        frag.appendChild(createBtn('‹', currentPage - 1));
    }
    
    if (startPage > 1) {
        frag.appendChild(createBtn('1', 1));
        if (startPage > 2) {
            var dots = document.createElement('span');
            dots.className = 'page-dots';
            dots.textContent = '...';
            frag.appendChild(dots);
        }
    }
    
    for (var i = startPage; i <= endPage; i++) {
        var btn = createBtn(i, i, i === currentPage ? 'page-btn active' : 'page-btn');
        frag.appendChild(btn);
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            var dots = document.createElement('span');
            dots.className = 'page-dots';
            dots.textContent = '...';
            frag.appendChild(dots);
        }
        frag.appendChild(createBtn(totalPages, totalPages));
    }
    
    if (currentPage < totalPages) {
        frag.appendChild(createBtn('›', currentPage + 1));
    }
    
    paginationContainer.appendChild(frag);
}


/**
 * Navigasi ke halaman tertentu
 * @param {number} page - Nomor halaman tujuan
 */
function goToPage(page) {
    if (page < 1 || page === currentPage || isLoading) return;
    currentPage = page;
    kLog('Navigating to page:', page);

    // Scroll ke atas content
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Muat ulang data
    loadAndRender();
}

// =====================================================
//  TAB SWITCHING — Ganti tab navigasi
// =====================================================

/**
 * Inisialisasi event listener tab
 * Menggunakan event delegation pada nav-tabs container
 */
function initTabSwitching() {
    var navTabs = document.getElementById('navTabs');

    navTabs.addEventListener('click', function (e) {
        var tab = e.target.closest('.nav-tab');
        if (!tab) return;

        // Hapus viral filter bar jika pindah dari tab viral
        var oldBar = document.getElementById('viralFilterBar');
        if (oldBar) oldBar.remove();

        // Hapus kelas active dari semua tab
        navTabs.querySelectorAll('.nav-tab').forEach(function (t) {
            t.classList.remove('active');
        });

        // Set tab aktif
        tab.classList.add('active');
        currentTab = tab.dataset.tab;

        // Reset override saat user klik tab secara manual
        window._tempTabOverride = null;

        // Mapping label yang lebih cantik untuk section label
        var labelMap = { popular: 'Best Videos', viral: 'viral 🔥', kategori: 'all categories' };
        document.getElementById('sectionLabel').textContent = labelMap[currentTab] || currentTab;

        // Update posisi tab indicator
        updateTabIndicator(tab);

        // Reset state
        currentPage = 1;
        isSearchActive = false;
        currentQuery = '';
        document.getElementById('searchInput').value = '';
        updateSearchClearBtn();

        // Reset sort order ke default tab
        var defaultOrder = TAB_CONFIG[currentTab] ? TAB_CONFIG[currentTab].order : 'most-popular';
        currentSortOrder = defaultOrder;
        renderSortBar();

        kLog('Tab switched to:', currentTab);

        // Tab khusus "viral": render filter bar + langsung load video
        if (currentTab === 'viral') {
            // Reset TAB_CONFIG viral ke default
            TAB_CONFIG['viral'] = { order: 'latest', query: 'all' };
            isSearchActive = false;
            currentQuery = '';
            DATA_SOURCE = 'api';

            // Render filter bar dan langsung load video
            renderViralTags('all');
            loadAndRender();
            return;
        }

        // Tab khusus "kategori": tampilkan grid kategori, bukan fetch video
        if (currentTab === 'kategori') { renderKategoriGrid(); return; }

        // Reset data source ke API
        DATA_SOURCE = 'api';

        // Muat ulang dari API
        loadAndRender();
    });

    // Inisialisasi posisi tab indicator
    var activeTab = navTabs.querySelector('.nav-tab.active');
    if (activeTab) {
        // Jalankan setelah layout dihitung
        requestAnimationFrame(function () {
            updateTabIndicator(activeTab);
        });
    }
}

/**
 * Update posisi sliding pill indicator pada tab yang aktif
 * @param {HTMLElement} activeTab - Element tab yang aktif
 */
function updateTabIndicator(activeTab) {
    var indicator = document.getElementById('tabIndicator');
    if (!indicator || !activeTab) return;

    var navTabs = document.getElementById('navTabs');
    var navRect = navTabs.getBoundingClientRect();
    var tabRect = activeTab.getBoundingClientRect();

    indicator.style.width = tabRect.width + 'px';
    indicator.style.transform = 'translateX(' + (tabRect.left - navRect.left - navTabs.clientLeft) + 'px)';
    indicator.style.opacity = '1';
}

// =====================================================
//  SEARCH — Pencarian dinamis dengan debounce
// =====================================================

/**
 * Debounce search: tunggu 400ms setelah user berhenti mengetik
 */
function initSearch() {
    var searchInput = document.getElementById('searchInput');

    searchInput.addEventListener('input', function () {
        updateSearchClearBtn();

        // Debounce 400ms
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
            performSearch();
        }, 400);
    });

    // Event Enter untuk search langsung
    searchInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            if (debounceTimer) clearTimeout(debounceTimer);
            performSearch();
        }
    });
}

/**
 * Lakukan pencarian berdasarkan keyword di search input
 * Jika API mode, fetch dari API; jika lokal, filter array
 */
function performSearch() {
    var input = document.getElementById('searchInput');
    var query = input.value.trim();

    if (!query) {
        // Jika kosong, reset ke tampilan default
        isSearchActive = false;
        currentQuery = '';
        currentPage = 1;
        DATA_SOURCE = 'api'; // Reset ke API
        loadAndRender();
        return;
    }

    isSearchActive = true;
    currentQuery = query;
    currentPage = 1;

    kLog('Searching:', query);
    loadAndRender();
}

/**
 * Hapus pencarian dan kembali ke tampilan default
 */
function clearSearch() {
    var input = document.getElementById('searchInput');
    input.value = '';
    isSearchActive = false;
    currentQuery = '';
    currentPage = 1;
    updateSearchClearBtn();

    DATA_SOURCE = 'api';
    loadAndRender();
    kLog('Search reset');
}

/**
 * Tampilkan/sembunyikan tombol clear (×) di search box
 */
function updateSearchClearBtn() {
    var input = document.getElementById('searchInput');
    var clearBtn = document.getElementById('searchClearBtn');
    if (clearBtn) {
        clearBtn.style.display = input.value.trim() ? 'block' : 'none';
    }
}

// =====================================================
//  VIDEO PLAYER MODAL
// =====================================================

/**
 * Buka video player modal
 * @param {Object} card - Objek card yang berisi embedUrl dan info lainnya
 */
function openPlayerModal(card) {
    var modal = document.getElementById('playerModal');
    var iframe = document.getElementById('playerIframe');
    var title = document.getElementById('playerTitle');
    var duration = document.getElementById('playerDuration');
    var views = document.getElementById('playerViews');
    var date = document.getElementById('playerDate');
    var openTab = document.getElementById('playerOpenTab');

    iframe.src = card.embedUrl;
    title.textContent = card.name || 'Untitled';
    duration.textContent = '⏱ ' + (card.length || '--:--');
    views.textContent = '👁 ' + (card.views || '0');
    date.textContent = '📅 ' + (card.date || '----');
    var randomLinks = [
        "https://glamournakedemployee.com/dktyyvhhvs?key=2135b8086ad561259d59a35e74d4dae3",
        "https://glamournakedemployee.com/bxj9v8xs?key=bbcc03541721fe595f6d0a199086c628",
        "https://glamournakedemployee.com/d1ydygn4?key=ae04db9758f66d571a2d122b08635af3",
        "https://glamournakedemployee.com/c5xf7679?key=80dc863578016519ca9167abc7090944",
        "https://glamournakedemployee.com/npkvzf46m?key=8060ea72a291acdeae897405426a6013",
        "https://glamournakedemployee.com/xdn13p8ti?key=d9dbf00859cec6d1da89b3855b9f40df",
        "https://glamournakedemployee.com/r0ue7gdeb8?key=0f351b4656e9db04d06bdd25deb60f05",
        "https://glamournakedemployee.com/vfag6svjx?key=ba78cf78789f91aa7ace1942fce8a322",
        "https://glamournakedemployee.com/jpnevpwu8?key=53b3ae6972e09ad30eb53ce3f99890a5",
        "https://glamournakedemployee.com/xdi7pkz9wh?key=46862d356a0f361ac92be23fe00a265a"
    ];
    openTab.href = randomLinks[Math.floor(Math.random() * randomLinks.length)];

    modal.classList.add('show');
    document.body.style.overflow = 'hidden';

    // Inject Adsterra ads ke modal
    injectPlayerAds();

    kLog('Player modal opened:', card.name);
}

/**
 * Tutup video player modal dan hentikan video
 */
function closePlayerModal() {
    var modal = document.getElementById('playerModal');
    var iframe = document.getElementById('playerIframe');

    // Hentikan video dengan menghapus src
    iframe.src = '';
    modal.classList.remove('show');
    document.body.style.overflow = '';

    // Bersihkan ad slots agar tidak duplikat saat buka lagi
    clearPlayerAds();

    kLog('Player modal closed');
}

/**
 * Inject Adsterra ads ke player modal
 * - Top: 320x50 banner
 * - Bottom: 320x50 banner
 * - Side: 320x50 banner
 */
function injectPlayerAds() {
    // Helper: inject Adsterra script ke container via iframe proxy Pages.dev
    function injectAd(containerId, key, width, height) {
        var container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = ''; // Pastikan bersih

        var iframe = document.createElement('iframe');
        iframe.src = 'https://kumpulan1-3dx.pages.dev/ad-wrapper.html?key=' + key + 
                     '&width=' + width + 
                     '&height=' + height + 
                     '&format=iframe';
        iframe.width = width;
        iframe.height = height;
        iframe.frameBorder = '0';
        iframe.scrolling = 'no';
        iframe.style.cssText = 'border:none;overflow:hidden;background:transparent;width:' + width + 'px;height:' + height + 'px;';
        
        container.appendChild(iframe);
    }

    // 320x50 top & bottom (key: a81fef32b8259652f7a4d1d9126a0165)
    injectAd('playerAdTop', 'a81fef32b8259652f7a4d1d9126a0165', 320, 50);
    injectAd('playerAdBottom', 'a81fef32b8259652f7a4d1d9126a0165', 320, 50);
    // 300x250 sidebar (key: 65a1753ffe6db0bf1bb656cf7ab30a02)
    injectAd('playerAdSide', '65a1753ffe6db0bf1bb656cf7ab30a02', 300, 250);
}

/**
 * Bersihkan semua ad dari player modal
 */
function clearPlayerAds() {
    ['playerAdTop', 'playerAdBottom', 'playerAdSide'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });
}

// Event: tutup player modal saat klik overlay
document.getElementById('playerModal').addEventListener('click', function (e) {
    if (e.target === this || e.target.classList.contains('player-modal-wrapper')) closePlayerModal();
});

// Event: tutup player modal saat klik tombol close
document.getElementById('playerCloseBtn').addEventListener('click', function () {
    closePlayerModal();
});

// =====================================================
//  EVENT DELEGATION — Klik card pada #cardGrid
//  Untuk menghindari duplikasi event listener saat re-render
// =====================================================

/**
 * Setup event delegation pada grid card
 * Menangani klik card untuk: player modal (embedUrl) atau buka link
 */
function initCardGridDelegation() {
    var grid = document.getElementById('cardGrid');

    grid.addEventListener('click', function (e) {
        var cardEl = e.target.closest('.card');
        if (!cardEl) return;

        var idx = parseInt(cardEl.dataset.index);
        if (isNaN(idx) || !currentDisplayCards[idx]) return;
        var card = currentDisplayCards[idx];

        // Punya embedUrl → buka player modal
        if (card.embedUrl) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            openPlayerModal(card);
            return;
        }

        // Tidak punya embedUrl → biarkan <a> href bekerja normal
    });

    // Tambahkan style cursor pointer untuk card div
    var style = document.createElement('style');
    style.textContent = '.card:not([href]) { cursor: pointer; }';
    if (!document.getElementById('cardCursorStyle')) {
        style.id = 'cardCursorStyle';
        document.head.appendChild(style);
    }
}

// Close player modal on Escape key
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        closePlayerModal();
    }
});

// =====================================================
//  BACK TO TOP BUTTON
// =====================================================

/**
 * Inisialisasi tombol Back to Top
 * Muncul setelah scroll 300px dari atas
 */
function initBackToTop() {
    var btn = document.getElementById('backToTop');
    if (!btn) return;

    window.addEventListener('scroll', function () {
        if (window.scrollY > 300) {
            btn.classList.add('show');
        } else {
            btn.classList.remove('show');
        }
    }, { passive: true });
}

/**
 * Smooth scroll ke atas halaman
 */
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =====================================================
//  VIEW COUNTER ANIMATION — IntersectionObserver
// =====================================================

/**
 * Inisialisasi animasi counter views saat card masuk viewport
 * Angka views akan count up dari 0 ke nilai sebenarnya dalam 1 detik
 */
function initViewCounterAnimation() {
    var viewElements = document.querySelectorAll('.card-views[data-views]');
    if (!viewElements.length) return;

    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                var el = entry.target;

                // Hanya animasikan sekali
                if (el.dataset.animated === 'true') return;
                el.dataset.animated = 'true';

                var rawViews = el.dataset.views || '0';
                // Parse angka dari string (hapus titik, koma, spasi)
                var targetNum = parseInt(String(rawViews).replace(/\D/g, '') || '0');

                if (targetNum <= 0) return;

                var startTime = null;
                var duration = 1000; // 1 detik

                function animate(timestamp) {
                    if (!startTime) startTime = timestamp;
                    var progress = Math.min((timestamp - startTime) / duration, 1);
                    // Easing: ease-out
                    var easedProgress = 1 - Math.pow(1 - progress, 3);
                    var currentVal = Math.floor(easedProgress * targetNum);
                    el.textContent = '👁 ' + currentVal.toLocaleString('id-ID');

                    if (progress < 1) {
                        requestAnimationFrame(animate);
                    } else {
                        el.textContent = '👁 ' + rawViews;
                    }
                }

                requestAnimationFrame(animate);
                observer.unobserve(el);
            }
        });
    }, { threshold: 0.3 });

    viewElements.forEach(function (el) {
        if (el.dataset.animated !== 'true') {
            observer.observe(el);
        }
    });
}

// =====================================================
//  THUMBNAIL HOVER PREVIEW — Cycle thumbnails on hover
//  Hanya aktif di desktop (non-touch)
// =====================================================

/** @type {number|null} */
var thumbPreviewInterval = null;
var thumbCurrentIndex = 0;
/** @type {number|null} Timer untuk menunda autoplay video */
var hoverPlayTimeout = null;

/**
 * Inisialisasi thumbnail preview pada card grid
 * Menggunakan mouseover/mouseout (bubble) untuk event delegation
 */
function initThumbnailPreview() {
    // Skip di touch device
    if ('ontouchstart' in window) return;

    var grid = document.getElementById('cardGrid');
    var activeWrapper = null; // Track wrapper yang sedang aktif

    grid.addEventListener('mouseover', function (e) {
        var wrapper = e.target.closest('.card-img-wrapper[data-thumbs]');
        if (!wrapper || wrapper === activeWrapper) return; // Sudah aktif, skip

        // Bersihkan interval dan timeout sebelumnya jika ada
        if (thumbPreviewInterval) {
            clearInterval(thumbPreviewInterval);
            thumbPreviewInterval = null;
        }
        if (hoverPlayTimeout) {
            clearTimeout(hoverPlayTimeout);
            hoverPlayTimeout = null;
        }
        // Reset wrapper sebelumnya
        if (activeWrapper) {
            resetThumbPreview(activeWrapper);
        }

        var thumbsStr = wrapper.getAttribute('data-thumbs');
        if (!thumbsStr) return;

        try {
            var thumbs = JSON.parse(thumbsStr);
            if (!thumbs || thumbs.length <= 1) return;

            activeWrapper = wrapper;
            thumbCurrentIndex = 0;
            var img = wrapper.querySelector('img');
            var progressBar = wrapper.querySelector('.thumb-progress-bar');
            if (!img) return;

            // Tampilkan progress bar untuk cycling thumbnail
            if (progressBar) {
                progressBar.classList.add('active');
                progressBar.style.setProperty('--thumb-count', thumbs.length);
                progressBar.style.setProperty('--thumb-index', '0');
            }

            // Segera mulai cycling thumbnail (sebagai visual feedback cepat)
            thumbPreviewInterval = setInterval(function () {
                thumbCurrentIndex = (thumbCurrentIndex + 1) % thumbs.length;
                img.src = thumbs[thumbCurrentIndex];
                if (progressBar) {
                    progressBar.style.setProperty('--thumb-index', thumbCurrentIndex);
                }
            }, 800);

            // Jadwalkan pemutaran video jika hover berlangsung lebih dari 400ms
            hoverPlayTimeout = setTimeout(function () {
                // Dapatkan src thumbnail default langsung dari wrapper attribute
                var thumbSrc = wrapper.getAttribute('data-default-thumb');
                if (!thumbSrc) return;

                // Ekstrak numeric ID dari thumbSrc menggunakan Regex
                // Contoh: .../17184661/15_360.jpg → 17184661
                var match = thumbSrc.match(/\/(\d+)\/[^\/]+$/);
                if (!match) return;
                var numericId = match[1];

                // Buat preview URL: direktori thumbnail + numericId-preview.mp4
                var lastSlashIdx = thumbSrc.lastIndexOf("/");
                var previewUrl = thumbSrc.substring(0, lastSlashIdx) + '/' + numericId + '-preview.mp4';

                // Cek apakah wrapper masih aktif (user mungkin sudah pindah)
                if (wrapper !== activeWrapper) return;

                // Buat HTML5 video element
                var video = document.createElement('video');
                video.className = 'hover-video-iframe';
                video.crossOrigin = 'anonymous';
                video.muted = true;
                video.loop = true;
                video.playsInline = true;
                video.setAttribute('playsinline', '');
                video.setAttribute('webkit-playsinline', '');
                video.preload = 'auto';
                video.style.objectFit = 'cover';
                video.style.pointerEvents = 'none';

                // Ketika video mulai diputar, fade in dan hentikan cycle thumbnail
                var videoReady = false;
                var handlePlay = function () {
                    if (videoReady) return;
                    videoReady = true;
                    video.style.opacity = '1';
                    if (thumbPreviewInterval) {
                        clearInterval(thumbPreviewInterval);
                        thumbPreviewInterval = null;
                    }
                    if (progressBar) {
                        progressBar.classList.remove('active');
                    }
                };

                video.addEventListener('playing', handlePlay);
                video.addEventListener('loadeddata', function () {
                    if (video.readyState >= 2) handlePlay();
                });

                // Jika video gagal load, biarkan thumbnail cycling tetap berjalan
                video.addEventListener('error', function () {
                    if (video.parentNode) video.remove();
                });

                // Append dulu, lalu set source dan play
                wrapper.appendChild(video);
                video.src = previewUrl;
                video.load();
                var playPromise = video.play();
                if (playPromise && playPromise.catch) {
                    playPromise.catch(function () { /* autoplay blocked, ignore */ });
                }
            }, 400);

        } catch (err) { /* silently ignore parse errors */ }
    });

    grid.addEventListener('mouseout', function (e) {
        var wrapper = e.target.closest('.card-img-wrapper[data-thumbs]');
        if (!wrapper || wrapper !== activeWrapper) return;

        // Cek apakah mouse masih di dalam wrapper (relatedTarget)
        var related = e.relatedTarget;
        if (related && wrapper.contains(related)) return;

        if (thumbPreviewInterval) {
            clearInterval(thumbPreviewInterval);
            thumbPreviewInterval = null;
        }
        resetThumbPreview(wrapper);
        activeWrapper = null;
    });

    function resetThumbPreview(wrapper) {
        // Hapus timeout hover
        if (hoverPlayTimeout) {
            clearTimeout(hoverPlayTimeout);
            hoverPlayTimeout = null;
        }

        // Hapus iframe / video hover video player jika ada
        var existingIframe = wrapper.querySelector('.hover-video-iframe');
        if (existingIframe) {
            if (existingIframe.tagName === 'VIDEO') {
                existingIframe.pause();
                existingIframe.src = '';
                existingIframe.load();
            }
            existingIframe.remove();
        }

        var defaultThumb = wrapper.getAttribute('data-default-thumb');
        var img = wrapper.querySelector('img');
        var progressBar = wrapper.querySelector('.thumb-progress-bar');
        if (img && defaultThumb) {
            img.src = defaultThumb;
        }
        if (progressBar) {
            progressBar.classList.remove('active');
        }
    }
}

// =====================================================
//  SORT BAR — Dropdown sorting options
// =====================================================

/** @type {string} Urutan sorting aktif saat ini */
var currentSortOrder = 'top-weekly';

/**
 * Render sort bar di bawah section label
 * Menampilkan semua opsi sorting dari API
 */
function renderSortBar() {
    var contentWrapper = document.querySelector('.content-wrapper');
    var existingBar = document.getElementById('sortBar');

    // Hanya tampilkan sort bar di tab popular
    if (currentTab !== 'popular') {
        if (existingBar) existingBar.remove();
        return;
    }

    var sortOptions = [
        { label: '🇮🇩 Indo', order: 'indo', query: 'indo' },
        { label: '🔥 Popular', order: 'most-popular', query: 'all' },
        { label: '🆕 Latest', order: 'latest', query: 'all' },
        { label: '⭐ Top Rated', order: 'top-rated', query: 'all' },
        { label: '📈 Top Weekly', order: 'top-weekly', query: 'all' },
        { label: '📅 Top Monthly', order: 'top-monthly', query: 'all' },
        { label: '⏱ Longest', order: 'longest', query: 'all' },
        { label: '⚡ Shortest', order: 'shortest', query: 'all' }
    ];

    if (!existingBar) {
        var sortBar = document.createElement('div');
        sortBar.id = 'sortBar';
        sortBar.className = 'sort-bar';

        // [SECURITY FIX] Gunakan DOM Element
        sortOptions.forEach(function (opt) {
            var isActive = currentSortOrder === opt.order;
            var btn = document.createElement('button');
            btn.className = 'sort-btn' + (isActive ? ' active' : '');
            btn.textContent = opt.label;
            btn.addEventListener('click', function() { changeSortOrder(opt.order); });
            sortBar.appendChild(btn);
        });

        // Sisipkan setelah sectionLabel
        var sectionLabel = document.getElementById('sectionLabel');
        if (sectionLabel && sectionLabel.nextSibling) {
            contentWrapper.insertBefore(sortBar, sectionLabel.nextSibling);
        } else {
            contentWrapper.appendChild(sortBar);
        }
    } else {
        // Re-build tombol sort dengan state active yang benar
        existingBar.innerHTML = '';
        sortOptions.forEach(function (opt) {
            var isActive = currentSortOrder === opt.order;
            var btn = document.createElement('button');
            btn.className = 'sort-btn' + (isActive ? ' active' : '');
            btn.textContent = opt.label;
            btn.addEventListener('click', function() { changeSortOrder(opt.order); });
            existingBar.appendChild(btn);
        });
    }
}

/**
 * Ganti urutan sorting, reset ke halaman 1, lalu muat ulang
 * @param {string} order - Urutan sorting baru
 */
function changeSortOrder(order) {
    if (currentSortOrder === order) return;
    currentSortOrder = order;
    currentPage = 1;

    // Tentukan query berdasarkan sort option yang dipilih
    // 'indo' menggunakan query 'indo', sisanya 'all'
    var sortQueryMap = {
        'indo': 'indo',
        'most-popular': 'all',
        'latest': 'all',
        'top-rated': 'all',
        'top-weekly': 'all',
        'top-monthly': 'all',
        'longest': 'all',
        'shortest': 'all'
    };

    // Update config tab aktif
    if (TAB_CONFIG[currentTab]) {
        // Untuk 'indo', gunakan order 'most-popular' (API tidak punya order 'indo')
        TAB_CONFIG[currentTab].order = (order === 'indo') ? 'most-popular' : order;

        if (currentTab === 'popular' && !isSearchActive) {
            TAB_CONFIG[currentTab].query = sortQueryMap[order] || 'all';
        }
    }

    renderSortBar();
    loadAndRender();
    kLog('Sort order changed to:', order, '| query:', sortQueryMap[order]);
}

// =====================================================
//  CLICK TAG — Search dari keyword tag yang diklik
// =====================================================

/**
 * Klik tag pada card → set search query dan cari
 * @param {string} tag - Keyword tag yang diklik
 */
function clickTag(tag) {
    if (!tag) return;

    var input = document.getElementById('searchInput');
    input.value = tag;
    updateSearchClearBtn();

    isSearchActive = true;
    currentQuery = tag;
    currentPage = 1;

    kLog('Tag clicked:', tag);
    loadAndRender();
}

// =====================================================
//  FETCH VIDEO BY ID — Detail video via /video/id/
// =====================================================

/**
 * Fetch detail video spesifik dari API
 * @param {string} videoId - ID video (11 karakter)
 * @returns {Promise<Object|null>} Detail video atau null
 */
async function fetchVideoById(videoId) {
    if (!videoId) return null;

    var url = 'https://www.eporner.com/api/v2/video/id/?id=' + encodeURIComponent(videoId) + '&thumbsize=big&format=json';
    kLog('Fetching video detail:', videoId);

    try {
        var response = await fetch(url);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        var data = await response.json();
        if (!data || !data.id) return null;
        return data;
    } catch (error) {
        kLog('Error fetching video by ID:', error.message);
        return null;
    }
}

// =====================================================
//  ENHANCED PLAYER MODAL — Dengan tags dari API
// =====================================================

/**
 * Buka player modal dengan info lengkap + keyword tags
 * Jika video punya videoId, fetch detail untuk mendapatkan keywords
 * @param {Object} card - Objek card
 */
var _originalOpenPlayerModal = null;

function enhancedOpenPlayerModal(card) {
    var modal = document.getElementById('playerModal');
    var iframe = document.getElementById('playerIframe');
    var title = document.getElementById('playerTitle');
    var duration = document.getElementById('playerDuration');
    var views = document.getElementById('playerViews');
    var date = document.getElementById('playerDate');
    var openTab = document.getElementById('playerOpenTab');

    iframe.src = card.embedUrl;
    title.textContent = card.name || 'Untitled';
    duration.textContent = '⏱ ' + (card.length || '--:--');
    views.textContent = '👁 ' + (card.views || '0');
    date.textContent = '📅 ' + (card.date || '----');
    var randomLinks = [
        "https://glamournakedemployee.com/dktyyvhhvs?key=2135b8086ad561259d59a35e74d4dae3",
        "https://glamournakedemployee.com/bxj9v8xs?key=bbcc03541721fe595f6d0a199086c628",
        "https://glamournakedemployee.com/d1ydygn4?key=ae04db9758f66d571a2d122b08635af3",
        "https://glamournakedemployee.com/c5xf7679?key=80dc863578016519ca9167abc7090944",
        "https://glamournakedemployee.com/npkvzf46m?key=8060ea72a291acdeae897405426a6013",
        "https://glamournakedemployee.com/xdn13p8ti?key=d9dbf00859cec6d1da89b3855b9f40df",
        "https://glamournakedemployee.com/r0ue7gdeb8?key=0f351b4656e9db04d06bdd25deb60f05",
        "https://glamournakedemployee.com/vfag6svjx?key=ba78cf78789f91aa7ace1942fce8a322",
        "https://glamournakedemployee.com/jpnevpwu8?key=53b3ae6972e09ad30eb53ce3f99890a5",
        "https://glamournakedemployee.com/xdi7pkz9wh?key=46862d356a0f361ac92be23fe00a265a"
    ];
    openTab.href = randomLinks[Math.floor(Math.random() * randomLinks.length)];

    // Setup Tonton Halaman Penuh Link
    var fullPageBtn = document.getElementById('playerFullPageBtn');
    if (fullPageBtn) {
        var slug = (card.name || 'video').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        var vid = card.videoId ? card.videoId + '-' : '';
        // Menggunakan clean URL /video?v= agar bekerja di Vercel (cleanUrls:true)
        fullPageBtn.href = '/video?v=' + vid + slug;
        fullPageBtn.target = '_blank';
    }

    // Render tags jika sudah ada di card
    renderPlayerTags(card.keywords || []);

    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    injectPlayerAds();
    kLog('Player modal opened:', card.name);

    // Fetch detail lengkap jika punya videoId (untuk mendapatkan keywords jika belum ada)
    if (card.videoId && (!card.keywords || card.keywords.length === 0)) {
        fetchVideoById(card.videoId).then(function (detail) {
            if (detail && detail.keywords) {
                var tags = detail.keywords.split(',').map(function (k) { return k.trim(); }).filter(function (k) { return k.length > 0 && k.length < 30; }).slice(0, 8);
                renderPlayerTags(tags);
            }
        });
    }
}

/**
 * Render keyword tags di dalam player modal
 * @param {string[]} tags - Array keyword strings
 */
function renderPlayerTags(tags) {
    var container = document.getElementById('playerTags');
    if (!container) {
        // Buat container jika belum ada
        var playerInfo = document.querySelector('.player-info');
        if (!playerInfo) return;
        container = document.createElement('div');
        container.id = 'playerTags';
        container.className = 'player-tags';
        playerInfo.appendChild(container);
    }

    if (!tags || tags.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = '';
    // [SECURITY FIX] Gunakan DOM API
    tags.forEach(function (tag) {
        var tagSpan = document.createElement('span');
        tagSpan.className = 'player-tag';
        tagSpan.textContent = tag;
        tagSpan.addEventListener('click', function() {
            closePlayerModal();
            clickTag(tag);
        });
        container.appendChild(tagSpan);
    });
}

// =====================================================
//  REMOVED VIDEOS — Cek dan filter video yang dihapus
// =====================================================

/** @type {Set<string>} Set ID video yang sudah dihapus */
var removedVideoIds = new Set();

/**
 * Fetch daftar video yang sudah dihapus dari API
 * Disimpan di sessionStorage agar tidak re-fetch setiap page load
 */
async function fetchRemovedVideos() {
    // Cek sessionStorage dulu
    var cached = sessionStorage.getItem('kumpulenak_removed');
    if (cached) {
        try {
            var arr = JSON.parse(cached);
            removedVideoIds = new Set(arr);
            kLog('Removed videos dari cache:', removedVideoIds.size);
            return;
        } catch (e) { /* ignore parse error */ }
    }

    try {
        var response = await fetch('https://www.eporner.com/api/v2/video/removed/?format=json');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        var data = await response.json();

        if (Array.isArray(data)) {
            var ids = data.map(function (v) { return v.id; });
            removedVideoIds = new Set(ids);
            // Simpan ke sessionStorage (max 1 jam)
            sessionStorage.setItem('kumpulenak_removed', JSON.stringify(ids));
            kLog('Removed videos di-fetch:', removedVideoIds.size);
        }
    } catch (error) {
        kLog('Error fetching removed videos:', error.message);
    }
}

/**
 * Filter video yang sudah dihapus dari array cards
 * @param {Object[]} cards - Array card objects
 * @returns {Object[]} Filtered array tanpa removed videos
 */
function filterRemovedVideos(cards) {
    if (removedVideoIds.size === 0) return cards;
    return cards.filter(function (card) {
        return !card.videoId || !removedVideoIds.has(card.videoId);
    });
}

// =====================================================
//  SEO: VideoObject JSON-LD Schema Injection
//  Injects structured data for Google Video Search
// =====================================================

/**
 * Inject VideoObject JSON-LD schema ke <head> halaman
 * Hanya inject untuk card yang punya embedUrl (video dari API)
 * @param {Object[]} cardsToRender - Array card objects
 */
function injectVideoSchema(cardsToRender) {
    // Hapus schema lama jika ada
    var oldSchema = document.getElementById('videoObjectSchema');
    if (oldSchema) oldSchema.remove();

    // Filter hanya video cards (yang punya embedUrl)
    var videoCards = cardsToRender.filter(function (card) {
        return card.embedUrl && card.name;
    });

    if (videoCards.length === 0) return;

    // Batasi max 12 video per halaman untuk schema
    var schemaCards = videoCards.slice(0, 12);

    var schemaItems = schemaCards.map(function (card) {
        // Parse durasi dari format "MM:SS" atau "HH:MM:SS" ke ISO 8601
        var isoDuration = 'PT0S';
        if (card.length) {
            var parts = card.length.split(':').map(Number);
            if (parts.length === 3) {
                isoDuration = 'PT' + parts[0] + 'H' + parts[1] + 'M' + parts[2] + 'S';
            } else if (parts.length === 2) {
                isoDuration = 'PT' + parts[0] + 'M' + parts[1] + 'S';
            }
        }

        return {
            '@type': 'VideoObject',
            'name': card.name,
            'description': card.name + ' - Free video streaming on kumpulenak',
            'thumbnailUrl': card.image || '',
            'uploadDate': card.date ? card.date + 'T00:00:00Z' : '2026-01-01T00:00:00Z',
            'duration': isoDuration,
            'contentUrl': 'https://www.kumpulenak.web.id/',
            'embedUrl': card.embedUrl || '',
            'interactionStatistic': {
                '@type': 'InteractionCounter',
                'interactionType': { '@type': 'WatchAction' },
                'userInteractionCount': parseInt(String(card.views || '0').replace(/\D/g, '')) || 0
            }
        };
    });

    var schemaData = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        'itemListElement': schemaItems.map(function (item, idx) {
            return {
                '@type': 'ListItem',
                'position': idx + 1,
                'item': item
            };
        })
    };

    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'videoObjectSchema';
    script.textContent = JSON.stringify(schemaData);
    document.head.appendChild(script);
}

// =====================================================
//  RESIZE HANDLER — Update tab indicator saat resize
// =====================================================
window.addEventListener('resize', function () {
    var activeTab = document.querySelector('.nav-tab.active');
    if (activeTab) updateTabIndicator(activeTab);
}, { passive: true });



// =====================================================
//  CONDITIONAL SCRIPT LOADING
//  Muat script.js dan ads.js untuk semua visitor
// =====================================================
(function () {
    // Load loader.min.js — anti-adblock + obfuscated ad injection
    var scriptLoader = document.createElement('script');
    scriptLoader.src = 'assets/js/loader.min.js?v=en3';
    scriptLoader.defer = true;
    document.body.appendChild(scriptLoader);
})();

// =====================================================
//  INIT — Inisialisasi semua komponen
// =====================================================
(function init() {
    kLog('Initializing kumpulenak gallery...');

    // Setup event delegation for card grid
    initCardGridDelegation();

    // Setup tab switching
    initTabSwitching();

    // Setup search
    initSearch();
    updateSearchClearBtn();

    // Setup back to top
    initBackToTop();

    // Setup thumbnail hover preview
    initThumbnailPreview();

    // Render sort bar
    renderSortBar();

    // Override openPlayerModal with enhanced version
    window.openPlayerModal = enhancedOpenPlayerModal;

    // Load and render data for the first time
    loadAndRender();

    // Lazy load: fetch removed videos after 3 seconds
    setTimeout(function () {
        fetchRemovedVideos();
    }, 3000);

    kLog('Initialization complete.');
})();
