# Checklist Manual Pemilik Website — LustHub V2.0 (lusthub.my.id)

Panduan lengkap di luar kode sumber (**Cloudflare**, **Google Search Console**, **Bing/Yandex Webmaster**, **Strategi Migrasi gTLD 5-Menit**, dan **Off-Page Authority US & Eropa**) agar arsitektur **LustHub V2.0** (8 bahasa Eropa, 172+ long-tail compound hubs, 5 discovery hubs, 64-shard O(1) edge runtime, dan 100% Adsterra intact) menghasilkan trafik organik internasional semaksimal mungkin.

---

## 1. Pengaturan Cloudflare *(Edge Cache `< 40ms` di US & Seluruh Eropa)*

### A. Update 1-Menit Cache Rule (8 Bahasa Eropa + 5 Discovery Hubs)
Buka [Cloudflare Dashboard](https://dash.cloudflare.com/) pada domain **`lusthub.my.id`** → **`Caching > Cache Rules`**:
1. Edit rule **`Cache SSR Video, Category & Feed`** Anda (klik **Edit expression**).
2. Ganti ekspresi dengan aturan lengkap V2.0 berikut agar seluruh server edge di US, London, Frankfurt, Paris, Madrid, Milan, Amsterdam, Lisbon, dan Warsawa men-cache seluruh halaman SSR & autocomplete Anda:
   ```text
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
   (starts_with(http.request.uri.path, "/api/suggest"))
   ```
3. Pastikan **Cache eligibility = `Eligible for cache`** dan **Edge TTL = `Use cache-control header if present, bypass cache if not`**, lalu klik **Save / Deploy**.
4. Buka **`Caching > Configuration`** → klik **`Purge Everything`** satu kali setelah deploy V2.0 selesai.

### B. Pengaturan Cloudflare Wajib Tetap Aktif
1. **`Security > Bots`:** **`Bot Fight Mode` = OFF** (pertahankan WAF Custom Rule `Allow Known Bots`).
2. **`Rules > Settings` → `URL Normalization`:** **`Normalize incoming URLs` = ON** dan **`Normalize URLs to origin` = ON**.
3. **`Speed > Optimization > Content Optimization`:** **`Cloudflare Fonts` = OFF** dan **`Rocket Loader` = OFF** *(wajib OFF agar skrip Adsterra Popunder & Social Bar berjalan 100% stabil)*.

---

## 2. Google Search Console (GSC) — Sitemap V2.0 & Validasi Perbaikan

1. Buka [Google Search Console](https://search.google.com/search-console) pada properti **`https://www.lusthub.my.id/`**.
2. **Kirim / Refresh Master Sitemap:**
   * Di menu **Peta Situs (Sitemaps)**, pastikan **`sitemap_index.xml`** aktif. Master index V2.0 kini memuat **11 file sitemap** (**7.355+ URL kanonis**):
     * `sitemaps/sitemap_pages.xml` *(halaman inti + 5 Discovery Hub: `/trending`, `/top-rated`, `/longest`, `/jav`, `/categories`)*
     * `sitemaps/sitemap_categories.xml` *(72 Core Hub Inggris + 9-way reciprocal `hreflang`)*
     * `sitemaps/sitemap_compound.xml` *(**172+ Long-Tail Compound Hubs** seperti `/c/german-milf`, `/c/european-amateur`, `/c/english-sub-jav`, `/c/4k-european`, `/c/czech-casting`)*
     * `sitemaps/sitemap_eu_locales.xml` *(**511 halaman Eropa** di 7 bahasa: `/de`, `/fr`, `/es`, `/it`, `/nl`, `/pt`, `/pl` + 72 kategori per bahasa dengan **9-way `hreflang` resiprokal sempurna**)*
     * `sitemaps/sitemap_videos_001.xml` s.d. `007.xml` *(6.588+ video AI-enriched non-spam yang lolos cek liveness)*
   * **Percepat Crawl (Disarankan):** Kirim juga secara eksplisit `sitemaps/sitemap_compound.xml` dan `sitemaps/sitemap_eu_locales.xml` di kolom Peta Situs agar Googlebot langsung memprioritaskan 683 halaman long-tail & Eropa baru!
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
