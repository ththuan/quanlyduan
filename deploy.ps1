# QLDA - Cập nhật và triển khai tự động
# Chạy file này mỗi khi có thay đổi từ GitHub:
#   PowerShell: .\deploy.ps1

Write-Output "==> Kéo code mới nhất từ GitHub..."
git pull

Write-Output "==> Build lại Docker image..."
docker compose build qlda

Write-Output "==> Triển khai..."
docker compose up -d qlda

Write-Output "==> Hoàn tất! https://quanlyduanctec.dpdns.org"
