// ============================================================
// CÂY QUY TRÌNH THỰC HIỆN DỰ ÁN / GÓI THẦU
// Dữ liệu tĩnh, không phụ thuộc DOM. workflow-ui.js đọc và hiển thị.
// ============================================================
const WF_STAGE_ORDER = [
  'chuanBiDauTu',
  'chuanBiThucHien',
  'luaChonNhaThau',
  'kyHopDong',
  'thucHienHopDong',
  'nghiemThu',
  'banGiao',
  'baoHanh',
  'thanhToan',
  'thanhLy',
  'congKhai',
  'quyetToan'
];

const WF_STAGE_LABELS = {
  chuanBiDauTu: 'Chuẩn bị đầu tư',
  chuanBiThucHien: 'Chuẩn bị thực hiện',
  luaChonNhaThau: 'Lựa chọn nhà thầu',
  kyHopDong: 'Ký hợp đồng',
  thucHienHopDong: 'Thực hiện hợp đồng',
  nghiemThu: 'Nghiệm thu',
  banGiao: 'Bàn giao',
  baoHanh: 'Bảo hành',
  thanhToan: 'Thanh toán',
  thanhLy: 'Thanh lý',
  congKhai: 'Công khai thông tin',
  quyetToan: 'Quyết toán'
};

const WF_STATUSES = {
  notStarted: { label: 'Chưa thực hiện', className: 'not-started' },
  inProgress: { label: 'Đang thực hiện', className: 'in-progress' },
  done: { label: 'Hoàn thành', className: 'done' },
  blocked: { label: 'Vướng mắc', className: 'blocked' },
  skipped: { label: 'Bỏ qua', className: 'skipped' }
};

const WF_PACKAGE_TYPE_LABELS = {
  consulting: 'Tư vấn',
  construction: 'Xây lắp',
  goods: 'Hàng hóa',
  mixed: 'Hỗn hợp / EPC',
  nonConsulting: 'Phi tư vấn'
};

