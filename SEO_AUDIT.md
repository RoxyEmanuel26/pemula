# 📋 Laporan Audit SEO Menyeluruh (FASE 0)
**Website:** lusthub.my.id (`www.lusthub.my.id`)  
**Tanggal Audit:** 28 Oktober 2026  
**Auditor:** Senior Technical SEO & Full-Stack Engineer  
**Status:** Fase 0 Selesai — Menunggu Persetujuan Pemilik untuk Fase 1

---

## 1. Arsitektur, Framework & Mode Rendering

* **Framework & Versi:** Vanilla HTML5, CSS3, Pure JavaScript (Static Web Application / Jamstack — *Tanpa framework seperti Next.js, Nuxt, atau Astro*).
* **Infrastruktur:** Vercel (Origin Hosting) di belakang Cloudflare CDN/Proxy (DNS, Edge Caching, DDOS protection).
* **Mode Rendering per Jenis Halaman:**

| Jenis Halaman | Route / URL Pattern | Mode Rendering | Cek Kritis: Apakah Judul, Deskripsi, H1 & Konten Ada di HTML Awal? |
| :--- | :--- | :---: | :--- |
| **Beranda (Home)** | `/` | **Hybrid CSR** | ⚠️ Judul, meta deskripsi, dan H1 **ADA** di HTML awal. Namun, daftar video dan kartu galeri **KOSONG (0 video)** di HTML awal; seluruh video dimuat via JavaScript (`fetch` ke Eporner API). |
| **Halaman Video** | `/v/:slug*` | **100% Pure CSR** | ❌ **FATAL:** HTML awal hanya menyajikan template generik statis (`video.html`). Judul video, meta deskripsi spesifik, tag H1, iframe video, dan structured data **TIDAK ADA** di HTML awal. Semua 20.000+ video menyajikan `<title>` generik yang sama persis: `"lusthub.my.id — High-Speed 18+ NSFW Streaming"`. |
| **Halaman Kategori** | `/c/:slug*` | **100% Pure CSR** | ❌ **FATAL:** HTML awal menyajikan `<title id="pageTitle">Loading... — lusthub.my.id</title>`, deskripsi generik, H1 bertuliskan `Loading... Videos`, dan 0 video. Judul dan konten kategori baru muncul setelah client JavaScript berjalan. |
| **Halaman Legal** | `/about`, `/contact`, `/dmca`, `/howto`, `/privacy`, `/terms` | **Pre-rendered SSG** | ✅ **ADA:** Judul, deskripsi, heading H1/H2, dan teks isi lengkap sudah ada di HTML awal. |
| **Halaman 404** | `/404` | **Static + SPA Router** | ✅ **ADA:** Mengembalikan HTTP status 404 sungguhan dengan navigasi kembali ke beranda. |

> ⚠️ **Diagnosa Kritis Penyebab 10 Bulan 0 Traffic:**  
> Mesin pencari seperti Googlebot mengutamakan **HTML awal (first wave of indexing)**. Karena halaman `/v/*` dan `/c/*` di-render murni di client (CSR), Googlebot mendeteksi puluhan ribu halaman video memiliki judul, deskripsi, dan konten kosong yang **100% identik (duplicate thin content / soft 404)**. Google menolak mengindeks atau memberi peringkat pada halaman yang tidak memiliki konten teks unik di HTML awal.

---

## 2. Daftar Route dan Pola URL

1. **Beranda:** `https://www.lusthub.my.id/`
2. **Halaman Video:** `https://www.lusthub.my.id/v/{id}-{slug}` (contoh: `/v/2AK6SsJrqQ3-a-mom-friend`) — di-rewrite oleh Vercel ke `/video` (`video.html`).
3. **Halaman Kategori:** `https://www.lusthub.my.id/c/{category-slug}` (contoh: `/c/asian`, `/c/japanese`, `/c/hijab`) — di-rewrite oleh Vercel ke `/category` (`category.html`).
4. **Pencarian:** `https://www.lusthub.my.id/?q={keyword}` — dioperasikan melalui client-side filter dan API parameter.
5. **Halaman Statis/Informasi:**
   * `/about` (`about.html`)
   * `/contact` (`contact.html`)
   * `/dmca` (`dmca.html`)
   * `/howto` (`howto.html`)
   * `/privacy` (`privacy.html`)
   * `/terms` (`terms.html`)
