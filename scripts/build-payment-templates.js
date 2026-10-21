// Sinh các biểu mẫu Excel NĐ 254/2025 dùng cho hồ sơ thanh quyết toán.
// Chạy: node scripts/build-payment-templates.js
const path = require('path');
const fs = require('fs');
const XLSX = require(path.join(__dirname, '..', 'server', 'node_modules', 'xlsx'));

const OUT = path.join(__dirname, '..', 'templates', 'excel');
fs.mkdirSync(OUT, { recursive: true });

function merge(ws, range) {
  ws['!merges'] = ws['!merges'] || [];
  const r = XLSX.utils.decode_range(range);
  ws['!merges'].push({ s: r.s, e: r.e });
}

function set(ws, addr, value, opts = {}) {
  const cell = ws[addr];
  if (!cell) ws[addr] = { t: typeof value === 'number' ? 'n' : 's', v: value };
  else { cell.t = typeof value === 'number' ? 'n' : 's'; cell.v = value; }
  if (opts.z) ws[addr].z = opts.z;
}

function aoa(rows) {
  return XLSX.utils.aoa_to_sheet(rows);
}

function save(wb, name) {
  wb.Workbook = wb.Workbook || {};
  wb.Workbook.CalcPr = { fullCalcOnLoad: true };
  XLSX.writeFile(wb, path.join(OUT, name), { compression: true });
  console.log('Đã tạo', name);
}

