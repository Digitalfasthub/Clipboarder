# Packages the extension into a Chrome Web Store-ready .zip
# (manifest.json + runtime files only - no README, .git, or dev tools).

$root = Split-Path $PSScriptRoot -Parent
$manifest = Get-Content (Join-Path $root "manifest.json") -Raw | ConvertFrom-Json
$version = $manifest.version

$distDir = Join-Path $root "dist"
if (!(Test-Path $distDir)) { New-Item -ItemType Directory -Path $distDir | Out-Null }

$stagingDir = Join-Path $distDir "staging"
if (Test-Path $stagingDir) { Remove-Item $stagingDir -Recurse -Force }
New-Item -ItemType Directory -Path $stagingDir | Out-Null

$filesToInclude = @(
  "manifest.json",
  "background.js",
  "content.js",
  "content.css",
  "popup.html",
  "popup.js"
)

foreach ($file in $filesToInclude) {
  Copy-Item (Join-Path $root $file) (Join-Path $stagingDir $file)
}
Copy-Item (Join-Path $root "icons") (Join-Path $stagingDir "icons") -Recurse

$zipName = "Clipboarder-v$version.zip"
$zipPath = Join-Path $distDir $zipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $zipPath
Remove-Item $stagingDir -Recurse -Force

Write-Host "Package ready: $zipPath"
