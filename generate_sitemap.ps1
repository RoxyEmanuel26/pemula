$ErrorActionPreference = 'Stop'
$baseUrl = 'https://www.kumpulenak.web.id'
$dateStr = Get-Date -Format "yyyy-MM-ddTHH:mm:ss+07:00"
$delaySeconds = 1.5
$perPage = 100
$maxConcurrent = 50
$maxPagesPerQuery = 50

Write-Host ""
Write-Host "============================================"
Write-Host "  kumpulenak Sitemap Generator v6.0"
Write-Host "  PARALLEL MULTI-THREADED (50 threads)"
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

function Update-MasterIndex($sitemapVideoFiles) {
    Write-Host "      -> Updating sitemap_index.xml (Master Index)..."
    $indexXml = "<?xml version='1.0' encoding='UTF-8'?>`n<sitemapindex xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>`n"
    $indexXml += "  <sitemap>`n    <loc>$baseUrl/sitemaps/sitemap_pages.xml</loc>`n    <lastmod>$dateStr</lastmod>`n  </sitemap>`n"
    foreach ($sf in $sitemapVideoFiles) {
        $indexXml += "  <sitemap>`n    <loc>$baseUrl/sitemaps/$sf</loc>`n    <lastmod>$dateStr</lastmod>`n  </sitemap>`n"
    }
    $indexXml += "</sitemapindex>"
    [System.IO.File]::WriteAllText('sitemap_index.xml', $indexXml, [System.Text.Encoding]::UTF8)
}

# Generate static sitemaps at start
Generate-StaticSitemaps

Write-Host ""
Write-Host "[API] Starting Parallel Crawling using RunspacePool..."
Write-Host "      Threads limit : $maxConcurrent"
Write-Host "      Pages limit   : $maxPagesPerQuery per category"
Write-Host "      Total queries : $($searchQueries.Count)"
Write-Host ""

# Thread-safe collections
$globalTitleSet = New-Object 'System.Collections.Concurrent.ConcurrentDictionary[string, bool]'

