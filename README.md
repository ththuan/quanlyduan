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

### Thư viện pháp luật & chatbot
- Tab **Tra cứu luật**: đọc và tìm kiếm điều khoản trong các văn bản ở thư mục `phaply/` (Luật Đấu thầu, NĐ 214/2025, TT 79/2025, TT 134/2026, Luật Xây dựng, TT 36/2026/TT-BXD, NĐ 254/2025, NĐ 193/2026, TT 73/2026).
- Chatbot AI tự tra cứu kho văn bản trước khi trả lời và hiển thị nguồn (văn bản, Điều) dưới câu trả lời.
- Mục **Pháp lý** có lộ trình hình thành dự án / quy trình mua sắm, tự đối chiếu hồ sơ đã nhập, mỗi bước kèm căn cứ pháp lý.
- Cập nhật kho văn bản: chép PDF mới vào `phaply/`, khai báo trong `scripts/build-legal-kb.py`, chạy `pip install pypdf` rồi `python scripts/build-legal-kb.py` và commit `server/knowledge/legal-kb.json` (file PDF không đưa lên git).

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
| Database | SQLite (qua `node:sqlite`) |
| Auth | Session-based, scrypt hash |
| Export | SheetJS (xlsx) |
| Deploy | Docker + Cloudflare Tunnel (miễn phí) |

## Triển khai

### Yêu cầu
- Server Linux/Debian (hoặc Windows) đã cài Docker Engine + Docker Compose plugin.
- Repo private → cần Personal Access Token (PAT) của GitHub để clone (Settings → Developer settings → Personal access tokens → Tokens (classic), tick quyền `repo`).

### Cài đặt trên Debian/Linux (khuyến nghị cho self-host / home server)

**1. Clone repo**

```bash
cd ~
git clone https://<github-username>:<PAT>@github.com/ththuan/quanlyduan.git
cd quanlyduan
```

> Tạo PAT tại GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token, tick quyền `repo`.

**2. Tạo file `.env` (cổng host + API key riêng của server này)**

`docker-compose.yml` đã có sẵn trong repo, cổng host lấy từ biến `QLDA_PORT` (mặc định `3000` nếu không đặt) — không cần sửa `docker-compose.yml`:

```bash
cat > .env <<'EOF'
QLDA_PORT=8091
QLDA_BIND_IP=0.0.0.0
GEMINI_API_KEY=your_real_gemini_key_here
# Tùy chọn: mã hóa backup tự động tại chỗ (tạo bằng: openssl rand -base64 32)
BACKUP_ENCRYPTION_KEY=
EOF
```

> - Đổi `8091` nếu trùng cổng service khác đang chạy trên host (VD AdGuard mặc định dùng cổng `3000`).
> - Nếu chỉ truy cập qua Cloudflare Tunnel, đặt `QLDA_BIND_IP=127.0.0.1` để không mở cổng app trực tiếp ra LAN/Internet.
> - `GEMINI_API_KEY` tùy chọn, lấy tại aistudio.google.com/apikey.
> - File `.env` nằm trong `.gitignore` — deploy lại (`git pull`) sau này **không bao giờ ghi đè** cổng bạn đã chọn.


**3. (Tuỳ chọn) Chọn nhà cung cấp / model AI**

Mặc định dùng Google Gemini. Có thể đổi model hoặc chuyển sang API tương thích OpenAI (OpenAI, OpenRouter, gateway…) **chỉ bằng biến môi trường — không cần sửa code**:

```bash
# Vẫn Gemini, chỉ đổi model (khi Google deprecate):
echo "GEMINI_MODEL=gemini-3.6-flash" >> .env

# Hoặc chuyển sang API tương thích OpenAI:
cat >> .env <<'EOF'
AI_PROVIDER=openai
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
EOF

docker compose up -d qlda
```

