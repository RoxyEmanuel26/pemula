@echo off
title lusthub.my.id - Sitemap Generator v5.0 FULL CRAWL
color 0A

echo ============================================
echo   lusthub.my.id Sitemap Generator v5.0
echo   FULL CRAWL - Fetch ALL videos
echo ============================================
echo.
echo IMPORTANT: This process may take 30-120 minutes
echo as it fetches ALL pages from 50 categories
echo with 1.5 second delay per request (anti rate limit).
echo.
echo Keep this window open until complete!
echo.

:: Run PowerShell script
powershell -ExecutionPolicy Bypass -File .\generate_sitemap.ps1

echo.
echo Now run:
echo   git add .
echo   git commit -m "update sitemap with all video URLs"
echo   git push
echo.
pause
