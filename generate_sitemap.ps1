# ==============================================================================
#  lusthub.my.id — Sitemap Generator v7.0 ENTERPRISE
#  Deep-Optimized: Anti-Rate-Limit, Retry Logic, Memory-Safe, SEO Perfect
# ==============================================================================
$ErrorActionPreference = 'Continue'   # Jangan crash seluruh program karena 1 error kecil
$baseUrl        = 'https://www.lusthub.my.id'
$dateStr        = Get-Date -Format "yyyy-MM-ddTHH:mm:ss+07:00"
$dateOnly       = Get-Date -Format "yyyy-MM-dd"
$delaySeconds   = 1      # Jeda antar halaman per thread (detik)
$perPage        = 1000   # Maksimum API Eporner per page
$maxConcurrent  = 5      # AMAN: 5 thread paralel (tidak trigger rate-limit)
$maxPagesPerQuery = 50   # 50 hal x 1000 video = 50.000 video terbaik per kategori

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  lusthub.my.id Sitemap Generator v7.0"      -ForegroundColor Cyan
Write-Host "  ENTERPRISE | $maxConcurrent Threads | RAM-Safe" -ForegroundColor Cyan
Write-Host "  Website : $baseUrl"                         -ForegroundColor Cyan
Write-Host "  Time    : $dateStr"                         -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# ==============================================================================
#  SEARCH QUERIES — Bersih, tanpa duplikat, diurutkan A-Z
#  'student' dan 'students' digabung menjadi 'student' saja (sama hasil API-nya)
# ==============================================================================
$searchQueries = @(
    '60 fps', 'ai', 'amateur', 'anal', 'arab',
    'asian', 'asmr', 'bbw', 'bdsm', 'beach',
    'big ass', 'big dick', 'big tits', 'blonde', 'blowjob',
    'bondage', 'brunette', 'bukkake', 'car', 'casting',
    'celebrity', 'chinese', 'compilation', 'cosplay', 'couple',
    'creampie', 'cuckold', 'cumshot', 'dance', 'doctor',
    'double penetration', 'ebony', 'fetish', 'filipina', 'fisting',
    'footjob', 'for women', 'gloryhole', 'group sex', 'handjob',
    'hardcore', 'hd porn 1080p', 'hentai', 'hijab', 'homemade',
    'hotel', 'hotwife', 'housewives', 'indian', 'indonesia',
    'interracial', 'japanese', 'korean', 'latina', 'lesbian',
    'lingerie', 'malay', 'massage', 'masturbation', 'mature',
    'milf', 'nurses', 'office', 'older men', 'orgy',
    'outdoor', 'pawg', 'petite', 'pinay', 'pornstar',
    'pov', 'pregnant', 'public', 'redhead', 'russian',
    'shemale', 'shower', 'sleep', 'small tits', 'squirt',
    'stepmom', 'stepsister', 'striptease', 'student', 'swinger',
    'teen', 'thai', 'threesome', 'toys', 'turkish',
    'uniform', 'vietnam', 'vintage', 'viral', 'vr porn',
    'webcam', 'yoga'
)

