# Checklist Manual Pemilik Website (lusthub.my.id)

Panduan langkah demi langkah untuk pengaturan di luar kode sumber (Cloudflare, Google Search Console, Bing/Yandex Webmaster, dan Analitik) agar sitemap terbaca 100% sukses dan trafik **US & Eropa (UK, DE, FR, ES, IT)** mencapai potensi puncaknya.

---

## 1. Pengaturan Cloudflare *(Agar Rute Eropa `/de`, `/fr`, `/es`, `/it` Juga Edge `< 40ms`)*

### A. Perluasan 1-Menit Cache Rule untuk 292 Halaman Eropa Baru
Di [Cloudflare Dashboard](https://dash.cloudflare.com/) pada domain **`lusthub.my.id`** → **`Caching > Cache Rules`**:
1. Edit rule **`Cache SSR Video, Category & Feed`** Anda.
2. Tambahkan 4 baris `OR` (atau klik *Edit expression*) agar seluruh portal Eropa (`/de`, `/fr`, `/es`, `/it` beserta 72 kategori per bahasa) ikut ter-cache di server edge Frankfurt, Paris, Madrid, Milan, dan London:
   ```text
   (starts_with(http.request.uri.path, "/v/")) or
   (starts_with(http.request.uri.path, "/c/")) or
   (http.request.uri.path eq "/de") or (starts_with(http.request.uri.path, "/de/c/")) or
   (http.request.uri.path eq "/fr") or (starts_with(http.request.uri.path, "/fr/c/")) or
   (http.request.uri.path eq "/es") or (starts_with(http.request.uri.path, "/es/c/")) or
   (http.request.uri.path eq "/it") or (starts_with(http.request.uri.path, "/it/c/")) or
   (http.request.uri.path eq "/feed.xml") or
   (http.request.uri.path eq "/llms.txt")
   ```
3. Pastikan **Cache eligibility = `Eligible for cache`** dan **Edge TTL = `Use cache-control header if present, bypass cache if not`**, lalu klik **Save / Deploy**.
4. Buka **`Caching > Configuration`** → klik **`Purge Everything`** satu kali setelah deploy.

### B. Checklist Pengaturan Cloudflare yang Wajib Tetap Aktif
1. **`Security > Bots`:** Pastikan **`Bot Fight Mode` = OFF** (tetap pertahankan WAF Custom Rule `Allow Known Bots`).
2. **`Rules > Settings` → `URL Normalization`:** Pastikan **`Normalize incoming URLs` = ON** dan **`Normalize URLs to origin` = ON** *(sudah terverifikasi aktif di live: `//sitemap_index.xml` merespons `200 OK` dalam `39ms`)*.
3. **`Speed > Optimization > Content Optimization`:** Pastikan **`Cloudflare Fonts` = OFF** dan **`Rocket Loader` = OFF**.

---

## 2. Google Search Console (GSC) — Sitemap & Pengindeksan US + Eropa

1. Buka [Google Search Console](https://search.google.com/search-console) pada properti **`https://www.lusthub.my.id/`**.
2. **Pastikan Master Sitemap Aktif:**
   * Di menu **Peta Situs (Sitemaps)**, kirimkan **`sitemap_index.xml`** (tanpa `/` di depan).
   * Master index ini otomatis menautkan:
     * `sitemaps/sitemap_pages.xml` *(7 halaman inti + 6 arah `hreflang` untuk `/`)*
     * `sitemaps/sitemap_categories.xml` *(72 hub US/EU & global berbahasa Inggris + `hreflang`)*
     * `sitemaps/sitemap_eu_locales.xml` *(**292 halaman lokal Eropa**: `/de`, `/fr`, `/es`, `/it` + 72 hub per bahasa dengan `hreflang` resiprokal)*
     * `sitemaps/sitemap_videos_001.xml`, `002.xml`, `003.xml`, dst. *(video AI-enriched non-spam)*
   * **Percepat Pengindeksan Eropa (Opsional):** Anda dapat langsung mengirim `sitemaps/sitemap_eu_locales.xml` secara eksplisit di kolom Peta Situs agar Googlebot Eropa langsung memprioritaskan 292 halaman DE/FR/ES/IT.
3. **Inspeksi URL Prioritas (Request Indexing):**
   * Uji & ajukan indeks untuk: `/de`, `/fr`, `/es`, `/it`, `/c/brunette`, `/c/hardcore`, `/c/pornstar`, `/de/c/milf`, `/fr/c/blonde`, `/es/c/latina`, `/it/c/amateur`.
4. **Validasi `Diblokir oleh robots.txt`:**
   * Jika masih ada antrean validasi untuk URL `/?q=...` lama, klik **`VALIDASI PERBAIKAN`**.

---

## 3. Bing Webmaster Tools & Yandex Webmaster *(Sumber Trafik Raksasa US & Eropa!)*

Untuk kategori 18+ di Amerika Serikat dan Eropa, **Bing, DuckDuckGo, Yahoo, Seznam (Ceko/Eropa Tengah), dan Yandex** sering menyumbang porsi trafik organik sangat besar karena kebijakan filter SafeSearch Google jauh lebih ketat.

**Otomatisasi Aktif:** Key **IndexNow (`1b69cc1059c94dbcb3e9a18b36d3ed85.txt`)** kini memprioritaskan seluruh **292 URL Eropa** + 72 hub Inggris + video AI terbaru secara otomatis pada setiap siklus CI (`scripts/indexnow-submit.mjs`).

Langkah cepat:
1. **Bing Webmaster Tools:** Buka [bing.com/webmasters](https://www.bing.com/webmasters) → **Import from Google Search Console** → kirim `https://www.lusthub.my.id/sitemap_index.xml` dan `https://www.lusthub.my.id/feed.xml`.
2. **Yandex Webmaster:** Buka [webmaster.yandex.com](https://webmaster.yandex.com/) *(verifikasi meta `a25cbe2b4f64ad3a` sudah terpasang)* → kirim `https://www.lusthub.my.id/sitemap_index.xml`.

---

## 4. Analitik Pengunjung (GA4 / Yandex Metrica)

Cloudflare Web Analytics (RUM) sudah aktif. Jika ingin memantau metrik detail per negara (US/DE/FR/ES/IT/UK) di Google Analytics 4:
1. Buat properti GA4 di [analytics.google.com](https://analytics.google.com) → salin Measurement ID (`G-XXXXXXXXXX`).
2. Isi variabel `window.GA4_MEASUREMENT_ID = 'G-XXXXXXXXXX';` di template HTML terkait.

---

## 5. Catatan Strategis Jangka Menengah (ccTLD `.my.id` vs Global gTLD `.com` / `.tv` / `.cc`)

Saat ini fondasi teknis Anda sudah 100% setara situs internasional kelas atas: server `iad1` (US East), 72 hub US/EU, 292 halaman lokal Eropa (`DE/FR/ES/IT`) dengan `hreflang` resiprokal sempurna, dan IndexNow otomatis. Satu-satunya batas alami di Google Search US/EU tinggal ekstensi ccTLD `.my.id` (kode negara Indonesia).
* Jika ke depan ingin menembus batas ccTLD tersebut, cukup daftarkan gTLD netral (`.com`, `.tv`, `.cc`, `.me`, atau `.xyz`), ubah `BASE_URL` di [`api/schema-helper.js`](file:///e:/00%20projek%20rumah/antigravity/website%20tuyul/api/schema-helper.js), dan pasang Redirect `301` di Cloudflare. Seluruh arsitektur multi-bahasa dan sitemap ini langsung berpindah tanpa kehilangan satu pun peringkat.
