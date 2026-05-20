@echo off
title kumpulenak - Static Site Generator & Sitemap
color 0A

echo ============================================
echo   kumpulenak SSG ^& Sitemap Generator v2.0
echo   Website: https://www.kumpulenak.web.id
echo ============================================
echo.

:: Jalankan PowerShell script dari direktori saat ini
powershell -ExecutionPolicy Bypass -File .\generate_sitemap.ps1

echo.
echo [DONE] SSG Generator dan Sitemap berhasil dieksekusi!
echo Sekarang jalankan: git add . ^& git commit -m "update sitemap and videos" ^& git push
pause