// ---------------- 02.a/TT ----------------
(function build02a() {
  const rows = [
    ['Mẫu số 02.a/TT'],
    ['BẢNG TỔNG HỢP THÔNG TIN HỢP ĐỒNG'],
    ['Căn cứ hợp đồng ký kết giữa {{chu_dau_tu.ten}} và {{nha_thau.ten}}'],
    ['Đơn vị: đồng'],
    ['STT', 'Chỉ tiêu', 'Thông tin hợp đồng lần đầu', 'Thông tin hợp đồng điều chỉnh lần 1', 'Thông tin hợp đồng điều chỉnh lần 2', 'Thông tin hợp đồng điều chỉnh lần 3', 'Thông tin hợp đồng điều chỉnh lần 4', 'Thông tin hợp đồng điều chỉnh lần …', 'Ghi chú'],
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
    ['I', 'Thông tin chung'],
    ['1', 'Hợp đồng'],
    ['1.1', 'Số hợp đồng', '{{hop_dong.so}}'],
    ['1.2', 'Ngày, tháng, năm ký hợp đồng', '{{hop_dong.ngay}}'],
    ['1.3', 'Loại hợp đồng', '{{hop_dong.loai}}'],
    ['1.4', 'Ngày hiệu lực của hợp đồng', '{{hop_dong.hieu_luc}}'],
    ['1.5', 'Thời gian thực hiện hợp đồng', '{{hop_dong.thoi_han}}'],
    ['2', 'Tên dự án/gói thầu'],
    ['2.1', 'Tên dự án', '{{du_an.ten}}'],
    ['2.2', 'Tên gói thầu (nếu có)', '{{goi_thau.ten}}'],
    ['2.3', 'Mã dự án đầu tư', '{{du_an.ma}}'],
    ['3', 'Chủ đầu tư'],
    ['3.1', 'Tên giao dịch', '{{chu_dau_tu.ten}}'],
    ['3.2', 'Đại diện', '{{chu_dau_tu.dai_dien}}'],
    ['3.3', 'Địa chỉ', '{{chu_dau_tu.dia_chi}}'],
    ['3.4', 'Tài khoản tại KBNN', '{{chu_dau_tu.tai_khoan_kbnn}}'],
    ['3.5', 'Mã số thuế', '{{chu_dau_tu.ma_so_thue}}'],
    ['3.6', 'Cơ quan quản lý thuế', '{{chu_dau_tu.co_quan_thue}}'],
    ['4', 'Nhà thầu (liên danh, thầu phụ, liên doanh)'],
    ['4.1', 'Nhà thầu chính (tên giao dịch)', '{{nha_thau.ten}}'],
    ['4.1.1', 'Đại diện', '{{nha_thau.dai_dien}}'],
    ['4.1.2', 'Địa chỉ', '{{nha_thau.dia_chi}}'],
    ['4.1.3', 'Tài khoản tại NH', '{{nha_thau.tai_khoan}} - {{nha_thau.ngan_hang}}'],
    ['4.1.4', 'Mã số thuế', '{{nha_thau.ma_so_thue}}'],
    ['4.1.5', 'Cơ quan quản lý thuế', '{{nha_thau.co_quan_thue}}'],
    ['4.2', 'Nhà thầu phụ (tên giao dịch)', ''],
    ['4.2.1', 'Đại diện', ''],
    ['4.2.2', 'Địa chỉ', ''],
    ['4.2.3', 'Tài khoản tại KBNN/NH', ''],
    ['4.2.4', 'Mã số thuế', ''],
    ['4.2.5', 'Cơ quan quản lý thuế', ''],
    ['4.3', 'Nhà thầu liên danh/liên doanh', ''],
    ['4.3.1', 'Đại diện', ''],
    ['4.3.2', 'Địa chỉ', ''],
    ['4.3.3', 'Tài khoản tại KBNN/NH', ''],
    ['4.3.4', 'Mã số thuế', ''],
    ['II', 'Thông tin hợp đồng'],
    ['1', 'Giá trị hợp đồng', '{{hop_dong.gia_tri}}'],
    ['2', 'Giá trị tạm ứng', '{{hop_dong.tam_ung}}'],
    ['3', 'Giá trị đã thanh toán', '{{hop_dong.da_thanh_toan}}'],
    ['4', 'Giá trị còn phải thanh toán', '{{hop_dong.con_phai_thanh_toan}}'],
    ['5', 'Thời hạn thanh toán', ''],
    ['6', 'Bảo đảm thực hiện hợp đồng', ''],
    ['7', 'Thời gian bảo hành', ''],
    ['8', 'Các nội dung khác', '']
  ];
  const ws = aoa(rows);
  const moneyRows = [44, 45, 46, 47];
  for (const r of moneyRows) {
    const c = ws['C' + r];
    if (c) c.z = '#,##0';
  }
  merge(ws, 'A1:I1'); merge(ws, 'A2:I2'); merge(ws, 'A3:I3'); merge(ws, 'A4:I4');
  for (const r of [7, 8, 14, 18, 25, 43]) merge(ws, `B${r}:I${r}`);
  ws['!cols'] = [8, 45, 35, 22, 22, 22, 22, 22, 25];
  ws['!rows'] = [{ hpt: 22 }, { hpt: 24 }, { hpt: 18 }, { hpt: 18 }, { hpt: 36 }, { hpt: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '02aTT');
  save(wb, '02a-TT-bang-tong-hop-thong-tin-hop-dong.xlsx');
})();

// ---------------- 03.a/TT ----------------
(function build03a() {
  const rows = [
    ['Mẫu số 03.a/TT'],
    ['BẢNG XÁC ĐỊNH GIÁ TRỊ KHỐI LƯỢNG CÔNG VIỆC HOÀN THÀNH'],
    ['Tên dự án: {{du_an.ten}}'],
    ['Mã dự án: {{du_an.ma}}'],
    ['Căn cứ Bảng thông tin của Hợp đồng số {{hop_dong.so}} ngày {{hop_dong.ngay}}'],
    ['Chủ đầu tư: {{chu_dau_tu.ten}}'],
    ['Nhà thầu: {{nha_thau.ten}}'],
    ['Thanh toán lần thứ: {{thanh_toan.ky}}'],
    ['Căn cứ Biên bản nghiệm thu số {{nghiem_thu.so}} ngày {{nghiem_thu.ngay}}'],
    ['Đơn vị tính: Đồng'],
    ['STT', 'Chỉ tiêu', 'Giá trị hợp đồng/dự toán', 'Giá trị KLHT chưa thanh toán đến hết kỳ trước', 'Giá trị KLHT nghiệm thu trong kỳ này', 'Giá trị KLHT đề nghị thanh toán kỳ này', 'Giá trị KLHT chưa thanh toán đến hết kỳ này', 'Lũy kế giá trị KLHT đã thanh toán đến hết kỳ trước', 'Lũy kế giá trị KLHT đã thanh toán đến hết kỳ này', 'Ghi chú'],
    ['1', '2', '3', '4', '5', '6', '7=4+5-6', '8', '9=8+6', '10'],
    ['I', 'Công việc thực hiện thông qua hợp đồng', '{{hop_dong.gia_tri}}', '{{thanh_toan.chua_thanh_toan_truoc}}', '{{thanh_toan.nghiem_thu_ky}}', '{{thanh_toan.de_nghi_ky}}', null, '{{thanh_toan.da_thanh_toan_truoc}}', null, ''],
    ['', '{{goi_thau.ten}}', '{{hop_dong.gia_tri}}', '{{thanh_toan.chua_thanh_toan_truoc}}', '{{thanh_toan.nghiem_thu_ky}}', '{{thanh_toan.de_nghi_ky}}', null, '{{thanh_toan.da_thanh_toan_truoc}}', null, ''],
    ['II', 'Công việc thực hiện không thông qua hợp đồng (không bao gồm kinh phí bồi thường, hỗ trợ, tái định cư; không bao gồm chi phí quản lý dự án)', '', '', '', '', '', '', '', ''],
    ['', 'Công việc A', '', '', '', '', '', '', '', ''],
    ['', 'Công việc B', '', '', '', '', '', '', '', ''],
    ['III', 'Chi phí đảm bảo cho việc tổ chức thực hiện bồi thường, hỗ trợ, tái định cư', '', '', '', '', '', '', '', ''],
    ['IV', 'Chi phí quản lý dự án', '', '', '', '', '', '', '', ''],
    ['', 'Công việc A', '', '', '', '', '', '', '', ''],
    ['', 'Công việc B', '', '', '', '', '', '', '', ''],
    ['', ''],
    ['1.', 'Giá trị tạm ứng còn lại chưa thu hồi đến hết kỳ trước:', '{{thanh_toan.tam_ung_con_lai}}', 'đồng'],
    ['2.', 'Số tiền đã thanh toán khối lượng hoàn thành đến hết kỳ trước:', '{{thanh_toan.da_thanh_toan_truoc}}', 'đồng'],
    ['2.1.', 'Thanh toán cho nhà thầu', '{{thanh_toan.da_thanh_toan_nha_thau}}', 'đồng'],
    ['2.2.', 'Tiền bảo hành công trình (trong trường hợp không bảo lãnh bảo hành công trình)', '{{thanh_toan.tien_bao_hanh}}', 'đồng'],
    ['2.3.', 'Chuyển vào tài khoản tạm giữ chờ quyết toán', '{{thanh_toan.tam_giu_quyet_toan}}', 'đồng'],
    ['3.', 'Lũy kế giá trị khối lượng thực hiện đến hết kỳ này', '{{thanh_toan.luy_ke_khoi_luong}}', 'đồng'],
    ['4.', 'Thanh toán để thu hồi tạm ứng:', '{{thanh_toan.thu_hoi_tam_ung}}', 'đồng'],
    ['5.', 'Giá trị đề nghị giải ngân kỳ này:', '{{thanh_toan.de_nghi_ky}}', 'đồng'],
    ['', 'Số tiền bằng chữ: {{thanh_toan.so_tien_bang_chu}}'],
    ['', '- Tạm ứng:', '{{thanh_toan.tam_ung_ky}}', 'đồng'],
    ['', '- Thanh toán khối lượng hoàn thành:', '{{thanh_toan.thanh_toan_khoi_luong}}', 'đồng'],
    ['', '+ Thanh toán cho nhà thầu', '{{thanh_toan.thanh_toan_nha_thau}}', 'đồng'],
    ['', '+ Tiền bảo hành công trình (trong trường hợp không bảo lãnh bảo hành công trình)', '{{thanh_toan.tien_bao_hanh}}', 'đồng'],
    ['', '+ Chuyển vào tài khoản tạm giữ chờ quyết toán', '{{thanh_toan.tam_giu_quyet_toan}}', 'đồng'],
    ['6.', 'Lũy kế giá trị giải ngân:', '{{thanh_toan.luy_ke_giai_ngan}}', 'đồng'],
    ['6.1.', 'Tạm ứng:', '{{thanh_toan.luy_ke_tam_ung}}', 'đồng'],
    ['6.2.', 'Thanh toán khối lượng hoàn thành:', '{{thanh_toan.luy_ke_thanh_toan}}', 'đồng'],
    ['', '- Thanh toán cho nhà thầu', '{{thanh_toan.luy_ke_thanh_toan_nha_thau}}', 'đồng'],
    ['', '- Tiền bảo hành công trình (trong trường hợp không bảo lãnh bảo hành công trình)', '{{thanh_toan.luy_ke_bao_hanh}}', 'đồng'],
    ['', '- Chuyển vào tài khoản tạm giữ chờ quyết toán', '{{thanh_toan.luy_ke_tam_giu}}', 'đồng']
  ];
  const ws = aoa(rows);
  ws.G13 = { t: 'n', f: 'D13+E13-F13' };
  ws.I13 = { t: 'n', f: 'H13+F13' };
  ws.G14 = { t: 'n', f: 'D14+E14-F14' };
  ws.I14 = { t: 'n', f: 'H14+F14' };
  for (let r = 13; r <= 24; r++) {
    for (const col of ['C', 'D', 'E', 'F', 'G', 'H', 'I']) {
      if (ws[col + r]) ws[col + r].z = '#,##0';
    }
  }
  for (let r = 26; r <= 44; r++) {
    if (ws['C' + r]) ws['C' + r].z = '#,##0';
  }
  merge(ws, 'A1:J1'); merge(ws, 'A2:J2'); merge(ws, 'A3:J3'); merge(ws, 'A4:J4'); merge(ws, 'A5:J5');
  merge(ws, 'A6:J6'); merge(ws, 'A7:J7'); merge(ws, 'A8:J8'); merge(ws, 'A9:J9'); merge(ws, 'A10:J10');
  for (const r of [15, 18, 19, 20, 21]) merge(ws, `B${r}:J${r}`);
  merge(ws, 'B31:J31');
  ws['!cols'] = [6, 52, 18, 18, 18, 18, 18, 18, 18, 20];
  ws['!rows'] = [{ hpt: 22 }, { hpt: 26 }, { hpt: 18 }, { hpt: 18 }, { hpt: 18 }, { hpt: 18 }, { hpt: 18 }, { hpt: 18 }, { hpt: 18 }, { hpt: 18 }, { hpt: 48 }, { hpt: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mẫu 03aTT');
  save(wb, '03a-TT-bang-xac-dinh-gia-tri-khoi-luong-hoan-thanh.xlsx');
})();

// ---------------- 03.c/QT (A-B) ----------------
(function build03c() {
  const rows = [
    ['Mẫu số 03.c/QT'],
    ['CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'],
    ['Độc lập - Tự do - Hạnh phúc'],
    ['BẢNG TÍNH GIÁ TRỊ QUYẾT TOÁN HỢP ĐỒNG GIỮA CHỦ ĐẦU TƯ VÀ NHÀ THẦU (QUYẾT TOÁN A-B)'],
    ['1. Tên dự án: {{du_an.ten}}'],
    ['2. Tên gói thầu: {{goi_thau.ten}}'],
    ['3. Hợp đồng (gồm cả hợp đồng điều chỉnh, bổ sung, phụ lục hợp đồng nếu có): Hợp đồng số {{hop_dong.so}} ngày {{hop_dong.ngay}}'],
    ['4. Chủ đầu tư/Ban quản lý dự án: {{chu_dau_tu.ten}}'],
    ['5. Nhà thầu: {{nha_thau.ten}}'],
    ['6. Căn cứ xác định: Biên bản nghiệm thu số {{nghiem_thu.so}} ngày {{nghiem_thu.ngay}}'],
    ['STT', 'Tên công việc (gồm công việc, giai đoạn, bộ phận/hàng hóa/thiết bị/tư vấn/chi phí khác) theo hợp đồng', 'Đơn vị tính', 'Khối lượng theo HĐ/PLHĐ', 'Khối lượng quyết toán', 'Đơn giá theo HĐ/PLHĐ (đồng)', 'Giá trị đề nghị quyết toán (đồng)', 'Ghi chú'],
    ['1', '2', '3', '4', '5', '6', '7 = 5*6', '8'],
    ['A', 'THEO HỢP ĐỒNG (HĐ)/PHỤ LỤC HỢP ĐỒNG (PLHĐ)'],
    ['1', 'Trong HĐ ban đầu (bao gồm cả khối lượng tăng, giảm các công việc trong HĐ ban đầu)', '%', '100%', '100%', '{{hop_dong.don_gia}}', '{{hop_dong.gia_tri}}', ''],
    ['2', 'Công việc phát sinh được bổ sung ngoài HĐ ban đầu theo quy định (nếu có)', '', '', '', '', '', ''],
    ['B', 'ĐIỀU CHỈNH THEO QUY ĐỊNH CỦA NHÀ NƯỚC (THUẾ, PHÍ,...)'],
    ['', '', '', '', '', '', '', ''],
    ['C', 'ĐIỀU CHỈNH THEO KẾT LUẬN CỦA CƠ QUAN CÓ THẨM QUYỀN (THANH TRA, KIỂM TOÁN NHÀ NƯỚC,...) trong trường hợp chưa giảm trừ (khối lượng, dự toán, thanh toán) trong quá trình thực hiện HĐ'],
    ['', '', '', '', '', '', '', ''],
    ['D', 'GIÁ TRỊ ĐIỀU CHỈNH GIÁ (Đối với các HĐ theo đơn giá điều chỉnh)'],
    ['', '', '', '', '', '', '', ''],
    ['', 'TỔNG CỘNG (A+B+C+D)', '', '', '', '', '=SUM(G14:G20)', ''],
    ['', 'TỔNG CỘNG (LÀM TRÒN)', '', '', '', '', '=ROUND(G21,0)', ''],
    ['', 'Giá trị quyết toán:', '', '', '', '', '{{quyet_toan.gia_tri}}', ''],
    ['', 'Bằng chữ:', '{{quyet_toan.gia_tri_bang_chu}}', '', '', '', '', ''],
    ['', ''],
    ['', 'NHÀ THẦU', '', 'CHỦ ĐẦU TƯ', '', '', '', ''],
    ['', '(Ký, ghi rõ họ tên, chức vụ và đóng dấu)', '', '(Ký, ghi rõ họ tên, chức vụ và đóng dấu)', '', '', '', ''],
    ['', ''],
    ['', '{{nha_thau.dai_dien}}', '', '{{chu_dau_tu.dai_dien}}', '', '', '', '']
  ];
  const ws = aoa(rows);
  ws.G22 = { t: 'n', f: 'SUM(G14:G21)' };
  ws.G23 = { t: 'n', f: 'ROUND(G22,0)' };
  for (let r = 14; r <= 25; r++) {
    for (const col of ['F', 'G']) {
      if (ws[col + r]) ws[col + r].z = '#,##0';
    }
  }
  merge(ws, 'A1:H1'); merge(ws, 'A2:H2'); merge(ws, 'A3:H3'); merge(ws, 'A4:H4');
  merge(ws, 'A5:H5'); merge(ws, 'A6:H6'); merge(ws, 'A7:H7'); merge(ws, 'A8:H8');
  merge(ws, 'A9:H9'); merge(ws, 'A10:H10');
  merge(ws, 'B13:H13'); merge(ws, 'B16:H16'); merge(ws, 'B18:H18'); merge(ws, 'B20:H20');
  merge(ws, 'B22:F22'); merge(ws, 'B23:F23'); merge(ws, 'B24:F24');
  merge(ws, 'C25:H25');
  merge(ws, 'B27:C27'); merge(ws, 'D27:E27');
  merge(ws, 'B28:C28'); merge(ws, 'D28:E28');
  merge(ws, 'B30:C30'); merge(ws, 'D30:E30');
  ws['!cols'] = [6, 55, 12, 16, 16, 18, 20, 18];
  ws['!rows'] = [{ hpt: 22 }, { hpt: 18 }, { hpt: 18 }, { hpt: 30 }, { hpt: 18 }, { hpt: 18 }, { hpt: 18 }, { hpt: 18 }, { hpt: 18 }, { hpt: 18 }, { hpt: 46 }, { hpt: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mẫu 03cQT');
  save(wb, '03c-QT-bang-quyet-toan-A-B.xlsx');
})();