# ==============================================================================
#  FUNGSI: Generate Sitemap Statis (Pages & Kategori)
# ==============================================================================
function Generate-StaticSitemaps {
    Write-Host "[SITEMAP] Generating static sitemaps (pages, categories)..." -ForegroundColor Green

    if (-not (Test-Path 'sitemaps')) {
        New-Item -ItemType Directory -Path 'sitemaps' -Force | Out-Null
    }

    # --- sitemap_pages.xml ---
    $pagesXml = @"
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.lusthub.my.id/</loc>
    <lastmod>$dateStr</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.00</priority>
  </url>
  <url><loc>https://www.lusthub.my.id/about</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.50</priority></url>
  <url><loc>https://www.lusthub.my.id/howto</loc><lastmod>$dateStr</lastmod><changefreq>monthly</changefreq><priority>0.60</priority></url>
  <url><loc>https://www.lusthub.my.id/contact</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.40</priority></url>
  <url><loc>https://www.lusthub.my.id/dmca</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.40</priority></url>
  <url><loc>https://www.lusthub.my.id/privacy</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.40</priority></url>
  <url><loc>https://www.lusthub.my.id/terms</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.40</priority></url>
</urlset>
"@
    [System.IO.File]::WriteAllText('sitemaps/sitemap_pages.xml', $pagesXml, [System.Text.Encoding]::UTF8)
    Write-Host "  [OK] sitemap_pages.xml" -ForegroundColor Green

    # --- sitemap_categories.xml ---
    # Menggunakan StringBuilder untuk performa penulisan XML yang jauh lebih cepat
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine("<?xml version='1.0' encoding='UTF-8'?>")
    [void]$sb.AppendLine("<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>")
    foreach ($q in $searchQueries) {
        $catLoc = "$baseUrl/search?q=$([uri]::EscapeDataString($q))"
        [void]$sb.AppendLine("  <url>")
        [void]$sb.AppendLine("    <loc>$catLoc</loc>")
        [void]$sb.AppendLine("    <lastmod>$dateStr</lastmod>")
        [void]$sb.AppendLine("    <changefreq>daily</changefreq>")
        [void]$sb.AppendLine("    <priority>0.80</priority>")
        [void]$sb.AppendLine("  </url>")
    }
    [void]$sb.AppendLine("</urlset>")
    [System.IO.File]::WriteAllText('sitemaps/sitemap_categories.xml', $sb.ToString(), [System.Text.Encoding]::UTF8)
    Write-Host "  [OK] sitemap_categories.xml" -ForegroundColor Green

    # Hapus file sitemap lama yang tidak dipakai
    @('sitemaps/sitemap_kategori.xml', 'sitemaps/sitemap_tags.xml') | ForEach-Object {
        if (Test-Path $_) { Remove-Item $_ -Force; Write-Host "  [DELETED] $_" -ForegroundColor DarkYellow }
    }
}

# ==============================================================================
#  FUNGSI: Update Master Index
# ==============================================================================
function Update-MasterIndex {
    Write-Host "      -> Updating sitemap_index.xml (Master Index)..." -ForegroundColor Green
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine("<?xml version='1.0' encoding='UTF-8'?>")
    [void]$sb.AppendLine("<sitemapindex xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>")
    $sitemapFiles = Get-ChildItem -Path "sitemaps" -Filter "*.xml" | Sort-Object Name
    foreach ($file in $sitemapFiles) {
        [void]$sb.AppendLine("  <sitemap>")
        [void]$sb.AppendLine("    <loc>$baseUrl/sitemaps/$($file.Name)</loc>")
        [void]$sb.AppendLine("    <lastmod>$dateStr</lastmod>")
        [void]$sb.AppendLine("  </sitemap>")
    }
    [void]$sb.AppendLine("</sitemapindex>")
    [System.IO.File]::WriteAllText('sitemap_index.xml', $sb.ToString(), [System.Text.Encoding]::UTF8)
}

# ==============================================================================
#  Jalankan Sitemap Statis
# ==============================================================================
Generate-StaticSitemaps

Write-Host ""
Write-Host "[API] Starting Parallel Crawling using RunspacePool..." -ForegroundColor Cyan
Write-Host "      Threads limit : $maxConcurrent"
Write-Host "      Pages limit   : $maxPagesPerQuery per category"
Write-Host "      Total queries : $($searchQueries.Count)"
Write-Host ""

# Shared global deduplication (thread-safe)
$globalIdSet    = New-Object 'System.Collections.Concurrent.ConcurrentDictionary[string, bool]'