> - `AI_PROVIDER`: `gemini` (mặc định) hoặc `openai`.
> - `AI_BASE_URL`: base URL nhà cung cấp (bao gồm `/v1`), ví dụ `https://openrouter.ai/api/v1`.
> - `AI_API_KEY`, `AI_MODEL`: khóa API và tên model.
> - Tương thích ngược: `GEMINI_API_KEY` / `GEMINI_MODEL` vẫn dùng được nếu không đặt `AI_*`.
> - Chatbot, lưu kho tri thức và tóm tắt văn bản đều dùng chung cấu hình này.

**3b. (Tuỳ chọn) Kết nối phần mềm Quản lý tài sản (QLTS)**

Thêm tài khoản dịch vụ QLTS vào `.env` để QLDA lấy danh mục loại tài sản, phòng/khoa và đồng bộ tài sản sang QLTS:

```bash
cat >> .env <<'EOF'
QLTS_API_URL=https://quanlytaisanctec.dpdns.org/api
QLTS_USERNAME=ten_dang_nhap_dich_vu
QLTS_PASSWORD=mat_khau_dich_vu
EOF
```

> - Tài khoản cần quyền tạo tài sản; nên tạo tài khoản riêng, không bật 2FA.
> - Nếu không cấu hình, QLDA vẫn chạy bình thường, chỉ ẩn/để trống phần liên kết QLTS.
> - Sau khi đổi `.env`, chạy `docker compose up -d qlda` để nạp lại biến môi trường.

**4. Build & chạy**
```bash
docker compose up -d --build
```

**5. Phục hồi dữ liệu thật (nếu có backup cũ)**

```bash
docker compose stop qlda
docker cp /đường/dẫn/qlda.sqlite qlda:/app/server/data/qlda.sqlite
docker cp /đường/dẫn/uploads/. qlda:/app/server/uploads/
docker compose start qlda
docker exec -u 0 qlda chown -R qlda:qlda /app/server/data /app/server/uploads
docker compose restart qlda
```

**6. Lấy / đặt lại mật khẩu admin**

Mật khẩu admin đầu tiên là **ngẫu nhiên**, được ghi vào file trong volume dữ liệu (không ghi ra log):
```bash
docker exec -it qlda cat /app/server/data/initial-admin-password.txt
docker exec -it qlda rm /app/server/data/initial-admin-password.txt   # xóa sau khi đã đổi mật khẩu
```
> Có thể đặt mật khẩu admin ngay từ lần chạy đầu bằng biến `QLDA_ADMIN_PASSWORD` trong `.env`.

Nếu bỏ lỡ, đặt lại trực tiếp bằng mật khẩu mạnh do bạn tự sinh (tránh gõ dấu `!` trực tiếp vào bash vì sẽ bị history expansion):
```bash
NEW_PW='thay-bang-mat-khau-manh-toi-thieu-12-ky-tu'
docker exec -e NEW_PW="$NEW_PW" -it qlda node -e "
const db = require('./server/db');
const user = db.getUserByUsername('admin');
if (user) {
  db.updateUserPassword(user.id, process.env.NEW_PW);
  console.log('Da dat lai mat khau cho user:', user.username);
} else {
  console.log('Khong tim thay user admin');
}
"
```

> **Mặc định**: `http://<ip-server>:8091`

**7. Nạp dự án mẫu D,E (Khu giảng đường dãy D,E) vào app đang chạy**

App tự nạp dự án D,E khi database còn rỗng (lần chạy đầu). Nếu muốn bổ sung/cập nhật dự án D,E (đầy đủ 35 gói thầu theo file `TONG HOP DU AN.xlsx`) vào dữ liệu hiện có **mà không xóa dự án khác**, gọi API (chỉ admin):

```bash
# Đăng nhập và lưu cookie phiên (cookie access/refresh là HttpOnly)
curl -c qlda-cookies.txt -X POST http://localhost:8091/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"mat-khau-cua-ban"}'

# Lấy CSRF token (cookie này không HttpOnly) rồi gọi API
CSRF=$(awk '$6=="qlda_csrf"{print $7}' qlda-cookies.txt)
curl -b qlda-cookies.txt -X POST http://localhost:8091/api/admin/import-seed \
  -H "X-CSRF-Token: $CSRF"
# -> {"ok":true,"created":0,"updated":1,"totalProjects":1}
```