6. **Halaman Error:** `/404` (`404.html`)
7. **File Pendukung & Integrasi:**
   * `/robots.txt`
   * `/sitemap_index.xml`
   * `/sitemaps/sitemap_pages.xml`
   * `/sitemaps/sitemap_categories.xml`
   * `/sitemaps/sitemap_videos_001.xml` s/d `sitemap_videos_004.xml`
   * `/ad-wrapper` (`ad-wrapper.html` — frame iklan)

---

## 3. Mekanisme Pengambilan Data API Pihak Ketiga

* **Sumber API:** Eporner API v2 (`https://www.eporner.com/api/v2/video/...`).
* **Titik Eksekusi:** **100% di browser pengunjung (Client-Side Fetch)**. Server Vercel saat ini tidak mengambil atau merender data video saat pengunjung membuka halaman.
* **Mekanisme Cache:**
  * **In-Memory Cache (Client):** Objek JavaScript `cacheStore` di browser dengan masa berlaku 5 menit (`300000 ms`). Jika user me-refresh halaman, browser memanggil ulang API Eporner.
  * **Server-Side Cache:** **TIDAK ADA** untuk runtime website. Hanya ada file `data/sitemap-state.json` yang dihasilkan saat menjalankan skrip offline sitemap builder.
* **Rate Limit & Stabilitas:**
  * Client script menggunakan timeout 10 detik (`AbortController`).
  * Jika API pihak ketiga sedang lambat atau down, halaman menampilkan error state *"Failed to load from server"*.

---

## 4. Status Elemen SEO Teknis (Checklist Komprehensif)

| Elemen SEO | Status | Analisis & Temuan |
| :--- | :---: | :--- |
| **`robots.txt`** | **ADA / BENAR** | Konfigurasi tepat. Memblokir AI scrapers (`Bytespider`, `PetalBot`, `AhrefsBot`, dll), memberikan izin eksplisit untuk `Googlebot`, `Googlebot-Video`, `Bingbot`, `Yandex`, dan menyertakan link sitemap index. |
| **`sitemap.xml` & index** | **ADA / VALID** | Validasi lolos (`validate-sitemaps.mjs`): 6 file sitemap, 20.031 URL video terkurasi, ukuran file aman (<4 MB per file). `sitemap_categories.xml` belum memiliki tag `<lastmod>`. |
| **`<title>` Tag** | **SALAH (di Video & Kategori)** | Beranda dan halaman statis sudah bagus. Namun pada `/v/*` semua video memiliki title default statis yang sama. Pada `/c/*` title awal adalah `"Loading... — lusthub.my.id"`. |
| **Meta Description** | **SALAH (di Video & Kategori)** | Sama seperti title, meta description pada halaman video dan kategori bersifat generik dan statis di HTML awal. |
| **Canonical URL** | **SALAH (di Video & Kategori)** | Pada HTML awal `/v/*` dan `/c/*`, tag canonical kosong: `<link rel="canonical" href="">`. Tag baru diisi JavaScript beberapa detik kemudian. |
| **Open Graph & Twitter Card** | **SALAH (di Video & Kategori)** | `og:title`, `og:description`, dan `og:image` kosong atau menggunakan aset default. Crawler media sosial (WhatsApp, Twitter, Telegram, Discord) tidak mengeksekusi JS dan akan menampilkan pratinjau yang rusak/kosong. |
| **Struktur Heading (H1)** | **SALAH / KURANG** | Beranda memiliki 1x H1 yang baik. Halaman video **tidak memiliki H1** di HTML awal. Halaman kategori memiliki H1 cacat di awal: `<h1>Loading <span id="heroKeyword">...</span> Videos</h1>`. |
| **Atribut `alt` Gambar** | **PERLU PERBAIKAN** | Diisi secara dinamis oleh JS dari judul video, tetapi thumbnail tidak memiliki atribut `width` dan `height` eksplisit pada kartu dinamis, berisiko menyebabkan layout shift (CLS). |
| **Structured Data (JSON-LD)** | **TIDAK LENGKAP** | Beranda memiliki `WebSite`, `Organization`, dan `BreadcrumbList`. Namun halaman video **tidak memiliki `VideoObject` di HTML awal**, dan kategori **tidak memiliki `ItemList` di HTML awal**. |
| **Halaman 404** | **BENAR** | Server Vercel mengembalikan status HTTP 404 asli (bukan soft 404). Tampilan 404 menyediakan navigasi kembali ke beranda dan kategori. |
| **HTTPS & www/non-www** | **BENAR** | Dipaksa HTTPS lewat Cloudflare SSL Edge. Domain kanonik adalah `https://www.lusthub.my.id/`. |
| **Halaman Kepercayaan / Legal** | **LENGKAP** | Memiliki halaman About, Contact, DMCA, Privacy Policy, Terms of Service, dan How to Download dengan link lengkap di footer. |

