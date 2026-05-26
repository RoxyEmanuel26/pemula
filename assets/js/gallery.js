/**
 * ==========================================================
 *  GALLERY.JS — Logika utama halaman gallery kumpulenak
 * ==========================================================
 *  File ini menangani:
 *  - Render kartu dari API / data lokal
 *  - Pagination yang berfungsi penuh
 *  - Search dinamis dengan debounce
 *  - Tab switching ke API
 *  - Video player modal
 *  - Dark/Light mode toggle
 *  - Loading, error, empty states
 *  - In-memory cache, AbortController, XSS escape
 *  - SEO: VideoObject JSON-LD schema injection
 * ==========================================================
 */

// =====================================================
//  CARD DATA — Data kartu lokal (fallback)
// =====================================================
let cards = [];

// =====================================================
//  STATE — Variabel state global
// =====================================================
let currentTab = 'popular';       // Tab aktif saat ini
let currentPage = 1;              // Halaman aktif saat ini
const itemsPerPage = 24;          // Jumlah item per halaman
let currentQuery = '';            // Keyword pencarian saat ini
let isSearchActive = false;       // Apakah sedang dalam mode pencarian
let isLoading = false;            // Apakah sedang memuat data
let totalPagesFromAPI = 1;        // Total halaman dari response API
let currentDisplayCards = [];     // Array card yang sedang ditampilkan
let debounceTimer = null;         // Timer untuk debounce search

/**
 * Sumber data: "api" untuk fetch dari Eporner API, "local" untuk data lokal
 * @type {"api"|"local"}
 */
let DATA_SOURCE = "api";

// =====================================================
//  KONFIGURASI TAB → PARAMETER API
//  Setiap tab punya parameter API sendiri
// =====================================================
const TAB_CONFIG = {
    popular: { order: 'most-popular', query: 'indo' },
    viral: { order: 'latest', query: 'all' },
    kategori: { order: 'top-weekly', query: 'all' }
};

// =====================================================
//  INDO MULTI-QUERY — Keywords gabungan untuk button Indo
//  API hanya support 1 query per request, jadi kita
//  fetch semua keyword paralel lalu gabungkan hasilnya
// =====================================================
const INDO_QUERIES = ['indo', 'cewe', 'bokep', 'mahasiswa', 'hijab', 'goyang'];

// =====================================================
//  VIRAL TAGS — Daftar tag/keyword untuk tab "viral"
// =====================================================
const VIRAL_TAGS = [
    { label: '🇮🇩 Indo', query: 'indonesia' },
    { label: '👩 Cewe', query: 'cewe' },
    { label: '🔥 Viral', query: 'viral' },
    { label: '📱 Bokep Indo', query: 'bokep indo' },
    { label: '🎓 Mahasiswi', query: 'mahasiswi' },
    { label: '💑 Pasutri', query: 'pasutri' },
    { label: '🏠 Rumahan', query: 'rumahan' },
    { label: '📸 Hijab', query: 'hijab' },
    { label: '🌙 Malam', query: 'malam' },
    { label: '💃 Goyang', query: 'goyang' },
    { label: '🎥 Live', query: 'live streaming' },
    { label: '⭐ Artis', query: 'artis indo' },
    { label: '🏖️ Pantai', query: 'pantai' },
    { label: '🏨 Hotel', query: 'hotel' },
    { label: '📲 TikTok', query: 'tiktok viral' },
    { label: '💋 Hot', query: 'hot indo' }
];

