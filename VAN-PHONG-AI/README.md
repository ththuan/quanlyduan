# Văn phòng AI Local

Văn phòng AI Local là trợ lý AI hỗ trợ xử lý công việc văn phòng trên máy local. Giao diện pixel art chỉ là lớp hiển thị sinh động; phần cốt lõi là hệ thống tiếp nhận yêu cầu, tra cứu tri thức, điều phối quy trình, tạo hồ sơ, nhắc việc và lưu vết quyết định.

## Mục tiêu

Người dùng đưa vào một yêu cầu bằng tiếng Việt, ví dụ:

> Căn cứ đề nghị của phòng A về việc nâng cấp hệ thống mạng, hãy phân tích nhu cầu và điền vào các biểu mẫu phù hợp.

Agent sẽ:

1. Chuẩn hóa yêu cầu và xác định loại hồ sơ.
2. Chọn skill và quy trình phù hợp.
3. Tra cứu tài liệu nội bộ, biểu mẫu và hồ sơ cũ.
4. Xác định dữ liệu đã có, dữ liệu còn thiếu và các giả định.
5. Tạo kế hoạch xử lý theo từng bước.
6. Điền bản nháp vào biểu mẫu, kèm bằng chứng và mức độ tin cậy.
7. Tạo công việc cho người dùng xác nhận.
8. Xuất bộ hồ sơ Word/PDF, lưu phiên bản và nhật ký xử lý.
9. Theo dõi các việc tiếp theo và nhắc khi đến hạn.

Agent không tự ký, tự phê duyệt, thanh toán, nghiệm thu, cấp quyền, xóa dữ liệu bên ngoài hay tự chọn nhà cung cấp cuối cùng.

## Kiến trúc tổng quan

```text
quy-trinh-thanh-toan.html
        |
        +-- Giao diện hồ sơ, tiến độ, Tủ tri thức và văn phòng pixel art
        |
        +-- van-phong-ai-local-server.js
                |
                +-- AI request/response và human confirmation gate
                +-- SQLite knowledge, memory, event, story và reminder
                +-- Tạo hồ sơ, version snapshot, Word/PDF và event log
                +-- office-life simulator đồng bộ trạng thái văn phòng
                +-- ai-agent-skills.js định tuyến skill có giới hạn
                +-- openwork-capabilities.js discovery/execution local
```

## Tính năng hiện có

### 1. Xử lý hồ sơ theo quy trình

- Nhận yêu cầu tự nhiên bằng tiếng Việt.
- Phân loại hồ sơ mua sắm, sửa chữa, thanh toán và các nhóm nghiệp vụ liên quan.
- Theo dõi các bước, bàn giao và việc đang chờ người dùng.
- Lưu `events`, `revisionHistory`, skill đã dùng và lịch sử trao đổi.
- Tự động đặt `reviewRequired` khi thiếu dữ liệu, bằng chứng yếu hoặc rủi ro cao.
- Lưu thời điểm và người xác nhận trước khi cho phép bước tiếp theo.

### 2. Phân tích có bằng chứng

Kết quả AI có các trường chính:

- `confidence`: mức độ tin cậy.
- `riskLevel`: mức rủi ro.
- `missing`: dữ liệu còn thiếu.
- `assumptions`: giả định đang sử dụng.
- `fieldEvidence`: bằng chứng theo từng trường.
- `reviewRequired`: có cần người dùng xem lại hay không.

Agent không được coi một suy đoán là sự thật. Nếu không có nguồn, phải ghi rõ không đủ bằng chứng.

### 3. Tủ tri thức và RAG local

Tủ tri thức lưu trên máy local và hỗ trợ TXT, Markdown, HTML, JSON, CSV, Word và PDF; đồng bộ `KHO-TRI-THUC`, `MAU` và hồ sơ đã tạo; tách tài liệu thành chunk và parent section; tìm kiếm FTS5, trích dẫn nguồn, cảnh báo tài liệu cũ, hỏi đáp nội bộ và lưu ký ức có kiểm soát.

### 4. Điền biểu mẫu và xuất hồ sơ

Mỗi yêu cầu có thể tạo thư mục trong `HO-SO-AI/` gồm báo cáo phân tích, bản nháp biểu mẫu, so sánh báo giá, ghi chú rủi ro, bản sao tài liệu, lịch sử trao đổi, snapshot `PHIEN-BAN-*`, `05-NHAT-KY-XU-LY-HO-SO.doc` và `05-NHAT-KY-XU-LY-HO-SO.pdf`. Tài liệu xuất ra luôn là bản nháp để người có trách nhiệm chỉnh sửa, đối chiếu và phát hành.

### 5. Skill runtime từ claude-skills

Thư mục `claude-skills/` là corpus tham khảo. Runtime chỉ nạp 5 skill đã được giới hạn trong `ai-agent-skills.js`:

| ID | Vai trò |
| --- | --- |
| `case-workflow` | Điều phối bước xử lý, bàn giao và human gate |
| `knowledge-retrieval` | Tra cứu, trích dẫn nguồn và kiểm soát độ tươi |
| `procurement-review` | So sánh báo giá, chi phí, nhà cung cấp và rủi ro |
| `decision-record` | Tạo biên bản/quyết định và yêu cầu xác nhận |
| `prompt-quality` | Kiểm tra schema, confidence, regression và rollback |

Mỗi skill có `triggers`, `can`, `cannot`, `output` và `policy`. Không nạp toàn bộ repository vào prompt để tránh mở rộng quyền ngầm.

### 6. OpenWork local capability adapter

Từ repo OpenWork đã clone trong `openwork/`, dự án chỉ áp dụng ý tưởng cốt lõi `search_capabilities`/`execute_capability` dưới dạng adapter local. Adapter nằm trong `openwork-capabilities.js` và không chạy desktop app, OpenWork Den, shell, browser automation hay connector cloud.

Capability gồm `knowledge.search`, `knowledge.ask`, `skills.list`, `reminders.list`, `reminders.create` và `dossier.create_draft`. Các capability ghi dữ liệu bắt buộc `confirm: true`.

```text
GET  /api/openwork/capabilities?query=bao%20gia
POST /api/openwork/capabilities/execute
{
  "name": "knowledge.search",
  "input": { "query": "báo giá thiết bị mạng", "limit": 10 }
}
```

Đây là lớp tương thích ý tưởng OpenWork, không phải ủy quyền cho agent tự thực hiện hành động ngoài hệ thống.

### 7. Nhắc việc và văn phòng pixel art

- Tạo, sửa, hoàn thành, kích hoạt, hủy và snooze lịch nhắc.
- Hỗ trợ thời gian đến hạn, múi giờ, recurrence, lead minutes và mức ưu tiên.
- Nhân vật di chuyển theo khung giờ làm việc, nghỉ trưa, cà phê, điện thoại, mạng xã hội và họp.
- Hoạt động văn phòng phát sinh từ trạng thái công việc, reminder và story hook.
- Dữ liệu simulation được đồng bộ qua server để không mất sau khi tải lại trang.
- Pixel art không thay thế workflow và không tự ý thực hiện side effect ngoài hệ thống.

## Quy trình sử dụng hằng ngày

### Khởi động

Mở `MO-VAN-PHONG-AI.cmd`. Launcher kiểm tra Node.js, `/api/status`, `/api/ai/skills` và yêu cầu đủ 5 skill runtime. Nếu phiên cũ thiếu skill, launcher khởi động lại server trên cổng 8765 rồi mở `http://127.0.0.1:8765/quy-trinh-thanh-toan.html#van-phong-ai`.

Khởi động thủ công:

```powershell
$env:AI_OFFICE_PORT='8765'
$env:AI_OFFICE_NO_OPEN='1'
node van-phong-ai-local-server.js
```

### Tạo và xử lý yêu cầu

1. Mở khu vực `HỒ SƠ` trong văn phòng.
2. Chọn giao việc cho AI.
3. Nhập yêu cầu, đơn vị đề nghị, số lượng, dự toán và nguồn kinh phí nếu biết.
4. Gửi cho agent.
5. Xem skill, confidence, risk, missing, assumptions và evidence.
6. Bổ sung dữ liệu nếu agent đặt human gate.
7. Xác nhận bước được phép thực hiện.
8. Mở tab hồ sơ để xem version, nhật ký, biểu mẫu và tải file.
9. Tạo reminder cho việc còn lại.

### Sử dụng Tủ tri thức và nhắc việc

Mở tủ `TRI THỨC`, thêm tài liệu hoặc đồng bộ hồ sơ. Đặt câu hỏi cụ thể và kiểm tra nguồn trong câu trả lời. Khi tài liệu không đủ hoặc hết hiệu lực, agent phải thông báo thay vì tự điền vào. Lịch nhắc có tiêu đề, thời điểm, mức ưu tiên, người nhắc và nội dung; người dùng có thể xác nhận, snooze hoặc đánh dấu hoàn thành.

## Cấu hình AI

Cấu hình local nằm trong `ai-config.local.json` và không nên commit/chia sẻ. Có thể dùng API tương thích OpenAI qua `Base URL`, Responses API hoặc Chat Completions. Nếu không có API, app vẫn chạy quy trình cơ bản và văn phòng pixel art; các tính năng sinh văn bản AI, hỏi đáp tri thức và phân tích nâng cao cần API hợp lệ.

```text
GET  /api/ai/config
POST /api/ai/test
```