Hoặc chạy trong Console của trình duyệt khi đang đăng nhập (admin):
```js
const csrf = (document.cookie.match(/qlda_csrf=([^;]+)/) || [])[1] || '';
fetch('/api/admin/import-seed', { method:'POST', headers:{ 'X-CSRF-Token': csrf } }).then(r=>r.json()).then(console.log);
```

> Dự án cùng `id` (vd `proj-day-de`) sẽ được cập nhật đầy đủ theo dữ liệu mẫu; các dự án khác giữ nguyên.

**8. Nhập nhanh nhiều dự án từ Excel**

Trong app, đăng nhập bằng tài khoản **admin**, bấm nút **Nhập dự án từ Excel** (biểu tượng `upload_file` trên thanh công cụ) và chọn file `.xlsx` theo mẫu **"TÌNH HÌNH THỰC HIỆN DỰ ÁN"** (giống file `TONG HOP DU AN.xlsx`). App tự tạo dự án kèm danh mục (I–VI) và toàn bộ gói thầu. Làm lần lượt từng file cho mỗi dự án.

### Cài đặt bằng Docker Desktop (Windows/Mac, dev/test nhanh)

```bash
git clone https://github.com/ththuan/quanlyduan.git
cd quanlyduan
docker compose up -d
```
> Mặc định: `http://localhost:3000`

### Triển khai ra Internet (Cloudflare Tunnel miễn phí)

**1. Chuẩn bị domain trên Cloudflare**
- Thêm domain vào Cloudflare Dashboard (Free plan)
- Trỏ nameserver về Cloudflare

**2. Tạo tunnel**
```bash
mkdir -p cloudflared
sudo chown -R 65532:65532 cloudflared

# Đăng nhập Cloudflare (mở link in ra, chọn domain, Authorize)
docker run --rm -it -v "$(pwd)/cloudflared:/home/nonroot/.cloudflared" cloudflare/cloudflared tunnel login

# Tạo tunnel
docker run --rm -v "$(pwd)/cloudflared:/home/nonroot/.cloudflared" cloudflare/cloudflared tunnel create qlda
# → ghi lại <tunnel-id> in ra

# Cấu hình DNS route
docker run --rm -v "$(pwd)/cloudflared:/home/nonroot/.cloudflared" cloudflare/cloudflared tunnel route dns qlda ten-mien-cua-ban.com
```

**3. Tạo `cloudflared/config.yml`**
```yaml
tunnel: <tunnel-id>
credentials-file: /home/nonroot/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: ten-mien-cua-ban.com
    service: http://qlda:3000
  - service: http_status:404
```

**4. Chạy**
```bash
docker compose up -d
docker compose logs -f cloudflared
```
Log kỳ vọng thấy `Registered tunnel connection` (×4) nghĩa là tunnel hoạt động. Truy cập `https://ten-mien-cua-ban.com` — HTTPS tự động, miễn phí trọn đời.

