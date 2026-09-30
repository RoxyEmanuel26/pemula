[CmdletBinding()]
param([switch]$Offline)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js 20 or newer is required to generate the sitemap.'
}

$arguments = @('scripts/generate-sitemaps.mjs')
if ($Offline) { $arguments += '--offline' }

Write-Host 'Generating bounded, incremental SEO sitemaps...' -ForegroundColor Cyan
& node @arguments
if ($LASTEXITCODE -ne 0) { throw "Sitemap generator failed with exit code $LASTEXITCODE." }

& node 'scripts/validate-sitemaps.mjs'
if ($LASTEXITCODE -ne 0) { throw "Sitemap validation failed with exit code $LASTEXITCODE." }

Write-Host 'Sitemap generation and validation completed.' -ForegroundColor Green
