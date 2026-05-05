Add-Type -AssemblyName System.Drawing
$iconPath = "c:\Users\venka\gemma-4\Gemma4Mobile\icon.png"
$img = [System.Drawing.Image]::FromFile($iconPath)
$sizes = @{ "mdpi"=48; "hdpi"=72; "xhdpi"=96; "xxhdpi"=144; "xxxhdpi"=192 }
$resPath = "c:\Users\venka\gemma-4\Gemma4Mobile\android\app\src\main\res"

foreach ($name in $sizes.Keys) {
    $size = $sizes[$name]
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $size, $size)
    $g.Dispose()
    
    $folderPath = Join-Path $resPath "mipmap-$name"
    if (-not (Test-Path $folderPath)) {
        New-Item -ItemType Directory -Path $folderPath
    }
    
    $launcherPath = Join-Path $folderPath "ic_launcher.png"
    $roundPath = Join-Path $folderPath "ic_launcher_round.png"
    
    # Remove existing files if they exist to avoid conflicts
    if (Test-Path $launcherPath) { Remove-Item $launcherPath -Force }
    if (Test-Path $roundPath) { Remove-Item $roundPath -Force }
    
    $bmp.Save($launcherPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Save($roundPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Generated icons for $name ($size x $size)"
}
$img.Dispose()