// =====================================================
//  KATEGORI LIST — Daftar semua kategori video
// =====================================================
const KATEGORI_LIST = [
    { label: '🔥 Most Popular', query: 'all', order: 'most-popular', icon: '🔥' },
    { label: '🆕 Terbaru', query: 'all', order: 'latest', icon: '🆕' },
    { label: '📈 Top Minggu Ini', query: 'all', order: 'top-weekly', icon: '📈' },
    { label: '📅 Top Bulan Ini', query: 'all', order: 'top-monthly', icon: '📅' },
    { label: '🇮🇩 Indonesia', query: 'indonesia', order: 'most-popular', icon: '🇮🇩' },
    { label: '👩 Cewek', query: 'girl', order: 'most-popular', icon: '👩' },
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
//  CACHE STORE — In-memory cache untuk response API
//  Key: "{tab}_{page}_{query}", expire 5 menit
// =====================================================
const cacheStore = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 menit dalam ms

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
//  DARK/LIGHT MODE — Toggle tema gelap dan terang
// =====================================================

/**
 * Inisialisasi tema berdasarkan cookie yang tersimpan
 * Default: dark mode
 */
function initTheme() {
    const savedTheme = getCookie('kumpulenak_theme');
    const theme = savedTheme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(theme);
    kLog('Tema diinisialisasi:', theme);
}

/**
 * Toggle tema antara dark dan light
 */
function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    setCookie('kumpulenak_theme', next, 30);
    updateThemeIcon(next);
    kLog('Tema diganti ke:', next);
}

/**
 * Update ikon tombol tema sesuai tema aktif
 * @param {string} theme - Tema yang aktif ("dark" atau "light")
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
 * Fetch data video dari Eporner API v2
 * @param {string} query - Keyword pencarian (default: "all")
 * @param {number} page - Nomor halaman (default: 1)
 * @param {string} order - Urutan sorting (default: "most-popular")
 * @returns {Promise<Object|null>} Response API atau null jika gagal
 */
async function fetchFromAPI(query, page, order) {
    // Buat cache key
    const cacheKey = currentTab + '_' + page + '_' + (query || 'all') + '_' + (order || 'latest');

    // Cek cache terlebih dahulu
    if (cacheStore[cacheKey] && (Date.now() - cacheStore[cacheKey].timestamp < CACHE_DURATION)) {
        kLog('Menggunakan cache untuk:', cacheKey);
        return cacheStore[cacheKey].data;
    }

    // Batalkan request sebelumnya jika masih berjalan
    if (currentAbortController) {
        currentAbortController.abort();
        kLog('Request sebelumnya dibatalkan');
    }

    // Buat AbortController baru
    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    // Bangun URL API
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
        // Fetch dengan timeout 10 detik
        const response = await Promise.race([
            fetch(apiUrl, { signal: signal }),
            new Promise(function (_, reject) {
                setTimeout(function () {
                    reject(new Error('Timeout: Request melebihi 10 detik'));
                }, 10000);
            })
        ]);

        if (!response.ok) {
            throw new Error('HTTP Error: ' + response.status);
        }

        const data = await response.json();

        // Simpan ke cache
        cacheStore[cacheKey] = {
            data: data,
            timestamp: Date.now()
        };

        kLog('API response diterima, total video:', data.total_count);
        return data;

    } catch (error) {
        // Jangan log error jika request dibatalkan secara sengaja
        if (error.name === 'AbortError') {
            kLog('Request dibatalkan oleh user');
            return null;
        }
        kLog('API error:', error.message);
        throw error;
    }
}

/**
 * Fetch multiple queries secara paralel dan gabungkan hasilnya
 * Digunakan untuk button "Indo" yang menggabungkan beberapa keyword
 * @param {string[]} queries - Array keyword yang akan difetch
 * @param {number} page - Nomor halaman (client-side pagination)
 * @param {string} order - Urutan sorting
 * @returns {Promise<Object|null>} Response gabungan dalam format yang sama dengan API
 */
