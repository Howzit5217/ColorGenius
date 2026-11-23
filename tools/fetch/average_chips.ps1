# Averages stain chip photos into one color each, using Windows' built-in image library (no downloads needed).
# Averages the middle 60% of each photo in linear light, away from any frame or label.
# Usage: powershell -File tools/fetch/average_chips.ps1 <folder-of-jpgs> <out.json>
param([string]$Folder, [string]$Out)
Add-Type -AssemblyName System.Drawing
function ToLin([double]$c) { $c = $c / 255.0; if ($c -le 0.04045) { return $c / 12.92 } else { return [Math]::Pow(($c + 0.055) / 1.055, 2.4) } }
function ToS([double]$v) { if ($v -le 0.0031308) { $s = 12.92 * $v } else { $s = 1.055 * [Math]::Pow($v, 1 / 2.4) - 0.055 }; return [int][Math]::Round([Math]::Max([double]0.0, [Math]::Min([double]1.0, [double]$s)) * 255) }
$result = @{}
foreach ($f in Get-ChildItem -Path $Folder -Filter *.jpg) {
  $img = [System.Drawing.Image]::FromFile($f.FullName)
  $n = 64
  $bmp = New-Object System.Drawing.Bitmap $n, $n
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBilinear
  $src = New-Object System.Drawing.Rectangle ([int]($img.Width * 0.2)), ([int]($img.Height * 0.2)), ([int]($img.Width * 0.6)), ([int]($img.Height * 0.6))
  $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $n, $n), $src, [System.Drawing.GraphicsUnit]::Pixel)
  $r = 0.0; $gg = 0.0; $b = 0.0
  for ($y = 0; $y -lt $n; $y++) { for ($x = 0; $x -lt $n; $x++) { $p = $bmp.GetPixel($x, $y); $r += ToLin $p.R; $gg += ToLin $p.G; $b += ToLin $p.B } }
  $k = $n * $n
  $result[$f.Name] = '{0:X2}{1:X2}{2:X2}' -f (ToS ($r / $k)), (ToS ($gg / $k)), (ToS ($b / $k))
  $g.Dispose(); $bmp.Dispose(); $img.Dispose()
}
$result | ConvertTo-Json | Set-Content -Path $Out -Encoding utf8
Write-Output ("averaged " + $result.Count)
