# Sitemap architecture

The public entry point is `https://www.lusthub.my.id/sitemap_index.xml`, declared once in `robots.txt`.

## Files

- `sitemaps/sitemap_pages.xml`: canonical static pages with Git-derived `lastmod` dates.
- `sitemaps/sitemap_categories.xml`: curated category routes linked by the interface.
- `sitemaps/sitemap_videos_NNN.xml`: globally deduplicated, newest-first rolling video inventory.
- `sitemap.xml`: conventional small root sitemap retained for compatibility.
- `data/sitemap-state.json`: deterministic incremental source catalog, excluded from Vercel deployments.

## Automation and cost controls

GitHub Actions runs `scripts/generate-sitemaps.mjs` daily at 03:17 Asia/Jakarta. It fetches newest-first API pages until it encounters a known video, prunes removed videos when the provider exposes them, retains at most 20,000 recent valid videos, and writes chunks of 5,000 URLs. The workflow validates every output and commits only when generated content changes. No Vercel Cron or Vercel Function is used.

The rolling cap is intentional. It replaces the former 1.5M-URL category crawl, reduces duplicated and thin discovery, bounds Vercel deployment storage, and concentrates search-engine crawling on recent canonical URLs.

## Manual fallback

Run `generate-sitemap.bat`, or run these commands directly:

```powershell
node scripts/generate-sitemaps.mjs
node scripts/validate-sitemaps.mjs
```

Use `node scripts/generate-sitemaps.mjs --offline` to rebuild deterministically from saved state without contacting the provider API.
