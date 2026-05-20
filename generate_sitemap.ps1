$ErrorActionPreference = 'Stop'
$baseUrl = 'https://www.kumpulenak.web.id'
$dateStr = Get-Date -Format "yyyy-MM-ddTHH:mm:ss+07:00"
Write-Host ""
Write-Host "============================================"
Write-Host "  kumpulenak Sitemap Generator v3.0"
Write-Host "  Website: $baseUrl"
Write-Host "  Waktu: $dateStr"
Write-Host "============================================"

# =============================================
# KONFIGURASI
# =============================================
$delaySeconds = 1.5        # Delay antar request API (detik)
$perPage = 100             # Jumlah video per halaman API
$maxPagesPerQuery = 10     # Maks halaman per query (100 x 10 = 1000 video per query)
$maxSitemapUrls = 45000    # Google limit: 50.000 per sitemap, kita batas 45.000

# Daftar query pencarian untuk menjaring video seluas mungkin
$searchQueries = @(
    'indonesia',
    'viral',
    'asian',
    'japanese',
    'korean',
    'amateur',
    'student',
    'hijab',
    'couple',
    'celebrity',
    'homemade',
    'massage',
    'outdoor',
    'webcam',
    'teen',
    'milf',
    'latina',
    'blonde',
    'brunette',
    'pov'
)

# =============================================
# STEP 1: Fetch ribuan video dari API Eporner
# =============================================
Write-Host ""
Write-Host "[API] Memulai pengambilan data video dari Eporner API..."
Write-Host "      Query: $($searchQueries.Count) kategori | Per halaman: $perPage | Maks halaman/query: $maxPagesPerQuery"
Write-Host "      Delay antar request: ${delaySeconds}s (menghindari rate limit)"
Write-Host ""

$allVideos = @{}  # Hashtable untuk deduplikasi berdasarkan video ID
$totalRequests = 0

foreach ($query in $searchQueries) {
    if ($allVideos.Count -ge $maxSitemapUrls) {
        Write-Host "      [!] Batas $maxSitemapUrls URL tercapai, menghentikan fetch."
        break
    }

    Write-Host "  [$query] Fetching..."
    $beforeCount = $allVideos.Count

    for ($page = 1; $page -le $maxPagesPerQuery; $page++) {
        if ($allVideos.Count -ge $maxSitemapUrls) { break }

        $apiUrl = "https://www.eporner.com/api/v2/video/search/?query=$([uri]::EscapeDataString($query))&per_page=$perPage&page=$page&thumbsize=small&order=most-popular&format=json"

        try {
            $response = Invoke-RestMethod -Uri $apiUrl -Method Get -TimeoutSec 30
            $totalRequests++

            if ($response.videos -and $response.videos.Count -gt 0) {
                foreach ($v in $response.videos) {
                    if (-not $allVideos.ContainsKey($v.id)) {
                        # Buat slug dari judul
                        $slug = ($v.title -replace '[^a-zA-Z0-9]+', '-').Trim('-').ToLower()
                        if ($slug.Length -gt 80) { $slug = $slug.Substring(0, 80).TrimEnd('-') }

                        $allVideos[$v.id] = @{
                            id    = $v.id
                            title = $v.title
                            slug  = $slug
                            added = if ($v.added) { $v.added.Substring(0, 10) } else { $dateStr.Substring(0, 10) }
                        }
                    }
                }

                # Jika halaman ini kurang dari per_page, berarti sudah habis
                if ($response.videos.Count -lt $perPage) { break }
            } else {
                break  # Tidak ada video lagi untuk query ini
            }
        } catch {
            Write-Host "      [!] Error halaman $page query '$query': $($_.Exception.Message)"
            break
        }

        # Delay untuk menghindari rate limit
        Start-Sleep -Seconds $delaySeconds
    }

    $newCount = $allVideos.Count - $beforeCount
    Write-Host "      -> +$newCount baru | Total: $($allVideos.Count) video unik | ($totalRequests requests)"
}

Write-Host ""
Write-Host "[API] Selesai! Total: $($allVideos.Count) video unik dari $totalRequests API requests"
Write-Host ""

