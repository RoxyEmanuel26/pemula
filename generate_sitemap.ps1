$ErrorActionPreference = 'Stop'
$baseUrl = 'https://www.kumpulenak.web.id'
$dateStr = Get-Date -Format "yyyy-MM-ddTHH:mm:ss+07:00"
$delaySeconds = 1.5
$perPage = 100

Write-Host ""
Write-Host "============================================"
Write-Host "  kumpulenak Sitemap Generator v5.0"
Write-Host "  FULL CRAWL - Auto Save & Resume"
Write-Host "  Website: $baseUrl"
Write-Host "  Time: $dateStr"
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

$stateFile = "sitemap_state.json"
$state = @{
    completedQueries = @()
    sitemapVideoFiles = @()
    grandTotalVideos = 0
    grandTotalRequests = 0
    grandTotalDupes = 0
}

if (Test-Path $stateFile) {
    Write-Host "[INFO] Found previous state file. Resuming from last checkpoint..."
    $savedState = Get-Content $stateFile -Raw | ConvertFrom-Json
    if ($savedState.completedQueries) { $state.completedQueries = @($savedState.completedQueries) }
    if ($savedState.sitemapVideoFiles) { $state.sitemapVideoFiles = @($savedState.sitemapVideoFiles) }
    if ($savedState.grandTotalVideos) { $state.grandTotalVideos = $savedState.grandTotalVideos }
    if ($savedState.grandTotalRequests) { $state.grandTotalRequests = $savedState.grandTotalRequests }
    if ($savedState.grandTotalDupes) { $state.grandTotalDupes = $savedState.grandTotalDupes }
}

function Save-State {
    $state | ConvertTo-Json -Depth 10 | Set-Content $stateFile -Encoding UTF8
}

function Update-MasterIndex {
    Write-Host "      -> Updating sitemap_index.xml (Master Index)..."
    $indexXml = "<?xml version='1.0' encoding='UTF-8'?>`n<sitemapindex xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>`n"
    $indexXml += "  <sitemap>`n    <loc>$baseUrl/sitemaps/sitemap_pages.xml</loc>`n    <lastmod>$dateStr</lastmod>`n  </sitemap>`n"
    foreach ($sf in $state.sitemapVideoFiles) {
        $indexXml += "  <sitemap>`n    <loc>$baseUrl/sitemaps/$sf</loc>`n    <lastmod>$dateStr</lastmod>`n  </sitemap>`n"
    }
    $indexXml += "</sitemapindex>"
    [System.IO.File]::WriteAllText('sitemap_index.xml', $indexXml, [System.Text.Encoding]::UTF8)
}

function Generate-StaticSitemaps {
    Write-Host "[SITEMAP] Generating static sitemaps (pages, categories, tags)..."
    
    # Ensure sitemaps directory exists
    if (-not (Test-Path 'sitemaps')) {
        New-Item -ItemType Directory -Path 'sitemaps' -Force | Out-Null
    }

    # sitemap_pages.xml — NO hreflang (single-language English site)
    $pagesXml = @"
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.kumpulenak.web.id/</loc>
    <lastmod>$dateStr</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.00</priority>
  </url>
  <url><loc>https://www.kumpulenak.web.id/about</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.50</priority></url>
  <url><loc>https://www.kumpulenak.web.id/contact</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.40</priority></url>
  <url><loc>https://www.kumpulenak.web.id/privacy</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.40</priority></url>
  <url><loc>https://www.kumpulenak.web.id/terms</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.40</priority></url>
  <url><loc>https://www.kumpulenak.web.id/dmca</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.40</priority></url>
  <url><loc>https://www.kumpulenak.web.id/howto</loc><lastmod>$dateStr</lastmod><changefreq>monthly</changefreq><priority>0.60</priority></url>
</urlset>
"@
    [System.IO.File]::WriteAllText('sitemaps/sitemap_pages.xml', $pagesXml, [System.Text.Encoding]::UTF8)

    # Clean up old sitemaps that are no longer canonical/needed
    $unwantedSitemaps = @('sitemaps/sitemap_kategori.xml', 'sitemaps/sitemap_tags.xml')
    foreach ($file in $unwantedSitemaps) {
        if (Test-Path $file) {
            Remove-Item $file -Force
            Write-Host "[SITEMAP] Deleted old non-canonical sitemap: $file"
        }
    }
}

