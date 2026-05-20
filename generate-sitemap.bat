@echo off
title kumpulenak - Sitemap Generator v3.0
color 0A

echo ============================================
echo   kumpulenak Sitemap Generator v3.0
echo   Fetches ribuan video dari Eporner API
echo ============================================
echo.
echo PENTING: Proses ini membutuhkan waktu 5-15 menit
echo karena mengambil data secara perlahan (1.5 detik per request)
echo agar tidak kena rate limit API.
echo.

:: Jalankan PowerShell script
powershell -ExecutionPolicy Bypass -File .\generate_sitemap.ps1

echo.
echo Sekarang jalankan:
echo   git add .
echo   git commit -m "update sitemap with video URLs"
echo   git push
echo.
pause