> **Chi phí**: 0đ/tháng — chỉ cần domain (~100k/năm) hoặc domain free tại [us.kg](https://register.us.kg).

## Cấu trúc dự án

```
quanlyduan/
├── index.html          # Giao diện chính (SPA)
├── login.html          # Trang đăng nhập
├── app.js              # Logic frontend (~4300 dòng)
├── motion.js           # Lớp animation (CSS + Web Animations API)
├── motion-ui.js        # Select/combobox, tooltip, bottom sheet có animation
├── style.css           # CSS toàn bộ ứng dụng
├── manifest.json       # PWA manifest
├── sw.js               # Service Worker (offline)
├── login.js            # Logic trang đăng nhập
├── login-particles.js  # Hiệu ứng nền trang đăng nhập
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

> **Lưu ý:** Push code lên GitHub **không tự động cập nhật** bất kỳ server nào đang chạy — mỗi server dùng snapshot Docker image build tại thời điểm build. Cần chủ động đồng bộ theo hướng dẫn dưới đây tuỳ hệ điều hành.

### File cấu hình riêng của server (không bao giờ bị `git pull`/`reset --hard` ghi đè)

Các file dưới đây nằm trong `.gitignore` — chỉ tồn tại local trên từng server, sửa code và deploy lại **không ảnh hưởng** tới chúng:

| File | Vai trò |
|---|---|
| `.env` | Chứa `QLDA_PORT` (đổi cổng host nếu trùng service khác như AdGuard), `GEMINI_API_KEY` và `GEMINI_MODEL` |
| `cloudflared/config.yml` | Tunnel-id + hostname riêng của server (copy từ `cloudflared/config.yml.example`) |
| `cloudflared/*.json`, `cloudflared/cert.pem` | Credentials tunnel Cloudflare riêng, không được commit |
| `server/data/`, `server/uploads/` | Dữ liệu thật (SQLite + file đính kèm), qua Docker volume |

> Nếu server báo lỗi `port is already allocated` hoặc `Tunnel credentials file ... doesn't exist` sau khi deploy — nguyên nhân **không phải do code mới**, mà do 1 trong các file trên bị thiếu/sai, hãy kiểm tra lại chứ đừng nghi code.
>
> **Model AI bị deprecate** (VD "model X no longer available") — **không cần sửa code**, chỉ cần thêm/sửa dòng `GEMINI_MODEL=ten-model-moi` trong `.env` trên server rồi `docker compose up -d qlda` (không cần build lại vì chỉ đổi biến môi trường).

### Cập nhật thủ công (Windows)

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

### Cập nhật thủ công / tự động (Debian/Linux)

Script `deploy.sh` đã có sẵn trong repo. Chạy thủ công:
```bash
chmod +x deploy.sh   # chỉ cần lần đầu
./deploy.sh
```
> Script tự `cd` về thư mục repo, `git pull --ff-only origin master`, build và khởi động lại service `qlda`. Có thể đổi branch bằng biến `DEPLOY_BRANCH=ten-branch ./deploy.sh`.

Tự động hoá bằng cron (kiểm tra mỗi 30 phút):
```bash
(crontab -l 2>/dev/null; echo "*/30 * * * * ~/quanlyduan/deploy.sh >> ~/quanlyduan/deploy.log 2>&1") | crontab -
```

### GitHub Actions

Mỗi lần push lên GitHub, workflow tự động build Docker image và kiểm tra syntax — đảm bảo code không bị lỗi trước khi deploy.

## Xử lý sự cố thường gặp (Debian/Docker)

| Lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| `could not read Username` khi build | Repo private, build bằng git URL trực tiếp | Dùng `context: .` sau khi `git clone` bằng PAT |
| `open Dockerfile: no such file` | Chạy `docker compose` sai thư mục / clone thất bại | Luôn `cd` đúng vào thư mục repo trước khi chạy |
| `port is already allocated` | Trùng cổng với service khác (VD AdGuard) | Đổi cổng host trong `ports:` |
| App không phản hồi dù build OK | `PORT` env không khớp port mapping | Đảm bảo `PORT=` khớp vế phải mapping |
| `Tunnel credentials file ... doesn't exist` | Dùng lại config/tunnel-id có sẵn trong repo (của người khác) | Tự tạo tunnel riêng bằng tài khoản Cloudflare của bạn |
| `SyntaxError: Unexpected identifier` khi chạy `node -e` có dấu `!` | Bash history expansion | Viết lại logic không dùng `!`, hoặc `set +H` trước khi chạy |
| Dữ liệu hiển thị là demo, không phải dữ liệu thật | Volume Docker mới, database rỗng, tự seed dữ liệu mẫu | Restore `qlda.sqlite` + `uploads/` thật bằng `docker cp` |
| Lỗi model AI "no longer available" | Google đổi/khai tử model Gemini theo thời gian | Sửa `GEMINI_MODEL=` trong `.env` rồi `docker compose up -d qlda` (không cần build lại) |

## License

Phát triển cho Trường Cao đẳng Kinh tế - Kỹ thuật Cần Thơ. © 2026.