# ==============================================================================
#  SCRIPT BLOCK — Berjalan di dalam setiap thread parallel
# ==============================================================================
$scriptBlock = {
    param(
        $query, $baseUrl, $dateStr, $dateOnly,
        $perPage, $delaySeconds, $maxPagesPerQuery,
        $globalIdSet
    )

    # --- Fungsi Perbaikan Encoding Eporner (Mojibake Fixer) ---
    function Fix-Mojibake($text) {
        if ([string]::IsNullOrEmpty($text)) { return $text }
        foreach ($char in $text.ToCharArray()) {
            if ([int]$char -gt 255) { return $text }  # Sudah Unicode benar
        }
        try {
            $bytes = [System.Text.Encoding]::GetEncoding("iso-8859-1").GetBytes($text)
            $utf8 = New-Object System.Text.UTF8Encoding $false, $true
            return $utf8.GetString($bytes)
        } catch { return $text }
    }

    # --- Persiapan Variabel ---
    $safeQuery       = $query -replace '[^a-zA-Z0-9]', '_'
    $fileName        = "sitemap_video_${safeQuery}.xml"
    $categoryVideos  = @{}
    $page            = 1
    $totalPages      = 1
    $dupeCount       = 0
    $requestCount    = 0
    $localSitemapFiles = @()

    Write-Host "  [$query] Starting..."

    while ($page -le $totalPages -and $page -le $maxPagesPerQuery) {
        $apiUrl = "https://www.eporner.com/api/v2/video/search/?query=$([uri]::EscapeDataString($query))&per_page=$perPage&page=$page&thumbsize=small&order=most-popular&format=json"

        $success    = $false
        $retryCount = 0
        $response   = $null

        while (-not $success -and $retryCount -lt 3) {
            try {
                $request = [System.Net.WebRequest]::Create($apiUrl)
                $request.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                $request.Timeout          = 15000  # 15 detik
                $request.ReadWriteTimeout = 15000

                $responseObj = $request.GetResponse()
                $stream      = $responseObj.GetResponseStream()
                $reader      = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
                $jsonString  = $reader.ReadToEnd()
                $reader.Close(); $stream.Close(); $responseObj.Close()

                $response = $jsonString | ConvertFrom-Json
                $requestCount++
                $success = $true
            } catch {
                $retryCount++
                $errMsg = $_.Exception.Message
                Write-Host "  [$query] [!] Error page ${page} (Attempt $retryCount/3): $errMsg" -ForegroundColor Yellow
                Start-Sleep -Seconds (3 * $retryCount)  # Exponential backoff: 3s, 6s, 9s
            }
        }

        if (-not $success) {
            Write-Host "  [$query] [!] Failed page ${page} after 3 retries, skipping." -ForegroundColor Red
            $page++
            continue
        }

        # Set total pages dari response page 1
        if ($page -eq 1) {
            if ($response.total_pages) {
                $totalPages = [int]$response.total_pages
                Write-Host "  [$query] Total: $($response.total_count) videos ($totalPages pages, limiting to $maxPagesPerQuery)"
            } else {
                Write-Host "  [$query] [!] API returned no total_pages. Stopping." -ForegroundColor Yellow
                break
            }
        }

        if ($response.videos -and $response.videos.Count -gt 0) {
            foreach ($v in $response.videos) {
                # --- Deduplication berdasarkan VIDEO ID (lebih akurat dari judul) ---
                if (-not $globalIdSet.TryAdd($v.id, $true)) {
                    $dupeCount++
                    continue
                }
                if ($categoryVideos.ContainsKey($v.id)) { continue }

                # Perbaiki encoding judul dari Eporner
                $titleVal = Fix-Mojibake ($v.title)
                if ([string]::IsNullOrWhiteSpace($titleVal)) { $titleVal = "Video $($v.id)" }

                # Buat slug dari judul (fallback ke ID jika non-Latin)
                $slug = ($titleVal -replace '[^a-zA-Z0-9]+', '-').Trim('-').ToLower()
                if ([string]::IsNullOrWhiteSpace($slug) -or $slug -eq '-') {
                    $slug = $v.id  # Gunakan video ID sebagai slug (unik & valid)
                }
                if ($slug.Length -gt 100) { $slug = $slug.Substring(0, 100).TrimEnd('-') }

                # Tanggal publikasi
                $addedDate       = $dateOnly
                $publicationDate = "${addedDate}T00:00:00Z"
                if ($v.added -and $v.added.Length -ge 19) {
                    $addedDate       = $v.added.Substring(0, 10)
                    $publicationDate = "$($v.added.Substring(0,10))T$($v.added.Substring(11,8))Z"
                } elseif ($v.added -and $v.added.Length -ge 10) {
                    $addedDate       = $v.added.Substring(0, 10)
                    $publicationDate = "${addedDate}T00:00:00Z"
                }

                # Thumbnail — Skip video tanpa thumbnail (Google akan menolaknya)
                $thumbVal = ""
                if ($v.default_thumb -and $v.default_thumb.src) {
                    $thumbVal = $v.default_thumb.src
                } elseif ($v.thumbs -and $v.thumbs.Count -gt 0 -and $v.thumbs[0].src) {
                    $thumbVal = $v.thumbs[0].src
                }
                if ([string]::IsNullOrWhiteSpace($thumbVal)) {
                    $dupeCount++  # Hitung sebagai skip
                    continue      # Jangan masukkan video tanpa thumbnail
                }

                # Embed URL
                $embedVal = if ($v.embed) { $v.embed } else { "https://www.eporner.com/embed/$($v.id)/" }

                # Durasi
                $durationVal = 0
                if ($v.length_sec) { $durationVal = [int]$v.length_sec }

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
            break  # Tidak ada video, hentikan paginasi
        }

        $page++
        Start-Sleep -Seconds $delaySeconds
    }

    # --- Tulis XML ke File (pakai StringBuilder agar super cepat) ---
    if ($categoryVideos.Count -gt 0) {
        $chunkSize   = 49000
        $videosArray = @($categoryVideos.Values)
        $totalChunks = [Math]::Ceiling($videosArray.Count / $chunkSize)

        for ($i = 0; $i -lt $totalChunks; $i++) {
            $chunkVideos     = $videosArray | Select-Object -Skip ($i * $chunkSize) -First $chunkSize
            $currentFileName = if ($totalChunks -gt 1) { $fileName.Replace(".xml", "_$($i+1).xml") } else { $fileName }

            $sb = New-Object System.Text.StringBuilder
            [void]$sb.AppendLine("<?xml version='1.0' encoding='UTF-8'?>")
            [void]$sb.AppendLine("<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9' xmlns:video='http://www.google.com/schemas/sitemap-video/1.1'>")

            foreach ($v in $chunkVideos) {
                $videoUrl    = "$baseUrl/v/$($v.id)-$($v.slug)"
                $escapedLoc  = [System.Security.SecurityElement]::Escape($videoUrl)
                $escapedThumb= [System.Security.SecurityElement]::Escape($v.thumbnail)
                $escapedTitle= [System.Security.SecurityElement]::Escape($v.title)
                $escapedEmbed= [System.Security.SecurityElement]::Escape($v.embed)

                # Deskripsi: max 2048 karakter sesuai standar Google
                $descRaw     = "Watch $($v.title) for free in HD quality on lusthub.my.id."
                if ($descRaw.Length -gt 2048) { $descRaw = $descRaw.Substring(0, 2045) + "..." }
                $escapedDesc = [System.Security.SecurityElement]::Escape($descRaw)

                [void]$sb.AppendLine("  <url>")
                [void]$sb.AppendLine("    <loc>$escapedLoc</loc>")
                [void]$sb.AppendLine("    <lastmod>$($v.added)</lastmod>")
                [void]$sb.AppendLine("    <changefreq>monthly</changefreq>")
                [void]$sb.AppendLine("    <priority>0.70</priority>")
                [void]$sb.AppendLine("    <video:video>")
                [void]$sb.AppendLine("      <video:thumbnail_loc>$escapedThumb</video:thumbnail_loc>")
                [void]$sb.AppendLine("      <video:title>$escapedTitle</video:title>")
                [void]$sb.AppendLine("      <video:description>$escapedDesc</video:description>")
                [void]$sb.AppendLine("      <video:player_loc>$escapedEmbed</video:player_loc>")
                if ($v.duration -gt 0) {
                    [void]$sb.AppendLine("      <video:duration>$($v.duration)</video:duration>")
                }
                [void]$sb.AppendLine("      <video:publication_date>$($v.published)</video:publication_date>")
                [void]$sb.AppendLine("      <video:family_friendly>no</video:family_friendly>")
                [void]$sb.AppendLine("      <video:requires_subscription>no</video:requires_subscription>")
                [void]$sb.AppendLine("    </video:video>")
                [void]$sb.AppendLine("  </url>")
            }

            [void]$sb.AppendLine("</urlset>")

            try {
                [System.IO.File]::WriteAllText("sitemaps/$currentFileName", $sb.ToString(), [System.Text.Encoding]::UTF8)
                $localSitemapFiles += $currentFileName
            } catch {
                Write-Host "  [$query] [!] Failed to write $currentFileName : $($_.Exception.Message)" -ForegroundColor Red
            }
        }

        Write-Host "  [$query] Completed. Saved $($localSitemapFiles.Count) file(s), $($categoryVideos.Count) unique videos." -ForegroundColor Green
    } else {
        Write-Host "  [$query] Completed. 0 new videos (possibly all skipped or API error)." -ForegroundColor DarkYellow
    }

    # Bebaskan RAM
    $categoryVideos = $null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()

    return [PSCustomObject]@{
        Query        = $query
        VideoCount   = if ($categoryVideos) { $categoryVideos.Count } else { 0 }
        RequestCount = $requestCount
        DupeCount    = $dupeCount
        SitemapFiles = $localSitemapFiles
    }
}

# ==============================================================================
#  EKSEKUSI PARALEL — RunspacePool
# ==============================================================================
$sessionState = [System.Management.Automation.Runspaces.InitialSessionState]::CreateDefault()
$pool = [System.Management.Automation.Runspaces.RunspaceFactory]::CreateRunspacePool(1, $maxConcurrent, $sessionState, $Host)
$pool.Open()

$runspaces = @()

foreach ($query in $searchQueries) {
    $pipeline = [System.Management.Automation.PowerShell]::Create()
    $pipeline.RunspacePool = $pool
    $pipeline.AddScript($scriptBlock)         | Out-Null
    $pipeline.AddParameter("query",           $query)             | Out-Null
    $pipeline.AddParameter("baseUrl",         $baseUrl)           | Out-Null
    $pipeline.AddParameter("dateStr",         $dateStr)           | Out-Null
    $pipeline.AddParameter("dateOnly",        $dateOnly)          | Out-Null
    $pipeline.AddParameter("perPage",         $perPage)           | Out-Null
    $pipeline.AddParameter("delaySeconds",    $delaySeconds)      | Out-Null
    $pipeline.AddParameter("maxPagesPerQuery",$maxPagesPerQuery)  | Out-Null
    $pipeline.AddParameter("globalIdSet",     $globalIdSet)       | Out-Null

    $handle = $pipeline.BeginInvoke()
    $runspaces += @{ Pipeline = $pipeline; Handle = $handle; Query = $query }
}

Write-Host "Dispatched $($runspaces.Count) crawling tasks. Waiting for all to complete..." -ForegroundColor Cyan
Write-Host ""

# Kumpulkan hasil semua thread
$grandTotalVideos   = 0
$grandTotalRequests = 0
$grandTotalDupes    = 0
$allSitemapFiles    = @()

foreach ($r in $runspaces) {
    $results = $r.Pipeline.EndInvoke($r.Handle)
    if ($results) {
        $grandTotalVideos   += $results.VideoCount
        $grandTotalRequests += $results.RequestCount
        $grandTotalDupes    += $results.DupeCount
        foreach ($sf in $results.SitemapFiles) { $allSitemapFiles += $sf }
    }
    # Tampilkan error internal thread jika ada
    if ($r.Pipeline.HadErrors) {
        foreach ($err in $r.Pipeline.Streams.Error) {
            Write-Host "  [THREAD ERR] $($r.Query): $err" -ForegroundColor Red
        }
    }
    $r.Pipeline.Dispose()
}

$pool.Close()
$pool.Dispose()

$allSitemapFiles = $allSitemapFiles | Sort-Object

# Update Master Index
Update-MasterIndex

# Update root sitemap.xml
Write-Host "[SITEMAP] Updating root sitemap.xml..." -ForegroundColor Green
$rootSitemapXml = @"
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.lusthub.my.id/</loc>
    <lastmod>$dateStr</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.00</priority>
  </url>
  <url><loc>https://www.lusthub.my.id/howto</loc><lastmod>$dateStr</lastmod><changefreq>monthly</changefreq><priority>0.60</priority></url>
  <url><loc>https://www.lusthub.my.id/about</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.50</priority></url>
  <url><loc>https://www.lusthub.my.id/contact</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.40</priority></url>
  <url><loc>https://www.lusthub.my.id/dmca</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.40</priority></url>
  <url><loc>https://www.lusthub.my.id/privacy</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.40</priority></url>
  <url><loc>https://www.lusthub.my.id/terms</loc><lastmod>$dateStr</lastmod><changefreq>yearly</changefreq><priority>0.40</priority></url>
</urlset>
"@
[System.IO.File]::WriteAllText('sitemap.xml', $rootSitemapXml, [System.Text.Encoding]::UTF8)

# Bersihkan state file lama jika ada
if (Test-Path "sitemap_state.json") { Remove-Item "sitemap_state.json" -Force }

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  ALL COMPLETE! v7.0 ENTERPRISE"             -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Video sitemaps       : $($allSitemapFiles.Count) files"
Write-Host "  Total unique videos  : $grandTotalVideos"
Write-Host "  API requests         : $grandTotalRequests"
Write-Host "  Skipped/Dupes        : $grandTotalDupes"
Write-Host "  sitemap_index.xml    : READY to submit to Google!"
Write-Host "  sitemap.xml          : Root (Updated!)"
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