## API chính

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| GET | `/api/status` | Trạng thái server và cấu hình AI công khai |
| GET | `/api/ai/skills` | Danh sách skill runtime đang bật |
| POST | `/api/ai/respond` | Phân tích/trả lời AI, tự động chọn skill |
| GET | `/api/openwork/capabilities` | Tìm capability local theo từ khóa |
| POST | `/api/openwork/capabilities/execute` | Gọi capability local theo tên chính xác, có confirmation gate |
| GET | `/api/knowledge/status` | Thống kê tài liệu, chunk, memory |
| POST | `/api/knowledge/documents` | Thêm tài liệu vào kho local |
| POST | `/api/knowledge/sync` | Đồng bộ các thư mục nguồn |
| GET | `/api/knowledge/search` | Tìm kiếm tài liệu |
| POST | `/api/knowledge/ask` | Hỏi đáp có trích dẫn nguồn |
| GET/POST | `/api/memory` | Đọc và lưu memory có kiểm soát |
| POST | `/api/reminders` | Tạo lịch nhắc |
| GET | `/api/reminders/notifications` | Lấy notification đang chờ |
| GET/POST | `/api/office-life` | Đọc và đồng bộ simulation |
| POST | `/api/dossiers` | Tạo bộ hồ sơ |
| POST | `/api/dossiers/report` | Xuất báo cáo hồ sơ |
| POST | `/api/dossiers/:id/interaction` | Lưu tương tác và phiên bản |

## Dữ liệu và bảo mật

- Dữ liệu tri thức, memory, reminder và office-life lưu trong SQLite local.
- API key chỉ nằm trong `ai-config.local.json`.
- Không đưa API key vào HTML, localStorage hay bộ hồ sơ xuất ra.
- Hồ sơ xuất ra có lịch sử và version để truy vết.
- Hành động có hậu quả phải qua human confirmation.
- Không coi giá trên web là báo giá chính thức.
- Cần đối chiếu quy định, thuế, vận chuyển, bảo hành và tài liệu gốc trước khi phát hành.

## Kiểm thử

```powershell
node --check ai-agent-skills.js
node --check van-phong-ai-local-server.js
node --check office-life-simulator.js
node --check openwork-capabilities.js
node test-ai-agent-contract.js
```

Kiểm tra runtime sau khi khởi động server:

```powershell
Invoke-WebRequest http://127.0.0.1:8765/api/status -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:8765/api/ai/skills -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:8765/api/openwork/capabilities -UseBasicParsing
```

`test-ai-agent-contract.js` kiểm tra schema confidence/risk/evidence, human gate, event history, version snapshot, event log, routing skill, capability adapter và governance instructions.

## Cấu trúc thư mục

```text
van-phong-ai-local-server.js  Server local và API
quy-trinh-thanh-toan.html     Giao diện nghiệp vụ + pixel office
office-life-simulator.js      Simulation nhân vật và hoạt động văn phòng
pixel-office-engine.js        Render/tương tác pixel art
pixel-world-engine.js         Va chạm, di chuyển và world state
office-narrative-catalog.js   Kho story và tình huống
ai-agent-skills.js            Runtime skill registry có giới hạn
ai-agent-skills.json          Metadata skill
openwork-capabilities.js      OpenWork capability adapter local
reminder-core.js              Giao diện lịch nhắc
test-ai-agent-contract.js     Contract test
KHO-TRI-THUC/                 Tài liệu tri thức nguồn
MAU/                          Biểu mẫu Word/PDF
HO-SO-AI/                     Hồ sơ và version đã tạo
claude-skills/                Corpus tham khảo upstream
openwork/                     Repo OpenWork tham khảo
```

## Nguyên tắc phát triển tiếp theo

1. Ưu tiên chất lượng workflow và bằng chứng trước khi thêm nhiều nhân vật.
2. Mỗi skill mới phải có trigger, quyền được phép, quyền bị cấm, output có cấu trúc, human gate và test case.
3. Mỗi thay đổi prompt phải có regression test và khả năng rollback.
4. Agent được học từ feedback thông qua memory và bộ test được duyệt; không tự động train mô hình từ dữ liệu nhạy cảm.
5. Tích hợp email, calendar, OCR và thư mục chia sẻ chỉ nên thêm qua connector có log, timeout, retry và chế độ dry-run.
6. Giao diện pixel art tiếp tục làm rõ trạng thái công việc, nhưng mọi thao tác nghiệp vụ quan trọng phải có màn hình dữ liệu và lịch sử để kiểm tra.

## Trạng thái hiện tại

Hệ thống đã có nền tảng của một work assistant local: xử lý hồ sơ, RAG, memory, reminder, versioning, audit log, skill governance, human confirmation và capability adapter theo mô hình OpenWork. Bước tiếp theo có giá trị nhất là chạy end-to-end trên máy, bổ sung bộ dữ liệu đánh giá từ các hồ sơ thực tế đã ẩn danh, sau đó mới mở rộng connector và tự động hóa có kiểm soát.
