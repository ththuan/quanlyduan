# Dev mode - test local changes ngay lập tức (không cần push GitHub)
# Dùng khi đang sửa code và muốn xem kết quả
# Chạy: .\dev.ps1

Write-Output "==> Build & deploy local changes..."
docker compose build qlda
docker compose up -d qlda
Write-Output "==> Xong! http://localhost:3000"
