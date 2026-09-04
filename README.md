# Phần mềm Quản lý Dự án Đầu tư Xây dựng

> **Trường Cao đẳng Kinh tế - Kỹ thuật Cần Thơ (CTEC)**

Hệ thống quản lý toàn diện các dự án đầu tư xây dựng — theo dõi tiến độ, giải ngân, quyết toán theo Luật Xây dựng 135/2025/QH15 và 07 nghị định hướng dẫn có hiệu lực từ 01/07/2026 (NĐ 217, 206, 207, 209, 210, 212 và 193/2026), cùng các quy định đấu thầu, thanh toán và mẫu biểu liên quan.

## Tính năng chính

### Quản lý dự án
- Thông tin dự án: tên, chủ đầu tư, mã số thuế, địa điểm, nhóm (A/B/C), nguồn vốn
- Danh sách công trình thuộc dự án kèm giấy phép xây dựng
- Trạng thái BCNCKT, thẩm định, BIM

### Quản lý gói thầu
- **5 loại gói**: Xây lắp, Tư vấn, Hàng hóa, Hỗn hợp, Phi tư vấn
- Form tự động hiển thị đúng trường theo từng loại gói
- Tiến độ, milestones, nghiệm thu hồ sơ, nghiệm thu khối lượng, hóa đơn, bàn giao, bảo hành
- **Nhiều đợt thanh toán** cho mỗi gói thầu
- **Quản lý phát sinh khối lượng** (variation orders)
- **Sản phẩm giao nộp** cho gói tư vấn (deliverables)
- Phân loại hồ sơ đính kèm theo danh mục pháp lý

### Quyết toán vốn
- Quyết toán niên độ ngân sách hàng năm (đối chiếu CĐT — KBNN)
- Quyết toán dự án hoàn thành (A-B)
- Tự động chọn phiên bản mẫu biểu theo ngày nộp hồ sơ (TT 96/2021 → TT 91/2025 → TT 73/2026)
- **Danh mục hồ sơ checklist** 6 mốc tự động cho mỗi gói thầu (23 mục)

### Dashboard & Báo cáo
- KPI tổng quan: tổng mức đầu tư, giải ngân, tỷ lệ hoàn thành
- Biểu đồ donut phân bổ chi phí, biểu đồ cột so sánh
- Timeline tiến độ các gói thầu
- Cảnh báo: hết hạn hợp đồng, hết hạn bảo hành, hạn nộp quyết toán
- **6 báo cáo** đồng bộ: so sánh chi phí, gói chưa HĐ, gói hoàn thành, bảo hành, quyết toán, hợp đồng & pháp lý
- **Xuất Excel** toàn bộ dữ liệu (4 sheet)

### Hệ thống
- **Phân quyền**: Admin / Guest (read-only)
- **Audit trail**: ghi log mọi thao tác tạo/sửa/xóa
- **Cấu hình động**: hạn mức, mẫu biểu, danh mục — chỉnh qua UI admin không cần sửa code
- **Danh mục văn bản pháp lý** tích hợp sẵn trong hệ thống
- **PWA**: cài đặt như app native trên mọi thiết bị

## Công nghệ

| Lớp | Công nghệ |
|-----|-----------|
| Frontend | Vanilla JavaScript (SPA), HTML5, CSS3 (Inter font, Material Symbols) |
| Backend | Node.js + Express |
| Database | SQLite (qua better-sqlite3) |
| Auth | Session-based, bcrypt hash |
| Export | SheetJS (xlsx) |
| Deploy | Docker + Cloudflare Tunnel (miễn phí) |

## Triển khai

### Yêu cầu

- [Docker Desktop](https://www.docker.com/products/docker-desktop)

### Cài đặt

```bash
git clone https://github.com/ththuan/quanlyduan.git
cd quanlyduan
docker compose up -d
```

> **Mặc định**: `http://localhost:3000` — Tài khoản `admin` / `admin123`

### Triển khai ra Internet (Cloudflare Tunnel miễn phí)

**1. Chuẩn bị domain trên Cloudflare**

- Thêm domain vào Cloudflare Dashboard (Free plan)
- Trỏ nameserver về Cloudflare

**2. Tạo tunnel (3 lệnh)**

```powershell
# Đăng nhập Cloudflare (mở link, chọn domain, Authorize)
docker run --rm -v "${PWD}/cloudflared:/home/nonroot/.cloudflared" cloudflare/cloudflared tunnel login

# Tạo tunnel
docker run --rm -v "${PWD}/cloudflared:/home/nonroot/.cloudflared" cloudflare/cloudflared tunnel create qlda

# Cấu hình DNS route
docker run --rm -v "${PWD}/cloudflared:/home/nonroot/.cloudflared" cloudflare/cloudflared tunnel route dns qlda ten-mien-cua-ban.com
```

**3. Cập nhật `cloudflared/config.yml`**

```yaml
tunnel: <tunnel-id>
credentials-file: /home/nonroot/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: ten-mien-cua-ban.com
    service: http://qlda:3000
  - service: http_status:404
```

**4. Cloudflare DNS**

Vào Cloudflare Dashboard → DNS → thêm CNAME:
```
Type: CNAME | Name: @ | Target: <tunnel-id>.cfargotunnel.com | Proxy: ON
```

**5. Chạy**

```bash
docker compose up -d
```

Truy cập `https://ten-mien-cua-ban.com` — HTTPS tự động, miễn phí trọn đời.

> **Chi phí**: 0đ/tháng — chỉ cần domain (~100k/năm) hoặc domain free tại [us.kg](https://register.us.kg).

## Cấu trúc dự án

```
quanlyduan/
├── index.html          # Giao diện chính (SPA)
├── login.html          # Trang đăng nhập
├── app.js              # Logic frontend (~4300 dòng)
├── style.css           # CSS toàn bộ ứng dụng
├── manifest.json       # PWA manifest
├── sw.js               # Service Worker (offline)
├── login.js            # Logic trang đăng nhập
├── logoCTEC.png        # Logo trường
├── docker-compose.yml  # Docker + Cloudflare Tunnel
├── Dockerfile          # Build Node.js image
├── cloudflared/        # Cấu hình Cloudflare Tunnel
│   ├── config.yml
│   ├── cert.pem
│   └── <tunnel-id>.json
└── server/
    ├── index.js        # Express backend + API
    ├── db.js           # SQLite database layer
    └── package.json
```

## CI/CD & Cập nhật

### Cập nhật thủ công

Khi sửa code trên máy local và muốn test ngay:

```powershell
.\dev.ps1     # Build & deploy local changes (không cần push GitHub)
```

Khi đã push lên GitHub và muốn đồng bộ về máy chạy:

```powershell
.\deploy.ps1  # git pull → build → deploy
```

### Tự động cập nhật (Windows Task Scheduler)

Chạy **1 lần** với PowerShell Administrator để máy tự check GitHub mỗi 30 phút:

```powershell
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-File D:\QLDA\deploy.ps1"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName "QLDA Auto Deploy" -Action $action -Trigger $trigger -RunLevel Highest
```

> Mỗi lần push code lên GitHub, trong vòng 30 phút máy sẽ tự động pull + build + deploy. Không cần làm gì thêm.

### GitHub Actions

Mỗi lần push lên GitHub, workflow tự động build Docker image và kiểm tra syntax — đảm bảo code không bị lỗi trước khi deploy.

## License

Phát triển cho Trường Cao đẳng Kinh tế - Kỹ thuật Cần Thơ. © 2026.
