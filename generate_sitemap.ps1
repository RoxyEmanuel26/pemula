$ErrorActionPreference = 'Stop'
$baseUrl = 'https://www.kumpulenak.web.id'
$dateStr = Get-Date -Format "yyyy-MM-ddTHH:mm:ss+07:00"
Write-Host "Waktu eksekusi: $dateStr"
Write-Host "============================================"

Write-Host "[SITEMAP] 1. Generating sitemap_pages.xml..."
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

Write-Host "[SITEMAP] 2. Generating sitemap_kategori.xml..."
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

Write-Host "[SITEMAP] 3. Generating sitemap_tags.xml..."
$tags = @('indonesia','cewe','viral','bokep indo','mahasiswi','pasutri','rumahan','hijab','malam','goyang','live streaming','artis indo','pantai','hotel','tiktok viral','hot indo')
$tagsXml = "<?xml version='1.0' encoding='UTF-8'?>`n<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>`n"
foreach ($t in $tags) {
  $url = $baseUrl + '/?q=' + [uri]::EscapeDataString($t)
  $tagsXml += "  <url>`n    <loc>$url</loc>`n    <lastmod>$dateStr</lastmod>`n    <changefreq>daily</changefreq>`n    <priority>0.75</priority>`n  </url>`n"
}
$tagsXml += "</urlset>"
[System.IO.File]::WriteAllText('sitemap_tags.xml', $tagsXml, [System.Text.Encoding]::UTF8)

Write-Host "[SITEMAP] 4. Generating sitemap_index.xml..."
$indexXml = @"
<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://www.kumpulenak.web.id/sitemap_pages.xml</loc>
    <lastmod>$dateStr</lastmod>
  </sitemap>
  <sitemap>
    <loc>https://www.kumpulenak.web.id/sitemap_kategori.xml</loc>
    <lastmod>$dateStr</lastmod>
  </sitemap>
  <sitemap>
    <loc>https://www.kumpulenak.web.id/sitemap_tags.xml</loc>
    <lastmod>$dateStr</lastmod>
  </sitemap>
</sitemapindex>
"@
[System.IO.File]::WriteAllText('sitemap_index.xml', $indexXml, [System.Text.Encoding]::UTF8)

Write-Host "============================================"
Write-Host "Summary:"
Write-Host "- sitemap_pages.xml (7 URLs)"
Write-Host "- sitemap_kategori.xml (18 URLs)"
Write-Host "- sitemap_tags.xml (16 URLs)"
Write-Host "- Total XML diperbarui!"
