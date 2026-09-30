@echo off
title lusthub.my.id - Incremental Sitemap Generator v8.0
color 0A

echo ============================================
echo   lusthub.my.id Incremental Sitemap Generator v8.0
echo   Rolling 20,000 newest videos - incremental
echo ============================================
echo.
echo Manual fallback only. GitHub Actions now refreshes
echo the sitemap automatically every day at 03:17 WIB.
echo.
echo Keep this window open until validation completes.
echo.

:: Run PowerShell script
powershell -ExecutionPolicy Bypass -File .\generate_sitemap.ps1

echo.
echo Now run:
echo   git add .
echo   git commit -m "chore(seo): refresh video sitemap"
echo   git push
echo.
pause
