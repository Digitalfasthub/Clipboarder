Add-Type -AssemblyName System.Drawing

$sizes = 16, 32, 48, 128
$outDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'icons'
if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

foreach ($size in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $green = [System.Drawing.Color]::FromArgb(255, 30, 142, 62)
  $brush = New-Object System.Drawing.SolidBrush $green
  $g.FillEllipse($brush, 0, 0, $size, $size)

  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $fontSize = [Math]::Max(8, [int]($size * 0.55))
  $font = New-Object System.Drawing.Font('Segoe UI Symbol', $fontSize, [System.Drawing.FontStyle]::Bold)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
  $g.DrawString([char]0x2714, $font, $white, $rect, $format)

  $bmp.Save((Join-Path $outDir "icon$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)

  $g.Dispose()
  $bmp.Dispose()
  $font.Dispose()
  $brush.Dispose()
  $white.Dispose()
}

Write-Host "Icons generated in $outDir"