async function fetchMultiQuery(queries, page, order) {
    // Cache key khusus multi-query
    var cacheKey = 'multi_' + queries.join('+') + '_' + page + '_' + order;

    if (cacheStore[cacheKey] && (Date.now() - cacheStore[cacheKey].timestamp < CACHE_DURATION)) {
        kLog('Menggunakan cache multi-query:', cacheKey);
        return cacheStore[cacheKey].data;
    }

    // Hitung berapa video per query agar total ~itemsPerPage
    var perQuery = Math.ceil(itemsPerPage / queries.length);
    // Untuk pagination, kita offset halaman per query
    var queryPage = page;

    kLog('Multi-query fetch:', queries.join(', '), '| per_query:', perQuery, '| page:', queryPage);

    // Fetch semua query secara paralel
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

        // Gabungkan semua video dari semua query
        var allVideos = [];
        var seenIds = {};
        var maxTotalPages = 1;

        results.forEach(function (res) {
            if (res && res.videos) {
                res.videos.forEach(function (v) {
                    // Deduplicate berdasarkan video ID
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

        // Acak urutan agar video dari berbagai query tercampur
        for (var i = allVideos.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = allVideos[i];
            allVideos[i] = allVideos[j];
            allVideos[j] = temp;
        }

        // Batasi ke itemsPerPage
        allVideos = allVideos.slice(0, itemsPerPage);

        // Format response seperti API biasa
        var mergedResponse = {
            count: allVideos.length,
            per_page: itemsPerPage,
            page: page,
            total_count: allVideos.length * maxTotalPages,
            total_pages: maxTotalPages,
            videos: allVideos
        };

        // Simpan ke cache
        cacheStore[cacheKey] = {
            data: mergedResponse,
            timestamp: Date.now()
        };

        kLog('Multi-query selesai, total video unik:', allVideos.length);
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
        keywordsArr = video.keywords.split(',').map(function (k) { return k.trim(); }).filter(function (k) { return k.length > 0 && k.length < 30; }).slice(0, 4);
    }
    // Ambil semua thumbnail URLs
    var thumbsArr = [];
    if (video.thumbs && video.thumbs.length > 0) {
        thumbsArr = video.thumbs.map(function (t) { return t.src; });
    }
    return {
        name: video.title || 'Untitled',
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
        btn.textContent = '🔄 Reset Pencarian';
        btn.addEventListener('click', clearSearch);
    } else {
        btn.textContent = '🔄 Coba Lagi';
        btn.addEventListener('click', retryLoad);
    }
    emptyDiv.appendChild(btn);

    document.getElementById('pagination').innerHTML = '';
}

// =====================================================
//  RENDER API ERROR — Error state
// =====================================================

/**
 * Tampilkan state error saat API gagal
 * @param {string} message - Pesan error yang ditampilkan
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
    btn.textContent = '🔄 Coba Lagi';
    btn.addEventListener('click', retryLoad);
    grid.querySelector('.error-state').appendChild(btn);

    document.getElementById('pagination').innerHTML = '';
}

/**
 * Coba muat ulang data setelah error
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
 * Render filter bar viral di atas cardGrid (di dalam content-wrapper)
 * Filter bar berisi tombol "Semua" + semua tag dari VIRAL_TAGS
 * @param {string} activeQuery - Query yang sedang aktif ('all' = semua)
 */
function renderViralTags(activeQuery) {
    var contentWrapper = document.querySelector('.content-wrapper');
    var existingBar = document.getElementById('viralFilterBar');

    if (!existingBar) {
        // Buat filter bar baru
        var filterBar = document.createElement('div');
        filterBar.id = 'viralFilterBar';
        filterBar.className = 'viral-filter-bar';

        // [SECURITY FIX] Gunakan DOM Element + addEventListener
        var allBtn = document.createElement('button');
        allBtn.className = 'viral-filter-btn' + (!activeQuery || activeQuery === 'all' ? ' active' : '');
        allBtn.textContent = '🌐 Semua';
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

        // Sisipkan di awal content-wrapper (sebelum sectionLabel)
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

    // Jangan mutasi TAB_CONFIG, gunakan variabel override sementara
    window._tempTabOverride = { order: order, query: query };

    // Update visual tab aktif ke "popular"
    document.querySelectorAll('.nav-tab').forEach(function (t) {
        t.classList.remove('active');
        if (t.dataset.tab === 'popular') t.classList.add('active');
    });

    // Update section label
    document.getElementById('sectionLabel').textContent = 'kategori: ' + query;

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
 * Render cards ke grid dari array currentDisplayCards
 * Menggunakan slice berdasarkan currentPage dan itemsPerPage untuk data lokal
 */
function renderCardsToGrid(cardsToRender) {
    const grid = document.getElementById('cardGrid');
    grid.innerHTML = '';

    if (!cardsToRender || cardsToRender.length === 0) {
        renderEmptyState('Tidak ada konten yang ditemukan');
        return;
    }

    // Tentukan posisi tengah untuk inject banner
    var midIndex = Math.floor(cardsToRender.length / 2);

    // Helper: buat in-grid custom image banner (untuk posisi atas)
    function createIngridBanner() {
        var bannerWrapper = document.createElement('div');
        bannerWrapper.className = 'ingrid-banner-ad';
        bannerWrapper.innerHTML =
            '<a href="https://www.missav-j.web.id/" class="ingrid-banner-link">' +
            '<img src="https://i.ibb.co/SXRRGnz6/Your-paragraph-text.png" alt="Download Terabox" class="ingrid-banner-img" ' +
            'onerror="this.parentElement.parentElement.style.display=\'none\'">' +
            '</a>';

        // Mencegah popunder terpicu saat klik banner
        bannerWrapper.addEventListener('click', function (e) {
            e.stopPropagation();
            e.stopImmediatePropagation();
        }, true);

        return bannerWrapper;
    }

    // Helper: buat in-grid Adsterra ad banner (untuk posisi tengah)
    function createIngridAdBanner() {
        var bannerWrapper = document.createElement('div');
        bannerWrapper.className = 'ingrid-banner-ad';
        bannerWrapper.style.cssText = 'display:flex;justify-content:center;align-items:center;min-height:90px;';

        // Inject Adsterra atOptions + invoke script
        var atScript = document.createElement('script');
        atScript.textContent = "atOptions = { 'key' : 'cffac27f60f026f84e02386788c1a06b', 'format' : 'iframe', 'height' : 90, 'width' : 728, 'params' : {} };";
        bannerWrapper.appendChild(atScript);

        var invokeScript = document.createElement('script');
        invokeScript.src = 'https://glamournakedemployee.com/cffac27f60f026f84e02386788c1a06b/invoke.js';
        bannerWrapper.appendChild(invokeScript);

        // Mencegah popunder terpicu saat klik banner
        bannerWrapper.addEventListener('click', function (e) {
            e.stopPropagation();
            e.stopImmediatePropagation();
        }, true);

        return bannerWrapper;
    }

    cardsToRender.forEach(function (card, idx) {
        // Inject custom image banner di awal card
        if (idx === 0) {
            grid.appendChild(createIngridBanner());
        }

        // Inject Adsterra ad banner di tengah-tengah card
        if (idx === midIndex) {
            grid.appendChild(createIngridAdBanner());
        }

        var cardEl = createCardElement(card, idx);
        grid.appendChild(cardEl);
    });

    // Inisialisasi IntersectionObserver untuk animasi view counter
    initViewCounterAnimation();

    // SEO: Inject VideoObject JSON-LD schema untuk Google Video Search
    injectVideoSchema(cardsToRender);

    kLog('Rendered ' + cardsToRender.length + ' cards ke grid (dengan in-grid banner)');
}

// =====================================================
//  LOAD AND RENDER — Fungsi utama untuk memuat dan menampilkan data
// =====================================================

/**
 * Fungsi utama: muat data (dari API atau lokal) lalu render ke grid
 * Ini dipanggil saat: init, ganti tab, ganti halaman, search
 */
async function loadAndRender() {
    if (isLoading) return;
    isLoading = true;

    // Tampilkan skeleton loading
    renderSkeletons(itemsPerPage);
    kLog('Memuat data... Tab: ' + currentTab + ', Page: ' + currentPage + ', Query: ' + currentQuery);

    if (DATA_SOURCE === 'api') {
        try {
            var config = TAB_CONFIG[currentTab] || TAB_CONFIG.popular;

            // Gunakan override sementara dari loadFromKategori jika ada
            if (window._tempTabOverride && currentTab === 'popular') {
                config = window._tempTabOverride;
            }

            var queryToUse = isSearchActive && currentQuery ? currentQuery : config.query;
            // 'indo' bukan order API yang valid — sudah dihandle via config.order
            var orderToUse = (currentSortOrder === 'indo') ? 'most-popular' : (currentSortOrder || config.order);

            // Reset override setelah digunakan
            window._tempTabOverride = null;

            var apiResponse;

            // Jika sort = 'indo' dan tidak sedang search, gunakan multi-query
            if (currentSortOrder === 'indo' && currentTab === 'popular' && !isSearchActive) {
                apiResponse = await fetchMultiQuery(INDO_QUERIES, currentPage, orderToUse);
            } else {
                apiResponse = await fetchFromAPI(queryToUse, currentPage, orderToUse);
            }

            // Jika request dibatalkan, hentikan
            if (apiResponse === null) {
                isLoading = false;
                return;
            }

            // Konversi data API ke format card
            if (apiResponse.videos && apiResponse.videos.length > 0) {
                currentDisplayCards = apiResponse.videos.map(mapAPIVideoToCard);
                // Filter video yang sudah dihapus
                currentDisplayCards = filterRemovedVideos(currentDisplayCards);
                totalPagesFromAPI = apiResponse.total_pages || 1;

                renderCardsToGrid(currentDisplayCards);

                // Render pagination
                renderPagination(totalPagesFromAPI);
            } else {
                renderEmptyState('Tidak ada video ditemukan' + (currentQuery ? ' untuk "' + escapeHTML(currentQuery) + '"' : ''));
            }

        } catch (error) {
            kLog('Gagal fetch API, fallback ke data lokal:', error.message);

            // Fallback ke data lokal
            fallbackToLocal();
            renderAPIError('Gagal memuat dari server. Menggunakan data lokal. (' + error.message + ')');
        }
    } else {
        // Mode lokal
        loadLocalData();
    }

    isLoading = false;
}

/**
 * Fallback ke data lokal saat API gagal
 * Menampilkan card dari array cards lokal
 */
function fallbackToLocal() {
    DATA_SOURCE = 'local';
    loadLocalData();
    // Tampilkan info bahwa menggunakan data lokal
    kLog('Menggunakan data lokal sebagai fallback');
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
    kLog('Berpindah ke halaman:', page);

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
        var labelMap = { popular: 'popular', viral: 'viral 🔥', kategori: 'semua kategori' };
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

        kLog('Tab diganti ke:', currentTab);

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

    kLog('Mencari:', query);
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
    kLog('Pencarian direset');
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
        "https://glamournakedemployee.com/xdi7pkz9wh?key=46862d356a0f361ac92be23fe00a265a",
        "https://omg10.com/4/10806721",
        "https://omg10.com/4/10806736",
        "https://omg10.com/4/10806719",
        "https://omg10.com/4/10806723",
        "https://omg10.com/4/10806731",
        "https://omg10.com/4/10806726",
        "https://omg10.com/4/10806729",
        "https://omg10.com/4/10806728",
        "https://omg10.com/4/10806730",
        "https://omg10.com/4/10806727"
    ];
    openTab.href = randomLinks[Math.floor(Math.random() * randomLinks.length)];

    modal.classList.add('show');
    document.body.style.overflow = 'hidden';

    // Inject Adsterra ads ke modal
    injectPlayerAds();

    kLog('Player modal dibuka:', card.name);
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

    kLog('Player modal ditutup');
}

/**
 * Inject Adsterra ads ke player modal
 * - Top: 320x50 banner
 * - Bottom: 320x50 banner
 * - Side: 320x50 banner
 */
function injectPlayerAds() {
    // Helper: inject Adsterra script ke container via iframe isolasi
    function injectAd(containerId, key, width, height) {
        var container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = ''; // Pastikan bersih

        var iframe = document.createElement('iframe');
        iframe.width = width;
        iframe.height = height;
        iframe.frameBorder = '0';
        iframe.scrolling = 'no';
        iframe.style.border = 'none';
        iframe.style.overflow = 'hidden';
        iframe.style.width = width + 'px';
        iframe.style.height = height + 'px';
        
        container.appendChild(iframe);

        try {
            var doc = iframe.contentDocument || iframe.contentWindow.document;
            doc.open();
            doc.write(
                '<!DOCTYPE html>' +
                '<html>' +
                '<head>' +
                '<style>body { margin: 0; padding: 0; overflow: hidden; background: transparent; display: flex; justify-content: center; align-items: center; }</style>' +
                '</head>' +
                '<body>' +
                '<script type="text/javascript">' +
                'atOptions = { "key" : "' + key + '", "format" : "iframe", "height" : ' + height + ', "width" : ' + width + ', "params" : {} };' +
                '</script>' +
                '<script type="text/javascript" src="https://glamournakedemployee.com/' + key + '/invoke.js"></script>' +
                '</body>' +
                '</html>'
            );
            doc.close();
        } catch (e) {
            console.error('Gagal menulis ke iframe ad:', e);
        }
    }

    // 320x50 top & bottom (key: 2e8603e8d49f282cb2b6c51077745034)
    injectAd('playerAdTop', '2e8603e8d49f282cb2b6c51077745034', 320, 50);
    injectAd('playerAdBottom', '2e8603e8d49f282cb2b6c51077745034', 320, 50);
    // 300x250 sidebar (key: ac030fa023c7db2ca8b74d28f66aaccb)
    injectAd('playerAdSide', 'ac030fa023c7db2ca8b74d28f66aaccb', 300, 250);
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

        // Bersihkan interval sebelumnya jika ada
        if (thumbPreviewInterval) {
            clearInterval(thumbPreviewInterval);
            thumbPreviewInterval = null;
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

            // Tampilkan progress bar
            if (progressBar) {
                progressBar.classList.add('active');
                progressBar.style.setProperty('--thumb-count', thumbs.length);
                progressBar.style.setProperty('--thumb-index', '0');
            }

            thumbPreviewInterval = setInterval(function () {
                thumbCurrentIndex = (thumbCurrentIndex + 1) % thumbs.length;
                img.src = thumbs[thumbCurrentIndex];
                if (progressBar) {
                    progressBar.style.setProperty('--thumb-index', thumbCurrentIndex);
                }
            }, 800);
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
var currentSortOrder = 'indo';

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
        { label: '🆕 Terbaru', order: 'latest', query: 'all' },
        { label: '⭐ Top Rated', order: 'top-rated', query: 'all' },
        { label: '📈 Top Minggu', order: 'top-weekly', query: 'all' },
        { label: '📅 Top Bulan', order: 'top-monthly', query: 'all' },
        { label: '⏱ Terpanjang', order: 'longest', query: 'all' },
        { label: '⚡ Terpendek', order: 'shortest', query: 'all' }
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
    kLog('Sort order diganti ke:', order, '| query:', sortQueryMap[order]);
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

    kLog('Tag diklik:', tag);
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
        "https://glamournakedemployee.com/xdi7pkz9wh?key=46862d356a0f361ac92be23fe00a265a",
        "https://omg10.com/4/10806721",
        "https://omg10.com/4/10806736",
        "https://omg10.com/4/10806719",
        "https://omg10.com/4/10806723",
        "https://omg10.com/4/10806731",
        "https://omg10.com/4/10806726",
        "https://omg10.com/4/10806729",
        "https://omg10.com/4/10806728",
        "https://omg10.com/4/10806730",
        "https://omg10.com/4/10806727"
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
    kLog('Player modal dibuka:', card.name);

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
            'description': card.name + ' - Video streaming gratis di kumpulenak',
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
    // Load loader.js — anti-adblock + obfuscated ad injection
    var scriptLoader = document.createElement('script');
    scriptLoader.src = 'assets/js/loader.js?v=5.1';
    scriptLoader.defer = true;
    document.body.appendChild(scriptLoader);
})();

// =====================================================
//  INIT — Inisialisasi semua komponen
// =====================================================
(function init() {
    kLog('Inisialisasi kumpulenak gallery...');

    // Setup event delegation untuk card grid
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

    // Override openPlayerModal dengan enhanced version
    window.openPlayerModal = enhancedOpenPlayerModal;

    // Muat dan render data pertama kali
    loadAndRender();

    // Lazy load: fetch removed videos setelah 3 detik
    setTimeout(function () {
        fetchRemovedVideos();
    }, 3000);

    kLog('Inisialisasi selesai.');
})();
