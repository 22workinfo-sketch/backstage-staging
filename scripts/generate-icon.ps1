Add-Type -AssemblyName System.Drawing

$width = 1024
$height = 1024
$bmp = New-Object System.Drawing.Bitmap $width, $height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

# Background Gradient: Dark Cyan to Deep Navy
$startColor = [System.Drawing.Color]::FromArgb(10, 25, 47)
$endColor = [System.Drawing.Color]::FromArgb(2, 12, 27)
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point $width, $height), $startColor, $endColor
$g.FillRectangle($bgBrush, 0, 0, $width, $height)

# Center Circle Glow / Gradient
$centerBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 160, 160), (New-Object System.Drawing.Point 864, 864), ([System.Drawing.Color]::FromArgb(99, 212, 237)), ([System.Drawing.Color]::FromArgb(14, 165, 233))
$g.FillEllipse($centerBrush, 160, 160, 704, 704)

# Inner Badge Circle
$innerBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(15, 23, 42))
$g.FillEllipse($innerBrush, 190, 190, 644, 644)

# Draw Logo Icon / Initials "MS" (Myan Service)
$font = New-Object System.Drawing.Font ("Segoe UI", 240, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$textBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 200, 200), (New-Object System.Drawing.Point 800, 800), ([System.Drawing.Color]::FromArgb(99, 212, 237)), ([System.Drawing.Color]::FromArgb(240, 249, 255))

$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center

$rect = New-Object System.Drawing.RectangleF 0, 0, $width, ($height - 40)
$g.DrawString("MS", $font, $textBrush, $rect, $sf)

# Subtitle "SUPPORT"
$subFont = New-Object System.Drawing.Font ("Segoe UI", 48, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$subBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(148, 163, 184))
$subRect = New-Object System.Drawing.RectangleF 0, 690, $width, 80
$g.DrawString("SUPPORT", $subFont, $subBrush, $subRect, $sf)

# Save to public and desktop
$publicPath = Join-Path (Get-Location) "public\app-icon-1024.png"
$bmp.Save($publicPath, [System.Drawing.Imaging.ImageFormat]::Png)

$desktopPath = [System.IO.Path]::Combine([System.Environment]::GetFolderPath("Desktop"), "myan-service-icon-1024.png")
$bmp.Save($desktopPath, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()

Write-Output "ICON_GENERATED: $publicPath"
Write-Output "DESKTOP_ICON: $desktopPath"