function wfFold(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

function wfInferPackageType(pkg, categoryName) {
  if (pkg?.pkgType) return pkg.pkgType;
  const classify = (s) => {
    if ((/phi tu van|bao hiem|ve sinh|an ninh|van hanh/.test(s)) && !/chi phi tu van/.test(s)) return 'nonConsulting';
    if (/tu van|thiet ke|giam sat|khao sat|tham tra|kiem dinh|quan ly du an|lap ho so|lap hsmt|danh gia hsd|tham dinh|thu tinh tai|thi nghiem|quan trac|do dac/.test(s)) return 'consulting';
    if (/xay dung|xay lap|thi cong|cai tao|sua chua|nang cap|khoi cong/.test(s)) return 'construction';
    if (/hang hoa|thiet bi|may moc|vat tu|mua sam/.test(s)) return 'goods';
    if (/epc|\bec\b|\bpc\b|hon hop/.test(s)) return 'mixed';
    return '';
  };
  const byName = classify(wfFold(pkg?.name || ''));
  if (byName) return byName;
  return classify(wfFold(categoryName || '')) || 'consulting';
}

function wfIsCostItem(pkg) {
  const method = wfFold(pkg?.selectionMethod || '');
  const name = wfFold(pkg?.name || '');
  const noProcurement = !method || method === '-' || method.includes('khong ap dung');
  return noProcurement && /^(chi phi|phi |le phi)/.test(name);
}
function wfProjectPackages(project) {
  const out = [];
  for (const cat of (project?.categories || [])) {
    for (const pkg of (cat.packages || [])) {
      out.push({
        ...pkg,
        categoryName: cat.name || '',
        categoryCode: cat.code || '',
        pkgType: pkg.pkgType || (wfIsCostItem(pkg) ? 'cost' : wfInferPackageType(pkg, cat.name))
      });
    }
  }
  return out;
}

function wfHasType(project, type) {
  return wfProjectPackages(project).some(p => p.pkgType === type);
}

const WF_MASTER_PROJECT = [
  {
    id: 'p-chu-truong',
    stage: 'chuanBiDauTu',
    title: 'Chủ trương đầu tư',
    type: 'gate',
    optional: true,
    hint: 'Lập tờ trình và quyết định chấp thuận chủ trương nếu dự án thuộc diện phải quyết định/chấp thuận chủ trương đầu tư.',
    legalBasis: ['Luật Xây dựng Đ23', 'Luật Đầu tư công'],
    outputs: ['Tờ trình chủ trương', 'Quyết định chấp thuận chủ trương']
  },
  {
    id: 'p-bao-cao',
    stage: 'chuanBiDauTu',
    title: 'Lập BCKTKT hoặc BCNCKT',
    type: 'document',
    required: true,
    hint: 'Lập Báo cáo kinh tế - kỹ thuật hoặc Báo cáo nghiên cứu khả thi tùy quy mô, tính chất dự án.',
    legalBasis: ['Luật Xây dựng Đ23-25'],
    outputs: ['BCKTKT/BCNCKT']
  },
  {
    id: 'p-tham-dinh',
    stage: 'chuanBiDauTu',
    title: 'Thẩm định báo cáo',
    type: 'gate',
    required: true,
    hint: 'Tổ chức thẩm định báo cáo làm cơ sở phê duyệt dự án.',
    legalBasis: ['Luật Xây dựng Đ26'],
    outputs: ['Báo cáo thẩm định']
  },
  {
    id: 'p-qd-da',
    stage: 'chuanBiDauTu',
    title: 'Quyết định phê duyệt dự án',
    type: 'gate',
    required: true,
    hint: 'Ban hành quyết định phê duyệt dự án, xác định tổng mức đầu tư, nguồn vốn và thời gian thực hiện.',
    legalBasis: ['Luật Xây dựng Đ28'],
    outputs: ['Quyết định phê duyệt dự án']
  },
  {
    id: 'p-von',
    stage: 'chuanBiThucHien',
    title: 'Kế hoạch bố trí vốn',
    type: 'document',
    required: true,
    hint: 'Xác nhận kế hoạch vốn/nguồn vốn được bố trí cho dự án.',
    legalBasis: ['Luật Đầu tư công', 'NĐ 254/2025'],
    outputs: ['Kế hoạch vốn']
  },
  {
    id: 'p-du-toan',
    stage: 'chuanBiThucHien',
    title: 'Dự toán / giá gói thầu',
    type: 'document',
    required: true,
    hint: 'Lập, thẩm định, phê duyệt dự toán hoặc xác định giá gói thầu làm cơ sở lập KHLCNT.',
    legalBasis: ['Luật Xây dựng Đ76', 'TT 36/2026/TT-BXD', 'NĐ 214/2025 Đ18'],
    outputs: ['Dự toán/giá gói thầu được duyệt']
  },
  {
    id: 'p-kh-tong-the',
    stage: 'chuanBiThucHien',
    title: 'Kế hoạch tổng thể lựa chọn nhà thầu',
    type: 'document',
    optional: true,
    hint: 'Lập nếu dự án có quy mô, tính chất cần quản lý tổng thể hoạt động đấu thầu.',
    legalBasis: ['LĐT Đ36', 'NĐ 214/2025 Đ16-17'],
    outputs: ['KH tổng thể được duyệt']
  },
  {
    id: 'p-dang-tai-kh-tong-the',
    stage: 'chuanBiThucHien',
    title: 'Đăng tải KH tổng thể lựa chọn nhà thầu',
    type: 'document',
    optional: true,
    hint: 'Đăng tải KH tổng thể trên Hệ thống mạng đấu thầu quốc gia chậm nhất 05 ngày làm việc kể từ ngày ban hành.',
    legalBasis: ['NĐ 214/2025 Đ16.5', 'TT 79/2025 Điều 13'],
    outputs: ['KH tổng thể được đăng tải']
  },
  {
    id: 'p-khlcnt',
    stage: 'chuanBiThucHien',
    title: 'Lập, phê duyệt KHLCNT',
    type: 'gate',
    required: true,
    hint: 'Lập kế hoạch lựa chọn nhà thầu cho dự án, phê duyệt theo quy định.',
    legalBasis: ['LĐT Đ37-41', 'NĐ 214/2025'],
    outputs: ['KHLCNT được duyệt']
  },
  {
    id: 'p-dang-tai-khlcnt',
    stage: 'chuanBiThucHien',
    title: 'Đăng tải KHLCNT trên Hệ thống',
    type: 'gate',
    required: true,
    hint: 'Đăng tải KHLCNT và tài liệu kèm theo trên Hệ thống mạng đấu thầu quốc gia chậm nhất 05 ngày làm việc kể từ ngày ban hành; kiểm tra tính thống nhất giữa tài liệu đăng tải và tài liệu đã phê duyệt.',
    legalBasis: ['LĐT Đ7.1a, Đ8.4', 'TT 79/2025 Điều 13'],
    outputs: ['KHLCNT được đăng tải']
  },
  {
    id: 'p-thiet-ke',
    stage: 'chuanBiThucHien',
    title: 'Thiết kế bản vẽ thi công',
    type: 'document',
    required: true,
    hint: 'Thẩm định, phê duyệt thiết kế bản vẽ thi công và dự toán làm cơ sở thi công.',
    legalBasis: ['Luật Xây dựng Đ29, Đ48'],
    outputs: ['Thiết kế BVTC được duyệt'],
    when: project => wfHasType(project, 'construction') || wfHasType(project, 'mixed')
  },
  {
    id: 'p-gpxd',
    stage: 'chuanBiThucHien',
    title: 'Giấy phép xây dựng',
    type: 'document',
    optional: true,
    hint: 'Kiểm tra trường hợp được miễn; nếu không thuộc diện miễn thì lập, xin cấp giấy phép xây dựng.',
    legalBasis: ['Luật Xây dựng Đ43, Đ48'],
    outputs: ['Giấy phép xây dựng'],
    when: project => wfHasType(project, 'construction') || wfHasType(project, 'mixed')
  },
  {
    id: 'p-quyet-toan',
    stage: 'quyetToan',
    title: 'Quyết toán vốn đầu tư dự án',
    type: 'gate',
    required: true,
    hint: 'Lập, thẩm định, phê duyệt quyết toán vốn đầu tư dự án hoàn thành theo NĐ 193 và TT 73/2026.',
    legalBasis: ['NĐ 193/2026', 'TT 73/2026/TT-BTC'],
    outputs: ['Hồ sơ quyết toán', 'Quyết định phê duyệt quyết toán']
  }
];

const WF_MASTER_PURCHASE = [
  {
    id: 'm-nhu-cau',
    stage: 'chuanBiDauTu',
    title: 'Xác định nhu cầu, dự toán mua sắm',
    type: 'document',
    required: true,
    hint: 'Xác định nhu cầu, kinh phí được giao và dự toán mua sắm làm căn cứ lập KHLCNT.',
    legalBasis: ['LĐT Đ41', 'NĐ 214/2025 Đ18'],
    outputs: ['Dự toán mua sắm']
  },
  {
    id: 'm-khlcnt',
    stage: 'chuanBiThucHien',
    title: 'Lập, phê duyệt KHLCNT',
    type: 'gate',
    required: true,
    hint: 'Lập kế hoạch lựa chọn nhà thầu cho dự toán mua sắm, phê duyệt theo quy định.',
    legalBasis: ['LĐT Đ38-41', 'NĐ 214/2025'],
    outputs: ['KHLCNT được duyệt']
  },
  {
    id: 'm-dang-tai-khlcnt',
    stage: 'chuanBiThucHien',
    title: 'Đăng tải KHLCNT trên Hệ thống',
    type: 'gate',
    required: true,
    hint: 'Đăng tải KHLCNT và tài liệu kèm theo trên Hệ thống mạng đấu thầu quốc gia chậm nhất 05 ngày làm việc kể từ ngày ban hành.',
    legalBasis: ['LĐT Đ7.1a, Đ8.4', 'TT 79/2025 Điều 13'],
    outputs: ['KHLCNT được đăng tải']
  },
  {
    id: 'm-quyet-toan',
    stage: 'quyetToan',
    title: 'Thanh toán, quyết toán mua sắm',
    type: 'gate',
    required: true,
    hint: 'Theo dõi thanh toán, quyết toán và thanh lý hợp đồng mua sắm.',
    legalBasis: ['NĐ 254/2025', 'NĐ 186/2025'],
    outputs: ['Hồ sơ thanh quyết toán']
  }
];

function wfStep(key, title, hint, legalBasis, outputs, stage = 'luaChonNhaThau', options = {}) {
  return {
    key,
    title,
    hint,
    legalBasis,
    outputs,
    stage,
    required: options.required !== false,
    optional: !!options.optional
  };
}

function wfMethodGroup(pkg) {
  const m = wfFold(`${pkg.selectionMethod || ''} ${pkg.name || ''} ${pkg.categoryName || ''}`);
  if (m.includes('dam phan gia')) return 'damPhanGia';
  if (m.includes('dac biet')) return 'dacBiet';
  if (m.includes('mua sam tap trung')) return 'muaSamTapTrung';
  if (m.includes('mua sam truc tuyen')) return 'muaSamTrucTuyen';
  if (m.includes('tu van ca nhan')) return 'tuVanCaNhan';
  if (m.includes('dau thau truoc')) return 'dauThauTruoc';
  if (m.includes('chao gia truc tuyen')) return 'chaoGia';
  if (m.includes('dat hang')) return 'datHang';
  if (m.includes('tu thuc hien')) return 'tuThucHien';
  if (m.includes('cong dong')) return 'congDong';
  if (m.includes('mua sam truc tiep')) return 'muaSamTrucTiep';
  if (m.includes('chao hang')) return 'chaoHang';
  if (m.includes('chi dinh')) return 'chiDinh';
  return 'dauThau';
}

function wfMethodNodes(pkg) {
  const group = wfMethodGroup(pkg);
  const m = wfFold(`${pkg.selectionMethod || ''} ${pkg.name || ''} ${pkg.categoryName || ''}`);
  const opt = { optional: true, required: false };

  if (group === 'chiDinh') {
    if (m.includes('rut gon')) {
      return [
        wfStep('chi-dinh', 'Quyết định chỉ định thầu rút gọn', 'Căn cứ điều kiện và hạn mức chỉ định thầu, ban hành quyết định chỉ định thầu rút gọn.', ['NĐ 214/2025 Đ78, Đ80'], ['Quyết định chỉ định thầu']),
        wfStep('du-thao-hd', 'Dự thảo, thương thảo hợp đồng', 'Gửi dự thảo hợp đồng, thương thảo giá và điều kiện hợp đồng với nhà thầu dự kiến.', ['NĐ 214/2025 Đ80'], ['Dự thảo hợp đồng', 'Biên bản thương thảo']),
        wfStep('kq', 'Phê duyệt kết quả chỉ định thầu', 'Phê duyệt kết quả lựa chọn nhà thầu và thực hiện công khai theo quy định.', ['NĐ 214/2025 Đ33, Đ80'], ['Quyết định phê duyệt KQ'])
      ];
    }
    return [
      wfStep('chi-dinh', 'Quyết định áp dụng chỉ định thầu', 'Xác định gói thầu thuộc trường hợp chỉ định thầu thông thường và ban hành quyết định.', ['NĐ 214/2025 Đ78, Đ79'], ['Quyết định chỉ định thầu']),
      wfStep('lap-hsyc', 'Lập hồ sơ yêu cầu', 'Lập HSYC gồm phạm vi, tiêu chuẩn đánh giá, giá chỉ định thầu và điều kiện hợp đồng.', ['NĐ 214/2025 Đ79'], ['HSYC']),
      wfStep('tham-dinh-hsyc', 'Thẩm định HSYC (nếu có)', 'Thẩm định hồ sơ yêu cầu trước khi phê duyệt nếu đơn vị có yêu cầu.', ['NĐ 214/2025 Đ135'], ['Báo cáo thẩm định HSYC'], 'luaChonNhaThau', opt),
      wfStep('phe-duyet-hsyc', 'Phê duyệt HSYC', 'Phê duyệt hồ sơ yêu cầu làm cơ sở phát hành.', ['NĐ 214/2025 Đ79'], ['Quyết định phê duyệt HSYC']),
      wfStep('phat-hanh-hsyc', 'Phát hành HSYC', 'Phát hành HSYC cho nhà thầu dự kiến được chỉ định.', ['NĐ 214/2025 Đ79'], ['HSYC phát hành']),
      wfStep('nop-de-xuat', 'Nộp hồ sơ đề xuất', 'Nhà thầu chuẩn bị và nộp hồ sơ đề xuất theo HSYC.', ['NĐ 214/2025 Đ79'], ['Hồ sơ đề xuất']),
      wfStep('danh-gia', 'Đánh giá hồ sơ đề xuất', 'Đánh giá năng lực, kinh nghiệm, kỹ thuật và giá đề xuất.', ['NĐ 214/2025 Đ79'], ['Báo cáo đánh giá']),
      wfStep('thuong-thao', 'Thương thảo hợp đồng', 'Thương thảo, làm rõ và hoàn thiện nội dung hợp đồng.', ['NĐ 214/2025 Đ79'], ['Biên bản thương thảo']),
      wfStep('tham-dinh-kq', 'Thẩm định kết quả (nếu có)', 'Thẩm định kết quả lựa chọn nhà thầu trước khi phê duyệt.', ['NĐ 214/2025 Đ136'], ['Báo cáo thẩm định KQ'], 'luaChonNhaThau', opt),
      wfStep('kq', 'Phê duyệt kết quả chỉ định thầu', 'Phê duyệt kết quả lựa chọn nhà thầu theo quy định.', ['NĐ 214/2025 Đ33, Đ79'], ['Quyết định phê duyệt KQ'])
    ];
  }

  if (group === 'chaoHang') {
    return [
      wfStep('lap-hsmt', 'Lập HSMT chào hàng', 'Lập HSMT chào hàng cạnh tranh; thời gian chuẩn bị hồ sơ tối thiểu 07 ngày làm việc.', ['NĐ 214/2025 Đ81'], ['HSMT chào hàng']),
      wfStep('phe-duyet-hsmt', 'Phê duyệt HSMT', 'Phê duyệt HSMT làm cơ sở đăng tải, phát hành.', ['NĐ 214/2025 Đ81'], ['Quyết định phê duyệt HSMT']),
      wfStep('thong-bao-moi-thau', 'Đăng tải thông báo mời thầu', 'Đăng tải thông báo và HSMT trên Hệ thống mạng đấu thầu quốc gia.', ['LĐT Đ7-8', 'TT 79/2025 Điều 17'], ['Thông báo mời thầu']),
      wfStep('phat-hanh-hsmt', 'Phát hành, làm rõ HSMT', 'Phát hành HSMT, trả lời làm rõ và sửa đổi (nếu có).', ['NĐ 214/2025 Đ81'], ['HSMT phát hành']),
      wfStep('nop-mo-thau', 'Nộp hồ sơ dự thầu, mở thầu', 'Nhà thầu nộp HSDT; mở thầu trong thời hạn 02 giờ kể từ thời điểm đóng thầu.', ['NĐ 214/2025 Đ81'], ['Biên bản mở thầu']),
      wfStep('danh-gia', 'Đánh giá hồ sơ dự thầu', 'Đánh giá hợp lệ, kỹ thuật, tài chính và xếp hạng nhà thầu.', ['NĐ 214/2025 Đ81'], ['Báo cáo đánh giá']),
      wfStep('kq', 'Phê duyệt, công khai kết quả', 'Phê duyệt kết quả lựa chọn nhà thầu và công khai theo quy định.', ['NĐ 214/2025 Đ33, Đ81'], ['Quyết định phê duyệt KQ'])
    ];
  }

  if (group === 'muaSamTrucTiep') {
    return [
      wfStep('lap-hsyc', 'Lập HSYC mua sắm trực tiếp', 'Lập HSYC gửi nhà thầu đã trúng thầu trước đó; kiểm tra khối lượng, đơn giá, tiến độ.', ['LĐT Đ25', 'NĐ 214/2025 Đ82'], ['HSYC']),
      wfStep('phe-duyet-hsyc', 'Phê duyệt HSYC', 'Phê duyệt HSYC làm cơ sở phát hành.', ['NĐ 214/2025 Đ82'], ['Quyết định phê duyệt HSYC']),
      wfStep('phat-hanh-hsyc', 'Phát hành HSYC', 'Phát hành HSYC cho nhà thầu đã trúng thầu trước đó.', ['NĐ 214/2025 Đ82'], ['HSYC phát hành']),
      wfStep('nop-de-xuat', 'Nộp hồ sơ đề xuất', 'Nhà thầu cập nhật năng lực, nộp đề xuất theo HSYC.', ['NĐ 214/2025 Đ82'], ['Hồ sơ đề xuất']),
      wfStep('danh-gia', 'Đánh giá hồ sơ đề xuất', 'Đánh giá kỹ thuật, đơn giá, tiến độ và năng lực nhà thầu.', ['NĐ 214/2025 Đ82'], ['Báo cáo đánh giá']),
      wfStep('thuong-thao', 'Thương thảo hợp đồng', 'Thương thảo giá và các điều kiện hợp đồng.', ['NĐ 214/2025 Đ82'], ['Biên bản thương thảo']),
      wfStep('kq', 'Phê duyệt kết quả mua sắm trực tiếp', 'Phê duyệt kết quả và công khai theo quy định.', ['NĐ 214/2025 Đ33, Đ82'], ['Quyết định phê duyệt KQ'])
    ];
  }

  if (group === 'tuThucHien') {
    return [
      wfStep('phuong-an', 'Phương án tự thực hiện', 'Xác định phạm vi, giá trị, thời gian, chất lượng và điều kiện nghiệm thu.', ['LĐT Đ26', 'NĐ 214/2025 Đ83'], ['Phương án tự thực hiện']),
      wfStep('giao-viec', 'Thỏa thuận giao việc', 'Ký thỏa thuận giao việc hoặc ban hành văn bản giao việc cho đơn vị trực thuộc.', ['NĐ 214/2025 Đ83'], ['Thỏa thuận giao việc']),
      wfStep('kq', 'Phê duyệt, công khai kết quả', 'Phê duyệt và công khai kết quả theo quy định.', ['NĐ 214/2025 Đ83'], ['Quyết định phê duyệt KQ'])
    ];
  }

  if (group === 'congDong') {
    return [
      wfStep('du-thao-hd', 'Dự thảo hợp đồng', 'Dự thảo hợp đồng gồm phạm vi, chất lượng, tiến độ, giá và quyền nghĩa vụ các bên.', ['NĐ 214/2025 Đ87'], ['Dự thảo hợp đồng']),
      wfStep('niem-yet', 'Niêm yết, mời tham gia', 'Niêm yết tại UBND cấp xã và thông báo trên phương tiện truyền thông cấp xã.', ['LĐT Đ27', 'NĐ 214/2025 Đ87'], ['Thông báo mời tham gia']),
      wfStep('ho-so-nang-luc', 'Nhận hồ sơ năng lực', 'Cộng đồng, tổ chức đoàn thể, nhóm thợ nộp hồ sơ năng lực, kinh nghiệm.', ['NĐ 214/2025 Đ87'], ['Hồ sơ năng lực']),
      wfStep('lua-chon', 'Lựa chọn, thương thảo', 'Xem xét hồ sơ, lựa chọn và thương thảo, ký kết hợp đồng.', ['NĐ 214/2025 Đ87'], ['Biên bản lựa chọn']),
      wfStep('kq', 'Công khai kết quả', 'Công khai kết quả trên Hệ thống và tại địa phương.', ['NĐ 214/2025 Đ87'], ['Kết quả công khai'])
    ];
  }

  if (group === 'datHang') {
    return [
      wfStep('ke-hoach-dat-hang', 'Lập kế hoạch đặt hàng', 'Xác định danh mục, số lượng, chất lượng, thời gian và giá đặt hàng.', ['LĐT Đ29a', 'NĐ 214/2025 Đ106-109'], ['Kế hoạch đặt hàng']),
      wfStep('thong-bao-dat-hang', 'Thông báo mời đặt hàng', 'Thông báo, mời nhà cung cấp tham gia đặt hàng theo quy định.', ['NĐ 214/2025 Đ109'], ['Thông báo mời đặt hàng']),
      wfStep('danh-gia', 'Đánh giá hồ sơ đặt hàng', 'Đánh giá năng lực, kỹ thuật, giá và tiến độ cung cấp.', ['NĐ 214/2025 Đ109'], ['Báo cáo đánh giá']),
      wfStep('kq', 'Phê duyệt kết quả đặt hàng', 'Phê duyệt kết quả đặt hàng và công khai theo quy định.', ['NĐ 214/2025 Đ109-111'], ['Quyết định phê duyệt KQ'])
    ];
  }

  if (group === 'damPhanGia') {
    return [
      wfStep('ke-hoach-dam-phan', 'Lập kế hoạch đàm phán giá', 'Xác định danh mục, khối lượng, giá khởi điểm và phương án đàm phán.', ['LĐT Đ28', 'NĐ 214/2025'], ['Kế hoạch đàm phán giá']),
      wfStep('to-chuc-dam-phan', 'Tổ chức đàm phán giá', 'Thực hiện đàm phán với nhà thầu theo quy định.', ['LĐT Đ28', 'NĐ 214/2025'], ['Biên bản đàm phán']),
      wfStep('kq', 'Phê duyệt kết quả đàm phán giá', 'Phê duyệt kết quả và công khai theo quy định.', ['NĐ 214/2025'], ['Quyết định phê duyệt KQ'])
    ];
  }

  if (group === 'dacBiet') {
    return [
      wfStep('khlcnt', 'Lập, phê duyệt KHLCNT', 'Lập kế hoạch lựa chọn nhà thầu cho gói thầu áp dụng trường hợp đặc biệt.', ['NĐ 214/2025 Đ84-85'], ['KHLCNT']),
      wfStep('thuong-thao', 'Thương thảo, hoàn thiện hợp đồng', 'Xác định nhà thầu đủ năng lực, kinh nghiệm và thương thảo hợp đồng.', ['NĐ 214/2025 Đ85'], ['Biên bản thương thảo']),
      wfStep('kq', 'Phê duyệt, công khai kết quả', 'Phê duyệt và công khai kết quả lựa chọn nhà thầu.', ['NĐ 214/2025 Đ85'], ['Quyết định phê duyệt KQ'])
    ];
  }

  if (group === 'chaoGia') {
    return [
      wfStep('thong-bao', 'Lập, đăng tải thông báo mời chào giá', 'Đăng tải thông báo mời chào giá trên Hệ thống mạng đấu thầu quốc gia.', ['NĐ 214/2025 Đ99-102'], ['Thông báo mời chào giá']),
      wfStep('chao-gia', 'Tổ chức chào giá trực tuyến', 'Nhà thầu chào giá trực tuyến; Hệ thống ghi nhận giá và xếp hạng.', ['NĐ 214/2025 Đ102'], ['Kết quả chào giá']),
      wfStep('xac-nhan', 'Xác nhận chấp thuận trao hợp đồng', 'Mời nhà thầu xếp hạng thứ nhất xác nhận chấp thuận trao hợp đồng.', ['NĐ 214/2025 Đ102'], ['Xác nhận trao hợp đồng']),
      wfStep('kq', 'Phê duyệt, công khai kết quả', 'Phê duyệt kết quả lựa chọn nhà thầu và công khai.', ['NĐ 214/2025 Đ33'], ['Quyết định phê duyệt KQ'])
    ];
  }

  if (group === 'muaSamTrucTuyen') {
    return [
      wfStep('dat-hang-truc-tuyen', 'Đặt hàng trên Hệ thống', 'Đặt mua hàng hóa, dịch vụ trực tiếp trên Hệ thống theo danh mục mua sắm trực tuyến.', ['NĐ 214/2025 Đ103-104'], ['Đơn hàng trên Hệ thống']),
      wfStep('xac-nhan-don-hang', 'Nhà thầu xác nhận đơn hàng', 'Nhà thầu xác nhận hoặc từ chối đơn hàng trong 03 ngày làm việc.', ['NĐ 214/2025 Đ104'], ['Đơn hàng được xác nhận']),
      wfStep('kq', 'Công khai kết quả mua sắm trực tuyến', 'Công khai kết quả mua sắm trực tuyến theo quy định.', ['NĐ 214/2025 Đ104'], ['Kết quả công khai'])
    ];
  }

  if (group === 'muaSamTapTrung') {
    return [
      wfStep('tong-hop-nhu-cau', 'Tổng hợp nhu cầu mua sắm', 'Tổng hợp nhu cầu, khối lượng, chủng loại hàng hóa, dịch vụ của các đơn vị.', ['LĐT Đ53', 'NĐ 214/2025 Đ89-91'], ['Danh mục nhu cầu']),
      wfStep('khlcnt', 'Lập, phê duyệt KHLCNT', 'Lập kế hoạch lựa chọn nhà thầu cho mua sắm tập trung.', ['LĐT Đ38-41', 'NĐ 214/2025 Đ91'], ['KHLCNT']),
      wfStep('to-chuc-lua-chon', 'Tổ chức lựa chọn nhà thầu', 'Tổ chức đấu thầu rộng rãi hoặc hình thức phù hợp để lựa chọn nhà thầu.', ['NĐ 214/2025 Đ91'], ['Kết quả lựa chọn']),
      wfStep('thoa-thuan-khung', 'Ký thỏa thuận khung', 'Hoàn thiện và ký thỏa thuận khung với nhà thầu trúng thầu.', ['LĐT Đ54', 'NĐ 214/2025 Đ92'], ['Thỏa thuận khung'])
    ];
  }

  if (group === 'tuVanCaNhan') {
    return [
      wfStep('dieu-khoan-tham-chieu', 'Lập, phê duyệt điều khoản tham chiếu', 'Xác định phạm vi, sản phẩm, thời gian và tiêu chí đánh giá tư vấn cá nhân.', ['NĐ 214/2025 Đ74, Đ76'], ['Điều khoản tham chiếu']),
      wfStep('danh-sach-tu-van', 'Lập danh sách tư vấn cá nhân', 'Xác định danh sách tối thiểu 03 tư vấn cá nhân (quy trình rút gọn) hoặc theo quy trình thông thường.', ['NĐ 214/2025 Đ76'], ['Danh sách tư vấn']),
      wfStep('thu-moi', 'Gửi thư mời', 'Gửi thư mời và điều khoản tham chiếu đến tư vấn cá nhân.', ['NĐ 214/2025 Đ77'], ['Thư mời']),
      wfStep('danh-gia-ly-lich', 'Đánh giá hồ sơ lý lịch khoa học', 'Đánh giá năng lực, kinh nghiệm theo tiêu chí.', ['NĐ 214/2025 Đ77'], ['Báo cáo đánh giá']),
      wfStep('kq', 'Phê duyệt, công khai kết quả', 'Phê duyệt kết quả lựa chọn tư vấn cá nhân và công khai.', ['NĐ 214/2025 Đ33, Đ77'], ['Quyết định phê duyệt KQ'])
    ];
  }

  if (group === 'dauThauTruoc') {
    return [
      wfStep('khlcnt-truoc', 'Lập, phê duyệt KHLCNT trước', 'Lập KHLCNT cho gói thầu cần thực hiện trước khi phê duyệt dự án.', ['LĐT Đ42', 'NĐ 214/2025'], ['KHLCNT']),
      wfStep('to-chuc-truoc', 'Tổ chức lựa chọn nhà thầu trước', 'Tổ chức lựa chọn nhà thầu theo quy trình áp dụng.', ['LĐT Đ42'], ['Kết quả lựa chọn']),
      wfStep('kq', 'Phê duyệt kết quả lựa chọn', 'Phê duyệt kết quả làm cơ sở ký hợp đồng sau khi dự án được phê duyệt.', ['NĐ 214/2025 Đ33'], ['Quyết định phê duyệt KQ'])
    ];
  }

  return [
    wfStep('moi-quan-tam', 'Thông báo mời quan tâm/sơ tuyển (nếu có)', 'Thực hiện khi gói thầu áp dụng sơ tuyển hoặc mời quan tâm theo quy định.', ['LĐT Đ22', 'NĐ 214/2025 Đ25, Đ62'], ['Thông báo mời quan tâm/sơ tuyển'], 'luaChonNhaThau', opt),
    wfStep('danh-sach-ngan', 'Phê duyệt danh sách ngắn (nếu có)', 'Phê duyệt danh sách nhà thầu đáp ứng yêu cầu sơ tuyển/mời quan tâm.', ['NĐ 214/2025 Đ25, Đ62'], ['Danh sách ngắn'], 'luaChonNhaThau', opt),
    wfStep('lap-hsmt', 'Lập HSMT/HSYC', 'Lập hồ sơ mời thầu/hồ sơ yêu cầu; xác định tiêu chí đánh giá, điều kiện hợp đồng.', ['LĐT Đ44', 'NĐ 214/2025 Đ26'], ['HSMT/HSYC']),
    wfStep('tham-dinh-hsmt', 'Thẩm định HSMT/HSYC (nếu có)', 'Thẩm định hồ sơ trước khi phê duyệt.', ['NĐ 214/2025 Đ135'], ['Báo cáo thẩm định HSMT'], 'luaChonNhaThau', opt),
    wfStep('phe-duyet-hsmt', 'Phê duyệt HSMT/HSYC', 'Phê duyệt hồ sơ làm cơ sở tổ chức lựa chọn.', ['NĐ 214/2025 Đ27'], ['Quyết định phê duyệt HSMT/HSYC']),
    wfStep('thong-bao-moi-thau', 'Đăng tải thông báo mời thầu', 'Đăng tải thông báo mời thầu trên Hệ thống theo tiến độ KHLCNT.', ['LĐT Đ7-8', 'TT 79/2025 Điều 17'], ['Thông báo mời thầu']),
    wfStep('phat-hanh-hsmt', 'Phát hành, làm rõ, sửa đổi HSMT', 'Phát hành HSMT; trả lời làm rõ, sửa đổi (nếu có).', ['NĐ 214/2025 Đ28'], ['HSMT phát hành']),
    wfStep('baodam-du-thau', 'Bảo đảm dự thầu (nếu có)', 'Yêu cầu bảo đảm dự thầu theo HSMT.', ['LĐT Đ14'], ['Bảo đảm dự thầu'], 'luaChonNhaThau', opt),
    wfStep('nop-mo-thau', 'Nộp hồ sơ dự thầu, mở thầu', 'Nhà thầu nộp HSDT; tổ chức mở thầu theo quy định. Nếu đấu thầu qua mạng, nộp E-HSDT và mở thầu trên Hệ thống.', ['NĐ 214/2025 Đ28-29'], ['Biên bản mở thầu']),
    wfStep('danh-gia', 'Đánh giá hồ sơ dự thầu', 'Đánh giá hợp lệ, năng lực, kỹ thuật, tài chính và xếp hạng.', ['LĐT Đ58-63', 'NĐ 214/2025 Đ29-32'], ['Báo cáo đánh giá']),
    wfStep('thuong-thao', 'Thương thảo hợp đồng (nếu có)', 'Thương thảo, làm rõ nội dung HSDT và hợp đồng.', ['NĐ 214/2025 Đ45'], ['Biên bản thương thảo'], 'luaChonNhaThau', opt),
    wfStep('tham-dinh-kq', 'Thẩm định kết quả lựa chọn nhà thầu', 'Thẩm định KQ trước khi phê duyệt.', ['NĐ 214/2025 Đ136'], ['Báo cáo thẩm định KQ'], 'luaChonNhaThau', opt),
    wfStep('kq', 'Phê duyệt kết quả lựa chọn nhà thầu', 'Phê duyệt KQ theo Điều 33 NĐ214.', ['NĐ 214/2025 Đ33'], ['Quyết định phê duyệt KQ'])
  ];
}


const WF_TYPE_NODES = {
  consulting: [
    { key: 'thuc-hien', stage: 'thucHienHopDong', title: 'Thực hiện dịch vụ tư vấn', required: true, hint: 'Triển khai công việc tư vấn theo hợp đồng, tiến độ và sản phẩm giao nộp.', legalBasis: ['LĐT Đ66-70'], outputs: ['Sản phẩm tư vấn'] },
    { key: 'nghiem-thu', stage: 'nghiemThu', title: 'Nghiệm thu sản phẩm tư vấn', required: true, hint: 'Kiểm tra chất lượng, khối lượng, hồ sơ và nghiệm thu sản phẩm tư vấn.', legalBasis: ['LĐT Đ66-67', 'Hợp đồng'], outputs: ['Biên bản nghiệm thu'] },
    { key: 'thanh-ly', stage: 'thanhLy', title: 'Thanh lý hợp đồng', required: true, hint: 'Thanh lý hợp đồng trong thời hạn quy định sau khi hoàn thành nghĩa vụ.', legalBasis: ['NĐ 214/2025 Đ121'], outputs: ['Biên bản thanh lý'] }
  ],
  construction: [
    { key: 'khoi-cong', stage: 'thucHienHopDong', title: 'Khởi công xây dựng', required: true, hint: 'Kiểm tra điều kiện khởi công, thông báo khởi công và bắt đầu thi công.', legalBasis: ['Luật Xây dựng Đ48'], outputs: ['Thông báo khởi công'] },
    { key: 'giam-sat', stage: 'thucHienHopDong', title: 'Giám sát thi công', required: true, hint: 'Tổ chức giám sát chất lượng, khối lượng, tiến độ và an toàn thi công.', legalBasis: ['Luật Xây dựng Đ57', 'NĐ 207/2026'], outputs: ['Nhật ký giám sát'] },
    { key: 'nghiem-thu-gd', stage: 'nghiemThu', title: 'Nghiệm thu giai đoạn/hạng mục', required: true, hint: 'Nghiệm thu từng giai đoạn, hạng mục theo thiết kế và quy chuẩn kỹ thuật.', legalBasis: ['Luật Xây dựng Đ57', 'NĐ 207/2026'], outputs: ['Biên bản nghiệm thu giai đoạn'] },
    { key: 'nghiem-thu-ht', stage: 'nghiemThu', title: 'Nghiệm thu hoàn thành công trình', required: true, hint: 'Nghiệm thu hoàn thành toàn bộ công trình, lập hồ sơ hoàn công.', legalBasis: ['Luật Xây dựng Đ57'], outputs: ['Biên bản nghiệm thu hoàn thành'] },
    { key: 'ban-giao', stage: 'banGiao', title: 'Bàn giao đưa vào sử dụng', required: true, hint: 'Bàn giao công trình, hồ sơ hoàn công cho đơn vị sử dụng.', legalBasis: ['Luật Xây dựng Đ58'], outputs: ['Biên bản bàn giao'] },
    { key: 'bao-hanh', stage: 'baoHanh', title: 'Bảo hành công trình', required: true, hint: 'Theo dõi thời gian bảo hành, xử lý khiếm khuyết và hoàn tất nghĩa vụ bảo hành.', legalBasis: ['Luật Xây dựng Đ64'], outputs: ['Hồ sơ bảo hành'] }
  ],
  goods: [
    { key: 'giao-hang', stage: 'thucHienHopDong', title: 'Giao nhận hàng hóa', required: true, hint: 'Kiểm tra số lượng, chủng loại, xuất xứ và tình trạng hàng hóa khi giao nhận.', legalBasis: ['Hợp đồng', 'NĐ 214/2025'], outputs: ['Biên bản giao nhận'] },
    { key: 'kiem-tra', stage: 'nghiemThu', title: 'Kiểm tra chất lượng hàng hóa', required: true, hint: 'Kiểm tra chất lượng, thông số kỹ thuật và chứng từ của hàng hóa.', legalBasis: ['Hợp đồng', 'NĐ 214/2025'], outputs: ['Biên bản kiểm tra chất lượng'] },
    { key: 'nghiem-thu', stage: 'nghiemThu', title: 'Nghiệm thu hàng hóa', required: true, hint: 'Nghiệm thu hàng hóa theo hợp đồng làm cơ sở thanh toán.', legalBasis: ['Hợp đồng'], outputs: ['Biên bản nghiệm thu'] },
    { key: 'ban-giao-tai-san', stage: 'banGiao', title: 'Bàn giao, đăng ký tài sản', required: true, hint: 'Bàn giao hàng hóa/tài sản cho đơn vị sử dụng; cập nhật sổ tài sản công và hồ sơ tài sản.', legalBasis: ['NĐ 186/2025', 'NĐ 286/2025'], outputs: ['Biên bản bàn giao', 'Sổ tài sản'] },
    { key: 'bao-hanh', stage: 'baoHanh', title: 'Bảo hành hàng hóa', required: true, hint: 'Theo dõi bảo hành, xử lý lỗi và hoàn tất nghĩa vụ bảo hành.', legalBasis: ['Hợp đồng'], outputs: ['Hồ sơ bảo hành'] }
  ],
  mixed: [
    { key: 'thuc-hien', stage: 'thucHienHopDong', title: 'Triển khai thiết kế, thi công', required: true, hint: 'Thực hiện thiết kế, cung cấp thiết bị và thi công theo hợp đồng EPC/EC/PC.', legalBasis: ['Hợp đồng', 'NĐ 210/2026'], outputs: ['Sản phẩm thiết kế, thi công'] },
    { key: 'chay-thu', stage: 'nghiemThu', title: 'Chạy thử, nghiệm thu chạy thử', required: true, hint: 'Tổ chức chạy thử, kiểm tra thông số và nghiệm thu kết quả chạy thử.', legalBasis: ['Hợp đồng EPC', 'QĐ 1040/QĐ-BXD'], outputs: ['Biên bản chạy thử'] },
    { key: 'nghiem-thu', stage: 'nghiemThu', title: 'Nghiệm thu hoàn thành', required: true, hint: 'Nghiệm thu hoàn thành công trình/hạng mục, lập hồ sơ hoàn công.', legalBasis: ['Luật Xây dựng Đ57'], outputs: ['Biên bản nghiệm thu hoàn thành'] },
    { key: 'ban-giao', stage: 'banGiao', title: 'Bàn giao đưa vào sử dụng', required: true, hint: 'Bàn giao công trình và hồ sơ cho đơn vị sử dụng.', legalBasis: ['Luật Xây dựng Đ58'], outputs: ['Biên bản bàn giao'] },
    { key: 'bao-hanh', stage: 'baoHanh', title: 'Bảo hành công trình', required: true, hint: 'Theo dõi bảo hành và xử lý khiếm khuyết.', legalBasis: ['Luật Xây dựng Đ64', 'NĐ 210/2026'], outputs: ['Hồ sơ bảo hành'] }
  ],
  nonConsulting: [
    { key: 'thuc-hien', stage: 'thucHienHopDong', title: 'Thực hiện dịch vụ phi tư vấn', required: true, hint: 'Triển khai dịch vụ theo hợp đồng, tiến độ và yêu cầu chất lượng.', legalBasis: ['Hợp đồng'], outputs: ['Sản phẩm dịch vụ'] },
    { key: 'nghiem-thu', stage: 'nghiemThu', title: 'Nghiệm thu dịch vụ', required: true, hint: 'Kiểm tra chất lượng, khối lượng và nghiệm thu dịch vụ.', legalBasis: ['Hợp đồng'], outputs: ['Biên bản nghiệm thu'] },
    { key: 'thanh-ly', stage: 'thanhLy', title: 'Thanh lý hợp đồng', required: true, hint: 'Thanh lý hợp đồng sau khi hoàn thành nghĩa vụ.', legalBasis: ['NĐ 214/2025 Đ121'], outputs: ['Biên bản thanh lý'] }
  ]
};

function wfBuildPackageNodes(pkg) {
  if (pkg.pkgType === 'cost') {
    return [
      {
        key: 'ghi-nhan',
        stage: 'thucHienHopDong',
        title: 'Thực hiện/ghi nhận chi phí',
        required: true,
        hint: 'Chi phí thuộc dự toán, không tổ chức lựa chọn nhà thầu; theo dõi chứng từ, hồ sơ thanh toán.',
        legalBasis: ['NĐ 254/2025'],
        outputs: ['Chứng từ chi phí']
      },
      {
        key: 'thanh-toan',
        stage: 'thanhToan',
        title: 'Thanh toán chi phí',
        required: true,
        hint: 'Thanh toán theo chứng từ, hóa đơn và quy định của pháp luật.',
        legalBasis: ['NĐ 254/2025'],
        outputs: ['Hồ sơ thanh toán']
      }
    ].map(n => ({
      ...n,
      id: `pk:${pkg.id}:${n.key}`,
      packageId: pkg.id,
      packageName: pkg.name,
      packageType: pkg.pkgType,
      categoryName: pkg.categoryName,
      stage: n.stage
    }));
  }
  const group = wfMethodGroup(pkg);
  const methodNodes = wfMethodNodes(pkg);
  const methodFold = wfFold(`${pkg.selectionMethod || ''} ${pkg.name || ''} ${pkg.categoryName || ''}`);
  const noContractFlow = /tu thuc hien|cong dong/.test(methodFold);
  const kqIndex = methodNodes.findIndex(n => n.key === 'kq');
  const postingKq = {
    key: 'dang-tai-kqlcnt',
    stage: 'luaChonNhaThau',
    title: 'Đăng tải KQLCNT và thông báo kết quả',
    required: true,
    hint: 'Sau khi phê duyệt, đăng tải KQLCNT trên Hệ thống: qua mạng ngay khi phê duyệt; không qua mạng chậm nhất 05 ngày làm việc. Gửi thông báo cho nhà thầu trong 05 ngày làm việc; cập nhật thông tin nhà thầu vi phạm/uy tín (NĐ 214 Điều 22) nếu có.',
    legalBasis: ['LĐT Đ7.1g, Đ8', 'NĐ 214/2025 Đ33.5, Đ22', 'TT 79/2025 Điều 20'],
    outputs: ['KQLCNT được đăng tải', 'Thông báo kết quả cho nhà thầu']
  };
  const methodWithPosting = kqIndex >= 0
    ? [...methodNodes.slice(0, kqIndex + 1), postingKq, ...methodNodes.slice(kqIndex + 1)]
    : [...methodNodes, postingKq];
  const hopDong = {
    key: 'hop-dong',
    stage: 'kyHopDong',
    title: group === 'muaSamTapTrung'
      ? 'Ký hợp đồng với đơn vị có nhu cầu'
      : (/tu thuc hien/.test(methodFold)
        ? 'Ký thỏa thuận giao việc'
        : (/cong dong/.test(methodFold) ? 'Ký hợp đồng với cộng đồng' : 'Ký kết hợp đồng')),
    required: true,
    hint: 'Hoàn thiện và ký kết hợp đồng/thỏa thuận phù hợp quyết định phê duyệt kết quả lựa chọn nhà thầu.',
    legalBasis: ['LĐT Đ66-67', 'NĐ 214/2025 Đ34'],
    outputs: ['Hợp đồng/thỏa thuận đã ký']
  };
  const contractPosting = {
    key: 'cong-khai-hop-dong',
    stage: 'kyHopDong',
    title: 'Công khai thông tin chủ yếu của hợp đồng',
    required: true,
    hint: 'Cung cấp/đăng tải thông tin chủ yếu của hợp đồng trên Hệ thống chậm nhất 05 ngày làm việc kể từ ngày hợp đồng có hiệu lực (số hợp đồng, chủ thể, giá, loại hợp đồng, thời gian thực hiện, nhà thầu phụ...).',
    legalBasis: ['LĐT Đ7.1h, Đ8.4', 'TT 79/2025 Điều 12'],
    outputs: ['Thông tin hợp đồng được đăng tải']
  };
  const progressUpdate = {
    key: 'cap-nhat-tien-do-hd',
    stage: 'thucHienHopDong',
    title: 'Cập nhật tiến độ thực hiện hợp đồng',
    required: true,
    hint: 'Cập nhật tiến độ thực tế trên Hệ thống khi hoàn thành các mốc của hợp đồng; cập nhật thay đổi phạm vi, danh sách và tỷ lệ nhà thầu phụ (nếu có).',
    legalBasis: ['NĐ 214/2025 Đ35.2'],
    outputs: ['Tiến độ hợp đồng được cập nhật']
  };
  const performancePosting = {
    key: 'cong-khai-kqthhd',
    stage: 'congKhai',
    title: 'Công khai kết quả thực hiện hợp đồng',
    required: true,
    hint: 'Đăng tải kết quả thực hiện hợp đồng (tiến độ, chất lượng, vi phạm, chấm dứt...) trên Hệ thống chậm nhất 06 tháng kể từ ngày kết thúc thời gian thực hiện gói thầu; nếu bảo hành > 06 tháng thì cập nhật sau khi hoàn thành bảo hành. Nhà thầu phản hồi trong 20 ngày.',
    legalBasis: ['LĐT Đ7.1k', 'NĐ 214/2025 Đ20.3-20.4, Đ35.3'],
    outputs: ['Kết quả thực hiện hợp đồng được đăng tải']
  };
  const goodsQuality = pkg.pkgType === 'goods' ? {
    key: 'cong-khai-chat-luong-hh',
    stage: 'congKhai',
    title: 'Công khai chất lượng hàng hóa đã sử dụng',
    required: true,
    hint: 'Đăng tải thông tin chất lượng hàng hóa trên Hệ thống chậm nhất 06 tháng kể từ ngày kết thúc thời gian thực hiện gói thầu; cập nhật sau bảo hành nếu bảo hành > 06 tháng.',
    legalBasis: ['NĐ 214/2025 Đ20.5, Đ20.7, Đ35.3'],
    outputs: ['Thông tin chất lượng hàng hóa được đăng tải']
  } : null;
  const reputationPosting = {
    key: 'cong-khai-uy-tin',
    stage: 'congKhai',
    title: 'Công khai thông tin nhà thầu vi phạm/uy tín',
    optional: true,
    hint: 'Đăng tải thông tin nhà thầu không bảo đảm uy tín, bị chấm dứt hợp đồng do lỗi nhà thầu, bị cấm tham gia đấu thầu hoặc có hành vi vi phạm khác (nếu có).',
    legalBasis: ['NĐ 214/2025 Đ22'],
    outputs: ['Thông tin vi phạm được đăng tải']
  };
  const typeNodes = WF_TYPE_NODES[pkg.pkgType] || WF_TYPE_NODES.consulting;
  const thanhToan = {
    key: 'thanh-toan',
    stage: 'thanhToan',
    title: 'Thanh toán, tạm ứng theo hợp đồng',
    required: true,
    hint: 'Theo dõi tạm ứng, thanh toán theo khối lượng/sản phẩm nghiệm thu và chứng từ hợp lệ.',
    legalBasis: ['NĐ 254/2025', 'NĐ 214/2025 Đ118-119'],
    outputs: ['Hồ sơ thanh toán']
  };
  const thanhLy = {
    key: 'thanh-ly',
    stage: 'thanhLy',
    title: 'Thanh lý hợp đồng',
    required: true,
    hint: 'Thanh lý hợp đồng trong thời hạn quy định sau khi hoàn thành nghĩa vụ.',
    legalBasis: ['NĐ 214/2025 Đ121'],
    outputs: ['Biên bản thanh lý']
  };
  const classifyNode = {
    key: 'phan-loai',
    stage: 'chuanBiThucHien',
    title: 'Phân loại gói thầu và xác định hình thức lựa chọn',
    required: true,
    hint: 'Xác định loại gói (tư vấn/xây lắp/hàng hóa/hỗn hợp/phi tư vấn/chi phí), giá gói, nguồn vốn, hình thức và phương thức lựa chọn, loại hợp đồng, đấu thầu qua mạng hay không qua mạng; đối chiếu ngưỡng chỉ định thầu, chào hàng, mua sắm trực tiếp và các trường hợp đặc biệt.',
    legalBasis: ['LĐT Đ20, Đ29b', 'NĐ 214/2025 Đ13, Đ18'],
    outputs: ['Bảng phân loại gói thầu']
  };
  const thresholdNode = {
    key: 'doi-chieu-nguong',
    stage: 'chuanBiThucHien',
    title: 'Đối chiếu ngưỡng, điều kiện áp dụng hình thức',
    required: true,
    hint: 'Đối chiếu: chỉ định thầu dự toán mua sắm không hình thành dự án ≤ 1 tỷ; tư vấn thuộc dự án ≤ 3 tỷ; phi tư vấn/hàng hóa/xây lắp/hỗn hợp ≤ 5 tỷ; chào hàng ≤ 10 tỷ; chào giá trực tuyến rút gọn ≤ 2 tỷ (dự toán mua sắm)/≤ 5 tỷ (dự án); mua sắm trực tuyến ≤ 500 triệu (dự toán mua sắm)/≤ 1 tỷ (dự án); tư vấn cá nhân ≤ 300 triệu. Mua sắm trực tiếp: hàng hóa tương tự, khối lượng ≤ 130%, đơn giá không vượt, trong 12 tháng. Gói ≤ 100 triệu: Thủ trưởng quyết định hoặc chỉ định thầu rút gọn.',
    legalBasis: ['NĐ 214/2025 Đ73, Đ78.4, Đ81, Đ99.3, Đ103.1', 'LĐT Đ23-25'],
    outputs: ['Bảng đối chiếu ngưỡng']
  };
  const adjustKhlcnt = {
    key: 'dieu-chinh-khlcnt',
    stage: 'chuanBiThucHien',
    title: 'Điều chỉnh KHLCNT (nếu có)',
    optional: true,
    hint: 'Khi thay đổi giá gói, thời gian, hình thức lựa chọn hoặc nội dung gói thầu, lập và phê duyệt điều chỉnh KHLCNT; đăng tải lại trên Hệ thống.',
    legalBasis: ['LĐT Đ38-41', 'NĐ 214/2025 Đ16-17'],
    outputs: ['KHLCNT điều chỉnh']
  };
  const cancelNode = {
    key: 'huy-thau',
    stage: 'luaChonNhaThau',
    title: 'Hủy thầu (nếu có)',
    optional: true,
    hint: 'Khi thuộc trường hợp hủy thầu, ban hành quyết định hủy thầu và đăng tải trên Hệ thống trong 05 ngày làm việc kể từ ngày ký.',
    legalBasis: ['LĐT Đ17', 'NĐ 214/2025 Đ33.4'],
    outputs: ['Quyết định hủy thầu']
  };
  const complaintNode = {
    key: 'kien-nghi',
    stage: 'luaChonNhaThau',
    title: 'Giải quyết kiến nghị (nếu có)',
    optional: true,
    hint: 'Tiếp nhận, xử lý và đăng tải văn bản giải quyết kiến nghị của nhà thầu theo quy định.',
    legalBasis: ['LĐT Đ89', 'NĐ 214/2025 Đ137-139'],
    outputs: ['Văn bản giải quyết kiến nghị']
  };
  const contractGuarantee = {
    key: 'bao-dam-thuc-hien-hd',
    stage: 'kyHopDong',
    title: 'Bảo đảm thực hiện hợp đồng (nếu có)',
    optional: true,
    hint: 'Nhà thầu thực hiện đặt cọc, thư bảo lãnh hoặc bảo hiểm bảo lãnh trước hoặc cùng thời điểm hợp đồng có hiệu lực; trừ trường hợp pháp luật không yêu cầu.',
    legalBasis: ['LĐT Đ68'],
    outputs: ['Bảo đảm thực hiện hợp đồng']
  };
  const advanceGuarantee = {
    key: 'bao-lanh-tam-ung',
    stage: 'kyHopDong',
    title: 'Bảo lãnh tạm ứng (nếu có)',
    optional: true,
    hint: 'Khi hợp đồng có tạm ứng, yêu cầu nhà thầu nộp bảo lãnh tạm ứng tương ứng và quản lý thu hồi tạm ứng.',
    legalBasis: ['NĐ 214/2025 Đ118'],
    outputs: ['Bảo lãnh tạm ứng']
  };
  const inspectionNode = {
    key: 'kiem-tra-giam-sat',
    stage: 'congKhai',
    title: 'Kiểm tra, giám sát hoạt động đấu thầu (nếu có)',
    optional: true,
    hint: 'Chuẩn bị hồ sơ, báo cáo và phối hợp khi cơ quan có thẩm quyền kiểm tra, giám sát hoạt động đấu thầu.',
    legalBasis: ['NĐ 214/2025 Đ122-132'],
    outputs: ['Hồ sơ phục vụ kiểm tra, giám sát']
  };
  const contractAmendment = {
    key: 'dieu-chinh-hop-dong',
    stage: 'thucHienHopDong',
    title: 'Điều chỉnh hợp đồng (nếu có)',
    optional: true,
    hint: 'Khi có thay đổi khối lượng, tiến độ, giá hoặc điều kiện hợp đồng, thực hiện điều chỉnh và cập nhật thông tin trên Hệ thống.',
    legalBasis: ['LĐT Đ70', 'NĐ 214/2025 Đ114-115'],
    outputs: ['Phụ lục/điều chỉnh hợp đồng']
  };
  const archiveNode = {
    key: 'luu-tru-ho-so',
    stage: 'thanhLy',
    title: 'Lưu trữ hồ sơ đấu thầu',
    required: true,
    hint: 'Lưu trữ đầy đủ hồ sơ lựa chọn nhà thầu, hợp đồng, chứng từ và tài liệu liên quan theo quy định.',
    legalBasis: ['LĐT Đ9'],
    outputs: ['Hồ sơ lưu trữ']
  };
  const all = [
    classifyNode,
    thresholdNode,
    adjustKhlcnt,
    ...methodWithPosting,
    cancelNode,
    complaintNode,
    hopDong,
    ...(noContractFlow ? [] : [contractGuarantee, advanceGuarantee, contractPosting]),
    ...typeNodes,
    ...(noContractFlow ? [] : [contractAmendment, progressUpdate]),
    thanhToan,
    thanhLy,
    archiveNode,
    inspectionNode,
    ...(noContractFlow ? [] : [performancePosting]),
    ...(goodsQuality ? [goodsQuality] : []),
    ...(noContractFlow ? [] : [reputationPosting])
  ];
  const seen = new Set();
  return all
    .filter(n => {
      if (seen.has(n.key)) return false;
      seen.add(n.key);
      return true;
    })
    .map(n => ({
      ...n,
      id: `pk:${pkg.id}:${n.key}`,
      packageId: pkg.id,
      packageName: pkg.name,
      packageType: pkg.pkgType,
      categoryName: pkg.categoryName,
      stage: n.stage || 'luaChonNhaThau'
    }));
}

function wfBuildWorkflow(project) {
  if (!project) return { master: [], packages: [], isPurchase: false };
  const isPurchase = project.projectScope === 'nonProject';
  const master = (isPurchase ? WF_MASTER_PURCHASE : WF_MASTER_PROJECT)
    .filter(n => !n.when || n.when(project))
    .map(n => ({ ...n, id: n.id, stage: n.stage || 'chuanBiDauTu' }));
  const packages = wfProjectPackages(project).map(pkg => ({
    pkg,
    nodes: wfBuildPackageNodes(pkg)
  }));
  return { master, packages, isPurchase };
}

const WF_WORKFLOW_CATALOG = {
  build: wfBuildWorkflow,
  stages: WF_STAGE_ORDER,
  stageLabels: WF_STAGE_LABELS,
  statuses: WF_STATUSES,
  packageTypeLabels: WF_PACKAGE_TYPE_LABELS,
  collectPackages: wfProjectPackages,
  inferType: wfInferPackageType,
  fold: wfFold
};



if (typeof window !== 'undefined') window.WorkflowCatalog = WF_WORKFLOW_CATALOG;
if (typeof globalThis !== 'undefined') globalThis.WorkflowCatalog = WF_WORKFLOW_CATALOG;
