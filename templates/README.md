# Thư viện mẫu quy trình đấu thầu và thanh quyết toán

Bộ mẫu được xây dựng từ hai hồ sơ thanh toán thực tế trong `phaply/`:

- `Thanh toan kiem dinh KTX D`
- `Thanh toan tham tra thiet ke KTX D`

và đối chiếu với NĐ 254/2025/NĐ-CP, NĐ 214/2025/NĐ-CP, TT 73/2026/TT-BTC, QĐ 1040/QĐ-BXD, Luật Đấu thầu 22/2023/QH15, Luật Xây dựng 135/2025/QH15.

## Cấu trúc

```
templates/
  manifest.json                         # danh mục mẫu, placeholder, căn cứ pháp lý
  word/
    01-bien-ban-nghiem-thu-tu-van.html
    02-bien-ban-thanh-ly-hop-dong.html
    03-de-nghi-thanh-toan.html
    04-bien-ban-thuong-thao-hop-dong.html
    05-phu-luc-dieu-chinh-hop-dong.html
    06-hop-dong-tu-van.html
    07-to-trinh-xin-chu-truong.html
    08-quyet-dinh-chap-thuan-chu-truong.html
    09-to-trinh-phe-duyet-khlcnt.html
    10-quyet-dinh-phe-duyet-khlcnt.html
    11-quyet-dinh-chi-dinh-thau-rut-gon.html
    12-quyet-dinh-phe-duyet-ket-qua-lua-chon.html
    13-bien-ban-nghiem-thu-cong-viec-xay-dung.html
    14-bien-ban-nghiem-thu-hoan-thanh-cong-trinh.html
    15-bien-ban-ban-giao-dua-vao-su-dung.html
    16-bien-ban-giao-nhan-hang-hoa.html
    17-hop-dong-mua-sam-hang-hoa.html
    18-thoa-thuan-khung.html
    19-to-trinh-phe-duyet-du-an.html
    20-bao-cao-tham-dinh-du-an.html
    21-quyet-dinh-phe-duyet-du-an.html
    22-to-trinh-phe-duyet-du-toan.html
    23-quyet-dinh-phe-duyet-du-toan.html
    24-quyet-dinh-thanh-lap-to-chuyen-gia.html
    25-quyet-dinh-thanh-lap-to-tham-dinh.html
    26-bien-ban-nghiem-thu-giai-doan.html
    27-bien-ban-nghiem-thu-chay-thu.html
    28-bien-ban-hoan-cong.html
    29-thong-bao-moi-thau.html
    30-thong-bao-khoi-cong.html
  excel/                                # biểu mẫu NĐ 254 (XLSX)
    02a-TT-bang-tong-hop-thong-tin-hop-dong.xlsx
    03a-TT-bang-xac-dinh-gia-tri-khoi-luong-hoan-thanh.xlsx
    03c-QT-bang-quyet-toan-A-B.xlsx
```

Tổng cộng: **33 mẫu** (30 Word + 3 Excel).

## Nhóm mẫu

**Chuẩn bị đầu tư**
- Tờ trình xin chủ trương đầu tư.
- Quyết định chấp thuận chủ trương đầu tư.
- Tờ trình phê duyệt dự án.
- Báo cáo thẩm định dự án.
- Quyết định phê duyệt dự án.

**Kế hoạch lựa chọn nhà thầu**
- Tờ trình phê duyệt KHLCNT.
- Quyết định phê duyệt KHLCNT.
- Tờ trình phê duyệt dự toán/giá gói thầu.
- Quyết định phê duyệt dự toán/giá gói thầu.

**Lựa chọn nhà thầu**
- Quyết định thành lập tổ chuyên gia.
- Quyết định thành lập tổ thẩm định.
- Quyết định chỉ định thầu rút gọn.
- Quyết định phê duyệt kết quả lựa chọn nhà thầu (không qua mạng).
- Thông báo mời thầu (không qua mạng).

**Hợp đồng**
- Hợp đồng tư vấn (khung).
- Hợp đồng mua sắm hàng hóa.
- Thỏa thuận khung mua sắm tập trung.
- Phụ lục điều chỉnh hợp đồng.

