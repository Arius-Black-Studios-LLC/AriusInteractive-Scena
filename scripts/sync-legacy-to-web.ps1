# Copy legacy static assets from docs/ into web/public/legacy for React bridge.
# Preserves exact JS/storage behavior (IndexedDB keys, localStorage, Supabase RPCs).

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$docs = Join-Path $root "docs"
$legacy = Join-Path $root "web\public\legacy"

New-Item -ItemType Directory -Path $legacy -Force | Out-Null

$jsFiles = @(
  "scena-auth.js", "scena-cloud.js", "scena-profile.js", "scena-account.js",
  "scena-catalog.js", "scena-demo-series.js", "scena-progress.js", "scena-player.js",
  "scena-comments.js", "scena-hearts.js", "scena-audio.js", "scena-reader-menu.js",
  "scena-default-audio.js", "scena-key-item.js", "scena-key-item-icons.js",
  "scena-badges.js", "scena-wallet.js", "scena-marketplace.js", "scena-feedback.js",
  "scena-version.js", "studio-store.js", "studio-app.js", "studio-graph.js",
  "learn-app.js", "learn-lessons.js", "learn-sandbox.js", "learn-mascots.js"
)

$cssFiles = @(
  "studio.css", "play.css", "series.css", "learn.css", "scena-page.css",
  "scena-logo.css", "arleco-theme.css", "blog.css"
)

foreach ($f in $jsFiles) {
  Copy-Item (Join-Path $docs $f) (Join-Path $legacy $f) -Force
}

foreach ($f in $cssFiles) {
  Copy-Item (Join-Path $docs $f) (Join-Path $legacy $f) -Force
}

Copy-Item (Join-Path $docs "scena-logo.js") (Join-Path $legacy "scena-logo.js") -Force
Copy-Item (Join-Path $docs "arleco-icon.png") (Join-Path $root "web\public\arleco-icon.png") -Force

# Blog articles (static HTML)
$blogSrc = Join-Path $docs "blog"
$blogDst = Join-Path $root "web\public\blog"
if (Test-Path $blogSrc) {
  if (Test-Path $blogDst) { Remove-Item $blogDst -Recurse -Force }
  Copy-Item $blogSrc $blogDst -Recurse -Force
}

Write-Host "Synced legacy assets to web/public/legacy"