# Script block to run inside each thread
$scriptBlock = {
    param(
        $query,
        $baseUrl,
        $dateStr,
        $perPage,
        $delaySeconds,
        $maxPagesPerQuery,
        $globalTitleSet
    )

    $safeQuery = $query -replace '[^a-zA-Z0-9]', '_'
    $fileName = "sitemap_video_${safeQuery}.xml"
    $categoryVideos = @{}
    $page = 1
    $totalPages = 1
    $dupeCount = 0
    $requestCount = 0
    $localSitemapFiles = @()

    Write-Host "  [$query] Starting..."

    while ($page -le $totalPages -and $page -le $maxPagesPerQuery) {
        $apiUrl = "https://www.eporner.com/api/v2/video/search/?query=$([uri]::EscapeDataString($query))&per_page=$perPage&page=$page&thumbsize=small&order=most-popular&format=json"
        
        try {
            # Disable pipeline buffering and invoke GET request
            $response = Invoke-RestMethod -Uri $apiUrl -Method Get -TimeoutSec 30
            $requestCount++

            if ($page -eq 1 -and $response.total_pages) {
                $totalPages = [int]$response.total_pages
                Write-Host "  [$query] Total: $($response.total_count) videos ($totalPages pages available, limiting to $maxPagesPerQuery)"
            }

            if ($response.videos -and $response.videos.Count -gt 0) {
                foreach ($v in $response.videos) {
                    if ($categoryVideos.ContainsKey($v.id)) { continue }

                    $titleLower = $v.title.ToLower().Trim()
                    # TryAdd returns false if key already exists, ensuring thread-safe deduplication
                    if (-not $globalTitleSet.TryAdd($titleLower, $true)) {
                        $dupeCount++
                        continue
                    }

                    $slug = ($v.title -replace '[^a-zA-Z0-9]+', '-').Trim('-').ToLower()
                    if ($slug.Length -gt 80) { $slug = $slug.Substring(0, 80).TrimEnd('-') }

                    $addedDate = $dateStr.Substring(0, 10)
                    $publicationDate = "${addedDate}T00:00:00Z"
                    if ($v.added -and $v.added.Length -ge 19) {
                        $datePart = $v.added.Substring(0, 10)
                        $timePart = $v.added.Substring(11, 8)
                        $publicationDate = "${datePart}T${timePart}Z"
                        $addedDate = $datePart
                    } elseif ($v.added -and $v.added.Length -ge 10) {
                        $datePart = $v.added.Substring(0, 10)
                        $publicationDate = "${datePart}T00:00:00Z"
                        $addedDate = $datePart
                    }

                    $titleVal = ""
                    if ($v.title) { $titleVal = $v.title }

                    $thumbVal = ""
                    if ($v.default_thumb -and $v.default_thumb.src) {
                        $thumbVal = $v.default_thumb.src
                    } elseif ($v.thumbs -and $v.thumbs.Count -gt 0 -and $v.thumbs[0].src) {
                        $thumbVal = $v.thumbs[0].src
                    }

                    $embedVal = ""
                    if ($v.embed) {
                        $embedVal = $v.embed
                    } else {
                        $embedVal = "https://www.eporner.com/embed/$($v.id)/"
                    }

                    $durationVal = 0
                    if ($v.length_sec) {
                        $durationVal = [int]$v.length_sec
                    }

                    $categoryVideos[$v.id] = @{
                        id        = $v.id
                        slug      = $slug
                        added     = $addedDate
                        title     = $titleVal
                        thumbnail = $thumbVal
                        embed     = $embedVal
                        duration  = $durationVal
                        published = $publicationDate
                    }
                }
            } else {
                break
            }
        } catch {
            Write-Host "  [$query] [!] Error on page ${page}, skipping..."
            Start-Sleep -Seconds 3
            $page++
            continue
        }

        $page++
        Start-Sleep -Seconds $delaySeconds
    }

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
            
            $xml = "<?xml version='1.0' encoding='UTF-8'?>`n<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9' xmlns:video='http://www.google.com/schemas/sitemap-video/1.1'>`n"
            foreach ($v in $chunkVideos) {
                $videoUrl = "$baseUrl/v/$($v.id)-$($v.slug)"
                
                # XML escape all dynamic values
                $escapedLoc = [System.Security.SecurityElement]::Escape($videoUrl)
                $escapedThumb = [System.Security.SecurityElement]::Escape($v.thumbnail)
                $escapedTitle = [System.Security.SecurityElement]::Escape($v.title)
                $escapedEmbed = [System.Security.SecurityElement]::Escape($v.embed)
                
                # Generate clean description (max 2048 chars)
                $descriptionRaw = "Watch $($v.title) for free in full HD quality on kumpulenak."
                $escapedDesc = [System.Security.SecurityElement]::Escape($descriptionRaw)
                
                $xml += "  <url>`n"
                $xml += "    <loc>$escapedLoc</loc>`n"
                $xml += "    <lastmod>$($v.added)</lastmod>`n"
                $xml += "    <changefreq>monthly</changefreq>`n"
                $xml += "    <priority>0.70</priority>`n"
                $xml += "    <video:video>`n"
                $xml += "      <video:thumbnail_loc>$escapedThumb</video:thumbnail_loc>`n"
                $xml += "      <video:title>$escapedTitle</video:title>`n"
                $xml += "      <video:description>$escapedDesc</video:description>`n"
                $xml += "      <video:embed_loc>$escapedEmbed</video:embed_loc>`n"
                $xml += "      <video:duration>$($v.duration)</video:duration>`n"
                $xml += "      <video:publication_date>$($v.published)</video:publication_date>`n"
                $xml += "    </video:video>`n"
                $xml += "  </url>`n"
            }
            $xml += "</urlset>"
            
            # Ensure safe output file writing
            [System.IO.File]::WriteAllText("sitemaps/$currentFileName", $xml, [System.Text.Encoding]::UTF8)
            $localSitemapFiles += $currentFileName
        }
        Write-Host "  [$query] Completed. Saved $($localSitemapFiles.Count) sitemap file(s), $($categoryVideos.Count) unique videos."
    } else {
        Write-Host "  [$query] Completed. 0 new videos."
    }

    return [PSCustomObject]@{
        Query = $query
        VideoCount = $categoryVideos.Count
        RequestCount = $requestCount
        DupeCount = $dupeCount
        SitemapFiles = $localSitemapFiles
    }
}

