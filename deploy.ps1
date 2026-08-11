# Production - kéo code từ GitHub về và triển khai
# Chạy: .\deploy.ps1

Write-Output "==> Kéo code mới nhất từ GitHub..."
git pull origin master

Write-Output "==> Build & deploy..."
docker compose build qlda
docker compose up -d qlda

Write-Output "==> Hoàn tất! https://quanlyduanctec.dpdns.org"