# =============================================
# STEP 2: Generate sitemap_videos.xml
# =============================================
Write-Host "[SITEMAP] Generating sitemap_videos.xml..."

# Jika terlalu banyak, pecah ke beberapa file sitemap (Google max 50.000 per file)
$videoList = $allVideos.Values | Sort-Object { $_.added } -Descending
$sitemapVideoFiles = @()
$fileIndex = 1
$urlsInCurrentFile = 0
$currentXml = "<?xml version='1.0' encoding='UTF-8'?>`n<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>`n"

foreach ($v in $videoList) {
    $videoUrl = "$baseUrl/video?v=$($v.id)-$($v.slug)"
    $currentXml += "  <url>`n    <loc>$videoUrl</loc>`n    <lastmod>$($v.added)</lastmod>`n    <changefreq>monthly</changefreq>`n    <priority>0.70</priority>`n  </url>`n"
    $urlsInCurrentFile++

    # Jika mencapai 40.000 per file, mulai file baru
    if ($urlsInCurrentFile -ge 40000) {
        $currentXml += "</urlset>"
        $fileName = "sitemap_videos_$fileIndex.xml"
        [System.IO.File]::WriteAllText($fileName, $currentXml, [System.Text.Encoding]::UTF8)
        $sitemapVideoFiles += $fileName
        Write-Host "      -> $fileName ($urlsInCurrentFile URLs)"
        $fileIndex++
        $urlsInCurrentFile = 0
        $currentXml = "<?xml version='1.0' encoding='UTF-8'?>`n<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>`n"
    }
}

# Tulis sisa yang belum di-flush
if ($urlsInCurrentFile -gt 0) {
    $currentXml += "</urlset>"
    if ($fileIndex -eq 1) {
        $fileName = "sitemap_videos.xml"
    } else {
        $fileName = "sitemap_videos_$fileIndex.xml"
    }
    [System.IO.File]::WriteAllText($fileName, $currentXml, [System.Text.Encoding]::UTF8)
    $sitemapVideoFiles += $fileName
    Write-Host "      -> $fileName ($urlsInCurrentFile URLs)"
}

# =============================================
# STEP 3: Generate sitemap_pages.xml
# =============================================
Write-Host "[SITEMAP] Generating sitemap_pages.xml..."
$pagesXml = @"
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://www.kumpulenak.web.id/</loc>
    <lastmod>$dateStr</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.00</priority>
    <xhtml:link rel="alternate" hreflang="id" href="https://www.kumpulenak.web.id/"/>
    <xhtml:link rel="alternate" hreflang="en" href="https://www.kumpulenak.web.id/"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="https://www.kumpulenak.web.id/"/>
  </url>
  <url><loc>https://www.kumpulenak.web.id/about</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.50</priority></url>
  <url><loc>https://www.kumpulenak.web.id/contact</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.40</priority></url>
  <url><loc>https://www.kumpulenak.web.id/privacy</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.40</priority></url>
  <url><loc>https://www.kumpulenak.web.id/terms</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.40</priority></url>
  <url><loc>https://www.kumpulenak.web.id/dmca</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.40</priority></url>
  <url><loc>https://www.kumpulenak.web.id/howto</loc><lastmod>$dateStr</lastmod><changefreq>monthly</changefreq><priority>0.60</priority></url>
</urlset>
"@
[System.IO.File]::WriteAllText('sitemap_pages.xml', $pagesXml, [System.Text.Encoding]::UTF8)

