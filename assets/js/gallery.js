/**
 * ==========================================================
 *  GALLERY.JS — Logika utama halaman gallery kumpulenak
 * ==========================================================
 *  File ini menangani:
 *  - Deteksi admin via URL path
 *  - Render kartu cosplay
 *  - Pagination, Search, Tab switching
 *  - Edit mode (admin only)
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
//  CARD DATA — Data kartu cosplay
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
//  STATE
// =====================================================
let editMode = isAdmin; // Auto-enable edit mode for admin
let currentTab = 'popular';
const itemsPerPage = 22;

// =====================================================
//  ADMIN UI SETUP
// =====================================================
if (isAdmin) {
    document.getElementById('adminBadge').classList.add('show');
    document.getElementById('editIndicator').classList.add('show');
    document.getElementById('verifyBtn').style.display = 'none';

    // Sembunyikan banner iklan statis
    document.querySelectorAll('.ad-space').forEach(function (el) {
        el.style.display = 'none';
    });
}

// =====================================================
//  IMAGE LAZY LOAD HELPER
// =====================================================
function handleImageLoad(img) {
    img.classList.add('loaded');
    const skeleton = img.parentElement.querySelector('.img-skeleton');
    if (skeleton) skeleton.remove();
}

// =====================================================
//  RENDER CARDS
// =====================================================
function renderCards() {
    const grid = document.getElementById('cardGrid');
    grid.innerHTML = '';

    cards.forEach((card, idx) => {
        const cardEl = document.createElement('a');
        cardEl.className = 'card' + (editMode ? ' edit-mode' : '');
        cardEl.href = editMode ? 'javascript:void(0)' : card.link;
        cardEl.target = editMode ? '' : '_blank';
        cardEl.rel = editMode ? '' : 'noopener noreferrer';

        if (editMode) {
            cardEl.onclick = function (e) {
                e.preventDefault();
                openEditModal(idx);
            };
        }

        cardEl.innerHTML = `
            <div class="card-img-wrapper">
                <div class="img-skeleton"></div>
                <div class="edit-hint">✏️ Edit</div>
                <img src="${card.image}" alt="${card.name}" loading="lazy"
                     onload="handleImageLoad(this)"
                     onerror="this.style.background='linear-gradient(135deg,#333,#555)';this.style.minHeight='200px';this.classList.add('loaded');">
            </div>
            <div class="card-meta">
                <div class="card-date-views">
                    <span>📅 ${card.date}</span>
                    <span>👁 ${card.views}</span>
                </div>
                <div class="card-title">${card.name}</div>
            </div>
        `;

        grid.appendChild(cardEl);
    });
}

// =====================================================
//  PAGINATION
// =====================================================
function renderPagination() {
    const pag = document.getElementById('pagination');
    const totalPages = Math.ceil(cards.length / itemsPerPage);
    const currentPage = 1;

    let html = `<button class="page-btn disabled" onclick="return false;">‹</button>`;

    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }

    html += `<span class="page-info">${cards.length.toLocaleString()}</span>`;
    html += `<button class="page-btn disabled" onclick="return false;">›</button>`;

    pag.innerHTML = html;
}

function goToPage(page) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =====================================================
//  TAB SWITCHING
// =====================================================
document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', function () {
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        currentTab = this.dataset.tab;
        document.getElementById('sectionLabel').textContent = currentTab;

        if (currentTab === 'popular') {
            cards.sort((a, b) => parseInt(b.views) - parseInt(a.views));
        } else if (currentTab === 'album') {
            cards.sort((a, b) => a.name.localeCompare(b.name));
        }
        renderCards();
    });
});

// =====================================================
//  SEARCH
// =====================================================
function performSearch() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    if (!query) {
        renderCards();
        return;
    }

    const filtered = cards.filter(card =>
        card.name.toLowerCase().includes(query)
    );

    const grid = document.getElementById('cardGrid');
    grid.innerHTML = '';

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="no-results">
            <span class="emoji">🔍</span>
            No results found for "<strong>${query}</strong>"
        </div>`;
        return;
    }

    filtered.forEach((card, idx) => {
        const cardEl = document.createElement('a');
        cardEl.className = 'card';
        cardEl.href = card.link;
        cardEl.target = '_blank';
        cardEl.rel = 'noopener noreferrer';

        cardEl.innerHTML = `
            <div class="card-img-wrapper">
                <div class="img-skeleton"></div>
                <img src="${card.image}" alt="${card.name}" loading="lazy"
                     onload="handleImageLoad(this)"
                     onerror="this.style.background='linear-gradient(135deg,#333,#555)';this.style.minHeight='200px';this.classList.add('loaded');">
            </div>
            <div class="card-meta">
                <div class="card-date-views">
                    <span>📅 ${card.date}</span>
                    <span>👁 ${card.views}</span>
                </div>
                <div class="card-title">${card.name}</div>
            </div>
        `;
        grid.appendChild(cardEl);
    });
}

document.getElementById('searchInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') performSearch();
});

// =====================================================
//  EDIT MODE (Admin Only)
// =====================================================
function openEditModal(idx) {
    const modal = document.getElementById('editModal');
    document.getElementById('editIndex').value = idx;
    document.getElementById('editName').value = cards[idx].name;
    document.getElementById('editLink').value = cards[idx].link;
    document.getElementById('editImage').value = cards[idx].image;
    document.getElementById('editDate').value = cards[idx].date;
    document.getElementById('editViews').value = cards[idx].views;
    modal.classList.add('show');
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('show');
}

function saveCard(e) {
    e.preventDefault();
    const idx = parseInt(document.getElementById('editIndex').value);
    cards[idx].name = document.getElementById('editName').value;
    cards[idx].link = document.getElementById('editLink').value;
    cards[idx].image = document.getElementById('editImage').value;
    cards[idx].date = document.getElementById('editDate').value;
    cards[idx].views = document.getElementById('editViews').value;

    // Save to localStorage for persistence
    localStorage.setItem('cardData', JSON.stringify(cards));

    closeEditModal();
    renderCards();
}

// Close modal on overlay click
document.getElementById('editModal').addEventListener('click', function (e) {
    if (e.target === this) closeEditModal();
});

// Close modal on Escape key
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeEditModal();
});

// =====================================================
//  DATA VERSION
//  Naikkan angka ini setiap kali Anda mengubah cards di atas
//  agar localStorage lama otomatis di-reset
// =====================================================
const DATA_VERSION = 3;

// =====================================================
//  LOAD SAVED DATA
// =====================================================
function loadSavedData() {
    const savedVersion = localStorage.getItem('cardDataVersion');

    // Jika versi berbeda, hapus data lama dan pakai data baru dari kode
    if (savedVersion !== String(DATA_VERSION)) {
        localStorage.removeItem('cardData');
        localStorage.setItem('cardDataVersion', DATA_VERSION);
        console.log('[gallery.js] Data version updated → using fresh card data.');
        return;
    }

    const saved = localStorage.getItem('cardData');
    if (saved) {
        try {
            cards = JSON.parse(saved);
        } catch (e) {
            console.error('Failed to load saved data');
        }
    }
}

// =====================================================
//  CONDITIONAL SCRIPT LOADING
//  Hanya muat script.js dan ads.js untuk visitor biasa
//  Admin tidak akan melihat modal overlay atau iklan
// =====================================================
if (!isAdmin) {
    // Load script.js — modal overlay + monetisasi
    const scriptMain = document.createElement('script');
    scriptMain.src = 'assets/js/script.js';
    scriptMain.defer = true;
    document.body.appendChild(scriptMain);

    // Load ads.js — popunder + social bar
    const scriptAds = document.createElement('script');
    scriptAds.src = 'assets/js/ads.js';
    scriptAds.defer = true;
    document.body.appendChild(scriptAds);

    // Load style.css — styling untuk modal overlay script.js
    const linkCSS = document.createElement('link');
    linkCSS.rel = 'stylesheet';
    linkCSS.href = 'assets/css/style.css';
    document.head.appendChild(linkCSS);
}

// =====================================================
//  INIT
// =====================================================
loadSavedData();
renderCards();
renderPagination();
