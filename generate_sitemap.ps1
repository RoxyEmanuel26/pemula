$ErrorActionPreference = 'Stop'
$baseUrl = 'https://www.kumpulenak.web.id'
$dateStr = Get-Date -Format "yyyy-MM-ddTHH:mm:ss+07:00"
$delaySeconds = 1.5
$perPage = 100

Write-Host ""
Write-Host "============================================"
Write-Host "  kumpulenak Sitemap Generator v4.1"
Write-Host "  FULL CRAWL - 1 sitemap per kategori"
Write-Host "  Website: $baseUrl"
Write-Host "  Waktu: $dateStr"
Write-Host "============================================"

$searchQueries = @(
    'indonesia', 'viral', 'asian', 'japanese', 'korean',
    'amateur', 'student', 'hijab', 'couple', 'celebrity',
    'homemade', 'massage', 'outdoor', 'webcam', 'teen',
    'milf', 'latina', 'blonde', 'brunette', 'pov',
    'anal', 'blowjob', 'creampie', 'threesome', 'lesbian',
    'interracial', 'big ass', 'big tits', 'small tits', 'redhead',
    'ebony', 'indian', 'thai', 'filipina', 'malay',
    'chinese', 'vietnam', 'arab', 'turkish', 'russian',
    'hentai', 'cosplay', 'yoga', 'dance', 'shower',
    'hotel', 'car', 'office', 'public', 'beach'
)

Write-Host ""
Write-Host "[API] Memulai FULL CRAWL..."
Write-Host "      $($searchQueries.Count) kategori | Delay: $delaySeconds dtk/request"
Write-Host ""

$globalTitleSet = @{}
$sitemapVideoFiles = @()
$grandTotalVideos = 0
$grandTotalRequests = 0
$grandTotalDupes = 0

foreach ($query in $searchQueries) {
    $safeQuery = $query -replace '[^a-zA-Z0-9]', '_'
    $fileName = "sitemap_video_${safeQuery}.xml"

    Write-Host "  [$query] Fetching..."
    $categoryVideos = @{}
    $page = 1
    $totalPages = 1
    $dupeCount = 0

    while ($page -le $totalPages) {
        $apiUrl = "https://www.eporner.com/api/v2/video/search/?query=$([uri]::EscapeDataString($query))&per_page=$perPage&page=$page&thumbsize=small&order=most-popular&format=json"

        try {
            $response = Invoke-RestMethod -Uri $apiUrl -Method Get -TimeoutSec 30
            $grandTotalRequests++

            if ($page -eq 1 -and $response.total_pages) {
                $totalPages = [int]$response.total_pages
                Write-Host "         Tersedia: $($response.total_count) video ($totalPages halaman)"
            }

            if ($response.videos -and $response.videos.Count -gt 0) {
                foreach ($v in $response.videos) {
                    if ($categoryVideos.ContainsKey($v.id)) { continue }

                    $titleLower = $v.title.ToLower().Trim()
                    if ($globalTitleSet.ContainsKey($titleLower)) {
                        $dupeCount++
                        continue
                    }

                    $slug = ($v.title -replace '[^a-zA-Z0-9]+', '-').Trim('-').ToLower()
                    if ($slug.Length -gt 80) { $slug = $slug.Substring(0, 80).TrimEnd('-') }

                    $addedDate = $dateStr.Substring(0, 10)
                    if ($v.added -and $v.added.Length -ge 10) { $addedDate = $v.added.Substring(0, 10) }

                    $categoryVideos[$v.id] = @{
                        id    = $v.id
                        slug  = $slug
                        added = $addedDate
                    }
                    $globalTitleSet[$titleLower] = $true
                }

                if ($page % 10 -eq 0) {
                    Write-Host "         Halaman $page/$totalPages... ($($categoryVideos.Count) unik)"
                }
            } else {
                break
            }
        } catch {
            Write-Host "         [!] Error halaman ${page}, skip..."
            Start-Sleep -Seconds 5
            $page++
            continue
        }

        $page++
        Start-Sleep -Seconds $delaySeconds
    }

    $grandTotalDupes += $dupeCount

    if ($categoryVideos.Count -gt 0) {
        $chunkSize = 49000
        $videosArray = @($categoryVideos.Values)
        $totalChunks = [Math]::Ceiling($videosArray.Count / $chunkSize)
        
        for ($i = 0; $i -lt $totalChunks; $i++) {
            $chunkVideos = $videosArray | Select-Object -Skip ($i * $chunkSize) -First $chunkSize
            
            $currentFileName = $fileName
            if ($totalChunks -gt 1) {
                $currentFileName = $fileName.Replace(".xml", "_$($i+1).xml")
            }
            
            $xml = "<?xml version='1.0' encoding='UTF-8'?>`n<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>`n"
            foreach ($v in $chunkVideos) {
                $videoUrl = "$baseUrl/video?v=$($v.id)-$($v.slug)"
                $xml += "  <url>`n    <loc>$videoUrl</loc>`n    <lastmod>$($v.added)</lastmod>`n    <changefreq>monthly</changefreq>`n    <priority>0.70</priority>`n  </url>`n"
            }
            $xml += "</urlset>"
            
            [System.IO.File]::WriteAllText($currentFileName, $xml, [System.Text.Encoding]::UTF8)
            $sitemapVideoFiles += $currentFileName
            Write-Host "      -> $currentFileName ($($chunkVideos.Count) URLs)"
        }
        $grandTotalVideos += $categoryVideos.Count
        Write-Host "      Total duplikat diskip: $dupeCount"
    } else {
        Write-Host "      -> SKIP (0 video baru)"
    }
    Write-Host ""
}

