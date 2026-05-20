@echo off
title kumpulenak - Sitemap Generator v4.0 FULL CRAWL
color 0A

echo ============================================
echo   kumpulenak Sitemap Generator v4.0
echo   FULL CRAWL - Ambil SEMUA video tanpa sisa
echo ============================================
echo.
echo PENTING: Proses ini bisa memakan waktu 30-120 menit
echo karena mengambil SEMUA halaman dari 50 kategori
echo dengan delay 1.5 detik per request (anti rate limit).
echo.
echo Biarkan jendela ini terbuka sampai selesai!
echo.

:: Jalankan PowerShell script
powershell -ExecutionPolicy Bypass -File .\generate_sitemap.ps1

echo.
echo Sekarang jalankan:
echo   git add .
echo   git commit -m "update sitemap with all video URLs"
echo   git push
echo.
pause
