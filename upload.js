const fs = require('fs');
const path = require('path');
const { put } = require('@vercel/blob');

// ==========================================
// PANDUAN PENGGUNAAN:
// 1. Pastikan Anda punya file .env berisi:
//    BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."
//    (Dapatkan token ini dari dashboard Vercel -> Storage -> Blob)
//
// 2. Install dotenv untuk membaca .env:
//    npm install dotenv
//
// 3. Jalankan script ini dengan perintah:
//    node upload.js
// ==========================================

// Load .env file
try {
    require('dotenv').config();
} catch (e) {
    console.log("Modul 'dotenv' belum diinstall. Jalankan: npm install dotenv");
}

const assetsDir = path.join(__dirname, 'assets');

async function uploadAssets() {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
        console.error("error: BLOB_READ_WRITE_TOKEN belum diset di environment / file .env");
        return;
    }

    try {
        const files = fs.readdirSync(assetsDir);
        // Filter hanya gambar
        const images = files.filter(f => /\.(jpg|jpeg|png|webp|svg|gif)$/i.test(f));

        if (images.length === 0) {
            console.log("Tidak ada file gambar di folder assets/ untuk di-upload.");
            return;
        }

        console.log(`Menemukan ${images.length} gambar. Memulai upload ke Vercel Blob...`);

        // Upload semua gambar satu per satu
        for (const file of images) {
            const filePath = path.join(assetsDir, file);
            const fileStream = fs.createReadStream(filePath);
            
            console.log(`Mengupload ${file}...`);
            const blob = await put(file, fileStream, {
                access: 'public', // Agar bisa diakses dari website
            });
            console.log(`✅ ${file} berhasil diupload! URL: ${blob.url}`);
        }

        console.log("\n====== SELESAI ======");
        console.log("Silakan copy URL di atas dan paste/ganti di dalam elemen <img src='...'> pada file index.html");
        
    } catch (error) {
        console.error("Terjadi kesalahan:", error.message);
    }
}

uploadAssets();
