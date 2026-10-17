# Draws the app icon (terracotta tile, cream map pin) at the sizes the manifest and iOS need.
# Run from the project root:  powershell -File scripts/make-icons.ps1
Add-Type -AssemblyName System.Drawing

function New-Icon([int]$size, [string]$path, [double]$tileScale, [bool]$rounded) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml('#EFE7D8'))

  $s = $size / 512.0
  $tile = 512 * $tileScale * $s
  $off = ($size - $tile) / 2
  $rect = New-Object System.Drawing.RectangleF $off, $off, $tile, $tile
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.ColorTranslator]::FromHtml('#DE7A32')), ([System.Drawing.ColorTranslator]::FromHtml('#A8481F')), 45.0
  if ($rounded) {
    $r = $tile * 0.22
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gp.AddArc($off, $off, $r * 2, $r * 2, 180, 90)
    $gp.AddArc($off + $tile - $r * 2, $off, $r * 2, $r * 2, 270, 90)
    $gp.AddArc($off + $tile - $r * 2, $off + $tile - $r * 2, $r * 2, $r * 2, 0, 90)
    $gp.AddArc($off, $off + $tile - $r * 2, $r * 2, $r * 2, 90, 90)
    $gp.CloseFigure()
    $g.FillPath($brush, $gp)
  } else {
    $g.FillRectangle($brush, $rect)
  }

  # map pin: circle head + tapered point, with a terracotta dot
  $cream = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#FBF6EC'))
  $cx = $size / 2; $cy = $size * 0.42
  $pr = $size * 0.15
  $pin = New-Object System.Drawing.Drawing2D.GraphicsPath
  $pin.AddArc([single]($cx - $pr), [single]($cy - $pr), [single]($pr * 2), [single]($pr * 2), 150, 240)
  $pin.AddLine([single]($cx + $pr * 0.866), [single]($cy + $pr * 0.5), [single]$cx, [single]($cy + $pr * 2.05))
  $pin.CloseFigure()
  $g.FillPath($cream, $pin)
  $dot = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#A4502F'))
  $dr = $pr * 0.4
  $g.FillEllipse($dot, [single]($cx - $dr), [single]($cy - $dr), [single]($dr * 2), [single]($dr * 2))

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

$out = Join-Path (Get-Location) 'public\icons'
New-Item -ItemType Directory -Force $out | Out-Null
# Full-bleed tiles: iOS and Android apply their own corner mask.
New-Icon 192 (Join-Path $out 'icon-192.png') 1.0 $false
New-Icon 512 (Join-Path $out 'icon-512.png') 1.0 $false
New-Icon 180 (Join-Path $out 'apple-touch-icon.png') 1.0 $false
# Maskable: keep the pin inside the 80% safe zone.
New-Icon 512 (Join-Path $out 'icon-maskable-512.png') 1.0 $false
Write-Output 'icons written'