---

## 5. Struktur Navigasi & Pagination (Crawlability Audit)

* ❌ **Masalah Besar pada Pagination:**  
  Pagination galeri video di `index.html` dan `category.html` dibuat menggunakan elemen `<button>` dengan event listener `click`, **bukan link `<a href="...">`**.
  ```javascript
  // Kode aktual di gallery.js:
  function d(e, t, r = "page-btn") {
      var a = document.createElement("button");
      return a.className = r, a.textContent = e, a.addEventListener("click", function() { goToPage(t) }), a;
  }
  ```
  *Akibat:* Googlebot **tidak mengklik button JavaScript**. Akibatnya, Googlebot tidak pernah bisa menavigasi ke halaman 2, 3, 4, dst. melalui tautan internal di halaman.
* ❌ **Masalah pada Grid Kategori Beranda:**  
  Tombol kategori di tab *"All Categories"* menggunakan `<button class="kategori-card-btn" onclick="loadFromKategori(...)">` alih-alih `<a href="/c/asian">`. Mesin pencari tidak dapat merayapi link ini secara alami untuk mendistribusikan PageRank internal.

---

## 6. Potensi Duplikat URL & Parameter

* **Trailing Slash & Extension:** Konfigurasi `vercel.json` sudah baik dengan `"cleanUrls": true` dan `"trailingSlash": false`.
* **Parameter Query:** Parameter internal seperti `/?q={keyword}` dan tab filter belum memiliki tag `noindex` atau canonical yang tegas mengarah ke beranda, berisiko menimbulkan duplikasi parameter URL jika bot menemukan link tersebut.
* **Kategori vs Query:** Ada potensi tumpang tindih antara pencarian internal `/?q=asian` dengan halaman kategori resmi `/c/asian`.

---

## 7. Masalah Performa & Core Web Vitals (CWV)

1. **Direct Embed Video Player:**  
   Pada `video.html`, iframe pihak ketiga (Eporner embed player) langsung disisipkan ke DOM begitu API merespons. Iframe ini memuat script pihak ketiga, tracking, dan koneksi media yang berat. Pola yang benar untuk SEO dan CWV adalah menggunakan **Facade Player** (tampilkan thumbnail beresolusi tinggi dengan tombol play, dan baru memuat iframe saat diklik user).
2. **Layout Shift (CLS):**  
   Thumbnail video dimuat secara dinamis tanpa atribut dimensi piksel `width` dan `height` tetap, menyebabkan kontainer melompat saat gambar selesai diunduh.
3. **Google Fonts Multi-Family:**  
   Memuat font `Inter`, `Noto Sans JP`, dan `Noto Sans SC` dari Google CDN secara bersamaan.
