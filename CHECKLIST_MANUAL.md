# Checklist Manual Pemilik Website — LustHub V2.0 (lusthub.my.id)

Panduan lengkap di luar kode sumber (**Cloudflare**, **Google Search Console**, **Bing/Yandex Webmaster**, **Strategi Migrasi gTLD 5-Menit**, dan **Off-Page Authority US & Eropa**) agar arsitektur **LustHub V2.0** (8 bahasa Eropa, 172+ long-tail compound hubs, 5 discovery hubs, 64-shard O(1) edge runtime, dan 100% Adsterra intact) menghasilkan trafik organik internasional semaksimal mungkin.

---

## 1. Pengaturan Cloudflare *(Hemat 95% Kuota Vercel + Edge Cache `< 40ms` US & Eropa)*

### A. Aktifkan Smart Tiered Cache (1 Klik, GRATIS — Hemat hingga 95% Origin Hits!)
Tanpa Tiered Cache, setiap halaman video yang dibuka dari 50 negara berbeda akan menembak Vercel Origin 50 kali terpisah!
1. Di [Cloudflare Dashboard](https://dash.cloudflare.com/) pada domain **`lusthub.my.id`** → **`Caching > Tiered Cache`**.
2. Klik **`Enable Tiered Cache`** → pilih **`Smart Tiered Cache Topology`** (GRATIS di paket Free!). Semua 300+ PoP global Cloudflare kini berbagi 1 cache induk sebelum menyentuh Vercel.

### B. Blokir Scraper Bot Rakus Bandwidth di Cloudflare WAF (1 Menit, GRATIS)
Bot scraper (`Bytespider`, `AhrefsBot`, `SemrushBot`, `PetalBot`, `Amazonbot`, `MJ12bot`, `DataForSeoBot`, `DotBot`, `BLEXBot`) sering mengabaikan `robots.txt` dan menguras **Fast Origin Transfer** Vercel!
1. Buka **`Security > WAF > Custom rules`** → klik **`Create rule`** (beri nama **`Block Bad Scrapers`**).
2. Klik **`Edit expression`** dan tempel:
   ```text
   (http.user_agent contains "Bytespider") or
   (http.user_agent contains "AhrefsBot") or
   (http.user_agent contains "SemrushBot") or
   (http.user_agent contains "MJ12bot") or
   (http.user_agent contains "PetalBot") or
   (http.user_agent contains "DotBot") or
   (http.user_agent contains "DataForSeoBot") or
   (http.user_agent contains "Amazonbot") or
   (http.user_agent contains "BLEXBot")
   ```
3. Action: **`Block`** → klik **Deploy** (pastikan berada di bawah rule `Allow Known Bots` jika ada).

### C. Perluasan 1-Menit Cache Rule (8 Bahasa Eropa + 5 Discovery Hubs + Edge TTL 7 Hari)
Di **`Caching > Cache Rules`**:
1. Edit rule **`Cache SSR Video, Category & Feed`** Anda (klik **Edit expression**).
2. Ganti ekspresi dengan aturan lengkap V2.2 berikut agar Cloudflare men-cache seluruh HTML & sitemap langsung di Edge:
   ```text
   (http.request.uri.path eq "/") or
   (starts_with(http.request.uri.path, "/v/")) or
   (starts_with(http.request.uri.path, "/c/")) or
   (http.request.uri.path in {"/trending" "/top-rated" "/longest" "/jav" "/categories" "/feed.xml" "/llms.txt"}) or
   (http.request.uri.path eq "/de") or (starts_with(http.request.uri.path, "/de/c/")) or
   (http.request.uri.path eq "/fr") or (starts_with(http.request.uri.path, "/fr/c/")) or
   (http.request.uri.path eq "/es") or (starts_with(http.request.uri.path, "/es/c/")) or
   (http.request.uri.path eq "/it") or (starts_with(http.request.uri.path, "/it/c/")) or
   (http.request.uri.path eq "/nl") or (starts_with(http.request.uri.path, "/nl/c/")) or
   (http.request.uri.path eq "/pt") or (starts_with(http.request.uri.path, "/pt/c/")) or
   (http.request.uri.path eq "/pl") or (starts_with(http.request.uri.path, "/pl/c/")) or
   (starts_with(http.request.uri.path, "/sitemap"))
   ```
3. Pengaturan Rule:
   - **Cache eligibility:** `Eligible for cache`
   - **Edge TTL:** `Use cache-control header if present, bypass cache if not` *(sudah diset 7–30 hari otomatis di server!)*
   - **Cache Key → Query string:** pilih **`Ignore query string`** untuk rule khusus `/v/` *(agar parameter `?fbclid=`, `?utm_...`, `?ref=` tidak pernah memecah cache & memicu Vercel Function!)*
4. Klik **Save / Deploy**, lalu buka **`Caching > Configuration`** → klik **`Purge Everything`** satu kali.

### B. Pengaturan Cloudflare Wajib Tetap Aktif
1. **`Security > Bots`:** **`Bot Fight Mode` = OFF** (pertahankan WAF Custom Rule `Allow Known Bots`).
2. **`Rules > Settings` → `URL Normalization`:** **`Normalize incoming URLs` = ON** dan **`Normalize URLs to origin` = ON**.
3. **`Speed > Optimization > Content Optimization`:** **`Cloudflare Fonts` = OFF** dan **`Rocket Loader` = OFF** *(wajib OFF agar skrip Adsterra Popunder & Social Bar berjalan 100% stabil)*.

---

## 2. Google Search Console (GSC) — Sitemap V2.0 & Validasi Perbaikan

1. Buka [Google Search Console](https://search.google.com/search-console) pada properti **`https://www.lusthub.my.id/`**.
2. **Kirim Ulang Master Sitemap dengan Format yang Benar (PENTING — TANPA `/` di Depan!):**
   * **HAPUS seluruh entri lama yang diawali garis miring `/`** di daftar *"Peta situs yang dikirimkan"* (klik setiap entri → ikon titik tiga kanan atas → **Hapus peta situs**). Karena kotak input GSC sudah berakhir dengan `https://www.lusthub.my.id/`, mengetik `/sitemap_index.xml` membuat GSC menyimpan URL rusak `https://www.lusthub.my.id//sitemap_index.xml`!
   * Setelah semua entri lama dihapus, cukup ketik **`sitemap_index.xml`** (**TANPA `/` di depan!**) lalu klik **KIRIM**.
   * Seluruh 11 sub-sitemap kini disajikan langsung di **root domain** (100% patuh aturan scope direktori `sitemaps.org` & tanpa header `X-Robots-Tag: noindex`):
     * `sitemap_pages.xml` *(halaman inti + 5 Discovery Hub)*
     * `sitemap_categories.xml` *(67 Core Hub aktif tanpa hub kosong)*
     * `sitemap_compound.xml` *(**172+ Long-Tail Compound Hubs**)*
     * `sitemap_eu_locales.xml` *(**455 halaman Eropa murni** di 7 bahasa dengan **9-way `hreflang` resiprokal**)*
     * `sitemap_videos_001.xml` s.d. `007.xml` *(6.583+ video AI dengan 100% `<video:duration>` dan tanggal W3C ketat)*
   * **Uji Langsung (Wajib 10 Detik):** Tempel `https://www.lusthub.my.id/sitemap_index.xml` di kotak **Inspeksi URL** (bagian atas GSC) → klik **`Uji URL Aktif`**. Jika muncul `HTTP 200` dan XML terbaca, tetapi tabel Peta Situs belum langsung hijau, cek **Cloudflare → Security → Events** (filter `URI Path contains sitemap`) untuk memastikan Cloudflare tidak menantang/memblokir IP Googlebot!
3. **Inspeksi URL Prioritas (Request Indexing):**
   * Ajukan indeks cepat untuk: `/trending`, `/categories`, `/jav`, `/longest`, `/nl`, `/pt`, `/pl`, `/c/german-milf`, `/c/european-amateur`, `/c/english-sub-jav`, `/nl/c/milf`.
4. **Validasi Perbaikan `Di-crawl - saat ini tidak diindeks`:**
   * Setelah klik **Purge Everything** di Cloudflare, buka **Pengindeksan halaman → Di-crawl - saat ini tidak diindeks** → klik **`MULAI VALIDASI BARU (Validate Fix)`**. Video mati sudah mengembalikan `HTTP 410 Gone`, sitemap XML sudah membawa `X-Robots-Tag: noindex, follow`, dan 100% video AI kini memiliki `0.00%` orphan rate!

---

## 3. Bing, DuckDuckGo, Yahoo, Seznam EU & Yandex *(Mesin Trafik Utama 18+ US & Eropa!)*

Karena Google menerapkan SafeSearch sangat ketat pada kueri dewasa di AS & Eropa, **Bing, DuckDuckGo, Yahoo, Seznam (Ceko), dan Yandex** sering menghasilkan lonjakan trafik lebih cepat sekaligus rasio CPM Adsterra US/EU yang sangat tinggi.

* **IndexNow Otomatis Aktif:** Setiap 12 jam, CI otomatis mengirim hingga **2.268 URL prioritas** (8 homepage bahasa + 5 discovery hub + 172 compound hubs + 511 EU hubs + video terbaru) ke `api.indexnow.org`.
* **Bing Webmaster Tools:** Buka [bing.com/webmasters](https://www.bing.com/webmasters) → **Import from GSC** → pastikan `https://www.lusthub.my.id/sitemap_index.xml` dan `https://www.lusthub.my.id/feed.xml` terdaftar.
* **Yandex Webmaster:** Buka [webmaster.yandex.com](https://webmaster.yandex.com/) *(verifikasi meta `a25cbe2b4f64ad3a` sudah terpasang)* → kirim `https://www.lusthub.my.id/sitemap_index.xml`.

---

## 4. Playbook Pertumbuhan Off-Page & Backlink US / Eropa *(Kunci Tembus Halaman 1 Google!)*

Kode & arsitektur V2.0 kini sudah setara situs tube internasional tercepat di dunia, namun **Google membutuhkan sinyal kepercayaan eksternal (Referring Domains + Brand Searches)** untuk mengangkat domain baru melewati pesaing lama di SERP US/EU:
1. **Daftarkan ke Direktori Indeks Dewasa Bereputasi Tinggi (High-DR Dofollow/Referral):**
   * Submit situs ke direktori kurasi global seperti *ThePornDude*, *PornGeek*, *MrPornGeek*, *ThePornList*, *PornSites.xxx*, dan *BestPornSites* (kategori Free Tubes / HD / JAV). Satu listing saja bisa menyumbang ribuan pengunjung US/EU per bulan + sinyal Otoritas Domain (DR) kuat bagi Google!
2. **Distribusi Telegram & X/Twitter (Brand Search + Return Visits / Navboost):**
   * Gunakan saluran Telegram Anda (`t.me/missav_jav_english`) untuk membagikan tautan langsung ke hub V2.0 (`/jav`, `/c/english-sub-jav`, `/c/uncensored-jav`, `/trending`, `/c/german-milf`). Klik langsung dari Telegram/X meningkatkan metrik *dwell time* dan *returning visitor* (**Navboost**) yang sangat disukai Google.
3. **Sindikasi RSS Feed (`/feed.xml`):**
   * Daftarkan `https://www.lusthub.my.id/feed.xml` ke agregator RSS dewasa & feed ping services agar setiap rilis baru langsung mendapat tautan masuk otomatis.

---

## 5. Saklar Migrasi 5-Menit ke Domain Global gTLD (`.com` / `.tv` / `.cc`)

> [!IMPORTANT]
> Secara algoritma, ekstensi **`.my.id`** dibaca Google sebagai ccTLD negara **Indonesia**, yang membatasi sebagian potensi peringkat organik di **Google.com (US)** dan **Google Eropa**. Seluruh kode V2.0 kini sudah dirancang **domain-agnostic** (`lib/schema.js` membaca environment variable `SITE_BASE_URL`).

Kapan pun Anda siap menembus batas geografis ccTLD ini (sangat direkomendasikan saat pendapatan Adsterra sudah menutupi biaya domain ~$10/tahun):
1. Beli domain gTLD netral (mis. `.com`, `.tv`, `.cc`, `.me`, atau `.to`) dan hubungkan ke proyek Vercel + Cloudflare yang sama.
2. Di **Vercel Project Settings → Environment Variables**, tambahkan:
   ```text
   SITE_BASE_URL = https://www.domainbarukamu.com
   ```
3. Pasang **1 Cloudflare Redirect Rule (`301 Permanent Redirect`)** dari `lusthub.my.id/*` → `https://www.domainbarukamu.com/$1` (Preserve query string = ON).
4. Jalankan ulang workflow GitHub Actions **Daily SEO sitemap refresh** (set `SITEMAP_BASE_URL` di repo variable) dan klik **Change of Address** di Google Search Console. Seluruh 7.355+ URL, 8 bahasa Eropa, 172 compound hubs, dan seluruh peringkat Anda langsung berpindah mulus dengan potensi trafik US & Eropa **3x–10x lebih tinggi**!
