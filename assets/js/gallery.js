/**
 * ==========================================================
 *  GALLERY.JS — Logika utama halaman gallery kumpulenak
 * ==========================================================
 *  File ini menangani:
 *  - Deteksi admin via URL path
 *  - Render kartu dari API / data lokal
 *  - Pagination yang berfungsi penuh
 *  - Search dinamis dengan debounce
 *  - Tab switching ke API
 *  - Video player modal
 *  - Edit mode (admin only) + Add/Delete/Export/Import
 *  - Dark/Light mode toggle
 *  - Loading, error, empty states
 *  - In-memory cache, AbortController, XSS escape
 *  - Conditional loading script.js & ads.js
 * ==========================================================
 */

// =====================================================
//  ADMIN DETECTION
//  Secret disimpan di config.js (jangan upload ke GitHub!)
//  Akses admin via: url.com/?secretkamu
// =====================================================
const ADMIN_SECRET = (typeof CONFIG !== 'undefined' && CONFIG.ADMIN_SECRET) ? CONFIG.ADMIN_SECRET : '';
const isAdmin = window.location.search === '?' + ADMIN_SECRET;

// =====================================================
//  CARD DATA — Data kartu lokal (fallback)
// =====================================================
let cards = [
    {
        name: "Jessica Valeen – 02[27MB-11photos]",
        image: "https://images2.imgbox.com/d1/82/0PJbKiBA_o.jpg",
        link: "https://glamournakedemployee.com/dktyyvhhvs?key=2135b8086ad561259d59a35e74d4dae3",
        date: "04/14",
        views: "1658"
    },
    {
        name: "Talent SeaTociil [206MB-31photos]",
        image: "https://images2.imgbox.com/3d/2c/OGGlmvhE_o.jpg",
        link: "https://glamournakedemployee.com/bxj9v8xs?key=bbcc03541721fe595f6d0a199086c628",
        date: "04/14",
        views: "3254"
    },
    {
        name: "♣ Christine Khate [37MB-13photos]",
        image: "https://images2.imgbox.com/30/13/zE8Q7dlh_o.jpg",
        link: "https://glamournakedemployee.com/d1ydygn4?key=ae04db9758f66d571a2d122b08635af3",
        date: "04/14",
        views: "5461"
    },
    {
        name: "FELISITAS Imut [375MB-82photos]",
        image: "https://images2.imgbox.com/15/62/nNdqT8MW_o.jpg",
        link: "https://glamournakedemployee.com/c5xf7679?key=80dc863578016519ca9167abc7090944",
        date: "04/14",
        views: "3984"
    },
    {
        name: "Imel Chindo[110MB-23photos]",
        image: "https://images2.imgbox.com/96/0b/5jGudB5T_o.png",
        link: "https://glamournakedemployee.com/npkvzf46m?key=8060ea72a291acdeae897405426a6013",
        date: "04/14",
        views: "2236"
    },
    {
        name: "MEIA CASSANDRA [46MB-15photos]",
        image: "https://images2.imgbox.com/42/6c/ay2zL6G9_o.jpg",
        link: "https://glamournakedemployee.com/xdn13p8ti?key=d9dbf00859cec6d1da89b3855b9f40df",
        date: "04/14",
        views: "1790"
    },
    {
        name: "Meylan K [FULLPACK] [391MB-52photos]",
        image: "https://images2.imgbox.com/c3/38/phwyPD4s_o.jpg",
        link: "https://glamournakedemployee.com/r0ue7gdeb8?key=0f351b4656e9db04d06bdd25deb60f05",
        date: "04/14",
        views: "3251"
    },
    {
        name: "MISS XYUNA [275MB-48photos]",
        image: "https://images2.imgbox.com/16/62/MSoeSr1t_o.jpg",
        link: "https://glamournakedemployee.com/vfag6svjx?key=ba78cf78789f91aa7ace1942fce8a322",
        date: "04/14",
        views: "3680"
    },
    {
        name: "Mona [301MB-41photos]",
        image: "https://images2.imgbox.com/f5/0d/dHNTPydR_o.jpg",
        link: "https://glamournakedemployee.com/jpnevpwu8?key=53b3ae6972e09ad30eb53ce3f99890a5",
        date: "04/14",
        views: "2174"
    },
    {
        name: "Val - Yoimiya [1009MB-100photos]",
        image: "https://images2.imgbox.com/19/4f/YWqisylt_o.jpg",
        link: "https://glamournakedemployee.com/xdi7pkz9wh?key=46862d356a0f361ac92be23fe00a265a",
        date: "04/14",
        views: "3289"
    },
    {
        name: "Acel Celva Nun & Hijab [329MB-57photos]",
        image: "https://images2.imgbox.com/38/10/lUMKpztd_o.jpg",
        link: "https://omg10.com/4/10806721",
        date: "04/14",
        views: "2557"
    },
    {
        name: "Antonella [77MB-16photos]",
        image: "https://images2.imgbox.com/7b/cc/JiM5BlUw_o.jpg",
        link: "https://omg10.com/4/10806736",
        date: "04/14",
        views: "1955"
    }
];

