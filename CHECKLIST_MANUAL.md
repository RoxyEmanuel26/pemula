# Checklist Manual Pemilik Website (lusthub.my.id)

Panduan langkah demi langkah untuk pengaturan di luar kode sumber (Cloudflare, Google Search Console, Bing/Yandex Webmaster, dan Analitik) agar trafik dari **US & EU** mencapai potensi puncaknya.

---

## 1. Cloudflare Edge Caching Rule *(Wajib untuk Kecepatan US & EU < 50ms)*

Meskipun server Vercel telah dipindahkan ke `iad1` (US East) dan sudah mengirim header `CDN-Cache-Control`, Cloudflare secara *default* tidak men-cache dokumen HTML `/v/*` dan `/c/*`. Aktifkan 1 aturan cache gratis ini di Dashboard Cloudflare Anda:

1. Login ke [Cloudflare Dashboard](https://dash.cloudflare.com/) → pilih domain **`lusthub.my.id`**.
2. Masuk ke menu **Caching > Cache Rules** → klik **Create rule**.
3. Beri nama aturan: `Cache SSR Video, Category & Feed`.
4. Pada **When incoming requests match...**, pilih **Custom filter expression**, lalu isi logika **OR** berikut:
   * `URI Path` **starts with** `/v/`
   * **OR** `URI Path` **starts with** `/c/`
   * **OR** `URI Path` **equals** `/feed.xml`
   * **OR** `URI Path` **equals** `/llms.txt`
5. Pada bagian **Cache eligibility**, pilih **Eligible for cache**.
6. Pada bagian **Edge TTL**, pilih **Use cache-control header if present, bypass cache if not** *(agar aturan 24 jam + stale-while-revalidate dari Vercel `api/video.js` & `api/category.js` otomatis dihormati!)*.
7. Pada **Browser TTL**, pilih **Respect origin**.
8. Klik **Deploy**.

> [!TIP]
> **Pastikan DNS Security tidak menghalangi crawler:** Di Cloudflare **Security > Settings**, pastikan **Bot Fight Mode** tetap diizinkan melewati aturan Custom WAF `Allow Known Bots (cf.client.bot -> Skip)` seperti yang sudah Anda pasang agar `Googlebot`, `Bingbot`, `DuckDuckBot`, `Yandex`, dan `GPTBot` tidak pernah ditantang CAPTCHA.

---

## 2. Google Search Console (GSC)

1. Buka [Google Search Console](https://search.google.com/search-console) pada properti domain Anda (`https://www.lusthub.my.id/`).
2. Pastikan pada menu **Sitemaps / Peta Situs**, Anda hanya mengirimkan:
   ```text
   sitemap_index.xml
   ```
   *(Jangan menambahkan `/` di depan huruf `s`)*.
3. **Inspeksi URL Prioritas (Request Indexing):** Uji & ajukan indeks untuk URL strategis berikut:
   * `https://www.lusthub.my.id/` *(Homepage dengan SSR 24 video & 20 hub US/EU)*
   * `https://www.lusthub.my.id/c/milf`
   * `https://www.lusthub.my.id/c/blonde`
   * `https://www.lusthub.my.id/c/pov`
   * `https://www.lusthub.my.id/c/onlyfans`
   * `https://www.lusthub.my.id/c/european`
   * `https://www.lusthub.my.id/c/amateur`
4. Uji 1 halaman video ter-enrich di [Google Rich Results Test](https://search.google.com/test/rich-results) untuk memastikan skema **`VideoObject`** (`embedUrl` + thumbnail HD) dan **`FAQPage`** terdeteksi hijau tanpa error.

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

Agar Anda dapat melihat berapa persen pengunjung datang dari **US, UK, Jerman, Prancis, Belanda, Kanada, dll.**:
1. Buat properti **Google Analytics 4 (GA4)** di [analytics.google.com](https://analytics.google.com) → salin Measurement ID (`G-XXXXXXXXXX`).
2. Masukkan ID tersebut ke variabel `window.GA4_MEASUREMENT_ID = 'G-XXXXXXXXXX';` di [`index.html`](file:///e:/00%20projek%20rumah/antigravity/website%20tuyul/index.html), [`video.html`](file:///e:/00%20projek%20rumah/antigravity/website%20tuyul/video.html), [`category.html`](file:///e:/00%20projek%20rumah/antigravity/website%20tuyul/category.html), dan halaman statis lainnya. *(Atau aktifkan **Cloudflare Web Analytics** gratis langsung dari Dashboard Cloudflare tanpa mengubah HTML!)*.

---

## 5. Catatan Strategis Jangka Menengah (Domain `.my.id` vs gTLD `.com` / `.tv` / `.cc`)

Website Anda kini menggunakan server `iad1` (US East), bebas sinyal `geo.region="ID"`, punya 44 kategori hub US/EU, serta IndexNow otomatis. Namun, jika kelak Anda ingin menghilangkan bias bawaan ccTLD `.my.id` di algoritma **Google Search US/EU** secara 100%:
* Pertimbangkan mendaftarkan domain netral global (seperti `.com`, `.tv`, `.cc`, `.me`, atau `.xyz`), arahkan `SITEMAP_BASE_URL` dan `BASE_URL` di [`api/schema-helper.js`](file:///e:/00%20projek%20rumah/antigravity/website%20tuyul/api/schema-helper.js) ke domain baru, lalu pasang Redirect `301` dari `lusthub.my.id` ke domain baru di Cloudflare. Seluruh fondasi SEO ini sudah siap migrasi dengan mulus!
