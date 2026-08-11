# ============================================================
# QLDA - Sinh chứng chỉ self-signed cho HTTPS nội bộ LAN
# Sinh file certs\qlda.pfx rồi chạy server với:
#   $env:HTTPS_PFX="...certs\qlda.pfx"
#   $env:HTTPS_PFX_PASSPHRASE="qlda2026"
#   node server/index.js
# Dùng cert store CurrentUser -> KHÔNG cần quyền Admin.
# ============================================================
param(
  [string]$OutPath  = (Join-Path $PSScriptRoot '..\certs\qlda.pfx'),
  [string]$Passphrase = 'qlda2026'
)

$ErrorActionPreference = 'Stop'

# Địa chỉ IP LAN của máy chủ (để cert có SAN khớp IP truy cập)
function Get-LanIPv4 {
  try {
    $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object {
        $_.IPAddress -notlike '127.*' -and
        $_.IPAddress -notlike '169.254.*' -and
        $_.InterfaceAlias -notlike '*WSL*' -and
        $_.InterfaceAlias -notlike 'vEthernet*' -and
        $_.IPAddress -notlike '172.1*.1' -and
        $_.IPAddress -notlike '172.2*' -and
        $_.IPAddress -notlike '172.30.*' -and
        $_.IPAddress -notlike '172.31.*'
      } |
      Sort-Object InterfaceMetric |
      Select-Object -First 1).IPAddress
    if ($ip) { return $ip }
  } catch { }
  return '192.168.1.10'
}

$ip   = Get-LanIPv4
$hostname = [System.Net.Dns]::GetHostName()
Write-Host "Tạo chứng chỉ self-signed cho: localhost, $hostname, $ip"

# Store CurrentUser (không cần Admin). Xóa cert cũ trùng tên nếu có.
Get-ChildItem 'Cert:\CurrentUser\My' -ErrorAction SilentlyContinue |
  Where-Object { $_.FriendlyName -eq 'QLDA LAN HTTPS' } |
  Remove-Item -Force -ErrorAction SilentlyContinue

$cert = New-SelfSignedCertificate `
  -DnsName @("localhost", $hostname, $ip) `
  -FriendlyName 'QLDA LAN HTTPS' `
  -CertStoreLocation 'Cert:\CurrentUser\My' `
  -KeyExportPolicy Exportable `
  -KeySpec KeyExchange `
  -NotAfter (Get-Date).AddYears(5)

$outDir = Split-Path -Parent $OutPath
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$secPass = ConvertTo-SecureString $Passphrase -AsPlainText -Force
Export-PfxCertificate -Cert $cert -FilePath $OutPath -Password $secPass -Force | Out-Null

Write-Host ""
Write-Host "OK - Đã xuất: $OutPath"
Write-Host "Thumbprint: $($cert.Thumbprint)"
Write-Host ""
Write-Host "Cách chạy server HTTPS (mở Terminal mới):"
Write-Host "  `$env:HTTPS_PFX = '$OutPath'"
Write-Host "  `$env:HTTPS_PFX_PASSPHRASE = '$Passphrase'"
Write-Host "  node server/index.js"
Write-Host ""
Write-Host "Các máy khác truy cập:  https://$ip`:3000"
Write-Host "(Trình duyệt sẽ cảnh báo không an toàn - bấm Nâng cao > Tiếp tục, chỉ 1 lần)"
