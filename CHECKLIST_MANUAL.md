# Checklist Manual Pemilik Website (lusthub.my.id)

Panduan langkah demi langkah untuk pengaturan di luar kode sumber (Cloudflare, Google Search Console, Bing/Yandex Webmaster, dan Analitik) agar sitemap terbaca 100% sukses dan trafik **US & EU** mencapai potensi puncaknya.

---

## 1. Pengaturan Cloudflare *(Wajib agar Sitemap Tidak Terblokir & Edge < 50ms)*

### A. Perbaikan Akar Masalah Sitemap Tidak Bisa Diambil Google
> [!CAUTION]
> **Penyebab paling umum "Tidak dapat mengambil peta situs" di paket Cloudflare Free:**
> Pada **Cloudflare Free Plan**, aturan WAF Custom Rule `Allow Known Bots (cf.client.bot -> Skip)` **TIDAK bisa melewati `Bot Fight Mode`**, karena *Bot Fight Mode* berjalan di *pipeline* terpisah di luar Ruleset Engine! Hal ini sering menjatuhkan/menantang fetcher latar belakang Sitemap Google walaupun `Test Live URL` berhasil.

Lakukan 4 langkah ini di [Cloudflare Dashboard](https://dash.cloudflare.com/) pada domain **`lusthub.my.id`**:
1. **Matikan `Bot Fight Mode` (`Security > Bots` atau `Security > Settings`):**
   * Set **`Bot Fight Mode`** ke posisi **OFF**. *(Tetap pertahankan WAF Custom Rule Anda `Allow Known Bots` dan proteksi lain di Ruleset Engine)*.
2. **Periksa `AI Crawl Control` (di menu kiri Dashboard Cloudflare):**
   * Pastikan crawler mesin pencari (`Googlebot`, `GoogleOther`, `Bingbot`, `Applebot`, `DuckDuckBot`, `OAI-SearchBot`) berada pada status **Allow** untuk tujuan pencarian/pengindeksan.
   * Buka juga **`Security > Events`** dan filter path `sitemap` untuk memastikan tidak ada lagi action `Block` atau `Managed Challenge` yang menyentuh IP Google.
3. **Aktifkan URL Normalization ke Origin (`Rules > Settings` → `URL Normalization`):**
   * Pastikan **`Normalize incoming URLs` = ON** dan aktifkan **`Normalize URLs to origin` = ON**.
   * Ini menghilangkan redirect `HTTP 308` pada URL ber-slash ganda (`https://www.lusthub.my.id//sitemap_index.xml`) sehingga langsung melayani `200 OK` sebelum mencapai Vercel.
4. **Pastikan Cache Rule & Purge Everything:**
   * Di **`Caching > Cache Rules`**, pastikan rule `Cache SSR Video, Category & Feed` sudah berstatus **Active / Deployed** dengan `URI Path` dimulai `/v/`, `/c/`, atau equals `/feed.xml`, `/llms.txt`, dan **Edge TTL = `Use cache-control header if present, bypass cache if not`**.
   * Di **`Speed > Optimization > Content Optimization`**, pastikan **`Cloudflare Fonts` = OFF** dan **`Rocket Loader` = OFF**.
   * Terakhir, buka **`Caching > Configuration`** → klik **`Purge Everything`** satu kali setelah deploy terbaru.

---

## 2. Google Search Console (GSC) — Reset Sitemap & Validasi

1. Buka [Google Search Console](https://search.google.com/search-console) pada properti **`https://www.lusthub.my.id/`**.
2. **Reset Sitemap Lama yang Macet Sejak `5 Nov 2026`:**
   * Masuk ke menu **Peta Situs (Sitemaps)**.
   * Klik baris `/sitemap.xml` → klik ikon titik tiga `⋮` di kanan atas → pilih **Hapus peta situs**.
   * Klik baris `/sitemap_index.xml` → klik ikon titik tiga `⋮` → pilih **Hapus peta situs**.
3. **Uji Kesiapan Live Googlebot Sebelum Kirim:**
   * Tempel URL **`https://www.lusthub.my.id/sitemap_index.xml`** pada bilah **Periksa semua URL** di atas → klik **UJI URL AKTIF (Live Test)**. Pastikan hasil menampilkan `Pengambilan halaman: Berhasil` (`200 OK`).
4. **Kirim Ulang 1 Master Index (atau Sub-Sitemap Langsung):**
   * Pada kotak *Tambahkan peta situs baru* (`https://www.lusthub.my.id/`), ketik **hanya** `sitemap_index.xml` *(jangan ketik `/` di depan dan jangan kirim `sitemap.xml` secara bersamaan)* lalu klik **KIRIM**.
   * **Jalur Cepat (Opsional/Anti-Macet):** Jika master index masih berstatus menunggu antrean, Anda juga boleh mengirimkan file anak `<urlset>` secara langsung:
     * `sitemaps/sitemap_videos_001.xml` *(1.000 video AI)*
     * `sitemaps/sitemap_videos_002.xml` *(sisa video AI)*
     * `sitemaps/sitemap_categories.xml` *(44 kategori US/EU & global)*
     * `sitemaps/sitemap_pages.xml` *(7 halaman inti & compliance)*
5. **Validasi `Diblokir oleh robots.txt` (8 URL `/?q=...`):**
   * Setelah `Purge Everything` di Cloudflare, buka **Pengindeksan halaman → Diblokir oleh robots.txt** → klik **`VALIDASI PERBAIKAN`**. Kini 8 URL lama tersebut terbaca `X-Robots-Tag: noindex, follow` dan tidak ada link `?q=` baru yang dibuat di HTML.
6. **Inspeksi URL Prioritas (Request Indexing):** Uji & ajukan indeks untuk `/`, `/c/milf`, `/c/blonde`, `/c/pov`, `/c/onlyfans`, `/c/european`, `/c/amateur`, serta uji 1 halaman video ter-enrich di [Google Rich Results Test](https://search.google.com/test/rich-results).

---

## 3. Bing Webmaster Tools & Yandex Webmaster *(Sumber Trafik Raksasa US & EU!)*

Untuk ceruk hiburan dewasa di Amerika Serikat & Eropa, **Bing, DuckDuckGo, Yahoo, Seznam (EU), dan Yandex** sering menyumbang trafik jauh lebih besar daripada Google karena filter SafeSearch Google jauh lebih ketat.

**Kabar Baik:** Key **IndexNow (`1b69cc1059c94dbcb3e9a18b36d3ed85.txt`)** sudah diotomasi ke dalam pipeline harian (`scripts/indexnow-submit.mjs`) sehingga setiap pembaruan langsung ditembakkan ke Bing, DuckDuckGo, Yahoo, Yandex, dan Seznam.

Langkah verifikasi akun:
1. **Bing Webmaster Tools:**
   * Buka [Bing Webmaster Tools](https://www.bing.com/webmasters) → pilih **Import from Google Search Console** (otomatis terverifikasi dalam 10 detik!).
   * Buka menu **Sitemaps** → kirimkan `https://www.lusthub.my.id/sitemap_index.xml` dan `https://www.lusthub.my.id/feed.xml`.
   * Pantau tab **IndexNow** di dashboard Bing untuk melihat log URL masuk harian.
2. **Yandex Webmaster:**
   * Buka [Yandex Webmaster](https://webmaster.yandex.com/) → tag `<meta name="yandex-verification" content="a25cbe2b4f64ad3a" />` sudah terpasang di semua halaman HTML!
   * Verifikasi situs dan kirimkan `https://www.lusthub.my.id/sitemap_index.xml`.

---

## 4. Pemasangan Analitik Pengunjung (GA4 / Yandex Metrica)

Cloudflare Web Analytics (RUM) sudah aktif di dashboard Anda. Jika ingin melacak detail konversi video di Google Analytics 4 atau Yandex Metrica:
1. Buat properti **Google Analytics 4 (GA4)** di [analytics.google.com](https://analytics.google.com) → salin Measurement ID (`G-XXXXXXXXXX`).
2. Masukkan ID tersebut ke variabel `window.GA4_MEASUREMENT_ID = 'G-XXXXXXXXXX';` di template HTML terkait.

---

## 5. Catatan Strategis Jangka Menengah (Domain `.my.id` vs gTLD `.com` / `.tv` / `.cc`)

Website Anda kini menggunakan server `iad1` (US East), bebas sinyal `geo.region="ID"`, punya 44 kategori hub US/EU, serta IndexNow otomatis. Namun, jika kelak Anda ingin menghilangkan bias bawaan ccTLD `.my.id` di algoritma **Google Search US/EU** secara 100%:
* Pertimbangkan mendaftarkan domain netral global (seperti `.com`, `.tv`, `.cc`, `.me`, atau `.xyz`), arahkan `SITEMAP_BASE_URL` dan `BASE_URL` di [`api/schema-helper.js`](file:///e:/00%20projek%20rumah/antigravity/website%20tuyul/api/schema-helper.js) ke domain baru, lalu pasang Redirect `301` dari `lusthub.my.id` ke domain baru di Cloudflare. Seluruh fondasi SEO ini sudah siap migrasi dengan mulus!