4. **Skrip Iklan Pihak Ketiga (Adsterra & Monetag):**  
   *Catatan penting:* Sesuai instruksi mutlak dari pemilik, **skrip iklan pihak ketiga TIDAK AKAN DISENTUH ATAU DIUBAH**. Namun, optimasi performa difokuskan pada elemen internal kita (facade player, image preconnect, dan script loading internal).

---

## 8. Ringkasan Temuan & Rencana Perbaikan (Berdasarkan Prioritas)

### 🔴 Prioritas 1: Kritis (Dampak Langsung ke Indexing & Peringkat Google)
1. **Perbaikan Rendering HTML Awal (Pre-rendering / Edge SSR / SSG):**
   * *Masalah:* Halaman video (`/v/*`) dan kategori (`/c/*`) kosong di HTML awal. Judul dan deskripsi identik untuk 20.000+ URL.
   * *Solusi:* Buat sistem pre-rendering (bisa via Vercel Edge Middleware / Serverless Function atau script SSG generator) agar HTML awal yang diterima bot sudah berisi `<title>`, `<meta description>`, `<link rel="canonical">`, `<h1>`, dan structured data `VideoObject` yang spesifik per video/kategori.
   * *Estimasi Usaha:* Sedang – Tinggi.
2. **Konversi Pagination & Navigasi ke Semantic `<a href>`:**
   * *Masalah:* Pagination dan tombol kategori memakai `<button onclick>`. Googlebot tidak bisa merayapi halaman kedua ke atas.
   * *Solusi:* Ubah tombol pagination menjadi link standar `<a href="?page=2">` atau `<a href="/c/asian?page=2">` dengan `window.history.pushState`.
   * *Estimasi Usaha:* Sedang.

### 🟠 Prioritas 2: Tinggi (Metadata & Snippet Rich Results)
3. **Canonical & Meta Tag Dinamis di HTML Awal:**
   * Pastikan `<link rel="canonical">`, Open Graph, dan Twitter Card terisi tepat di HTML awal sebelum JavaScript berjalan.
   * *Estimasi Usaha:* Rendah – Sedang (terselesaikan bersamaan dengan perbaikan rendering).
4. **Structured Data JSON-LD `VideoObject` & `ItemList` di HTML Awal:**
   * Pasang schema `VideoObject` valid di HTML awal halaman video dan `ItemList` di kategori.
   * *Estimasi Usaha:* Sedang.

### 🟡 Prioritas 3: Sedang (Performa & CWV)
5. **Video Embed Facade (Click-to-Play):**
   * Ganti auto-insert iframe dengan thumbnail facade dan tombol play SVG. Player baru dimuat saat user menekan tombol play. Memangkas LCP drastis.
   * *Estimasi Usaha:* Sedang.
6. **Mencegah Cumulative Layout Shift (CLS):**
   * Berikan rasio aspek kontainer yang pasti (`aspect-ratio: 16/9`) dan atribut width/height pada placeholder kartu.
   * *Estimasi Usaha:* Rendah.

### 🟢 Prioritas 4: Rendah (Penyempurnaan Tambahan)
7. **Penyempurnaan Sitemap Kategori:**
   * Tambahkan `<lastmod>` aktual pada `sitemap_categories.xml`.
   * *Estimasi Usaha:* Sangat Rendah.

---

## Kesimpulan Auditor
Penyebab website ini memiliki *hampir nol traffic organik selama 10 bulan* **bukan karena penalti**, melainkan karena **arsitektur Client-Side Rendering (CSR) murni** pada halaman video dan kategori yang menyajikan HTML awal kosong dan seragam ke Googlebot, ditambah navigasi pagination berbasis JavaScript button yang tidak bisa dirayapi mesin pencari.

Dengan menyelesaikan FASE 1 (Fondasi Crawling & Indexing) dan FASE 2 (Metadata On-Page), Googlebot akan untuk pertama kalinya dapat membaca judul unik, deskripsi unik, H1, dan video schema pada setiap halaman.
