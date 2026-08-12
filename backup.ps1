# Auto backup QLDA — copy SQLite + uploads, giữ 7 ngày
# Chạy: .\backup.ps1

$backupDir = "D:\QLDA\backups"
$date = Get-Date -Format "yyyy-MM-dd-HHmm"
$file = "$backupDir\qlda-$date.zip"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

Write-Output "==> Đang backup..."

try {
    # Copy SQLite từ Docker volume ra temp
    $tempDir = "$env:TEMP\qlda-backup"
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    docker cp qlda:/app/server/data/qlda.sqlite "$tempDir\qlda.sqlite" 2>$null
    docker cp qlda:/app/server/uploads "$tempDir\uploads" 2>$null

    # Nén thành zip
    Compress-Archive -Path "$tempDir\*" -DestinationPath $file -Force
    Remove-Item -Recurse -Force $tempDir

    # Xóa backup cũ hơn 7 ngày
    Get-ChildItem "$backupDir\qlda-*.zip" |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } |
        Remove-Item -Force

    $count = (Get-ChildItem "$backupDir\qlda-*.zip").Count
    $size = [math]::Round((Get-Item $file).Length / 1KB, 1)
    Write-Output "==> OK! ${size}KB — đang giữ $count bản (7 ngày)"
} catch {
    Write-Output "==> LỖI: $_"
}
