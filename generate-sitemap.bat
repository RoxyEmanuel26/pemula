@echo off
setlocal enabledelayedexpansion
title kumpulenak - Static Site Generator & Sitemap
color 0A

echo ============================================
echo   kumpulenak SSG ^& Sitemap Generator v2.0
echo   Website: https://www.kumpulenak.web.id
echo ============================================
echo.

:: Menulis PowerShell script ke temporary file
set PS_SCRIPT="%TEMP%\generate_sitemap.ps1"
(
echo $ErrorActionPreference = 'Stop'
echo $baseUrl = 'https://www.kumpulenak.web.id'
echo $dateStr = Get-Date -Format "yyyy-MM-ddTHH:mm:ss+07:00"
echo Write-Host "Waktu eksekusi: $dateStr"
echo Write-Host "============================================"
echo.
echo Write-Host "[SSG] 1. Membaca template-video.html dan assets/data/videos.json..."
echo $template = [System.IO.File]::ReadAllText('template-video.html', [System.Text.Encoding]::UTF8)
echo $videosJson = [System.IO.File]::ReadAllText('assets/data/videos.json', [System.Text.Encoding]::UTF8)
echo $videos = $videosJson ^| ConvertFrom-Json
echo.
echo Write-Host "[SSG] 2. Menghasilkan file fisik HTML untuk masing-masing video..."
echo $vDir = 'v'
echo if (-not (Test-Path $vDir)) { New-Item -ItemType Directory -Force -Path $vDir ^| Out-Null }
echo.
echo $videosXml = "^<?xml version='1.0' encoding='UTF-8'?^>`n^<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'^>`n"
echo $videoCount = 0
echo foreach ($v in $videos) {
echo     $slug = ($v.name -replace '[^^a-zA-Z0-9]+', '-').Trim('-').ToLower()
echo     $html = $template.Replace('{{TITLE}}', $v.name)
echo     $html = $html.Replace('{{SLUG}}', $slug)
echo     $html = $html.Replace('{{IMAGE}}', $v.image)
echo     $html = $html.Replace('{{EMBED_URL}}', $v.link)
echo     $html = $html.Replace('{{DURATION}}', if ($v.length) { $v.length } else { '--:--' })
echo     $html = $html.Replace('{{VIEWS}}', if ($v.views) { $v.views } else { '0' })
echo     $html = $html.Replace('{{DATE}}', if ($v.date) { $v.date } else { '----' })
echo.
echo     $filePath = Join-Path $vDir "$slug.html"
echo     [System.IO.File]::WriteAllText($filePath, $html, [System.Text.Encoding]::UTF8)
echo     $videoCount++
echo.
echo     $url = $baseUrl + '/v/' + $slug
echo     $videosXml += "  ^<url^>`n    ^<loc^>$url^</loc^>`n    ^<lastmod^>$dateStr^</lastmod^>`n    ^<changefreq^>monthly^</changefreq^>`n    ^<priority^>0.90^</priority^>`n  ^</url^>`n"
echo }
echo $videosXml += "^</urlset^>"
echo [System.IO.File]::WriteAllText('sitemap_videos.xml', $videosXml, [System.Text.Encoding]::UTF8)
echo Write-Host "      -^> Berhasil membuat $videoCount file HTML di folder /v/"
echo.
echo Write-Host "[SITEMAP] 3. Generating sitemap_pages.xml..."
echo $pagesXml = @"
echo ^<?xml version="1.0" encoding="UTF-8"?^>
echo ^<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"^>
echo   ^<url^>
echo     ^<loc^>https://www.kumpulenak.web.id/^</loc^>
echo     ^<lastmod^>$dateStr^</lastmod^>
echo     ^<changefreq^>daily^</changefreq^>
echo     ^<priority^>1.00^</priority^>
echo     ^<xhtml:link rel="alternate" hreflang="id" href="https://www.kumpulenak.web.id/"/^>
echo     ^<xhtml:link rel="alternate" hreflang="en" href="https://www.kumpulenak.web.id/"/^>
echo     ^<xhtml:link rel="alternate" hreflang="x-default" href="https://www.kumpulenak.web.id/"/^>
echo   ^</url^>
echo   ^<url^>^<loc^>https://www.kumpulenak.web.id/about^</loc^>^<lastmod^>$dateStr^</lastmod^>^<changefreq^>yearly^</changefreq^>^<priority^>0.50^</priority^>^</url^>
echo   ^<url^>^<loc^>https://www.kumpulenak.web.id/contact^</loc^>^<lastmod^>$dateStr^</lastmod^>^<changefreq^>yearly^</changefreq^>^<priority^>0.40^</priority^>^</url^>
echo   ^<url^>^<loc^>https://www.kumpulenak.web.id/privacy^</loc^>^<lastmod^>$dateStr^</lastmod^>^<changefreq^>yearly^</changefreq^>^<priority^>0.40^</priority^>^</url^>
echo   ^<url^>^<loc^>https://www.kumpulenak.web.id/terms^</loc^>^<lastmod^>$dateStr^</lastmod^>^<changefreq^>yearly^</changefreq^>^<priority^>0.40^</priority^>^</url^>
echo   ^<url^>^<loc^>https://www.kumpulenak.web.id/dmca^</loc^>^<lastmod^>$dateStr^</lastmod^>^<changefreq^>yearly^</changefreq^>^<priority^>0.40^</priority^>^</url^>
echo   ^<url^>^<loc^>https://www.kumpulenak.web.id/howto^</loc^>^<lastmod^>$dateStr^</lastmod^>^<changefreq^>monthly^</changefreq^>^<priority^>0.60^</priority^>^</url^>
echo ^</urlset^>
echo "@
echo [System.IO.File]::WriteAllText('sitemap_pages.xml', $pagesXml, [System.Text.Encoding]::UTF8)
echo.
echo Write-Host "[SITEMAP] 4. Generating sitemap_kategori.xml..."
echo $kategoriList = @(
echo   @{q='all'; order='most-popular'}, @{q='all'; order='latest'}, @{q='all'; order='top-weekly'}, @{q='all'; order='top-monthly'},
echo   @{q='indonesia'; order='most-popular'}, @{q='girl'; order='most-popular'}, @{q='viral'; order='latest'},
echo   @{q='japanese'; order='most-popular'}, @{q='korean'; order='most-popular'}, @{q='amateur'; order='most-popular'},
echo   @{q='student'; order='most-popular'}, @{q='couple'; order='most-popular'}, @{q='hijab'; order='most-popular'},
echo   @{q='celebrity'; order='most-popular'}, @{q='outdoor'; order='most-popular'}, @{q='dance'; order='most-popular'},
echo   @{q='live cam'; order='latest'}, @{q='mature'; order='most-popular'}
echo )
echo $kategoriXml = "^<?xml version='1.0' encoding='UTF-8'?^>`n^<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'^>`n"
echo foreach ($k in $kategoriList) {
echo   $url = ''
echo   if ($k.q -eq 'all') { $url = $baseUrl + '/?order=' + $k.order }
echo   else { $url = $baseUrl + '/?q=' + [uri]::EscapeDataString($k.q) + '^&amp;order=' + $k.order }
echo   $kategoriXml += "  ^<url^>`n    ^<loc^>$url^</loc^>`n    ^<lastmod^>$dateStr^</lastmod^>`n    ^<changefreq^>daily^</changefreq^>`n    ^<priority^>0.80^</priority^>`n  ^</url^>`n"
echo }
echo $kategoriXml += "^</urlset^>"
echo [System.IO.File]::WriteAllText('sitemap_kategori.xml', $kategoriXml, [System.Text.Encoding]::UTF8)
echo.
echo Write-Host "[SITEMAP] 5. Generating sitemap_tags.xml..."
echo $tags = @('indonesia','cewe','viral','bokep indo','mahasiswi','pasutri','rumahan','hijab','malam','goyang','live streaming','artis indo','pantai','hotel','tiktok viral','hot indo')
echo $tagsXml = "^<?xml version='1.0' encoding='UTF-8'?^>`n^<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'^>`n"
echo foreach ($t in $tags) {
echo   $url = $baseUrl + '/?q=' + [uri]::EscapeDataString($t)
echo   $tagsXml += "  ^<url^>`n    ^<loc^>$url^</loc^>`n    ^<lastmod^>$dateStr^</lastmod^>`n    ^<changefreq^>daily^</changefreq^>`n    ^<priority^>0.75^</priority^>`n  ^</url^>`n"
echo }
echo $tagsXml += "^</urlset^>"
echo [System.IO.File]::WriteAllText('sitemap_tags.xml', $tagsXml, [System.Text.Encoding]::UTF8)
echo.
echo Write-Host "[SITEMAP] 6. Generating sitemap_index.xml..."
echo $indexXml = @"
echo ^<?xml version="1.0" encoding="UTF-8"?^>
echo ^<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"^>
echo   ^<sitemap^>
echo     ^<loc^>https://www.kumpulenak.web.id/sitemap_pages.xml^</loc^>
echo     ^<lastmod^>$dateStr^</lastmod^>
echo   ^</sitemap^>
echo   ^<sitemap^>
echo     ^<loc^>https://www.kumpulenak.web.id/sitemap_kategori.xml^</loc^>
echo     ^<lastmod^>$dateStr^</lastmod^>
echo   ^</sitemap^>
echo   ^<sitemap^>
echo     ^<loc^>https://www.kumpulenak.web.id/sitemap_tags.xml^</loc^>
echo     ^<lastmod^>$dateStr^</lastmod^>
echo   ^</sitemap^>
echo   ^<sitemap^>
echo     ^<loc^>https://www.kumpulenak.web.id/sitemap_videos.xml^</loc^>
echo     ^<lastmod^>$dateStr^</lastmod^>
echo   ^</sitemap^>
echo ^</sitemapindex^>
echo "@
echo [System.IO.File]::WriteAllText('sitemap_index.xml', $indexXml, [System.Text.Encoding]::UTF8)
echo.
echo Write-Host "============================================"
echo Write-Host "Summary:"
echo Write-Host "- sitemap_pages.xml (7 URLs)"
echo Write-Host "- sitemap_kategori.xml (18 URLs)"
echo Write-Host "- sitemap_tags.xml (16 URLs)"
echo Write-Host "- sitemap_videos.xml ($videoCount URLs)"
echo Write-Host "- Total XML diperbarui!"
) > %PS_SCRIPT%

:: Jalankan PowerShell script
powershell -ExecutionPolicy Bypass -File %PS_SCRIPT%

:: Hapus file temporary
del %PS_SCRIPT%

echo.
echo [DONE] SSG Generator dan Sitemap berhasil dieksekusi!
echo Sekarang jalankan: git add . ^& git commit -m "update sitemap and videos" ^& git push
pause
