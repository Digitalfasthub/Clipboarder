Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$outDir = Join-Path $root "store-listing"
if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$W = 1280
$H = 800
$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

function NewSolidBrush([int]$r, [int]$g2, [int]$b, [int]$a = 255) {
  return New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($a, $r, $g2, $b))
}

function RoundedRect([System.Drawing.Graphics]$gfx, [System.Drawing.Rectangle]$rect, [int]$radius, [System.Drawing.Brush]$brush, [System.Drawing.Pen]$pen) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  if ($brush) { $gfx.FillPath($brush, $path) }
  if ($pen) { $gfx.DrawPath($pen, $path) }
  $path.Dispose()
}

# Background gradient
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point 0, 0),
  (New-Object System.Drawing.Point $W, $H),
  [System.Drawing.Color]::FromArgb(255, 232, 240, 254),
  [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
)
$g.FillRectangle($bgBrush, 0, 0, $W, $H)

# Headline text (left side)
$headFont = New-Object System.Drawing.Font("Arial", 40, [System.Drawing.FontStyle]::Bold)
$subFont = New-Object System.Drawing.Font("Arial", 18, [System.Drawing.FontStyle]::Regular)
$darkBrush = NewSolidBrush 32 33 36
$greyBrush = NewSolidBrush 95 99 104

$g.DrawString("Clipboarder", $headFont, $darkBrush, 70, 90)
$g.DrawString("Collect multiple copies.", $subFont, $greyBrush, 70, 160)
$g.DrawString("Paste them back anytime - your way.", $subFont, $greyBrush, 70, 190)

$bulletFont = New-Object System.Drawing.Font("Arial", 15, [System.Drawing.FontStyle]::Regular)
$bullets = @(
  "- Two hotkeys you choose: one to copy, one to paste",
  "- Items stay in the list after pasting - reuse anytime",
  "- Keep formatting and links, or strip them - your call",
  "- 100% local. No accounts, no servers, no tracking"
)
$by = 260
foreach ($b in $bullets) {
  $g.DrawString($b, $bulletFont, $greyBrush, 70, $by)
  $by += 34
}

# Mock browser chrome (top bar) on the right side
$browserRect = New-Object System.Drawing.Rectangle 660, 90, 560, 420
RoundedRect $g $browserRect 14 (NewSolidBrush 255 255 255) (New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255,224,224,224)), 1)
$toolbarRect = New-Object System.Drawing.Rectangle 660, 90, 560, 48
RoundedRect $g $toolbarRect 14 (NewSolidBrush 245 246 248) $null
$g.FillRectangle((NewSolidBrush 245 246 248), 660, 118, 560, 20)

# window dots
$dotColors = @(@(237,106,94), @(245,191,79), @(97,195,78))
$dx = 684
foreach ($c in $dotColors) {
  $g.FillEllipse((NewSolidBrush $c[0] $c[1] $c[2]), $dx, 110, 12, 12)
  $dx += 20
}
# address bar
$addrRect = New-Object System.Drawing.Rectangle 760, 104, 420, 24
RoundedRect $g $addrRect 12 (NewSolidBrush 255 255 255) (New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255,224,224,224)), 1)
$g.DrawString("docs.example.com", $bulletFont, $greyBrush, 772, 107)

# page body placeholder lines
$lineBrush = NewSolidBrush 232 234 237
for ($i = 0; $i -lt 6; $i++) {
  $w = if ($i % 3 -eq 2) { 260 } else { 420 }
  $g.FillRectangle($lineBrush, 684, 160 + ($i * 24), $w, 10)
}

# Extension toolbar icon + popup dropdown mockup
$iconPath = Join-Path $root "icons\icon48.png"
if (Test-Path $iconPath) {
  $iconImg = [System.Drawing.Image]::FromFile($iconPath)
  $g.DrawImage($iconImg, 1150, 100, 28, 28)
  $iconImg.Dispose()
}

$popupRect = New-Object System.Drawing.Rectangle 900, 150, 300, 330
RoundedRect $g $popupRect 10 (NewSolidBrush 255 255 255) (New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255,200,200,200)), 1)
$g.FillRectangle((NewSolidBrush 255 255 255), 905, 155, 290, 10) # cover border seam at top

$popupTitleFont = New-Object System.Drawing.Font("Arial", 15, [System.Drawing.FontStyle]::Bold)
$g.DrawString("Clipboarder", $popupTitleFont, $darkBrush, 918, 164)
$smallFont = New-Object System.Drawing.Font("Arial", 10, [System.Drawing.FontStyle]::Regular)
$g.DrawString("Copy mode: ON", $smallFont, $greyBrush, 918, 190)
$g.DrawString("3 / 10 items", $smallFont, $greyBrush, 1130, 190)

# list items
$items = @(
  @{ text = "https://example.com/pricing"; tag = $null; selected = $true },
  @{ text = "Thanks for the quick reply! Let's..."; tag = "rich"; selected = $false },
  @{ text = "Q3 revenue grew 18% year over..."; tag = "cut"; selected = $false }
)
$iy = 214
foreach ($it in $items) {
  $rowRect = New-Object System.Drawing.Rectangle 912, $iy, 276, 34
  if ($it.selected) {
    $g.FillRectangle((NewSolidBrush 232 240 254), $rowRect)
  }
  $tx = 920
  if ($it.selected) {
    $g.DrawString([char]0x2794, $bulletFont, (NewSolidBrush 26 115 232), $tx, $iy + 8)
    $tx += 18
  }
  if ($it.tag) {
    $tagColor = if ($it.tag -eq "rich") { @(230,244,234) } else { @(254,247,224) }
    $tagText = if ($it.tag -eq "rich") { @(30,142,62) } else { @(166,106,0) }
    $tagRect = New-Object System.Drawing.Rectangle $tx, ($iy + 9), 30, 14
    RoundedRect $g $tagRect 3 (NewSolidBrush $tagColor[0] $tagColor[1] $tagColor[2]) $null
    $g.DrawString($it.tag, (New-Object System.Drawing.Font("Arial", 7)), (NewSolidBrush $tagText[0] $tagText[1] $tagText[2]), ($tx + 3), ($iy + 11))
    $tx += 36
  }
  $g.DrawString($it.text, $smallFont, $darkBrush, $tx, $iy + 10)
  $g.DrawString("x", (New-Object System.Drawing.Font("Arial", 11, [System.Drawing.FontStyle]::Bold)), (NewSolidBrush 180 180 180), 1170, $iy + 8)
  $iy += 34
}

$footerFont = New-Object System.Drawing.Font("Arial", 9, [System.Drawing.FontStyle]::Underline)
$g.DrawString("Clear list", $footerFont, (NewSolidBrush 95 99 104), 1140, 460)

$bmp.Save((Join-Path $outDir "screenshot-1280x800.png"), [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()

Write-Host "Screenshot generated: $(Join-Path $outDir 'screenshot-1280x800.png')"