Write-Host "============================================"
Write-Host "[API] CRAWL SELESAI!"
Write-Host "      Total video unik: $grandTotalVideos"
Write-Host "      Duplikat skip   : $grandTotalDupes"
Write-Host "      API requests    : $grandTotalRequests"
Write-Host "      Sitemap files   : $($sitemapVideoFiles.Count)"
Write-Host "============================================"
Write-Host ""

# sitemap_pages.xml
Write-Host "[SITEMAP] sitemap_pages.xml..."
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

# sitemap_kategori.xml
Write-Host "[SITEMAP] sitemap_kategori.xml..."
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

# sitemap_tags.xml
Write-Host "[SITEMAP] sitemap_tags.xml..."
$tags = @('indonesia','cewe','viral','bokep indo','mahasiswi','pasutri','rumahan','hijab','malam','goyang','live streaming','artis indo','pantai','hotel','tiktok viral','hot indo')
$tagsXml = "<?xml version='1.0' encoding='UTF-8'?>`n<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>`n"
foreach ($t in $tags) {
  $url = $baseUrl + '/?q=' + [uri]::EscapeDataString($t)
  $tagsXml += "  <url>`n    <loc>$url</loc>`n    <lastmod>$dateStr</lastmod>`n    <changefreq>daily</changefreq>`n    <priority>0.75</priority>`n  </url>`n"
}
$tagsXml += "</urlset>"
[System.IO.File]::WriteAllText('sitemap_tags.xml', $tagsXml, [System.Text.Encoding]::UTF8)

# sitemap_index.xml
Write-Host "[SITEMAP] sitemap_index.xml..."
$indexXml = "<?xml version='1.0' encoding='UTF-8'?>`n<sitemapindex xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>`n"
$indexXml += "  <sitemap>`n    <loc>$baseUrl/sitemap_pages.xml</loc>`n    <lastmod>$dateStr</lastmod>`n  </sitemap>`n"
$indexXml += "  <sitemap>`n    <loc>$baseUrl/sitemap_kategori.xml</loc>`n    <lastmod>$dateStr</lastmod>`n  </sitemap>`n"
$indexXml += "  <sitemap>`n    <loc>$baseUrl/sitemap_tags.xml</loc>`n    <lastmod>$dateStr</lastmod>`n  </sitemap>`n"
foreach ($sf in $sitemapVideoFiles) {
    $indexXml += "  <sitemap>`n    <loc>$baseUrl/$sf</loc>`n    <lastmod>$dateStr</lastmod>`n  </sitemap>`n"
}
$indexXml += "</sitemapindex>"
[System.IO.File]::WriteAllText('sitemap_index.xml', $indexXml, [System.Text.Encoding]::UTF8)

Write-Host ""
Write-Host "============================================"
Write-Host "  SEMUA SELESAI!"
Write-Host "============================================"
Write-Host "  sitemap_pages.xml    : 7 URLs"
Write-Host "  sitemap_kategori.xml : $($kategoriList.Count) URLs"
Write-Host "  sitemap_tags.xml     : $($tags.Count) URLs"
Write-Host "  Video sitemaps       : $($sitemapVideoFiles.Count) file"
Write-Host "  Total video unik     : $grandTotalVideos"
Write-Host "  sitemap_index.xml    : master"
Write-Host "============================================"
