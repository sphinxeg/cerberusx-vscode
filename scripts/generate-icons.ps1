<#
Generates PNG icons from the SVG sources in `resources/`.
Tries ImageMagick (`magick`) first, then Inkscape (`inkscape`).

Usage (PowerShell):
  ./scripts/generate-icons.ps1

Outputs:
- resources/icon.png          (128x128) root extension icon for Marketplace
- resources/icon-32.png       (32x32)  small icon
- resources/light/icon.png    (128x128) light theme variant
- resources/dark/icon.png     (128x128) dark theme variant
#>

$fail = $false
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$repoRoot = Resolve-Path ".." -Relative
$resources = Join-Path $repoRoot "resources"

function Run-Magick($inFile, $outFile, $size) {
    Write-Host "magick convert $inFile -resize $size $outFile"
    & magick convert $inFile -resize $size $outFile
    return $LASTEXITCODE
}

function Run-Inkscape($inFile, $outFile, $width, $height) {
    Write-Host "inkscape $inFile --export-type=png --export-filename=$outFile --export-width=$width --export-height=$height"
    & inkscape $inFile --export-type=png --export-filename=$outFile --export-width=$width --export-height=$height
    return $LASTEXITCODE
}

# Ensure target folders
New-Item -ItemType Directory -Force -Path (Join-Path $resources "light") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $resources "dark") | Out-Null

$svgMain = Join-Path $resources "icon.svg"
$svgLight = Join-Path $resources "light" "icon.svg"
$svgDark  = Join-Path $resources "dark" "icon.svg"

$pngMain = Join-Path $resources "icon.png"
$png32   = Join-Path $resources "icon-32.png"
$pngLight = Join-Path $resources "light" "icon.png"
$pngDark  = Join-Path $resources "dark" "icon.png"

# Try ImageMagick first
if (Get-Command magick -ErrorAction SilentlyContinue) {
    Write-Host "Using ImageMagick (magick) to generate PNGs..."
    if (Test-Path $svgMain) { Run-Magick $svgMain $pngMain "128x128" }
    if (Test-Path $svgMain) { Run-Magick $svgMain $png32 "32x32" }
    if (Test-Path $svgLight) { Run-Magick $svgLight $pngLight "128x128" }
    if (Test-Path $svgDark)  { Run-Magick $svgDark  $pngDark  "128x128" }
    exit 0
}

# Fallback to Inkscape
if (Get-Command inkscape -ErrorAction SilentlyContinue) {
    Write-Host "Using Inkscape to generate PNGs..."
    if (Test-Path $svgMain) { Run-Inkscape $svgMain $pngMain 128 128 }
    if (Test-Path $svgMain) { Run-Inkscape $svgMain $png32 32 32 }
    if (Test-Path $svgLight) { Run-Inkscape $svgLight $pngLight 128 128 }
    if (Test-Path $svgDark)  { Run-Inkscape $svgDark  $pngDark  128 128 }
    exit 0
}

Write-Host "Neither ImageMagick (magick) nor Inkscape (inkscape) were found on PATH."
Write-Host "Please install one of them or export PNGs manually from 'resources/*.svg'."
exit 1