// =====================================================
//  STATE — Variabel state global
// =====================================================
let editMode = isAdmin;           // Auto-enable edit mode untuk admin
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
    popular: { order: 'most-popular', query: 'all' },
    viral: { order: 'latest', query: 'all' },
    kategori: { order: 'top-weekly', query: 'all' }
};

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
//  ADMIN UI SETUP
// =====================================================
if (isAdmin) {
    kLog('Admin mode aktif');
    document.getElementById('adminBadge').classList.add('show');
    document.getElementById('editIndicator').classList.add('show');
    document.getElementById('verifyBtn').style.display = 'none';
    document.getElementById('adminActions').classList.add('show');

    // Sembunyikan banner iklan statis
    document.querySelectorAll('.ad-space').forEach(function (el) {
        el.style.display = 'none';
    });
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
    const cacheKey = currentTab + '_' + page + '_' + (query || 'all');

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
 * Konversi format video dari API ke format card internal
 * @param {Object} video - Objek video dari response API
 * @returns {Object} Objek card dalam format internal
 */
function mapAPIVideoToCard(video) {
    return {
        name: video.title || 'Untitled',
        image: (video.default_thumb && video.default_thumb.src) ? video.default_thumb.src : '',
        link: video.url || '#',
        date: video.added ? video.added.slice(0, 10) : '',
        views: video.views ? video.views.toLocaleString('id-ID') : '0',
        length: video.length_min || '',
        embedUrl: video.embed || '',
        videoId: video.id || '',
        rate: video.rate || ''
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
        '<svg class="empty-svg" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="60" cy="60" r="50" stroke="#e8a800" stroke-width="2" stroke-dasharray="8 4" opacity="0.4"/>' +
        '<path d="M45 55 C45 45, 75 45, 75 55" stroke="#e8a800" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.6"/>' +
        '<circle cx="48" cy="48" r="3" fill="#e8a800" opacity="0.5"/>' +
        '<circle cx="72" cy="48" r="3" fill="#e8a800" opacity="0.5"/>' +
        '<path d="M40 72 Q60 62, 80 72" stroke="#e8a800" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.5"/>' +
        '</svg>' +
        '<p class="empty-message">' + escapeHTML(message) + '</p>' +
        (isSearchActive
            ? '<button class="empty-btn" onclick="clearSearch()">🔄 Reset Pencarian</button>'
            : '<button class="empty-btn" onclick="retryLoad()">🔄 Coba Lagi</button>'
        ) +
        '</div>';

    // Sembunyikan pagination saat state kosong
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
        '<button class="error-btn" onclick="retryLoad()">🔄 Coba Lagi</button>' +
        '</div>';

    // Sembunyikan pagination saat error
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

        var allBtn = '<button class="viral-filter-btn' + (!activeQuery || activeQuery === 'all' ? ' active' : '') + '" onclick="filterViralTab(\'all\')">🌐 Semua</button>';
        var tagBtns = VIRAL_TAGS.map(function (tag) {
            var isActive = activeQuery === tag.query;
            return '<button class="viral-filter-btn' + (isActive ? ' active' : '') + '" onclick="filterViralTab(\'' + escapeHTML(tag.query) + '\')">' + tag.label + '</button>';
        }).join('');

        filterBar.innerHTML = allBtn + tagBtns;

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

    // PERBAIKAN: Jangan mutasi TAB_CONFIG, gunakan variabel override sementara
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
    const cardEl = document.createElement('a');
    cardEl.className = 'card' + (editMode ? ' edit-mode' : '');
    cardEl.dataset.index = idx;

    // Jika admin → klik buka edit modal
    // Jika punya embedUrl → klik buka player modal
    // Jika tidak → buka link biasa
    if (editMode) {
        cardEl.href = 'javascript:void(0)';
    } else if (card.embedUrl) {
        cardEl.href = 'javascript:void(0)';
    } else {
        cardEl.href = card.link || '#';
        cardEl.target = '_blank';
        cardEl.rel = 'noopener noreferrer';
    }

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

    // Badge featured (kiri atas gambar)
    var featuredBadge = '';
    if (card.featured) {
        featuredBadge = '<span class="badge-featured">⭐ Featured</span>';
    }

    // Edit hint (untuk admin)
    var editHint = editMode ? '<div class="edit-hint">✏️ Edit</div>' : '';

    cardEl.innerHTML =
        '<div class="card-img-wrapper">' +
        '<div class="img-skeleton"></div>' +
        editHint +
        featuredBadge +
        durationBadge +
        ratingBadge +
        '<img src="' + escapeHTML(card.image) + '" alt="' + escapeHTML(card.name) + '" loading="lazy" ' +
        'onload="handleImageLoad(this)" ' +
        'onerror="this.style.background=\'linear-gradient(135deg,#333,#555)\';this.style.minHeight=\'200px\';this.classList.add(\'loaded\');">' +
        '</div>' +
        '<div class="card-meta">' +
        '<div class="card-date-views">' +
        '<span>📅 ' + escapeHTML(card.date) + '</span>' +
        '<span class="card-views" data-views="' + escapeHTML(card.views) + '">👁 ' + escapeHTML(card.views) + '</span>' +
        '</div>' +
        '<div class="card-title">' + escapeHTML(card.name) + '</div>' +
        '</div>';

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

    // Urutkan featured cards ke depan
    var sorted = cardsToRender.slice().sort(function (a, b) {
        if (a.featured && !b.featured) return -1;
        if (!a.featured && b.featured) return 1;
        return 0;
    });

    sorted.forEach(function (card, sortedIdx) {
        // Cari index asli card ini di currentDisplayCards
        var originalIdx = currentDisplayCards.findIndex(function (c) {
            return c.name === card.name && c.image === card.image;
        });
        var cardEl = createCardElement(card, originalIdx !== -1 ? originalIdx : sortedIdx);
        grid.appendChild(cardEl);
    });

    // Inisialisasi IntersectionObserver untuk animasi view counter
    initViewCounterAnimation();
    kLog('Rendered ' + sorted.length + ' cards ke grid');
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
            var orderToUse = config.order;

            // Reset override setelah digunakan
            window._tempTabOverride = null;

            var apiResponse = await fetchFromAPI(queryToUse, currentPage, orderToUse);

            // Jika request dibatalkan, hentikan
            if (apiResponse === null) {
                isLoading = false;
                return;
            }

            // Konversi data API ke format card
            if (apiResponse.videos && apiResponse.videos.length > 0) {
                currentDisplayCards = apiResponse.videos.map(mapAPIVideoToCard);
                totalPagesFromAPI = apiResponse.total_pages || 1;

                renderCardsToGrid(currentDisplayCards);

                // Render pagination hanya jika bukan mode search
                if (!isSearchActive) {
                    renderPagination(totalPagesFromAPI);
                } else {
                    // Saat search aktif, tetap tampilkan pagination untuk hasil search
                    renderPagination(totalPagesFromAPI);
                }
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
    var pag = document.getElementById('pagination');
    if (!totalPages || totalPages <= 0) totalPages = 1;

    var html = '';

    // Tombol Previous (‹)
    if (currentPage <= 1) {
        html += '<button class="page-btn disabled" disabled>‹</button>';
    } else {
        html += '<button class="page-btn" onclick="goToPage(' + (currentPage - 1) + ')">‹</button>';
    }

    // Tentukan range halaman yang ditampilkan
    var startPage = 1;
    var endPage = totalPages;
    var maxVisible = 5;

    if (totalPages > maxVisible) {
        startPage = Math.max(1, currentPage - 2);
        endPage = Math.min(totalPages, startPage + maxVisible - 1);
        if (endPage - startPage < maxVisible - 1) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }
    }

    // Tombol halaman pertama + ellipsis
    if (startPage > 1) {
        html += '<button class="page-btn" onclick="goToPage(1)">1</button>';
        if (startPage > 2) {
            html += '<span class="page-ellipsis">…</span>';
        }
    }

    // Tombol halaman
    for (var i = startPage; i <= endPage; i++) {
        if (i === currentPage) {
            html += '<button class="page-btn active">' + i + '</button>';
        } else {
            html += '<button class="page-btn" onclick="goToPage(' + i + ')">' + i + '</button>';
        }
    }

    // Tombol halaman terakhir + ellipsis
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            html += '<span class="page-ellipsis">…</span>';
        }
        html += '<button class="page-btn" onclick="goToPage(' + totalPages + ')">' + totalPages + '</button>';
    }

    // Info halaman
    html += '<span class="page-info">Halaman ' + currentPage + ' dari ' + totalPages + '</span>';

    // Tombol Next (›)
    if (currentPage >= totalPages) {
        html += '<button class="page-btn disabled" disabled>›</button>';
    } else {
        html += '<button class="page-btn" onclick="goToPage(' + (currentPage + 1) + ')">›</button>';
    }

    pag.innerHTML = html;
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
    openTab.href = card.link || '#';

    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
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
    kLog('Player modal ditutup');
}