# =============================================
# STEP 4: Generate sitemap_kategori.xml
# =============================================
Write-Host "[SITEMAP] Generating sitemap_kategori.xml..."
$kategoriList = @(
  @{q='all'; order='most-popular'}, @{q='all'; order='latest'}, @{q='all'; order='top-weekly'}, @{q='all'; order='top-monthly'},
  @{q='indonesia'; order='most-popular'}, @{q='girl'; order='most-popular'}, @{q='viral'; order='latest'},
  @{q='japanese'; order='most-popular'}, @{q='korean'; order='most-popular'}, @{q='amateur'; order='most-popular'},
  @{q='student'; order='most-popular'}, @{q='couple'; order='most-popular'}, @{q='hijab'; order='most-popular'},
  @{q='celebrity'; order='most-popular'}, @{q='outdoor'; order='most-popular'}, @{q='dance'; order='most-popular'},
  @{q='live cam'; order='latest'}, @{q='mature'; order='most-popular'}
)
$kategoriXml = "<?xml version='1.0' encoding='UTF-8'?>`n<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>`n"
foreach ($k in $kategoriList) {
  $url = ''
  if ($k.q -eq 'all') { $url = $baseUrl + '/?order=' + $k.order }
  else { $url = $baseUrl + '/?q=' + [uri]::EscapeDataString($k.q) + '&amp;order=' + $k.order }
  $kategoriXml += "  <url>`n    <loc>$url</loc>`n    <lastmod>$dateStr</lastmod>`n    <changefreq>daily</changefreq>`n    <priority>0.80</priority>`n  </url>`n"
}
$kategoriXml += "</urlset>"
[System.IO.File]::WriteAllText('sitemap_kategori.xml', $kategoriXml, [System.Text.Encoding]::UTF8)

# =============================================
# STEP 5: Generate sitemap_tags.xml
# =============================================
Write-Host "[SITEMAP] Generating sitemap_tags.xml..."
$tags = @('indonesia','cewe','viral','bokep indo','mahasiswi','pasutri','rumahan','hijab','malam','goyang','live streaming','artis indo','pantai','hotel','tiktok viral','hot indo')
$tagsXml = "<?xml version='1.0' encoding='UTF-8'?>`n<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>`n"
foreach ($t in $tags) {
  $url = $baseUrl + '/?q=' + [uri]::EscapeDataString($t)
  $tagsXml += "  <url>`n    <loc>$url</loc>`n    <lastmod>$dateStr</lastmod>`n    <changefreq>daily</changefreq>`n    <priority>0.75</priority>`n  </url>`n"
}
$tagsXml += "</urlset>"
[System.IO.File]::WriteAllText('sitemap_tags.xml', $tagsXml, [System.Text.Encoding]::UTF8)

# =============================================
# STEP 6: Generate sitemap_index.xml
# =============================================
Write-Host "[SITEMAP] Generating sitemap_index.xml..."
$indexXml = "<?xml version='1.0' encoding='UTF-8'?>`n<sitemapindex xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>`n"
$indexXml += "  <sitemap>`n    <loc>$baseUrl/sitemap_pages.xml</loc>`n    <lastmod>$dateStr</lastmod>`n  </sitemap>`n"
$indexXml += "  <sitemap>`n    <loc>$baseUrl/sitemap_kategori.xml</loc>`n    <lastmod>$dateStr</lastmod>`n  </sitemap>`n"
$indexXml += "  <sitemap>`n    <loc>$baseUrl/sitemap_tags.xml</loc>`n    <lastmod>$dateStr</lastmod>`n  </sitemap>`n"

foreach ($sf in $sitemapVideoFiles) {
    $indexXml += "  <sitemap>`n    <loc>$baseUrl/$sf</loc>`n    <lastmod>$dateStr</lastmod>`n  </sitemap>`n"
}

$indexXml += "</sitemapindex>"
[System.IO.File]::WriteAllText('sitemap_index.xml', $indexXml, [System.Text.Encoding]::UTF8)

# =============================================
# SUMMARY
# =============================================
Write-Host ""
Write-Host "============================================"
Write-Host "  SELESAI!"
Write-Host "============================================"
Write-Host "  - sitemap_pages.xml     (7 URLs)"
Write-Host "  - sitemap_kategori.xml  (18 URLs)"
Write-Host "  - sitemap_tags.xml      (16 URLs)"
foreach ($sf in $sitemapVideoFiles) {
    Write-Host "  - $sf"
}
Write-Host "  - sitemap_index.xml     (master)"
Write-Host ""
Write-Host "  Total video URL: $($allVideos.Count)"
Write-Host "  Total API requests: $totalRequests"
Write-Host "============================================"
Write-Host ""