# Always generate static sitemaps at the start (refresh every run)
Generate-StaticSitemaps
Update-MasterIndex
Write-Host ""

Write-Host "[API] Starting FULL CRAWL..."
Write-Host "      $($searchQueries.Count) categories | Delay: $delaySeconds sec/request"
Write-Host ""

$globalTitleSet = @{}

foreach ($query in $searchQueries) {
    if ($state.completedQueries -contains $query) {
        Write-Host "  [$query] Already completed in previous session. Skipping..."
        Write-Host ""
        continue
    }

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
            $state.grandTotalRequests++

            if ($page -eq 1 -and $response.total_pages) {
                $totalPages = [int]$response.total_pages
                Write-Host "         Available: $($response.total_count) videos ($totalPages pages)"
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
                    Write-Host "         Page $page/$totalPages... ($($categoryVideos.Count) unique)"
                }
            } else {
                break
            }
        } catch {
            Write-Host "         [!] Error on page ${page}, skipping..."
            Start-Sleep -Seconds 5
            $page++
            continue
        }

        $page++
        Start-Sleep -Seconds $delaySeconds
    }

    $state.grandTotalDupes += $dupeCount

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
                $videoUrl = "$baseUrl/v/$($v.id)-$($v.slug)"
                $xml += "  <url>`n    <loc>$videoUrl</loc>`n    <lastmod>$($v.added)</lastmod>`n    <changefreq>monthly</changefreq>`n    <priority>0.70</priority>`n  </url>`n"
            }
            $xml += "</urlset>"
            
            [System.IO.File]::WriteAllText("sitemaps/$currentFileName", $xml, [System.Text.Encoding]::UTF8)
            $state.sitemapVideoFiles += $currentFileName
            Write-Host "      -> $currentFileName ($($chunkVideos.Count) URLs)"
        }
        $state.grandTotalVideos += $categoryVideos.Count
        Write-Host "      Duplicates skipped: $dupeCount"
    } else {
        Write-Host "      -> SKIP (0 new videos)"
    }
    
    # 1. Update completed category in state
    $state.completedQueries += $query
    # 2. Save progress to JSON file
    Save-State
    # 3. Update master index immediately so it's always up-to-date if process is interrupted
    Update-MasterIndex
    
    Write-Host ""
}

# Also regenerate the root sitemap.xml with the same static pages (no hreflang)
Write-Host "[SITEMAP] Updating root sitemap.xml..."
$rootSitemapXml = @"
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.kumpulenak.web.id/</loc>
    <lastmod>$dateStr</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.00</priority>
  </url>
  <url><loc>https://www.kumpulenak.web.id/about</loc><lastmod>$dateStr</lastmod><changefreq>monthly</changefreq><priority>0.50</priority></url>
  <url><loc>https://www.kumpulenak.web.id/howto</loc><lastmod>$dateStr</lastmod><changefreq>monthly</changefreq><priority>0.60</priority></url>
  <url><loc>https://www.kumpulenak.web.id/contact</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.40</priority></url>
  <url><loc>https://www.kumpulenak.web.id/dmca</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.40</priority></url>
  <url><loc>https://www.kumpulenak.web.id/privacy</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.40</priority></url>
  <url><loc>https://www.kumpulenak.web.id/terms</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.40</priority></url>
</urlset>
"@
[System.IO.File]::WriteAllText('sitemap.xml', $rootSitemapXml, [System.Text.Encoding]::UTF8)

Write-Host ""
Write-Host "============================================"
Write-Host "  ALL COMPLETE!"
Write-Host "============================================"
Write-Host "  Video sitemaps       : $($state.sitemapVideoFiles.Count) files"
Write-Host "  Total unique videos  : $($state.grandTotalVideos)"
Write-Host "  API requests         : $($state.grandTotalRequests)"
Write-Host "  sitemap_index.xml    : master (Ready to submit to Google!)"
Write-Host "  sitemap.xml          : root (Updated!)"
Write-Host "============================================"
Write-Host ""

# Remove state file since process is complete
if (Test-Path $stateFile) {
    Remove-Item $stateFile -Force
}