**Nghiệm thu, bàn giao**
- Biên bản nghiệm thu sản phẩm tư vấn.
- Biên bản nghiệm thu công việc xây dựng.
- Biên bản nghiệm thu giai đoạn/hạng mục.
- Biên bản nghiệm thu hoàn thành công trình.
- Biên bản nghiệm thu chạy thử (EPC).
- Biên bản hoàn công.
- Biên bản bàn giao đưa vào sử dụng.
- Biên bản giao nhận hàng hóa.
- Biên bản thương thảo hợp đồng.

**Thực hiện dự án**
- Thông báo khởi công xây dựng.

**Thanh toán, quyết toán**
- Đề nghị thanh toán.
- Biên bản thanh lý hợp đồng.
- Bảng tổng hợp thông tin hợp đồng — 02.a/TT.
- Bảng xác định giá trị khối lượng hoàn thành — 03.a/TT.
- Bảng quyết toán A–B — 03.c/QT.

## Định dạng

- **Word (HTML):** mẫu văn bản, dùng placeholder `{{nhom.truong}}`. Mở trực tiếp bằng trình duyệt để xem trước, sau đó thay placeholder và xuất `.doc`/`.docx`.
- **Excel (XLSX):** giữ cấu trúc biểu mẫu NĐ 254. Các ô có placeholder sẽ được điền từ dữ liệu dự án/gói thầu; các cột tính toán đã có công thức.

## Placeholder

Xem danh sách đầy đủ trong `manifest.json` mục `context`. Ví dụ:

- `{{du_an.ten}}`, `{{goi_thau.ten}}`
- `{{chu_dau_tu.ten}}`, `{{nha_thau.ten}}`
- `{{hop_dong.so}}`, `{{hop_dong.gia_tri}}`, `{{hop_dong.tam_ung}}`
- `{{nghiem_thu.so}}`, `{{nghiem_thu.ngay}}`
- `{{thanh_toan.so_tien}}`, `{{thanh_toan.de_nghi_ky}}`
- `{{khlcnt.so}}`, `{{chi_dinh_thau.so}}`, `{{ket_qua_lua_chon.so}}`
- `{{quyet_toan.gia_tri}}`

Quy ước: dùng đúng khóa trong manifest, không tự đặt khóa mới nếu chưa khai báo.

## Kiểm tra và sinh lại

```bash
node scripts/check-template-placeholders.js
node scripts/build-payment-templates.js
```

`check-template-placeholders.js` quét toàn bộ placeholder trong Word và Excel, báo lỗi nếu có khóa chưa khai báo trong manifest.

## Lưu ý pháp lý

- Các mẫu 02.a/TT, 03.a/TT, 03.c/QT là biểu mẫu NĐ 254/2025/NĐ-CP; không tự ý sửa cấu trúc khi chưa đối chiếu văn bản.
- Các mẫu biên bản nghiệm thu, thanh lý, đề nghị thanh toán, thương thảo, phụ lục hợp đồng, tờ trình/QĐ chủ trương, KHLCNT là **mẫu nghiệp vụ tham khảo**, cần đối chiếu quy chế nội bộ và văn bản chuyên ngành trước khi ban hành.
- Với hợp đồng xây dựng, dùng mẫu chính thức tại QĐ 1040/QĐ-BXD và đối chiếu NĐ 210/2026/NĐ-CP.
- Với đấu thầu qua mạng, dùng các mẫu Phụ lục TT 79/2025/TT-BTC và TT 134/2026/TT-BTC.

## Giao diện

Thư viện đã được nối vào tab **Mẫu biểu** (chỉ quản trị viên thấy):

- Chọn dự án/gói thầu ở thanh trên cùng.
- Tìm kiếm, lọc theo giai đoạn và định dạng.
- **Xem & điền**: mở biểu mẫu, tự điền dữ liệu dự án/gói thầu, sửa trực tiếp và xem trước.
- **Tải mẫu trống**: tải file gốc chưa điền.
- Xuất Word (`.doc`) hoặc Excel (`.xlsx`) từ nút tải trong cửa sổ xem trước.

Mã nguồn giao diện: `templates-ui.js`; route tĩnh: `/templates/*`; thư viện Excel trình duyệt: `/assets/xlsx.full.min.js`.

## Bước tiếp theo

- Bổ sung mẫu HSMT/HSYC (Mẫu số TT 79 và TT 134).
- Bổ sung mẫu EPC, hàng hóa chuyên ngành, bảo lãnh, hồ sơ hoàn công chi tiết.
- Bổ sung quy trình duyệt/trạng thái cho từng mẫu (nếu cần).
