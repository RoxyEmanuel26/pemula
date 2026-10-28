# Checklist Manual Pemilik Website (lusthub.my.id)

Panduan langkah demi langkah untuk tindakan yang memerlukan akses akun atau intervensi langsung dari pemilik website. Setiap langkah disusun dengan instruksi teknis yang jelas dan mudah dipraktikkan.

---

## 1. Verifikasi Domain di Google Search Console (GSC)

Agar Google dapat mengindeks website dan mengirimkan data analitik pencarian:

1. Buka [Google Search Console](https://search.google.com/search-console).
2. Login menggunakan akun Google Anda.
3. Pilih opsi **Domain Property** (bukan URL Prefix), lalu masukkan domain: `lusthub.my.id`.
4. Salin catatan TXT DNS yang diberikan Google.
5. Masuk ke dashboard DNS penyedia domain Anda (Cloudflare / Namecheap / Rumahweb, dll.).
6. Tambahkan record DNS baru:
   * **Type:** `TXT`
   * **Name:** `@` (atau `lusthub.my.id`)
   * **Value:** *(paste kode verifikasi dari Google, contoh: `google-site-verification=...`)*
   * **TTL:** Auto
7. Kembali ke Google Search Console dan klik tombol **Verify**.
8. Setelah terverifikasi, masuk ke menu **Sitemaps** di sidebar kiri.
9. Masukkan URL sitemap utama:
   ```text
   sitemap_index.xml
   ```
10. Klik **Submit**. Pastikan statusnya berubah menjadi **Success** (Google akan membaca `sitemap_pages.xml`, `sitemap_categories.xml`, dan sitemap video secara berkala).

---

## 2. Periksa Laporan "Pages" (Pengindeksan Halaman) di GSC

Lakukan audit berkala seminggu sekali pada laporan pengindeksan:

1. Buka menu **Indexing > Pages** di sidebar GSC.
2. Perhatikan 2 grafik utama:
   * **Indexed (Hijau):** Jumlah halaman yang aktif tampil di hasil pencarian Google.
   * **Not indexed (Abu-abu):** Halaman yang tidak masuk indeks Google.
3. Periksa alasan umum di bagian *Why pages aren't indexed*:
   * **Discovered - currently not indexed:** Halaman ditemukan Google tapi belum sempat dirayapi. Halaman yang telah diperkaya (*enriched*) secara bertahap akan diproses oleh Googlebot.
   * **Crawled - currently not indexed:** Google sudah merayapi halaman tetapi menganggap kualitasnya belum cukup unik. Berkat implementasi Fase 5, video yang belum diperkaya otomatis dilindungi dengan `noindex, follow` agar tidak memicu penalti *thin content*.
   * **Excluded by 'noindex' tag:** Ini adalah status normal untuk halaman video yang belum melewati pipeline pengayaan AI, halaman pencarian internal (`?q=`), dan halaman `404.html`.

---

## 3. URL Inspection & Permintaan Indexing Awal

Minta bot Google memprioritaskan perayapan halaman-halaman kunci situs Anda:

1. Di kolom pencarian bagian atas Search Console, masukkan URL berikut satu per satu:
   * `https://www.lusthub.my.id/` (Homepage)
   * `https://www.lusthub.my.id/c/indonesia` (Hub Kategori Indonesia)
   * `https://www.lusthub.my.id/c/viral` (Hub Kategori Viral)
   * `https://www.lusthub.my.id/c/bokep-indo` (Hub Kategori Bokep Indo)
   * `https://www.lusthub.my.id/c/japanese` (Hub Kategori Japanese)
   * 3 sampai 5 URL video populer teratas yang sudah berstatus `enriched`.
2. Klik **Test Live URL** untuk memastikan Googlebot dapat membaca halaman dengan status `200 OK`, Title, H1, dan JSON-LD.
3. Klik tombol **Request Indexing**.

---

## 4. Pendaftaran di Bing Webmaster Tools & IndexNow

Mesin pencari Bing menggerakkan Yahoo Search, DuckDuckGo (sebagian), dan ekosistem Microsoft:

1. Buka [Bing Webmaster Tools](https://www.bing.com/webmasters).
2. Login dan pilih **Import from Google Search Console** (metode paling cepat dan otomatis tanpa perlu verifikasi ulang).
3. Setelah profil aktif, masuk ke menu **Sitemaps** dan kirimkan `https://www.lusthub.my.id/sitemap_index.xml`.
4. **IndexNow:** Fitur ini memberi tahu Bing dan Yandex secara instan begitu ada halaman baru. Anda dapat mengaktifkannya langsung melalui Cloudflare App Store (pencarian: "IndexNow by Microsoft Bing") dengan satu klik tanpa menulis kode server.

---

## 5. Pemasangan Analitik Pengunjung (GA4 / Plausible)

Pantau volume pengunjung, negara asal, dan kata kunci:

1. Buat properti **Google Analytics 4 (GA4)** di [analytics.google.com](https://analytics.google.com).
2. Dapatkan **Measurement ID** Anda (berformat `G-XXXXXXXXXX`).
3. Buka file `index.html` dan `video.html`:
   ```javascript
   // Isi variabel yang sudah disiapkan:
   window.GA4_MEASUREMENT_ID = 'G-XXXXXXXXXX';
   ```
4. Atau pasang analitik berbasis privasi tanpa cookie (seperti Plausible / Umami) yang sangat ringan dan tidak memperlambat Core Web Vitals.

---

## 6. Jadwal Pemantauan Mingguan (Weekly SOP)

Luangkan waktu 15–20 menit setiap awal pekan (misalnya setiap Senin pagi):

| No | Hal yang Diperiksa | Target / Indikator Sehat | Tindakan Jika Bermasalah |
|---|---|---|---|
| 1 | **Total Clicks & Impressions** di GSC | Tren garis grafik bergerak naik | Update konten hub kategori yang tayangannya mulai tumbuh |
| 2 | **Average Position** kata kunci utama | Posisi 1–20 untuk kata kunci long-tail | Tambahkan internal link dari video populer ke kategori terkait |
| 3 | **Total Indexed Pages** | Bertambah seiring background pipeline pengayaan berjalan | Jalankan `npm run seo:status` untuk melihat progres batch |
| 4 | **Core Web Vitals Report** di GSC | Status 100% "Good" (Hijau) | Pastikan poster video facade tetap terkompresi dengan baik |
| 5 | **Usage Vercel & Edge Requests** | Tetap hemat dan jauh di bawah batas kuota | Pastikan Cloudflare caching dan header browser cache tidak diubah |

---

## 7. Strategi Trafik Organik di Luar Google (Khusus Situs Hiburan)

Mengandalkan SEO murni memerlukan waktu inkubasi (biasanya 2–8 minggu). Terapkan strategi multichannel berikut untuk mendatangkan pengunjung langsung:

### A. Saluran Telegram Berbasis Cuplikan (Teaser + Link)
* Buat Channel Telegram resmi dengan nama brand `lusthub.my.id`.
* Publikasikan potongan klip preview pendek (durasi 5–15 detik).
* Sertakan link langsung ke halaman video situs (`https://www.lusthub.my.id/v/{id}-{slug}`) dengan teks ajakan: *"Tonton full durasi HD tanpa iklan pop-up di web resmi: lusthub.my.id"*.
* Telegram adalah sumber traffic retensi nomor 1 untuk situs hiburan dewasa di Indonesia.

### B. Komunitas Twitter / X & Thread Viral
* Manfaatkan tagar (*hashtags*) yang sedang tren saat ada video viral lokal yang ramai dibicarakan.
* Buat tweet berbasis screenshot sensor/teaser singkat dengan watermark domain `lusthub.my.id`.
* Sematkan link di kolom komentar (*reply*) atau bio profil akun untuk menghindari deteksi shadowban otomatis algoritma X.

### C. Forum Komunitas & Web Bookmarking
* Bagikan ulasan kurasi kategori (misalnya: *"Kumpulan 20 Link Video Viral Terlengkap Kualitas 1080p"*) di forum-forum diskusi bertema hiburan dewasa.
* Gunakan anchor text yang mengarah ke Halaman Hub Kategori (`https://www.lusthub.my.id/c/{kategori}`) karena halaman kategori memiliki nilai backlink yang lebih tahan lama dibanding halaman video tunggal.

---

## 8. Menjalankan Pengayaan Konten Berkala (SEO Pipeline)

Untuk terus memperkaya sisa video yang masih berstatus `noindex`:

1. **Secara Manual:**
   ```bash
   # Jalankan pengayaan untuk 50 video berikutnya
   npm run seo:enrich -- --limit 50
   
   # Cek status hasil indexing dan sisa antrean
   npm run seo:status
   ```
2. **Secara Otomatis (GitHub Actions / Vercel Cron):**
   * Pasang `GEMINI_API_KEY` di Environment Variables hosting/repository Anda.
   * Jadwalkan pemanggilan `npm run seo:enrich` 1 kali per hari untuk secara konsisten mengubah 500–1000 video tipis menjadi halaman kaya yang layak indeks setiap harinya tanpa melebihi batas kuota gratis.
