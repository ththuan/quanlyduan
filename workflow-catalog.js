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

function wfMethodNodes(pkg) {
  const method = wfFold(pkg.selectionMethod || '');
  if (method.includes('chi dinh')) {
    return [
      {
        key: 'chi-dinh',
        stage: 'luaChonNhaThau',
        title: 'Quyết định chỉ định thầu',
        required: true,
        hint: 'Áp dụng quy trình chỉ định thầu rút gọn hoặc thông thường theo NĐ 214/2025 Điều 78-80.',
        legalBasis: ['NĐ 214/2025 Đ78-80'],
        outputs: ['Quyết định chỉ định thầu']
      },
      {
        key: 'du-thao-hd',
        stage: 'luaChonNhaThau',
        title: 'Dự thảo, thương thảo hợp đồng',
        required: true,
        hint: 'Hoàn thiện dự thảo hợp đồng, thương thảo giá và các điều kiện hợp đồng.',
        legalBasis: ['NĐ 214/2025 Đ80'],
        outputs: ['Biên bản thương thảo', 'Dự thảo hợp đồng']
      },
      {
        key: 'kq',
        stage: 'luaChonNhaThau',
        title: 'Phê duyệt, công khai kết quả chỉ định thầu',
        required: true,
        hint: 'Phê duyệt kết quả lựa chọn nhà thầu và công khai theo quy định.',
        legalBasis: ['NĐ 214/2025 Đ33, Đ80'],
        outputs: ['Quyết định phê duyệt KQ']
      }
    ];
  }
  if (method.includes('chao hang')) {
    return [
      { key: 'hsmt', stage: 'luaChonNhaThau', title: 'Lập, phê duyệt HSMT chào hàng', required: true, hint: 'HSMT chào hàng cạnh tranh; thời gian chuẩn bị hồ sơ tối thiểu 07 ngày làm việc.', legalBasis: ['NĐ 214/2025 Đ81'], outputs: ['HSMT chào hàng'] },
      { key: 'to-chuc', stage: 'luaChonNhaThau', title: 'Phát hành, mở thầu', required: true, hint: 'Đăng tải, phát hành HSMT và tổ chức mở thầu.', legalBasis: ['NĐ 214/2025 Đ81'], outputs: ['Biên bản mở thầu'] },
      { key: 'danh-gia', stage: 'luaChonNhaThau', title: 'Đánh giá hồ sơ dự thầu', required: true, hint: 'Đánh giá hợp lệ, năng lực, kỹ thuật, tài chính và xếp hạng nhà thầu.', legalBasis: ['NĐ 214/2025 Đ81'], outputs: ['Báo cáo đánh giá'] },
      { key: 'kq', stage: 'luaChonNhaThau', title: 'Phê duyệt, công khai KQ', required: true, hint: 'Phê duyệt kết quả lựa chọn nhà thầu và công khai.', legalBasis: ['NĐ 214/2025 Đ33, Đ81'], outputs: ['Quyết định phê duyệt KQ'] }
    ];
  }
  if (method.includes('mua sam truc tiep')) {
    return [
      { key: 'hsyc', stage: 'luaChonNhaThau', title: 'Lập, phê duyệt HSYC mua sắm trực tiếp', required: true, hint: 'HSYC gửi nhà thầu đã trúng thầu trước đó; kiểm tra khối lượng, đơn giá.', legalBasis: ['LĐT Đ25', 'NĐ 214/2025 Đ82'], outputs: ['HSYC'] },
      { key: 'de-xuat', stage: 'luaChonNhaThau', title: 'Nộp đề xuất, thương thảo', required: true, hint: 'Nhà thầu nộp hồ sơ đề xuất; chủ đầu tư đánh giá, thương thảo.', legalBasis: ['NĐ 214/2025 Đ82'], outputs: ['Hồ sơ đề xuất', 'Biên bản thương thảo'] },
      { key: 'kq', stage: 'luaChonNhaThau', title: 'Phê duyệt, công khai KQ', required: true, hint: 'Phê duyệt kết quả mua sắm trực tiếp và công khai.', legalBasis: ['NĐ 214/2025 Đ33, Đ82'], outputs: ['Quyết định phê duyệt KQ'] }
    ];
  }
  if (method.includes('tu thuc hien')) {
    return [
      { key: 'phuong-an', stage: 'luaChonNhaThau', title: 'Phương án tự thực hiện', required: true, hint: 'Xác định phạm vi, giá trị, thời gian, chất lượng và điều kiện nghiệm thu.', legalBasis: ['LĐT Đ26', 'NĐ 214/2025 Đ83'], outputs: ['Phương án tự thực hiện'] },
      { key: 'giao-viec', stage: 'luaChonNhaThau', title: 'Thỏa thuận giao việc', required: true, hint: 'Ký thỏa thuận giao việc hoặc ban hành văn bản giao việc.', legalBasis: ['NĐ 214/2025 Đ83'], outputs: ['Thỏa thuận giao việc'] },
      { key: 'kq', stage: 'luaChonNhaThau', title: 'Phê duyệt, công khai KQ', required: true, hint: 'Phê duyệt và công khai kết quả theo quy định.', legalBasis: ['NĐ 214/2025 Đ83'], outputs: ['Quyết định phê duyệt KQ'] }
    ];
  }
  if (method.includes('cong dong')) {
    return [
      { key: 'thong-bao', stage: 'luaChonNhaThau', title: 'Niêm yết, mời tham gia', required: true, hint: 'Niêm yết tại UBND cấp xã và thông báo trên phương tiện truyền thông cấp xã.', legalBasis: ['LĐT Đ27', 'NĐ 214/2025 Đ87'], outputs: ['Thông báo mời tham gia'] },
      { key: 'lua-chon', stage: 'luaChonNhaThau', title: 'Lựa chọn cộng đồng/nhóm thợ', required: true, hint: 'Xem xét hồ sơ năng lực, lựa chọn và thương thảo hợp đồng.', legalBasis: ['NĐ 214/2025 Đ87'], outputs: ['Biên bản lựa chọn'] },
      { key: 'kq', stage: 'luaChonNhaThau', title: 'Công khai kết quả', required: true, hint: 'Công khai kết quả lựa chọn trên Hệ thống và tại địa phương.', legalBasis: ['NĐ 214/2025 Đ87'], outputs: ['Kết quả công khai'] }
    ];
  }
  if (method.includes('dat hang')) {
    return [
      { key: 'dat-hang', stage: 'luaChonNhaThau', title: 'Đặt hàng', required: true, hint: 'Thực hiện quy trình đặt hàng theo NĐ 214/2025 Điều 106-112.', legalBasis: ['LĐT Đ29a', 'NĐ 214/2025 Đ106-112'], outputs: ['Quyết định đặt hàng'] }
    ];
  }
  if (method.includes('chao gia truc tuyen')) {
    return [
      { key: 'thong-bao', stage: 'luaChonNhaThau', title: 'Thông báo mời chào giá', required: true, hint: 'Đăng tải thông báo mời chào giá trên Hệ thống mạng đấu thầu quốc gia.', legalBasis: ['NĐ 214/2025 Đ99-102'], outputs: ['Thông báo mời chào giá'] },
      { key: 'chao-gia', stage: 'luaChonNhaThau', title: 'Tổ chức chào giá trực tuyến', required: true, hint: 'Nhà thầu chào giá trực tuyến; hệ thống ghi nhận giá và xếp hạng.', legalBasis: ['NĐ 214/2025 Đ102'], outputs: ['Kết quả chào giá'] },
      { key: 'kq', stage: 'luaChonNhaThau', title: 'Phê duyệt, công khai KQ', required: true, hint: 'Phê duyệt kết quả lựa chọn nhà thầu và công khai.', legalBasis: ['NĐ 214/2025 Đ33'], outputs: ['Quyết định phê duyệt KQ'] }
    ];
  }
  return [
    { key: 'hsmt', stage: 'luaChonNhaThau', title: 'Lập, thẩm định, phê duyệt HSMT/HSYC', required: true, hint: 'Lập HSMT/HSYC, thẩm định (nếu có) và phê duyệt làm cơ sở tổ chức lựa chọn.', legalBasis: ['LĐT Đ44', 'NĐ 214/2025 Đ26-27'], outputs: ['HSMT/HSYC được duyệt'] },
    { key: 'to-chuc', stage: 'luaChonNhaThau', title: 'Thông báo mời thầu, phát hành, mở thầu', required: true, hint: 'Đăng tải thông báo, phát hành HSMT và tổ chức mở thầu.', legalBasis: ['LĐT Đ7-8', 'NĐ 214/2025 Đ28'], outputs: ['Biên bản mở thầu'] },
    { key: 'danh-gia', stage: 'luaChonNhaThau', title: 'Đánh giá hồ sơ dự thầu/đề xuất', required: true, hint: 'Đánh giá hợp lệ, năng lực, kỹ thuật, tài chính và xếp hạng nhà thầu.', legalBasis: ['LĐT Đ58-63', 'NĐ 214/2025 Đ29-32'], outputs: ['Báo cáo đánh giá'] },
    { key: 'kq', stage: 'luaChonNhaThau', title: 'Thẩm định, phê duyệt, công khai KQ', required: true, hint: 'Thẩm định (nếu có), phê duyệt kết quả lựa chọn nhà thầu và công khai.', legalBasis: ['NĐ 214/2025 Đ33'], outputs: ['Quyết định phê duyệt KQ'] }
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
  const methodNodes = wfMethodNodes(pkg);
  const methodFold = wfFold(pkg.selectionMethod || '');
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
    title: /tu thuc hien/.test(methodFold)
      ? 'Ký thỏa thuận giao việc'
      : (/cong dong/.test(methodFold) ? 'Ký hợp đồng với cộng đồng' : 'Ký kết hợp đồng'),
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
  const all = [
    ...methodWithPosting,
    hopDong,
    ...(noContractFlow ? [] : [contractPosting]),
    ...typeNodes,
    ...(noContractFlow ? [] : [progressUpdate]),
    thanhToan,
    thanhLy,
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



