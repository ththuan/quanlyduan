# Phần mềm Quản lý Dự án Đầu tư Xây dựng

> **Trường Cao đẳng Kinh tế - Kỹ thuật Cần Thơ (CTEC)**

Ứng dụng web quản lý dự án đầu tư xây dựng và mua sắm tài sản: theo dõi dự án, gói thầu, hợp đồng, tiến độ, giải ngân, nghiệm thu, bảo hành, quyết toán; tra cứu văn bản pháp luật và hỏi đáp bằng AI. Giao diện PWA hỗ trợ cài đặt và cache tài nguyên tĩnh; triển khai bằng Docker và có thể public qua Cloudflare Tunnel.

---

## Mục lục

- [Tính năng](#tính-năng)
- [Công nghệ](#công-nghệ)
- [Cài đặt nhanh](#cài-đặt-nhanh)
- [Cấu hình môi trường](#cấu-hình-môi-trường)
- [Sao lưu & phục hồi](#sao-lưu--phục-hồi)
- [Nhập dữ liệu](#nhập-dữ-liệu)
- [Cập nhật kho pháp luật](#cập-nhật-kho-pháp-luật)
- [Triển khai Internet](#triển-khai-internet)
- [Cập nhật & CI/CD](#cập-nhật--cicd)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [API chính](#api-chính)
- [Bảo mật](#bảo-mật)
- [Xử lý sự cố](#xử-lý-sự-cố)
- [Giấy phép](#giấy-phép)

---

## Tính năng

### 1. Tổng quan & cảnh báo
- KPI: tổng mức đầu tư, giá trị hợp đồng, lũy kế giải ngân, giá trị nghiệm thu.
- Biểu đồ donut phân bổ dự toán và tiến độ giải ngân theo từng gói thầu.
- Tổng hợp trạng thái gói thầu, timeline các mốc sắp đến.
- Cảnh báo tự động: hợp đồng sắp hết hạn, bảo hành sắp hết hạn, hạn nộp quyết toán, hồ sơ còn thiếu.

### 2. Dự án & công trình
- Thông tin dự án: mã, tên, chủ đầu tư, mã số thuế, địa điểm, nhóm dự án, nguồn vốn, tổng mức đầu tư, kế hoạch vốn.
- Phân tách phạm vi **Xây dựng** và **Mua sắm / sửa chữa thường xuyên**.
- Danh mục công trình, giấy phép xây dựng, trạng thái BCNCKT/thẩm định/BIM.
- Quản lý nhiều dự án, chuyển dự án nhanh trên thanh công cụ.

### 3. Gói thầu & hợp đồng
- **5 loại gói**: Xây lắp, Tư vấn, Hàng hóa, Hỗn hợp, Phi tư vấn; form tự hiển thị trường theo loại gói.
- Thông tin hợp đồng, nhà thầu, giá trúng thầu, thời gian thực hiện, phụ lục hợp đồng.
- Tiến độ, mốc công việc, nghiệm thu hồ sơ, nghiệm thu khối lượng, bàn giao, bảo hành.
- **Nhiều đợt thanh toán**, hóa đơn GTGT, chứng từ XML.
- **Phát sinh khối lượng** (variation orders) và giá trị hợp đồng hiện hành.
- **Sản phẩm giao nộp** cho gói tư vấn.
- Checklist hồ sơ theo mốc và phân loại tài liệu đính kèm.

### 4. Quyết toán vốn
- Quyết toán niên độ ngân sách hằng năm (đối chiếu CĐT — KBNN).
- Quyết toán dự án hoàn thành (A-B).
- Tự chọn phiên bản mẫu biểu theo ngày nộp hồ sơ (TT 96/2021 → TT 91/2025 → TT 73/2026).
- Danh mục hồ sơ/checklist quyết toán theo từng gói thầu.
- In báo cáo quyết toán, bảo hành và xuất dữ liệu phục vụ lưu trữ.

### 5. Tài sản & đồng bộ QLTS
- Danh mục tài sản theo dự án/gói thầu, đơn vị tính, số lượng, nguyên giá, nơi sử dụng, năm đưa vào sử dụng.
- Nhập tài sản từ Excel, in/PDF, xuất Word.
- Lấy danh mục phòng/khoa và loại tài sản từ phần mềm **QLTS**.
- Đồng bộ tài sản sang QLTS, phân bổ số lượng theo phòng/khoa, sinh mã tài sản.

### 6. Báo cáo & xuất dữ liệu
- Báo cáo tổng hợp tiến độ và giải ngân vốn đầu tư.
- So sánh chi phí theo danh mục; danh sách gói chưa có hợp đồng; gói đã hoàn thành.
- Báo cáo bảo hành, hợp đồng & pháp lý, tổng hợp giá trị hợp đồng/nghiệm thu.
- In trực tiếp trong app (thân thiện PWA/iPad), không mở popup.
- Xuất Excel 4 sheet: Dự án, Gói thầu, Thanh toán, Phát sinh.

### 7. Pháp lý & thư viện pháp luật
- Mục **Pháp lý**: lộ trình hình thành dự án/quy trình mua sắm, đối chiếu hồ sơ đã nhập, mỗi bước kèm căn cứ pháp lý.
- Thư viện văn bản: đọc toàn văn, tìm kiếm điều/khoản, lọc theo văn bản, xem hiệu lực.
- Hỏi đáp pháp luật bằng AI, câu trả lời kèm nguồn (văn bản, Điều/Khoản) bấm mở được.
- Kho tri thức tự học: lưu câu hỏi–đáp đã kiểm chứng, chờ admin duyệt trước khi dùng làm ngữ cảnh AI.

### 8. Trợ lý AI
- Chat trong app với ngữ cảnh dự án hiện tại: tiến độ, giải ngân, hồ sơ, rủi ro.
- Tra cứu kho pháp luật và kho tri thức trước khi trả lời; hiển thị nguồn tham chiếu.
- Lưu lịch sử hội thoại theo từng người dùng.
- Hỗ trợ Gemini hoặc API tương thích OpenAI (OpenAI, OpenRouter, gateway…), đổi model bằng biến môi trường.
- Giới hạn tần suất gọi AI theo người dùng để tránh lạm dụng chi phí.

### 9. Quy trình tham khảo
- Cây quy trình theo loại dự án/gói/hình thức lựa chọn nhà thầu.
- Ghi chú đăng tải, công khai theo NĐ 214/2025 và NĐ 349/2026.
- Chỉ admin truy cập.

### 10. Hệ thống
- Phân quyền **Admin** / **Guest** (chỉ đọc).
- Audit trail: ghi log tạo/sửa/xóa kèm người dùng và thời gian.
- Cấu hình động: hạn mức, danh mục, mẫu biểu, cơ quan ban hành… chỉnh qua UI admin.
- Nhập dự án/tài sản từ Excel; xuất báo cáo/Excel/Word.
- Quản lý file đính kèm: PDF, Word, Excel, ảnh, văn bản.
- Sao lưu tự động định kỳ, phục hồi từ file JSON hoặc bản tự động.
- PWA: cài như ứng dụng, có service worker và cache tài nguyên tĩnh.
- Giao diện có animation nhẹ, tự giảm chuyển động khi máy yếu hoặc phát hiện jank.

---

## Công nghệ

| Lớp | Công nghệ |
|---|---|
| Frontend | Vanilla JavaScript SPA, HTML5, CSS3, PWA, Web Animations API |
| Backend | Node.js 22+ (ESM-free CommonJS), Express 4 |
| Database | SQLite qua `node:sqlite` (built-in) |
| Auth | Cookie `HttpOnly` + CSRF token, scrypt, session server-side |
| File/PDF | Multer, PDF.js, SheetJS (xlsx) |
| AI | Gemini hoặc API tương thích OpenAI |
| Deploy | Docker, Docker Compose, Cloudflare Tunnel |
| CI | GitHub Actions build Docker + kiểm tra cú pháp |

---

## Cài đặt nhanh

### Yêu cầu
- Server Linux/Debian hoặc Windows có Docker Engine + Docker Compose plugin.
- Repo private: cần GitHub PAT có quyền `repo` khi clone.

### Clone

```bash
cd ~
git clone https://<github-username>:<PAT>@github.com/ththuan/quanlyduan.git
cd quanlyduan
```

### Tạo `.env`

```bash
cat > .env <<'EOF'
QLDA_PORT=8091
QLDA_BIND_IP=0.0.0.0
GEMINI_API_KEY=your_real_gemini_key_here
# Tùy chọn: đặt mật khẩu admin ngay lần chạy đầu (tối thiểu 10 ký tự)
# QLDA_ADMIN_PASSWORD=MatKhauManhCuaBan
# Tùy chọn: mã hóa backup tự động tại chỗ (openssl rand -base64 32)
# BACKUP_ENCRYPTION_KEY=
EOF
```

### Chạy

```bash
docker compose up -d --build
```

Mặc định: `http://<ip-server>:8091`.

### Lấy mật khẩu admin lần đầu

Mật khẩu admin được tạo ngẫu nhiên và lưu trong volume dữ liệu, **không ghi ra log**:

```bash
docker exec -it qlda cat /app/server/data/initial-admin-password.txt
docker exec -it qlda rm /app/server/data/initial-admin-password.txt
```

Sau khi đăng nhập, hệ thống bắt buộc đổi mật khẩu. Có thể đặt mật khẩu ngay từ đầu bằng `QLDA_ADMIN_PASSWORD`.

Nếu quên mật khẩu admin, đặt lại trực tiếp (dùng mật khẩu mạnh):

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

### Chạy trực tiếp khi phát triển (không Docker)

Yêu cầu Node.js **22.5+** (có `node:sqlite`):

```bash
cd server
npm install
node --watch index.js
```

Mở `http://localhost:3000`. Frontend là file tĩnh, không cần build.

---

## Cấu hình môi trường

Các biến đặt trong `.env` (không commit):

| Biến | Mặc định | Mô tả |
|---|---|---|
| `QLDA_PORT` | `3000` | Cổng host mapping ra ngoài |
| `QLDA_BIND_IP` | `0.0.0.0` | IP bind cổng host; đặt `127.0.0.1` nếu chỉ dùng Cloudflare Tunnel |
| `QLDA_ADMIN_PASSWORD` | ngẫu nhiên | Mật khẩu admin cho lần tạo DB đầu tiên |
| `QLDA_DATA_DIR` | `server/data` | Thư mục dữ liệu SQLite/backup (Docker dùng volume) |
| `QLDA_UPLOADS_DIR` | `server/uploads` | Thư mục file đính kèm (Docker dùng volume) |
| `BACKUP_INTERVAL_HOURS` | `6` | Chu kỳ sao lưu tự động |
| `BACKUP_ENCRYPTION_KEY` | trống | Khóa AES-256-GCM dạng base64 32 byte để mã hóa backup |
| `BACKUP_MAX_ATTACHMENT_BYTES` | `268435456` (256MB) | Giới hạn tổng dung lượng file đính kèm trong một backup |
| `AI_PROVIDER` | `gemini` | `gemini` hoặc `openai` |
| `AI_API_KEY` / `AI_MODEL` | — | Khóa và model AI |
| `AI_BASE_URL` | — | Base URL API tương thích OpenAI (gồm `/v1`) |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | — | Tương thích ngược cho Gemini |
| `QLTS_API_URL` | `https://quanlytaisanctec.dpdns.org/api` | API QLTS |
| `QLTS_USERNAME` / `QLTS_PASSWORD` | — | Tài khoản dịch vụ QLTS (không bật 2FA) |
| `HTTPS_PFX` / `HTTPS_PFX_PASSPHRASE` | — | Chạy HTTPS bằng file PFX (tuỳ chọn) |
| `HTTPS_CERT` / `HTTPS_KEY` | — | Chạy HTTPS bằng PEM (tuỳ chọn) |

### Chuyển nhà cung cấp AI

```bash
cat >> .env <<'EOF'
AI_PROVIDER=openai
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
EOF
docker compose up -d qlda
```

> Chatbot, lưu kho tri thức và tóm tắt văn bản dùng chung cấu hình AI.

### Kết nối QLTS

```bash
cat >> .env <<'EOF'
QLTS_API_URL=https://quanlytaisanctec.dpdns.org/api
QLTS_USERNAME=ten_dang_nhap_dich_vu
QLTS_PASSWORD=mat_khau_dich_vu
EOF
docker compose up -d qlda
```

Không cấu hình QLTS thì app vẫn chạy bình thường; phần đồng bộ tài sản sẽ trống/ẩn.

---

## Sao lưu & phục hồi

### Sao lưu tự động
- Chạy mỗi `BACKUP_INTERVAL_HOURS` giờ, giữ bản gần nhất trong `server/data/backups`.
- Nếu đặt `BACKUP_ENCRYPTION_KEY`, file có dạng `backup-*.json.enc` (AES-256-GCM).
- Nếu tổng file đính kèm vượt giới hạn, backup ghi `skippedPdfs` và bỏ qua phần vượt để tránh OOM.

Tạo khóa mã hóa:

```bash
openssl rand -base64 32
```

> **Quan trọng:** mất `BACKUP_ENCRYPTION_KEY` thì không thể phục hồi backup `.enc`.

### Tải backup thủ công
Trong app: admin → **Sao lưu & Phục hồi** → tải file JSON.
Hoặc API:

```bash
curl -c cookies.txt -X POST http://localhost:8091/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"mat-khau"}'
CSRF=$(awk '$6=="qlda_csrf"{print $7}' cookies.txt)
curl -b cookies.txt -o QLDA_Backup.json http://localhost:8091/api/backup
```

### Phục hồi dữ liệu thật
Khi chuyển server hoặc khôi phục từ file SQLite/uploads cũ:

```bash
docker compose stop qlda
docker cp /duong/dan/qlda.sqlite qlda:/app/server/data/qlda.sqlite
docker cp /duong/dan/uploads/. qlda:/app/server/uploads/
docker compose start qlda

# Nếu file do root sở hữu, chown bằng container tạm (volume đang gắn vào qlda)
UID_Q=$(docker run --rm qlda id -u)
GID_Q=$(docker run --rm qlda id -g)
docker run --rm --volumes-from qlda -e UID_Q="$UID_Q" -e GID_Q="$GID_Q" \
  alpine sh -c 'chown -R "$UID_Q:$GID_Q" /app/server/data /app/server/uploads'
docker compose restart qlda
```

> Container chạy `read_only` + `cap_drop: ALL`; chỉ volume dữ liệu/uploads được ghi. Không ghi file vào thư mục app.

Khôi phục từ backup tự động: admin → **Sao lưu & Phục hồi** → chọn bản gần nhất. File `.enc` cần đúng `BACKUP_ENCRYPTION_KEY`.

---

## Nhập dữ liệu

### Nhập dự án từ Excel
1. Đăng nhập admin.
2. Bấm **Nhập dự án từ Excel** (`upload_file`).
3. Chọn file `.xlsx` theo mẫu **“TÌNH HÌNH THỰC HIỆN DỰ ÁN”** (giống `TONG HOP DU AN.xlsx`).
4. App tự tạo dự án, danh mục I–VI và toàn bộ gói thầu. Làm lần lượt từng file cho mỗi dự án.

### Nhập tài sản từ Excel
- Vào **Tài sản** → **Nhập Excel**, tải file mẫu ngay trong modal.
- Dữ liệu phân cấp: dòng A/B/C = dự án, I/II = gói thầu, dòng STT = tài sản.

### Nạp dự án mẫu D,E
App tự nạp khi database rỗng. Nếu muốn cập nhật dự án D,E vào dữ liệu đang có mà không xóa dự án khác:

```bash
curl -c cookies.txt -X POST http://localhost:8091/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"mat-khau"}'
CSRF=$(awk '$6=="qlda_csrf"{print $7}' cookies.txt)
curl -b cookies.txt -X POST http://localhost:8091/api/admin/import-seed \
  -H "X-CSRF-Token: $CSRF"
```

Trong Console trình duyệt (đang đăng nhập admin):

```js
const csrf = (document.cookie.match(/qlda_csrf=([^;]+)/) || [])[1] || '';
fetch('/api/admin/import-seed', { method: 'POST', headers: { 'X-CSRF-Token': csrf } })
  .then(r => r.json()).then(console.log);
```

---

## Cập nhật kho pháp luật

Kho pháp luật được build từ các file trong `phaply/`:

1. Chép PDF/DOC/DOCX mới vào `phaply/`.
2. Khai báo file trong `scripts/build-legal-kb.py`.
3. Chạy:

```bash
pip install pypdf
python scripts/build-legal-kb.py
```

4. Commit `server/knowledge/legal-kb.json` (không commit file PDF gốc — đã nằm trong `.gitignore`).
5. Deploy lại app.

---

## Triển khai Internet (Cloudflare Tunnel)

### 1. Chuẩn bị domain
- Thêm domain vào Cloudflare Dashboard (Free plan), trỏ nameserver về Cloudflare.

### 2. Tạo tunnel

```bash
mkdir -p cloudflared
sudo chown -R 65532:65532 cloudflared
docker run --rm -it -v "$(pwd)/cloudflared:/home/nonroot/.cloudflared" cloudflare/cloudflared tunnel login
docker run --rm -v "$(pwd)/cloudflared:/home/nonroot/.cloudflared" cloudflare/cloudflared tunnel create qlda
docker run --rm -v "$(pwd)/cloudflared:/home/nonroot/.cloudflared" cloudflare/cloudflared tunnel route dns qlda ten-mien-cua-ban.com
```

### 3. Tạo `cloudflared/config.yml`

```yaml
tunnel: <tunnel-id>
credentials-file: /home/nonroot/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: ten-mien-cua-ban.com
    service: http://qlda:3000
  - service: http_status:404
```

### 4. Chạy

```bash
docker compose up -d
docker compose logs -f cloudflared
```

Thấy `Registered tunnel connection` là tunnel hoạt động. Truy cập `https://ten-mien-cua-ban.com` — HTTPS tự động, miễn phí.

> Nên đặt `QLDA_BIND_IP=127.0.0.1` để không mở cổng app trực tiếp ra Internet.

---

## Cập nhật & CI/CD

> Push code lên GitHub **không tự động cập nhật** server đang chạy. Mỗi server dùng image build tại thời điểm deploy.

### Debian/Linux

```bash
chmod +x deploy.sh   # lần đầu
./deploy.sh
```

Script tự `git pull --ff-only`, build và khởi động lại `qlda`. Đổi branch:

```bash
DEPLOY_BRANCH=ten-branch ./deploy.sh
```

Tự động mỗi 30 phút:

```bash
(crontab -l 2>/dev/null; echo "*/30 * * * * ~/quanlyduan/deploy.sh >> ~/quanlyduan/deploy.log 2>&1") | crontab -
```

### Windows

```powershell
.\dev.ps1     # build & deploy code local
.\deploy.ps1  # git pull → build → deploy
```

Tự động bằng Task Scheduler (PowerShell Administrator):

```powershell
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-File D:\QLDA\deploy.ps1"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName "QLDA Auto Deploy" -Action $action -Trigger $trigger -RunLevel Highest
```

### GitHub Actions
`.github/workflows/build.yml` build Docker image và chạy `node --check` cho `app.js` + `server/index.js` mỗi lần push `master`.

### File cấu hình riêng của server

Các file sau nằm trong `.gitignore`, không bị `git pull` ghi đè:

| File | Vai trò |
|---|---|
| `.env` | Cổng, bind IP, khóa AI, QLTS, backup key |
| `cloudflared/config.yml`, `cloudflared/*.json`, `cert.pem` | Cấu hình/credentials tunnel |
| `server/data/`, `server/uploads/` | SQLite, backup, file đính kèm (Docker volume) |

---

## Cấu trúc dự án

```text
quanlyduan/
├── index.html              # SPA chính
├── login.html              # Trang đăng nhập
├── app.js                  # Logic frontend
├── motion.js               # Animation CSS + Web Animations API
├── motion-ui.js            # Select/combobox, tooltip, bottom sheet
├── legal-ui.js             # UI thư viện pháp luật/hỏi đáp
├── wiki-ui.js              # UI kho tri thức (nếu bật)
├── workflow-catalog.js     # Dữ liệu quy trình
├── workflow-ui.js          # UI cây quy trình
├── templates-ui.js         # Module mẫu biểu (mở rộng)
├── style.css               # CSS toàn bộ ứng dụng
├── login.js                # Logic đăng nhập
├── login-particles.js      # Hiệu ứng nền trang đăng nhập
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
├── logoCTEC.png
├── Dockerfile
├── docker-compose.yml
├── deploy.sh               # Deploy Debian/Linux
├── deploy.ps1 / dev.ps1    # Deploy Windows
├── webhook.js              # Webhook deploy GitHub (tuỳ chọn)
├── Caddyfile               # Reverse proxy mẫu (tuỳ chọn)
├── assets/                 # Font, icon, PDF.js, file mẫu Excel
├── templates/              # Mẫu biểu Word/Excel
├── phaply/                 # PDF/DOC nguồn pháp luật (không commit)
├── scripts/                # Script build kho pháp luật
├── .github/workflows/      # CI build Docker
└── server/
    ├── index.js            # Express API + static server
    ├── db.js               # SQLite, user/session/config
    ├── seed-data.js        # Dữ liệu dự án mẫu
    ├── asset-seed-data.js  # Dữ liệu tài sản mẫu
    ├── excel-import.js     # Nhập dự án từ Excel
    ├── asset-import.js     # Nhập tài sản từ Excel
    ├── legal.js            # Tìm kiếm/BM25 kho pháp luật
    ├── legal-wiki.js       # Kho tri thức tự học
    ├── ai-client.js        # Gemini/OpenAI-compatible client
    ├── qltk.js             # Kết nối QLTS
    ├── knowledge/          # legal-kb.json
    └── package.json
```

---

## API chính

Tất cả API (trừ `/api/health`, `/api/login`, `/api/refresh`) yêu cầu xác thực. Trình duyệt dùng cookie `HttpOnly`; script/API có thể dùng `Authorization: Bearer <accessToken>`. Các thao tác ghi cần header `X-CSRF-Token` khi dùng cookie.

| Nhóm | Endpoint |
|---|---|
| Auth | `POST /api/login`, `POST /api/logout`, `POST /api/refresh`, `GET /api/me` |
| Người dùng | `GET/POST /api/users`, `PUT /api/users/:id/password`, `DELETE /api/users/:id` |
| Dự án | `GET/PUT /api/state`, `PUT /api/projects/:projectId/assets/:assetId` |
| File | `POST /api/pdfs`, `GET/DELETE /api/pdfs/:id` |
| Sao lưu | `GET /api/backup`, `POST /api/restore`, `GET /api/backups`, `POST /api/backups/:filename/restore` |
| Nhập admin | `POST /api/admin/import-seed`, `POST /api/admin/import-project-excel`, `GET /api/admin/import-asset-template`, `POST /api/admin/preview-asset-excel`, `POST /api/admin/import-asset-excel` |
| QLTS | `GET /api/qltk/options`, `POST /api/qltk/sync-assets` |
| Pháp luật | `GET /api/legal/docs`, `/api/legal/doc/:id`, `/api/legal/doc/:id/full`, `/api/legal/article`, `/api/legal/search` |
| Wiki | `GET /api/wiki/entries`, `/api/wiki/stats`, `/api/wiki/graph`, `POST /api/wiki/entries/:id/approve`, `DELETE /api/wiki/entries/:id`, `POST /api/wiki/learn`, `POST /api/wiki/ingest` |
| AI | `GET/POST/DELETE /api/ai/history`, `POST /api/ai/chat` |
| Cấu hình/Export | `GET/PUT /api/config`, `GET /api/export/excel` |

---

## Bảo mật

- **Xác thực**: cookie `qlda_at`/`qlda_rt` là `HttpOnly`, `SameSite=Lax`, thêm `Secure` khi HTTPS; CSRF token `qlda_csrf` cho request ghi.
- **Mật khẩu**: scrypt + salt, tối thiểu 10 ký tự, khóa tạm sau 5 lần sai, không tiết lộ tài khoản có tồn tại.
- **Phiên**: access token 30 phút, refresh 7 ngày, tuyệt đối 30 ngày; phát hiện refresh token bị dùng lại và thu hồi phiên; đổi mật khẩu thu hồi toàn bộ phiên.
- **Phân quyền**: admin-only cho cấu hình, backup/restore, import, duyệt/xóa kho tri thức, đồng bộ QLTS; guest chỉ đọc.
- **XSS**: escape dữ liệu khi render; CSP chặn script inline mới (`script-src-elem`), không dùng `unsafe-eval`; vẫn còn inline event handler cho tương thích UI.
- **Upload**: giới hạn 50MB, whitelist phần mở rộng, kiểm tra magic-byte; file không phải PDF/ảnh tải về dạng `attachment`.
- **DoS/chi phí**: giới hạn body request (mặc định 256KB, route import/restore lớn hơn sau khi xác thực), rate-limit login/AI, timeout AI 60s, ingest có khóa chống chạy trùng.
- **Backup**: tùy chọn mã hóa AES-256-GCM at-rest; giới hạn tổng dung lượng file đính kèm.
- **Container**: chạy non-root, `read_only`, `tmpfs /tmp`, `cap_drop: ALL`, `no-new-privileges`, giới hạn PID.
- **Vận hành**: không commit `.env`; đặt `QLDA_BIND_IP=127.0.0.1` nếu chỉ dùng tunnel; dùng HTTPS để cookie `Secure`/HSTS hoạt động.

---

## Xử lý sự cố

| Lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| `port is already allocated` | Trùng cổng host | Đổi `QLDA_PORT` trong `.env` |
| `Tunnel credentials file ... doesn't exist` | Thiếu/sai `cloudflared/config.yml` hoặc credentials | Tạo tunnel riêng, kiểm tra `cloudflared/` |
| App không phản hồi dù build OK | `PORT`/mapping sai | Đảm bảo `QLDA_PORT` khớp mapping; app luôn listen `3000` trong container |
| `403 CSRF token không hợp lệ` | Thiếu header `X-CSRF-Token` hoặc cookie hết hạn | Đăng nhập lại; dùng đúng cookie/CSRF khi gọi API |
| Cookie không được lưu | Truy cập HTTP nhưng cookie `Secure`, hoặc proxy thiếu `X-Forwarded-Proto` | Dùng HTTPS/Cloudflare Tunnel; kiểm tra proxy |
| `401` liên tục | Access token hết hạn và refresh thất bại | Đăng nhập lại; kiểm tra cookie `qlda_rt` |
| `413 Payload Too Large` | Body vượt giới hạn | Giảm kích thước file/JSON; import/restore dùng route riêng |
| Không restore được backup `.enc` | Thiếu/sai `BACKUP_ENCRYPTION_KEY` | Dùng đúng key đã tạo backup |
| Lỗi permission sau restore | File do root sở hữu | Chạy lệnh `chown` bằng container alpine ở mục phục hồi |
| `read-only file system` | Ghi ra ngoài volume | Chỉ ghi vào `server/data`, `server/uploads` hoặc `/tmp` |
| Dữ liệu là demo | Volume mới, DB rỗng, tự seed | Restore `qlda.sqlite` + `uploads/` thật |
| Lỗi model AI "no longer available" | Model bị khai tử | Sửa `GEMINI_MODEL`/`AI_MODEL` trong `.env`, `docker compose up -d qlda` |
| Quên mật khẩu admin | — | Dùng lệnh `db.updateUserPassword` trong README hoặc xóa volume nếu chấp nhận mất dữ liệu |

---

## Giấy phép

Phát triển cho Trường Cao đẳng Kinh tế - Kỹ thuật Cần Thơ. © 2026.