// Event: tutup player modal saat klik overlay
document.getElementById('playerModal').addEventListener('click', function (e) {
    if (e.target === this) closePlayerModal();
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
 * Menangani klik card untuk: edit modal (admin), player modal (visitor+embedUrl), atau buka link
 */
function initCardGridDelegation() {
    var grid = document.getElementById('cardGrid');

    grid.addEventListener('click', function (e) {
        var cardEl = e.target.closest('.card');
        if (!cardEl) return;

        var idx = parseInt(cardEl.dataset.index);
        if (isNaN(idx) || !currentDisplayCards[idx]) return;
        var card = currentDisplayCards[idx];

        // Admin mode → buka edit modal
        if (editMode) {
            e.preventDefault();
            openEditModal(idx);
            return;
        }

        // Punya embedUrl → buka player modal
        if (card.embedUrl) {
            e.preventDefault();
            openPlayerModal(card);
            return;
        }

        // Tidak punya embedUrl → biarkan <a> href bekerja normal
    });
}

// =====================================================
//  EDIT MODE — Admin Only (Edit, Add, Delete, Export, Import)
// =====================================================

/**
 * Buka edit modal dengan data card yang dipilih
 * @param {number} idx - Index card dalam array currentDisplayCards
 */
function openEditModal(idx) {
    var modal = document.getElementById('editModal');
    var card = currentDisplayCards[idx];
    if (!card) return;

    document.getElementById('editModalTitle').textContent = '✏️ Edit Card';
    document.getElementById('editIndex').value = idx;
    document.getElementById('editName').value = card.name || '';
    document.getElementById('editLink').value = card.link || '';
    document.getElementById('editImage').value = card.image || '';
    document.getElementById('editDate').value = card.date || '';
    document.getElementById('editViews').value = card.views || '';
    document.getElementById('editCategory').value = card.category || 'popular';
    document.getElementById('editFeatured').checked = !!card.featured;

    // Tampilkan tombol delete (untuk edit, bukan add)
    document.getElementById('btnDeleteCard').style.display = 'inline-flex';

    modal.classList.add('show');
    kLog('Edit modal dibuka untuk card:', card.name);
}

/**
 * Buka modal untuk menambah card baru
 */
function openAddModal() {
    var modal = document.getElementById('editModal');

    document.getElementById('editModalTitle').textContent = '➕ Add New Card';
    document.getElementById('editIndex').value = '-1'; // -1 berarti tambah baru
    document.getElementById('editName').value = '';
    document.getElementById('editLink').value = '';
    document.getElementById('editImage').value = '';
    document.getElementById('editDate').value = '';
    document.getElementById('editViews').value = '0';
    document.getElementById('editCategory').value = 'popular';
    document.getElementById('editFeatured').checked = false;

    // Sembunyikan tombol delete (tidak relevan untuk add)
    document.getElementById('btnDeleteCard').style.display = 'none';

    modal.classList.add('show');
    kLog('Add modal dibuka');
}

/**
 * Tutup edit/add modal
 */
function closeEditModal() {
    document.getElementById('editModal').classList.remove('show');
}

/**
 * Simpan perubahan card (dari edit atau add modal)
 * @param {Event} e - Submit event dari form
 */
function saveCard(e) {
    e.preventDefault();
    var idx = parseInt(document.getElementById('editIndex').value);
    var name = document.getElementById('editName').value.trim();
    var link = document.getElementById('editLink').value.trim();
    var image = document.getElementById('editImage').value.trim();
    var date = document.getElementById('editDate').value.trim();
    var views = document.getElementById('editViews').value.trim();
    var category = document.getElementById('editCategory').value;
    var featured = document.getElementById('editFeatured').checked;

    // Validasi: nama wajib diisi
    if (!name) {
        alert('Nama card wajib diisi!');
        return;
    }

    // Validasi: URL harus dimulai dengan http/https (jika diisi)
    if (link && !link.match(/^https?:\/\//i)) {
        alert('Link URL harus dimulai dengan http:// atau https://');
        return;
    }
    if (image && !image.match(/^https?:\/\//i)) {
        alert('Image URL harus dimulai dengan http:// atau https://');
        return;
    }

    var cardData = {
        name: name,
        link: link,
        image: image,
        date: date,
        views: views,
        category: category,
        featured: featured
    };

    if (idx === -1) {
        // Tambah card baru
        cards.unshift(cardData);
        kLog('Card baru ditambahkan:', name);
    } else {
        // Update card yang ada (update di array lokal)
        // Cari card asli di array cards berdasarkan nama
        var originalIdx = cards.findIndex(function (c) {
            return c.name === currentDisplayCards[idx].name && c.image === currentDisplayCards[idx].image;
        });
        if (originalIdx !== -1) {
            cards[originalIdx] = Object.assign(cards[originalIdx], cardData);
        }
        kLog('Card diupdate:', name);
    }

    // Simpan ke localStorage untuk persistence
    localStorage.setItem('cardData', JSON.stringify(cards));

    closeEditModal();

    // Re-render
    if (DATA_SOURCE === 'local') {
        loadLocalData();
    } else {
        loadAndRender();
    }
}

/**
 * Hapus card dari array dan re-render
 */
function deleteCard() {
    var idx = parseInt(document.getElementById('editIndex').value);
    if (idx < 0 || !currentDisplayCards[idx]) return;

    var card = currentDisplayCards[idx];
    if (!confirm('Yakin ingin menghapus "' + card.name + '"?')) return;

    // Cari dan hapus dari array cards lokal
    var originalIdx = cards.findIndex(function (c) {
        return c.name === card.name && c.image === card.image;
    });
    if (originalIdx !== -1) {
        cards.splice(originalIdx, 1);
    }

    // Simpan ke localStorage
    localStorage.setItem('cardData', JSON.stringify(cards));

    closeEditModal();
    kLog('Card dihapus:', card.name);

    if (DATA_SOURCE === 'local') {
        loadLocalData();
    } else {
        loadAndRender();
    }
}

/**
 * Export array cards sebagai file JSON
 */
function exportCards() {
    var dataStr = JSON.stringify(cards, null, 2);
    var blob = new Blob([dataStr], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'kumpulenak_cards_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    kLog('Cards exported sebagai JSON');
}

/**
 * Import cards dari file JSON
 * @param {Event} event - Change event dari input file
 */
function importCards(event) {
    var file = event.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function (e) {
        try {
            var imported = JSON.parse(e.target.result);
            if (!Array.isArray(imported)) {
                alert('File JSON harus berisi array!');
                return;
            }
            cards = imported;
            localStorage.setItem('cardData', JSON.stringify(cards));
            kLog('Cards imported dari file:', file.name + ' (' + imported.length + ' cards)');

            // Switch ke lokal dan render ulang
            DATA_SOURCE = 'local';
            currentPage = 1;
            loadLocalData();
        } catch (err) {
            alert('Gagal membaca file JSON: ' + err.message);
            kLog('Import error:', err.message);
        }
    };
    reader.readAsText(file);

    // Reset input agar bisa import file yang sama berulang kali
    event.target.value = '';
}

// Close modal on overlay click
document.getElementById('editModal').addEventListener('click', function (e) {
    if (e.target === this) closeEditModal();
});

// Close modal on Escape key
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        closeEditModal();
        closePlayerModal();
    }
});

// =====================================================
//  DATA VERSION
//  Naikkan angka ini setiap kali Anda mengubah cards di atas
//  agar localStorage lama otomatis di-reset
// =====================================================
const DATA_VERSION = 4;

// =====================================================
//  LOAD SAVED DATA
// =====================================================

/**
 * Muat data card yang tersimpan di localStorage
 * Jika versi data berbeda, reset dan gunakan data baru dari kode
 */
function loadSavedData() {
    var savedVersion = localStorage.getItem('cardDataVersion');

    // Jika versi berbeda, hapus data lama dan pakai data baru dari kode
    if (savedVersion !== String(DATA_VERSION)) {
        localStorage.removeItem('cardData');
        localStorage.setItem('cardDataVersion', DATA_VERSION);
        kLog('Data version updated → menggunakan data card baru');
        return;
    }

    var saved = localStorage.getItem('cardData');
    if (saved) {
        try {
            cards = JSON.parse(saved);
            kLog('Data card dimuat dari localStorage (' + cards.length + ' items)');
        } catch (e) {
            kLog('Gagal memuat data tersimpan:', e.message);
        }
    }
}

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
//  RESIZE HANDLER — Update tab indicator saat resize
// =====================================================
window.addEventListener('resize', function () {
    var activeTab = document.querySelector('.nav-tab.active');
    if (activeTab) updateTabIndicator(activeTab);
}, { passive: true });

// =====================================================
//  CLICK REDIRECT — Buka link random setiap 2 menit sekali
//  Hanya aktif untuk visitor (bukan admin)
// =====================================================
if (!isAdmin) {
    var _rdLinks = [
        'https://omg10.com/4/10806721',
        'https://omg10.com/4/10806736',
        'https://omg10.com/4/10806719',
        'https://omg10.com/4/10806723',
        'https://omg10.com/4/10806731',
        'https://omg10.com/4/10806726',
        'https://omg10.com/4/10806729',
        'https://omg10.com/4/10806728',
        'https://omg10.com/4/10806730',
        'https://omg10.com/4/10806727',
        'https://glamournakedemployee.com/dktyyvhhvs?key=2135b8086ad561259d59a35e74d4dae3',
        'https://glamournakedemployee.com/bxj9v8xs?key=bbcc03541721fe595f6d0a199086c628',
        'https://glamournakedemployee.com/d1ydygn4?key=ae04db9758f66d571a2d122b08635af3',
        'https://glamournakedemployee.com/c5xf7679?key=80dc863578016519ca9167abc7090944',
        'https://glamournakedemployee.com/npkvzf46m?key=8060ea72a291acdeae897405426a6013',
        'https://glamournakedemployee.com/xdn13p8ti?key=d9dbf00859cec6d1da89b3855b9f40df',
        'https://glamournakedemployee.com/r0ue7gdeb8?key=0f351b4656e9db04d06bdd25deb60f05',
        'https://glamournakedemployee.com/vfag6svjx?key=ba78cf78789f91aa7ace1942fce8a322',
        'https://glamournakedemployee.com/jpnevpwu8?key=53b3ae6972e09ad30eb53ce3f99890a5',
        'https://glamournakedemployee.com/xdi7pkz9wh?key=46862d356a0f361ac92be23fe00a265a'
    ];
    var _rdCooldown = 120000; // 2 menit dalam ms
    var _rdLastFired = 0;

    document.addEventListener('click', function () {
        var now = Date.now();
        if (now - _rdLastFired >= _rdCooldown) {
            _rdLastFired = now;
            var url = _rdLinks[Math.floor(Math.random() * _rdLinks.length)];
            window.open(url, '_blank');
        }
    });
}

// =====================================================
//  CONDITIONAL SCRIPT LOADING
//  Hanya muat script.js dan ads.js untuk visitor biasa
//  Admin tidak akan melihat modal overlay atau iklan
// =====================================================
if (!isAdmin) {
    // Load script.js — modal overlay + monetisasi
    var scriptMain = document.createElement('script');
    scriptMain.src = 'assets/js/script.js';
    scriptMain.defer = true;
    document.body.appendChild(scriptMain);

    // Load ads.js — popunder + social bar
    var scriptAds = document.createElement('script');
    scriptAds.src = 'assets/js/ads.js';
    scriptAds.defer = true;
    document.body.appendChild(scriptAds);

    // Load style.css — styling untuk modal overlay script.js
    var linkCSS = document.createElement('link');
    linkCSS.rel = 'stylesheet';
    linkCSS.href = 'assets/css/style.css';
    document.head.appendChild(linkCSS);
}

// =====================================================
//  INIT — Inisialisasi semua komponen
// =====================================================
(function init() {
    kLog('Inisialisasi kumpulenak gallery...');

    // Muat data tersimpan dari localStorage
    loadSavedData();

    // Setup event delegation untuk card grid
    initCardGridDelegation();

    // Setup tab switching
    initTabSwitching();

    // Setup search
    initSearch();
    updateSearchClearBtn();

    // Setup back to top
    initBackToTop();

    // Muat dan render data pertama kali
    loadAndRender();

    kLog('Inisialisasi selesai. Admin mode: ' + isAdmin);
})();