# Create the RunspacePool
$sessionState = [System.Management.Automation.Runspaces.InitialSessionState]::CreateDefault()
$pool = [System.Management.Automation.Runspaces.RunspaceFactory]::CreateRunspacePool(1, $maxConcurrent, $sessionState, $Host)
$pool.Open()

$runspaces = @()

# Dispatch all queries as jobs to the runspace pool
foreach ($query in $searchQueries) {
    $pipeline = [System.Management.Automation.PowerShell]::Create()
    $pipeline.RunspacePool = $pool
    
    $pipeline.AddScript($scriptBlock) | Out-Null
    $pipeline.AddParameter("query", $query) | Out-Null
    $pipeline.AddParameter("baseUrl", $baseUrl) | Out-Null
    $pipeline.AddParameter("dateStr", $dateStr) | Out-Null
    $pipeline.AddParameter("perPage", $perPage) | Out-Null
    $pipeline.AddParameter("delaySeconds", $delaySeconds) | Out-Null
    $pipeline.AddParameter("maxPagesPerQuery", $maxPagesPerQuery) | Out-Null
    $pipeline.AddParameter("globalTitleSet", $globalTitleSet) | Out-Null
    
    $handle = $pipeline.BeginInvoke()
    $runspaces += @{
        Pipeline = $pipeline
        Handle   = $handle
        Query    = $query
    }
}

Write-Host "Dispatched $($runspaces.Count) crawling tasks. Waiting for all to complete..."
Write-Host ""

# Monitor and gather results
$state = @{
    sitemapVideoFiles = @()
    grandTotalVideos = 0
    grandTotalRequests = 0
    grandTotalDupes = 0
}

foreach ($r in $runspaces) {
    # Block until this thread completes and get returned custom object
    $results = $r.Pipeline.EndInvoke($r.Handle)
    
    if ($results) {
        $state.grandTotalVideos += $results.VideoCount
        $state.grandTotalRequests += $results.RequestCount
        $state.grandTotalDupes += $results.DupeCount
        foreach ($sf in $results.SitemapFiles) {
            $state.sitemapVideoFiles += $sf
        }
    }
    
    $r.Pipeline.Dispose()
}

$pool.Close()
$pool.Dispose()

# Sort video sitemap files alphabetically
$state.sitemapVideoFiles = $state.sitemapVideoFiles | Sort-Object

# Update the master index
Update-MasterIndex $state.sitemapVideoFiles

# Update root sitemap.xml
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

# Clean up sitemap_state.json if it exists since we do not need resuming now
$stateFile = "sitemap_state.json"
if (Test-Path $stateFile) {
    Remove-Item $stateFile -Force
}

Write-Host ""
Write-Host "============================================"
Write-Host "  ALL COMPLETE!"
Write-Host "============================================"
Write-Host "  Video sitemaps       : $($state.sitemapVideoFiles.Count) files"
Write-Host "  Total unique videos  : $($state.grandTotalVideos)"
Write-Host "  API requests         : $($state.grandTotalRequests)"
Write-Host "  Duplicate titles     : $($state.grandTotalDupes)"
Write-Host "  sitemap_index.xml    : master (Ready to submit to Google!)"
Write-Host "  sitemap.xml          : root (Updated!)"
Write-Host "============================================"
Write-Host ""
