(function () {
  'use strict';

  const E = function (id, title, spot, group, lines, choices, options) {
    return Object.assign({ id: id, title: title, spot: spot, tier: 'mid', group: group, lines: lines, choices: choices || [], weight: 1, cooldownDays: 5 }, options || {});
  };

  const C = function (id, label, effects, followup) {
    return { id: id, label: label, effects: effects || {}, followup: followup || '' };
  };

  const midEvents = [
    E('deadline-report', 'Báo cáo cần hoàn tất trước giờ họp', 'meeting', ['work'], [
      { person: 'HẢI', text: 'Báo cáo tổng hợp vừa được yêu cầu sớm hơn hai giờ. Chúng ta phải chốt phần nào thật sự cần trước cuộc họp.' },
      { person: 'LONG', text: 'Tôi có thể khóa số liệu chính trước, phần thuyết minh sẽ cập nhật sau khi đối chiếu lần cuối.' },
      { person: 'MINH', text: 'Tôi chuẩn hóa biểu mẫu ngay để mọi người không mất thời gian sửa định dạng.' }
    ], [
      C('focus', 'Ưu tiên số liệu cốt lõi', { metrics: { efficiency: 4, workload: 5, complianceRisk: 1 } }, 'Nhóm thống nhất hoàn tất phần bắt buộc trước, nội dung phụ cập nhật sau.'),
      C('complete', 'Làm đủ toàn bộ báo cáo', { metrics: { quality: 3, workload: 9, morale: -2 } }, 'Cả nhóm làm thêm để giữ báo cáo đầy đủ ngay trong lần trình đầu.')
    ], { cooldownDays: 6, weekdays: [1, 4] }),

    E('invoice-mismatch', 'Hóa đơn và biên bản chưa khớp', 'meeting', ['work', 'system'], [
      { person: 'LONG', text: 'Số tiền trên hóa đơn lệch với biên bản nghiệm thu. Chưa thể đưa sang bước thanh toán.' },
      { person: 'PHÚC', text: 'Phải giữ nguyên dấu vết, xác định nguồn sai rồi mới yêu cầu điều chỉnh.' },
      { person: 'NAM', text: 'Tôi kiểm tra phiên bản tệp và thời điểm văn bản được chuyển đến.' }
    ], [
      C('return', 'Trả lại để điều chỉnh chứng từ', { metrics: { complianceRisk: -6, efficiency: -2, quality: 4 } }, 'Hồ sơ được trả về đúng đầu mối và ghi rõ nội dung cần sửa.'),
      C('verify', 'Đối chiếu thêm trước khi trả', { metrics: { complianceRisk: -3, workload: 4, quality: 2 } }, 'Nhóm mở một vòng đối chiếu bổ sung trước khi phát hành yêu cầu điều chỉnh.')
    ], { modes: ['processing', 'waiting'], cooldownDays: 8 }),

    E('missing-acceptance', 'Thiếu biên bản nghiệm thu', 'records', ['work'], [
      { person: 'NAM', text: 'Bộ hồ sơ chưa có biên bản nghiệm thu bản cuối. Tôi chỉ thấy một bản dự thảo.' },
      { person: 'MINH', text: 'Tôi sẽ đánh dấu trường bắt buộc còn thiếu trong danh mục chứng từ.' },
      { person: 'PHÚC', text: 'Không được thay bản dự thảo cho tài liệu đã ký và kiểm tra thực tế.' }
    ], [
      C('pause', 'Tạm dừng bước thanh toán', { metrics: { complianceRisk: -5, efficiency: -2 } }, 'Bước thanh toán được giữ lại cho đến khi có biên bản hợp lệ.'),
      C('prepare', 'Chuẩn bị trước phần không phụ thuộc', { metrics: { efficiency: 3, workload: 2, complianceRisk: -2 } }, 'AI tiếp tục chuẩn bị danh mục và báo cáo, nhưng không vượt qua điểm kiểm soát của con người.')
    ], { modes: ['processing', 'waiting'], cooldownDays: 7 }),

    E('rush-procurement', 'Yêu cầu mua sắm phát sinh sát hạn', 'board', ['work', 'system'], [
      { person: 'LÂM', text: 'Có yêu cầu mua sắm mới cần hoàn thành rất sớm, nhưng thông tin cấu hình còn chưa đủ.' },
      { person: 'HẢI', text: 'Ta cần tách nhu cầu khẩn thực sự khỏi phần có thể lập kế hoạch bình thường.' },
      { person: 'PHÚC', text: 'Khẩn không có nghĩa là bỏ căn cứ, bỏ thẩm quyền hoặc bỏ bước kiểm soát.' }
    ], [
      C('scope', 'Thu hẹp phạm vi cấp thiết', { metrics: { efficiency: 4, complianceRisk: -3, morale: 1 } }, 'Yêu cầu được chia thành phần cấp thiết và phần lập kế hoạch sau.'),
      C('full', 'Giữ toàn bộ phạm vi', { metrics: { workload: 8, complianceRisk: 2, quality: 2 } }, 'Nhóm giữ phạm vi lớn và chấp nhận áp lực điều phối cao hơn.')
    ], { cooldownDays: 9 }),

    E('urgent-approval', 'Hồ sơ cần ý kiến người có thẩm quyền', 'meeting', ['work', 'people'], [
      { person: 'PHÚC', text: 'Điểm này không thuộc phần AI hoặc nhóm nghiệp vụ có thể tự quyết.' },
      { person: 'HẢI', text: 'Tôi sẽ tóm tắt phương án và rủi ro để trình đúng người có thẩm quyền.' },
      { person: 'LONG', text: 'Các con số đã khóa, chỉ còn quyết định lựa chọn phương án.' }
    ], [
      C('brief', 'Trình bản tóm tắt hai phương án', { metrics: { quality: 3, efficiency: 2, complianceRisk: -3 } }, 'Người có thẩm quyền nhận được hai phương án cùng tác động rõ ràng.'),
      C('detail', 'Trình toàn bộ hồ sơ chi tiết', { metrics: { quality: 4, workload: 5, efficiency: -1 } }, 'Nhóm chuẩn bị bộ trình đầy đủ để người phê duyệt xem toàn bộ căn cứ.')
    ], { modes: ['waiting'], cooldownDays: 5 }),

    E('review-disagreement', 'Bất đồng trong cách rà soát', 'meeting', ['people', 'work'], [
      { person: 'LÂM', text: 'Nếu yêu cầu thêm tài liệu lúc này, nhà cung cấp sẽ chậm báo giá.' },
      { person: 'PHÚC', text: 'Nếu thiếu căn cứ thì báo giá nhanh cũng không giúp hồ sơ đi tiếp được.' },
      { person: 'HẢI', text: 'Hai bên cần thống nhất danh sách tối thiểu và thời điểm bổ sung.' }
    ], [
      C('minimum', 'Chốt bộ tài liệu tối thiểu', { metrics: { efficiency: 3, morale: 2 }, relations: { 'LAM:PHUC': 2 } }, 'Lâm và Phúc thống nhất danh sách tối thiểu có thời hạn bổ sung rõ ràng.'),
      C('strict', 'Yêu cầu đầy đủ trước khi tiếp tục', { metrics: { complianceRisk: -4, efficiency: -3 }, relations: { 'LAM:PHUC': -2 } }, 'Nhóm ưu tiên kiểm soát đầy đủ, chấp nhận thời gian kéo dài hơn.')
    ], { cooldownDays: 8 }),

    E('handover-gap', 'Khoảng trống trong bàn giao', 'records', ['people'], [
      { person: 'NAM', text: 'Có hai tệp được chuyển nhưng không kèm ghi chú phiên bản nào là bản cuối.' },
      { person: 'MINH', text: 'Tôi đã dùng bản mới hơn, nhưng đúng là chưa cập nhật vào danh mục bàn giao.' },
      { person: 'HẢI', text: 'Ta cần quy ước tên tệp và người xác nhận phiên bản cuối.' }
    ], [
      C('standardize', 'Chuẩn hóa quy tắc bàn giao', { metrics: { quality: 4, efficiency: 2, workload: 2 }, relations: { 'MINH:NAM': 2 } }, 'Một quy tắc tên tệp và xác nhận phiên bản được áp dụng ngay.'),
      C('quick-fix', 'Chỉ sửa hồ sơ hiện tại', { metrics: { efficiency: 2, quality: -1 }, relations: { 'MINH:NAM': -1 } }, 'Hồ sơ hiện tại được sửa nhanh nhưng nguyên nhân hệ thống vẫn còn.')
    ], { cooldownDays: 7 }),

    E('budget-rumor', 'Tin đồn về việc giảm ngân sách', 'coffee', ['people', 'system'], [
      { person: 'MINH', text: 'Mọi người đang truyền nhau tin tháng tới sẽ giảm mạnh ngân sách.' },
      { person: 'LONG', text: 'Tôi chưa thấy thông báo chính thức, không nên đổi kế hoạch chỉ dựa trên tin đồn.' },
      { person: 'HẢI', text: 'Ta kiểm tra nguồn và vẫn chuẩn bị một phương án dự phòng.' }
    ], [
      C('verify-source', 'Xác minh nguồn chính thức', { metrics: { morale: 2, complianceRisk: -2, efficiency: 1 } }, 'Nhóm chờ thông tin chính thức và chuẩn bị phương án dự phòng kín đáo.'),
      C('prepare-cut', 'Lập tức chuẩn bị cắt giảm', { metrics: { workload: 4, morale: -4, efficiency: 1 } }, 'Nhóm bắt đầu rà soát các khoản có thể cắt, tâm lý văn phòng trở nên căng hơn.')
    ], { weekdays: [3], cooldownDays: 14 }),

    E('mentor-newcomer', 'Hướng dẫn người mới', 'forms', ['people', 'personal'], [
      { person: 'MINH', text: 'Bạn mới chưa quen bộ biểu mẫu và đang điền nhầm trường thông tin.' },
      { person: 'NAM', text: 'Tôi có thể hướng dẫn cách tìm đúng phiên bản tài liệu trong tủ hồ sơ.' },
      { person: 'HẢI', text: 'Hãy dành một khoảng ngắn để hướng dẫn đúng từ đầu.' }
    ], [
      C('pair', 'Ghép người hướng dẫn trực tiếp', { metrics: { morale: 4, workload: 2, quality: 2 }, relations: { 'MINH:NAM': 1 } }, 'Người mới được hướng dẫn theo một hồ sơ mẫu hoàn chỉnh.'),
      C('guide', 'Gửi tài liệu tự học', { metrics: { efficiency: 2, morale: -1, workload: -1 } }, 'Tài liệu được gửi nhanh nhưng người mới cần tự xử lý nhiều hơn.')
    ], { weekdays: [2, 3], cooldownDays: 12 }),

    E('credit-dispute', 'Tranh luận về phần đóng góp', 'meeting', ['people', 'work'], [
      { person: 'LONG', text: 'Phần đối chiếu số liệu đã mất khá nhiều thời gian nhưng không được ghi trong bản tổng kết.' },
      { person: 'MINH', text: 'Tôi chỉ ghi các đầu việc nhìn thấy trong báo cáo, không có ý bỏ sót.' },
      { person: 'HẢI', text: 'Bản tổng kết cần phản ánh đúng đóng góp để tránh tích tụ khó chịu.' }
    ], [
      C('revise', 'Cập nhật lại phần đóng góp', { metrics: { morale: 4, quality: 1 }, relations: { 'LONG:MINH': 3 } }, 'Bản tổng kết được sửa và ghi nhận rõ phần việc đối chiếu.'),
      C('move-on', 'Giữ báo cáo, trao đổi riêng', { metrics: { efficiency: 1, morale: -2 }, relations: { 'LONG:MINH': -2 } }, 'Nhóm không sửa báo cáo nhưng trưởng nhóm trao đổi riêng với hai bên.')
    ], { cooldownDays: 12 }),

    E('printer-breakdown', 'Máy in dừng giữa đợt hoàn thiện hồ sơ', 'print', ['random', 'work'], [
      { person: 'MINH', text: 'Máy in báo lỗi đúng lúc cần đóng bộ hồ sơ.' },
      { person: 'NAM', text: 'Tôi kiểm tra hàng đợi, có thể chuyển phần cần gấp sang máy còn lại.' },
      { person: 'PHÚC', text: 'Nhớ đối chiếu bản in thay thế với phiên bản điện tử trước khi trình.' }
    ], [
      C('reroute', 'Chuyển hàng đợi sang máy dự phòng', { metrics: { efficiency: 2, systemHealth: -2, workload: 2 } }, 'Tài liệu gấp được chuyển sang máy dự phòng.'),
      C('repair', 'Dừng để xử lý máy chính', { metrics: { systemHealth: 5, efficiency: -3, workload: 1 } }, 'Nhóm xử lý nguyên nhân để tránh lỗi lặp lại trong ngày.')
    ], { cooldownDays: 6 }),

    E('network-outage', 'Mạng nội bộ chập chờn', 'server', ['random', 'system'], [
      { person: 'PHÚC', text: 'Kết nối đến NAS đang chập chờn, chưa nên ghi đè tệp trong lúc này.' },
      { person: 'NAM', text: 'Tôi tạm khóa đồng bộ và ghi lại danh sách tệp đang mở.' },
      { person: 'LONG', text: 'Tôi có thể tiếp tục đối chiếu trên bản local đã tải trước đó.' }
    ], [
      C('offline', 'Chuyển sang chế độ làm việc ngoại tuyến', { metrics: { efficiency: 1, systemHealth: -3, complianceRisk: -1 } }, 'Nhóm làm việc trên bản local và giữ danh sách chờ đồng bộ.'),
      C('pause-network', 'Tạm dừng để kiểm tra mạng', { metrics: { systemHealth: 6, efficiency: -4 } }, 'Công việc mạng được dừng ngắn để kiểm tra switch và kết nối NAS.')
    ], { cooldownDays: 8 }),

    E('coffee-machine-failure', 'Máy pha cà phê hỏng', 'coffee', ['random', 'people'], [
      { person: 'MINH', text: 'Máy pha cà phê không hoạt động, đúng hôm mọi người đều đến sớm.' },
      { person: 'LÂM', text: 'Tôi có thể gọi đồ uống ngoài, nhưng sẽ mất một lúc.' },
      { person: 'HẢI', text: 'Coi như cả nhóm có một lý do đổi không khí vài phút.' }
    ], [
      C('order', 'Đặt đồ uống cho cả nhóm', { metrics: { morale: 5, efficiency: -1 }, relations: { 'HAI:TEAM': 2 } }, 'Không khí văn phòng nhẹ hơn sau một đợt đồ uống chung.'),
      C('skip', 'Bỏ qua và tiếp tục làm việc', { metrics: { efficiency: 2, morale: -2 } }, 'Mọi người quay lại bàn, nhịp làm việc nhanh nhưng hơi căng.')
    ], { cooldownDays: 10 }),

    E('power-flicker', 'Nguồn điện chập chờn trong vài giây', 'server', ['random', 'system'], [
      { person: 'PHÚC', text: 'UPS đã chuyển nguồn đúng cách, nhưng cần kiểm tra nhật ký thiết bị.' },
      { person: 'NAM', text: 'NAS không mất kết nối, hàng đợi đồng bộ vẫn còn nguyên.' },
      { person: 'HẢI', text: 'Ta kiểm tra nhanh rồi mới tiếp tục các thao tác ghi dữ liệu lớn.' }
    ], [
      C('full-check', 'Kiểm tra toàn bộ hạ tầng', { metrics: { systemHealth: 7, efficiency: -3, complianceRisk: -1 } }, 'Nhóm rà nguồn, UPS và nhật ký NAS trước khi tiếp tục.'),
      C('monitor', 'Tiếp tục và tăng giám sát', { metrics: { efficiency: 2, systemHealth: -2, complianceRisk: 1 } }, 'Công việc tiếp tục trong khi hệ thống được theo dõi sát hơn.')
    ], { cooldownDays: 14 }),

    E('birthday-surprise', 'Một sinh nhật nhỏ trong văn phòng', 'coffee', ['random', 'personal'], [
      { person: 'MINH', text: 'Mọi người giữ kín nhé, giờ nghỉ sẽ có một chiếc bánh nhỏ.' },
      { person: 'NAM', text: 'Tôi đã dọn một góc bàn và kiểm tra lịch khách đến.' },
      { person: 'HẢI', text: 'Chúng ta nghỉ đúng mười phút rồi quay lại công việc.' }
    ], [
      C('join', 'Cả nhóm cùng tham gia', { metrics: { morale: 8, efficiency: -2 }, relations: { 'TEAM:TEAM': 3 } }, 'Một khoảng nghỉ ngắn giúp quan hệ trong nhóm tốt lên.'),
      C('rotate', 'Chia lượt để không dừng công việc', { metrics: { morale: 4, efficiency: 1 }, relations: { 'TEAM:TEAM': 1 } }, 'Mọi người thay phiên ghé qua, công việc vẫn được duy trì.')
    ], { weekdays: [5], cooldownDays: 20 }),

    E('budget-cut', 'Thông báo điều chỉnh ngân sách', 'meeting', ['system', 'work'], [
      { person: 'LONG', text: 'Ngân sách khả dụng đã giảm, một số hạng mục phải sắp xếp lại.' },
      { person: 'LÂM', text: 'Tôi sẽ rà báo giá và tách phần bắt buộc khỏi phần có thể lùi.' },
      { person: 'PHÚC', text: 'Mọi điều chỉnh vẫn phải có căn cứ và ghi nhận thay đổi phạm vi.' }
    ], [
      C('priority', 'Giữ các hạng mục thiết yếu', { metrics: { efficiency: 3, quality: 1, morale: -1 } }, 'Nguồn lực được dồn cho các hạng mục ảnh hưởng trực tiếp hoạt động.'),
      C('spread', 'Giảm đều toàn bộ hạng mục', { metrics: { quality: -3, morale: -2, complianceRisk: 1 } }, 'Mỗi hạng mục đều bị thu hẹp, giảm xung đột ưu tiên nhưng tăng rủi ro chất lượng.')
    ], { cooldownDays: 20 }),

    E('policy-update', 'Quy định nội bộ vừa được cập nhật', 'records', ['system', 'work'], [
      { person: 'PHÚC', text: 'Có một cập nhật mới liên quan đến bước kiểm soát và trách nhiệm lưu chứng từ.' },
      { person: 'MINH', text: 'Tôi cần rà lại các mẫu đang dùng để tránh giữ nội dung cũ.' },
      { person: 'NAM', text: 'Tôi sẽ đánh dấu ngày hiệu lực và lưu cả phiên bản trước để tra cứu.' }
    ], [
      C('apply-now', 'Áp dụng ngay cho hồ sơ mới', { metrics: { complianceRisk: -5, workload: 4, quality: 2 } }, 'Quy định mới được áp dụng ngay, hồ sơ đang chạy được rà tác động riêng.'),
      C('transition', 'Lập kế hoạch chuyển tiếp', { metrics: { complianceRisk: -3, efficiency: 2, workload: 2 } }, 'Nhóm lập danh sách hồ sơ chịu tác động và thời điểm chuyển đổi.')
    ], { cooldownDays: 18 }),

    E('audit-sample', 'Hồ sơ được chọn kiểm tra ngẫu nhiên', 'meeting', ['system', 'work'], [
      { person: 'PHÚC', text: 'Một hồ sơ vừa được chọn để kiểm tra ngẫu nhiên. Ta cần chứng minh được toàn bộ dấu vết xử lý.' },
      { person: 'NAM', text: 'Nhật ký phiên bản và tệp nguồn đều còn trên NAS.' },
      { person: 'LONG', text: 'Tôi sẽ chuẩn bị bảng đối chiếu số liệu và chứng từ liên quan.' }
    ], [
      C('full-pack', 'Chuẩn bị bộ kiểm tra đầy đủ', { metrics: { complianceRisk: -7, workload: 6, quality: 3 } }, 'Một bộ kiểm tra đầy đủ được đóng gói với nhật ký và căn cứ.'),
      C('focused-pack', 'Chỉ chuẩn bị phạm vi được yêu cầu', { metrics: { efficiency: 3, complianceRisk: -2, workload: 2 } }, 'Nhóm chuẩn bị đúng phạm vi, sẵn sàng bổ sung khi có yêu cầu tiếp theo.')
    ], { cooldownDays: 16 }),

    E('family-leave', 'Một nhân viên cần xin nghỉ đột xuất', 'lounge', ['personal', 'people'], [
      { person: 'HẢI', text: 'Một thành viên cần nghỉ vì việc gia đình. Ta phải phân lại phần việc trong hôm nay.' },
      { person: 'MINH', text: 'Tôi có thể nhận phần biểu mẫu, nhưng cần người hỗ trợ kiểm tra phiên bản.' },
      { person: 'NAM', text: 'Tôi nhận phần tài liệu và bàn giao để công việc không bị đứt.' }
    ], [
      C('redistribute', 'Chia việc đều trong nhóm', { metrics: { morale: 3, workload: 5, efficiency: -1 }, relations: { 'TEAM:TEAM': 2 } }, 'Công việc được chia đều và người nghỉ không phải xử lý từ xa.'),
      C('critical-only', 'Chỉ giữ đầu việc cấp thiết', { metrics: { workload: -2, efficiency: 2, quality: -1 } }, 'Nhóm hoãn các việc ít cấp thiết để bảo vệ năng lực trong ngày.')
    ], { cooldownDays: 18 }),

    E('burnout-signs', 'Dấu hiệu quá tải cuối ngày', 'coffee', ['personal', 'work'], [
      { person: 'LONG', text: 'Mấy ngày nay số liệu đổi liên tục, tôi bắt đầu khó giữ tập trung.' },
      { person: 'MINH', text: 'Tôi cũng đang xử lý nhiều phiên bản cùng lúc, cần chốt thứ tự ưu tiên.' },
      { person: 'HẢI', text: 'Ta dừng nhận thêm việc không khẩn và khóa ba ưu tiên chính.' }
    ], [
      C('reduce-load', 'Giảm tải và khóa ưu tiên', { metrics: { morale: 6, workload: -7, efficiency: 1 }, relations: { 'TEAM:TEAM': 2 } }, 'Khối lượng được thu gọn để cả nhóm phục hồi nhịp làm việc.'),
      C('push', 'Cố hoàn tất thêm một đợt', { metrics: { efficiency: 4, workload: 7, morale: -6, quality: -1 } }, 'Nhóm tăng tốc thêm một đợt nhưng mức căng thẳng tăng rõ rệt.')
    ], { weekdays: [4, 5], cooldownDays: 12 })
  ];

  const arcs = [
    {
      id: 'month-close', type: 'main', title: 'Đóng bộ hồ sơ trọng điểm cuối tháng', durationDays: 16,
      summary: 'Một bộ hồ sơ lớn phải đi qua đủ bước, chịu nhiều thay đổi và được đóng gói trước cuối tháng.',
      beats: [
        { id: 'setup', dayOffset: 0, title: 'Hồ sơ trọng điểm xuất hiện', spot: 'meeting', lines: [
          { person: 'HẢI', text: 'Tháng này có một bộ hồ sơ trọng điểm cần theo dõi xuyên suốt, mọi thay đổi phải được ghi rõ.' },
          { person: 'PHÚC', text: 'Tôi lập danh sách điểm kiểm soát ngay từ đầu để không dồn rủi ro về cuối.' },
          { person: 'NAM', text: 'Tôi tạo cấu trúc lưu trữ riêng và khóa quy tắc đặt tên phiên bản.' }
        ], effects: { metrics: { workload: 3, quality: 2 } } },
        { id: 'rising', dayOffset: 4, title: 'Phạm vi hồ sơ thay đổi', spot: 'meeting', lines: [
          { person: 'LÂM', text: 'Đơn vị đề nghị bổ sung một hạng mục mới sau khi báo giá đã được thu thập.' },
          { person: 'LONG', text: 'Thay đổi này ảnh hưởng tổng giá trị và cách đối chiếu ngân sách.' },
          { person: 'PHÚC', text: 'Phải ghi nhận thay đổi phạm vi và xác định bước nào cần thực hiện lại.' }
        ], choices: [
          C('rebaseline', 'Lập lại mốc phạm vi và tiến độ', { metrics: { complianceRisk: -5, workload: 5, quality: 3 } }, 'Arc được lập lại mốc, chậm hơn nhưng có dấu vết rõ.'),
          C('separate', 'Tách hạng mục mới thành hồ sơ sau', { metrics: { efficiency: 4, workload: -2, morale: 1 } }, 'Hồ sơ hiện tại giữ nguyên, hạng mục mới được đưa sang vòng sau.')
        ] },
        { id: 'climax', dayOffset: 10, title: 'Điểm nghẽn trước hạn cuối', spot: 'meeting', lines: [
          { person: 'MINH', text: 'Một biểu mẫu quan trọng vẫn đang chờ xác nhận trong khi hạn đóng bộ đã gần.' },
          { person: 'HẢI', text: 'Ta phải phân biệt phần có thể hoàn thiện và phần buộc chờ quyết định của con người.' },
          { person: 'PHÚC', text: 'Không được biến áp lực thời gian thành lý do bỏ điểm kiểm soát.' }
        ], choices: [
          C('checkpoint', 'Giữ điểm kiểm soát và trình khẩn', { metrics: { complianceRisk: -6, efficiency: -2, quality: 4 } }, 'Bộ trình khẩn được chuẩn bị, điểm kiểm soát vẫn được giữ.'),
          C('parallel', 'Hoàn thiện song song phần còn lại', { metrics: { efficiency: 4, workload: 5, complianceRisk: -2 } }, 'Các phần độc lập được hoàn thiện song song trong lúc chờ xác nhận.')
        ] },
        { id: 'resolution', dayOffset: 15, title: 'Đóng bộ và rút kinh nghiệm', spot: 'records', lines: [
          { person: 'NAM', text: 'Bộ hồ sơ đã được đóng gói, phiên bản cuối và nhật ký đều đầy đủ.' },
          { person: 'LONG', text: 'Số liệu cuối đã khớp với báo cáo và danh mục chứng từ.' },
          { person: 'HẢI', text: 'Ta chốt ba bài học để áp dụng cho bộ hồ sơ lớn tiếp theo.' }
        ], effects: { metrics: { morale: 5, quality: 5, complianceRisk: -3 } } }
      ]
    },
    {
      id: 'process-redesign', type: 'main', title: 'Cải tiến quy trình phối hợp nội bộ', durationDays: 15,
      summary: 'Nhóm đo điểm nghẽn, thử cách làm mới và quyết định có chuẩn hóa quy trình hay không.',
      beats: [
        { id: 'observe', dayOffset: 0, title: 'Nhận diện điểm nghẽn lặp lại', spot: 'board', lines: [
          { person: 'HẢI', text: 'Ba hồ sơ gần đây đều chậm ở bước bàn giao phiên bản.' },
          { person: 'NAM', text: 'Nguyên nhân không nằm ở lưu trữ mà ở thời điểm xác nhận bản cuối.' },
          { person: 'MINH', text: 'Tôi đề nghị thử một checklist bàn giao ngắn.' }
        ], effects: { metrics: { quality: 2 } } },
        { id: 'pilot', dayOffset: 4, title: 'Thử nghiệm checklist mới', spot: 'forms', lines: [
          { person: 'MINH', text: 'Checklist mới giảm nhầm phiên bản nhưng thêm một bước xác nhận.' },
          { person: 'LONG', text: 'Thời gian tăng rất ít, đổi lại số liệu ít phải làm lại hơn.' },
          { person: 'HẢI', text: 'Ta cần quyết định thử rộng hơn hay giữ trong một nhóm nhỏ.' }
        ], choices: [
          C('expand', 'Mở rộng thử nghiệm toàn văn phòng', { metrics: { quality: 4, workload: 3, efficiency: 1 } }, 'Checklist được áp dụng thử cho toàn bộ hồ sơ mới.'),
          C('small', 'Giữ thử nghiệm ở hai bộ phận', { metrics: { quality: 2, workload: 1 } }, 'Thử nghiệm tiếp tục trong phạm vi nhỏ để giảm xáo trộn.')
        ] },
        { id: 'resistance', dayOffset: 9, title: 'Phản ứng với cách làm mới', spot: 'coffee', lines: [
          { person: 'LÂM', text: 'Checklist hữu ích nhưng một số mục chưa phù hợp với việc lấy báo giá.' },
          { person: 'PHÚC', text: 'Có thể tách mục bắt buộc và mục theo loại hồ sơ.' },
          { person: 'HẢI', text: 'Cải tiến phải giảm lỗi mà không biến thành thủ tục cứng nhắc.' }
        ], choices: [
          C('adapt', 'Tách checklist theo loại hồ sơ', { metrics: { efficiency: 3, quality: 4, workload: 2 }, relations: { 'LAM:PHUC': 2 } }, 'Checklist được chia thành lõi bắt buộc và phần theo tình huống.'),
          C('uniform', 'Giữ một checklist thống nhất', { metrics: { complianceRisk: -3, efficiency: -2, morale: -2 } }, 'Một checklist chung được giữ để dễ kiểm soát nhưng kém linh hoạt hơn.')
        ] },
        { id: 'adopt', dayOffset: 14, title: 'Chốt quy trình cải tiến', spot: 'meeting', lines: [
          { person: 'HẢI', text: 'Dữ liệu thử nghiệm đủ để chốt cách làm mới.' },
          { person: 'NAM', text: 'Tỷ lệ nhầm phiên bản đã giảm và nhật ký bàn giao rõ hơn.' },
          { person: 'MINH', text: 'Tôi sẽ đóng gói checklist và hướng dẫn sử dụng.' }
        ], effects: { metrics: { efficiency: 5, quality: 5, morale: 2 } } }
      ]
    },
    {
      id: 'nas-capacity', type: 'side', title: 'Dung lượng NAS tăng nhanh', durationDays: 6,
      summary: 'Kho dữ liệu gần ngưỡng cảnh báo, nhóm phải dọn dẹp và điều chỉnh cách lưu phiên bản.',
      beats: [
        { id: 'warning', dayOffset: 0, title: 'NAS phát cảnh báo dung lượng', spot: 'server', lines: [
          { person: 'PHÚC', text: 'Dung lượng NAS tăng nhanh hơn bình thường trong tuần này.' },
          { person: 'NAM', text: 'Có nhiều bản xuất trung gian và tệp trùng chưa được gom.' }
        ], effects: { metrics: { systemHealth: -4 } } },
        { id: 'cleanup', dayOffset: 2, title: 'Rà soát tệp trùng và bản tạm', spot: 'server', lines: [
          { person: 'NAM', text: 'Tôi đã lập danh sách tệp trùng, nhưng cần chọn giữa dọn nhanh và lưu trữ lạnh.' },
          { person: 'PHÚC', text: 'Bất kỳ tệp nào liên quan dấu vết hồ sơ đều phải giữ đúng chính sách.' }
        ], choices: [
          C('archive', 'Chuyển bản cũ sang lưu trữ lạnh', { metrics: { systemHealth: 6, workload: 3, complianceRisk: -2 } }, 'Bản cũ được chuyển sang vùng lưu trữ lạnh có danh mục.'),
          C('delete-temp', 'Chỉ xóa tệp tạm đã xác minh', { metrics: { systemHealth: 3, efficiency: 2 } }, 'Nhóm giải phóng vừa đủ dung lượng và giữ nguyên cấu trúc lưu trữ.')
        ] },
        { id: 'stable', dayOffset: 5, title: 'Kho dữ liệu trở lại ổn định', spot: 'server', lines: [
          { person: 'NAM', text: 'Dung lượng đã về mức an toàn và quy tắc lưu bản trung gian đã rõ.' },
          { person: 'PHÚC', text: 'Cảnh báo sớm sẽ được giữ để tránh lặp lại tình trạng này.' }
        ], effects: { metrics: { systemHealth: 5, quality: 2 } } }
      ]
    },
    {
      id: 'supplier-trust', type: 'side', title: 'Độ tin cậy của nhà cung cấp', durationDays: 7,
      summary: 'Một nhà cung cấp gửi thông tin không ổn định, buộc nhóm đánh giá lại cách phối hợp.',
      beats: [
        { id: 'inconsistent', dayOffset: 0, title: 'Báo giá thay đổi nhiều lần', spot: 'forms', lines: [
          { person: 'LÂM', text: 'Nhà cung cấp vừa gửi bản báo giá thứ ba với thông số khác hai bản trước.' },
          { person: 'LONG', text: 'Nếu không khóa phiên bản, bảng so sánh sẽ không còn đáng tin.' }
        ], effects: { metrics: { workload: 3, quality: -2 } } },
        { id: 'response', dayOffset: 3, title: 'Yêu cầu nhà cung cấp giải trình', spot: 'reception', lines: [
          { person: 'LÂM', text: 'Họ thừa nhận thay đổi do phối hợp nội bộ chưa tốt và đề nghị thêm thời gian.' },
          { person: 'PHÚC', text: 'Ta cần chọn mức độ tiếp tục dựa trên bằng chứng, không dựa trên lời hứa.' }
        ], choices: [
          C('conditional', 'Cho cơ hội với điều kiện rõ ràng', { metrics: { efficiency: 2, complianceRisk: -1, quality: 1 } }, 'Nhà cung cấp được tiếp tục với thời hạn và yêu cầu phiên bản rõ ràng.'),
          C('alternative', 'Chuyển sang nguồn thay thế', { metrics: { workload: 5, complianceRisk: -3, efficiency: -2 } }, 'Nhóm mở lại việc khảo sát để giảm phụ thuộc vào nguồn thiếu ổn định.')
        ] },
        { id: 'review', dayOffset: 6, title: 'Đánh giá lại nguồn cung', spot: 'meeting', lines: [
          { person: 'LÂM', text: 'Thông tin nguồn cung đã được khóa và bảng so sánh có thể sử dụng.' },
          { person: 'LONG', text: 'Các thay đổi đều đã có dấu vết và lý do.' }
        ], effects: { metrics: { quality: 3, complianceRisk: -2 } } }
      ]
    },
    {
      id: 'team-friction', type: 'side', title: 'Mâu thuẫn giữa tốc độ và kiểm soát', durationDays: 8,
      summary: 'Lâm và Phúc bất đồng qua nhiều hồ sơ, ảnh hưởng cách phối hợp của cả nhóm.',
      beats: [
        { id: 'spark', dayOffset: 0, title: 'Một cuộc trao đổi căng thẳng', spot: 'meeting', lines: [
          { person: 'LÂM', text: 'Tôi cảm thấy mọi đề xuất đều bị giữ lại dù đã có đủ thông tin thực tế.' },
          { person: 'PHÚC', text: 'Tôi giữ lại vì căn cứ chưa thể hiện rõ trong hồ sơ, không phải vì phản đối đề xuất.' }
        ], effects: { metrics: { morale: -3 }, relations: { 'LAM:PHUC': -3 } } },
        { id: 'mediate', dayOffset: 3, title: 'Trưởng nhóm đứng ra điều phối', spot: 'lounge', lines: [
          { person: 'HẢI', text: 'Hai bên hãy tách điều mình cần khỏi cách diễn đạt khiến người kia khó chịu.' },
          { person: 'LÂM', text: 'Tôi cần biết trước bằng chứng tối thiểu để không phải bổ sung nhiều vòng.' },
          { person: 'PHÚC', text: 'Tôi cần phần giải trình được đưa thẳng vào hồ sơ, không chỉ nói trong cuộc họp.' }
        ], choices: [
          C('protocol', 'Lập quy ước phối hợp chung', { metrics: { morale: 4, quality: 3, workload: 2 }, relations: { 'LAM:PHUC': 5 } }, 'Hai bên thống nhất quy ước về bằng chứng tối thiểu và cách phản hồi.'),
          C('separate', 'Tạm tách luồng công việc', { metrics: { efficiency: 2, morale: 1 }, relations: { 'LAM:PHUC': -1 } }, 'Hai bên giảm trao đổi trực tiếp nhưng nguyên nhân sâu vẫn chưa được giải quyết.')
        ] },
        { id: 'test', dayOffset: 5, title: 'Thử cách phối hợp mới', spot: 'forms', lines: [
          { person: 'LÂM', text: 'Tôi đã gửi báo giá kèm bảng giải trình ngay từ đầu.' },
          { person: 'PHÚC', text: 'Nhờ vậy tôi chỉ cần phản hồi một vòng và không giữ hồ sơ lâu.' }
        ], effects: { metrics: { efficiency: 3, morale: 2 }, relations: { 'LAM:PHUC': 2 } } },
        { id: 'close', dayOffset: 7, title: 'Quan hệ phối hợp ổn định lại', spot: 'coffee', lines: [
          { person: 'HẢI', text: 'Cách trao đổi mới đang hiệu quả hơn. Ta giữ thói quen nói rõ yêu cầu ngay từ đầu.' },
          { person: 'LÂM', text: 'Tôi thấy phần kiểm soát dễ dự đoán hơn.' },
          { person: 'PHÚC', text: 'Tôi cũng nhận được căn cứ rõ hơn để xử lý nhanh.' }
        ], effects: { metrics: { morale: 4, efficiency: 2 }, relations: { 'LAM:PHUC': 3 } } }
      ]
    },
    {
      id: 'staff-balance', type: 'side', title: 'Cân bằng khối lượng trong nhóm', durationDays: 6,
      summary: 'Một thành viên quá tải khiến cả nhóm phải xem lại cách phân phối công việc.',
      beats: [
        { id: 'signal', dayOffset: 0, title: 'Dấu hiệu quá tải xuất hiện', spot: 'coffee', lines: [
          { person: 'MINH', text: 'Tôi đang giữ quá nhiều biểu mẫu cùng lúc và bắt đầu nhầm giữa các phiên bản.' },
          { person: 'HẢI', text: 'Đây là tín hiệu phải điều chỉnh tải, không phải cố thêm bằng mọi giá.' }
        ], effects: { metrics: { morale: -3, quality: -2, workload: 4 } } },
        { id: 'redistribute', dayOffset: 2, title: 'Phân phối lại đầu việc', spot: 'board', lines: [
          { person: 'NAM', text: 'Tôi có thể nhận phần kiểm tra phiên bản và danh mục tệp.' },
          { person: 'LONG', text: 'Tôi nhận phần đối chiếu trường số liệu trong biểu mẫu.' }
        ], choices: [
          C('team', 'Chia việc cho cả nhóm', { metrics: { morale: 4, workload: -5, efficiency: 2 }, relations: { 'TEAM:TEAM': 2 } }, 'Khối lượng được chia lại theo năng lực từng người.'),
          C('delay', 'Lùi các đầu việc ít ưu tiên', { metrics: { workload: -6, quality: 2, efficiency: -1 } }, 'Các đầu việc ít ưu tiên được dời để bảo vệ chất lượng phần chính.')
        ] },
        { id: 'recover', dayOffset: 5, title: 'Nhịp làm việc cân bằng trở lại', spot: 'coffee', lines: [
          { person: 'MINH', text: 'Tôi đã kiểm soát lại được các phiên bản và không còn phải đổi liên tục giữa quá nhiều việc.' },
          { person: 'HẢI', text: 'Ta giữ cách nhìn tải theo nhóm thay vì chờ một người lên tiếng khi đã quá muộn.' }
        ], effects: { metrics: { morale: 5, quality: 3, workload: -2 } } }
      ]
    },
    {
      id: 'internal-audit', type: 'main', title: 'Đợt kiểm tra nội bộ theo chuyên đề', durationDays: 15,
      summary: 'Một đợt kiểm tra chọn mẫu buộc cả nhóm rà lại dấu vết hồ sơ, giải trình và cách phối hợp trước khi chốt kết quả.',
      beats: [
        { id: 'notice', dayOffset: 0, title: 'Thông báo kiểm tra chuyên đề', spot: 'meeting', lines: [
          { person: 'HẢI', text: 'Tuần này có đợt kiểm tra chuyên đề. Chúng ta giữ nguyên hồ sơ, không sửa dấu vết sau khi đã phát hành.' },
          { person: 'PHÚC', text: 'Tôi lập danh sách điểm kiểm soát và trường hợp cần giải trình bằng căn cứ.' },
          { person: 'NAM', text: 'Tôi khóa danh mục phiên bản để mỗi tệp đều truy được nguồn và thời điểm.' }
        ], effects: { metrics: { workload: 3, complianceRisk: -2 } } },
        { id: 'sample', dayOffset: 4, title: 'Ba hồ sơ được chọn ngẫu nhiên', spot: 'records', lines: [
          { person: 'NAM', text: 'Ba hồ sơ được chọn có đủ tệp chính, nhưng một hồ sơ có nhiều bản nháp chưa phân loại.' },
          { person: 'LONG', text: 'Số liệu khớp, vấn đề là phải chứng minh bản nào đã dùng để trình.' },
          { person: 'HẢI', text: 'Ta chọn cách xử lý vừa giữ nguyên dấu vết vừa giúp người kiểm tra đọc nhanh.' }
        ], choices: [
          C('index', 'Lập chỉ mục toàn bộ phiên bản', { metrics: { quality: 5, workload: 5, complianceRisk: -4 } }, 'Nhóm lập chỉ mục nguồn, bản nháp, bản trình và bản cuối cho từng hồ sơ.'),
          C('explain', 'Lập giải trình cho hồ sơ được chọn', { metrics: { efficiency: 3, workload: 2, complianceRisk: -2 } }, 'Nhóm tập trung giải trình rõ ba hồ sơ mẫu và giữ kế hoạch chuẩn hóa sau kiểm tra.')
        ] },
        { id: 'finding', dayOffset: 9, title: 'Phát hiện điểm yếu trong bàn giao', spot: 'meeting', lines: [
          { person: 'PHÚC', text: 'Điểm yếu không nằm ở kết quả cuối mà ở việc xác nhận phiên bản khi bàn giao.' },
          { person: 'MINH', text: 'Tôi đề nghị bổ sung một dòng người giao, người nhận và thời điểm xác nhận.' },
          { person: 'HẢI', text: 'Biện pháp phải đủ rõ nhưng không tạo thêm thủ tục không cần thiết.' }
        ], choices: [
          C('control', 'Bổ sung điểm kiểm soát bàn giao', { metrics: { quality: 4, efficiency: 1, complianceRisk: -5 } }, 'Điểm xác nhận bàn giao được thêm vào checklist lõi.'),
          C('training', 'Đào tạo lại quy tắc phiên bản', { metrics: { morale: 2, quality: 3, workload: 2 } }, 'Cả nhóm thực hành lại quy tắc trên một hồ sơ mẫu trước khi áp dụng.')
        ] },
        { id: 'close', dayOffset: 14, title: 'Chốt kết quả kiểm tra', spot: 'meeting', lines: [
          { person: 'HẢI', text: 'Kết quả kiểm tra đã chốt. Không có sai lệch lớn, nhưng cách bàn giao phải được cải thiện.' },
          { person: 'NAM', text: 'Danh mục phiên bản mới đã hoạt động và có thể dùng cho các hồ sơ tiếp theo.' },
          { person: 'PHÚC', text: 'Tôi lưu khuyến nghị, người phụ trách và thời hạn theo dõi sau kiểm tra.' }
        ], effects: { metrics: { quality: 6, complianceRisk: -6, morale: 3 } } }
      ]
    },
    {
      id: 'digital-service-launch', type: 'main', title: 'Triển khai một dịch vụ nội bộ mới', durationDays: 16,
      summary: 'Văn phòng thử nghiệm một dịch vụ số mới, xử lý phản hồi ban đầu và quyết định phạm vi triển khai chính thức.',
      beats: [
        { id: 'proposal', dayOffset: 0, title: 'Đề xuất dịch vụ số mới', spot: 'board', lines: [
          { person: 'HẢI', text: 'Có đề xuất mở một dịch vụ nội bộ để đơn vị gửi yêu cầu và theo dõi trạng thái hồ sơ.' },
          { person: 'MINH', text: 'Tôi có thể chuẩn hóa biểu mẫu đầu vào để giảm yêu cầu bổ sung.' },
          { person: 'PHÚC', text: 'Phải phân quyền rõ dữ liệu nào người gửi được xem và dữ liệu nào chỉ dùng nội bộ.' }
        ], effects: { metrics: { workload: 4, morale: 2 } } },
        { id: 'scope', dayOffset: 4, title: 'Chọn phạm vi thử nghiệm', spot: 'meeting', lines: [
          { person: 'LONG', text: 'Nếu mở quá rộng ngay từ đầu, số yêu cầu thiếu dữ liệu sẽ làm nghẽn khâu rà soát.' },
          { person: 'LÂM', text: 'Nhưng phạm vi quá nhỏ sẽ không phản ánh đủ các loại nhu cầu thực tế.' },
          { person: 'HẢI', text: 'Ta cần một phạm vi đủ học được nhưng vẫn kiểm soát được tải.' }
        ], choices: [
          C('pilot-two', 'Thử nghiệm tại hai đơn vị', { metrics: { efficiency: 2, quality: 3, workload: 2 } }, 'Dịch vụ được thử tại hai đơn vị có loại yêu cầu khác nhau.'),
          C('pilot-wide', 'Mở thử toàn trường có giới hạn', { metrics: { efficiency: 4, workload: 7, morale: -1 } }, 'Dịch vụ mở rộng nhưng giới hạn số yêu cầu tiếp nhận mỗi ngày.')
        ] },
        { id: 'feedback', dayOffset: 10, title: 'Phản hồi đầu tiên từ người dùng', spot: 'reception', lines: [
          { person: 'MINH', text: 'Người dùng thích theo dõi trạng thái nhưng chưa hiểu một số trường bắt buộc.' },
          { person: 'NAM', text: 'Nhật ký cho thấy nhiều người dừng ở cùng một bước nhập tài liệu.' },
          { person: 'PHÚC', text: 'Ta sửa hướng dẫn, không được tự giảm yêu cầu căn cứ chỉ để hoàn thành nhanh hơn.' }
        ], choices: [
          C('simplify', 'Đơn giản cách nhập và giữ đủ căn cứ', { metrics: { efficiency: 5, quality: 2, workload: 3 } }, 'Giao diện nhập được rút gọn, các căn cứ bắt buộc vẫn giữ nguyên.'),
          C('assist', 'Bổ sung hỗ trợ tại điểm tiếp nhận', { metrics: { morale: 4, workload: 5, quality: 3 } }, 'Một giai đoạn hỗ trợ trực tiếp được mở trong tuần đầu.')
        ] },
        { id: 'launch', dayOffset: 15, title: 'Quyết định triển khai chính thức', spot: 'meeting', lines: [
          { person: 'HẢI', text: 'Dữ liệu thử nghiệm đủ để quyết định triển khai chính thức theo từng giai đoạn.' },
          { person: 'LONG', text: 'Tải xử lý đã ổn định sau khi biểu mẫu đầu vào được điều chỉnh.' },
          { person: 'NAM', text: 'Tôi đã chuẩn bị theo dõi lỗi, sao lưu và báo cáo sử dụng.' }
        ], effects: { metrics: { efficiency: 7, quality: 4, systemHealth: 2, morale: 4 } } }
      ]
    },
    {
      id: 'new-staff-onboarding', type: 'side', title: 'Tiếp nhận thành viên mới', durationDays: 7,
      summary: 'Một thành viên mới làm quen với hồ sơ, công cụ và văn hóa phối hợp của văn phòng.',
      beats: [
        { id: 'arrival', dayOffset: 0, title: 'Ngày đầu của thành viên mới', spot: 'reception', lines: [
          { person: 'HẢI', text: 'Hôm nay có thành viên mới. Mỗi người giúp một phần để bạn ấy hiểu luồng công việc thực tế.' },
          { person: 'MINH', text: 'Tôi chuẩn bị bộ biểu mẫu mẫu và danh sách trường thường bị thiếu.' },
          { person: 'NAM', text: 'Tôi hướng dẫn cấu trúc thư mục, quy tắc tên tệp và cách bàn giao.' }
        ], effects: { metrics: { workload: 2, morale: 3 } } },
        { id: 'mentor', dayOffset: 2, title: 'Chọn cách kèm cặp', spot: 'forms', lines: [
          { person: 'HẢI', text: 'Bạn mới cần được làm trên tình huống thật nhưng chưa nên tự xử lý điểm kiểm soát quan trọng.' },
          { person: 'PHÚC', text: 'Tôi có thể rà từng bước đầu tiên và giải thích vì sao phải giữ căn cứ.' }
        ], choices: [
          C('pairing', 'Ghép cặp luân phiên theo nghiệp vụ', { metrics: { quality: 4, morale: 4, workload: 3 }, relations: { 'TEAM:TEAM': 2 } }, 'Thành viên mới theo từng người trong một phần quy trình.'),
          C('mentor', 'Một người hướng dẫn xuyên suốt', { metrics: { efficiency: 2, quality: 3, workload: 4 } }, 'Một đầu mối chịu trách nhiệm hướng dẫn và tổng hợp câu hỏi.')
        ] },
        { id: 'independent', dayOffset: 6, title: 'Hoàn thành hồ sơ mẫu đầu tiên', spot: 'meeting', lines: [
          { person: 'MINH', text: 'Bạn mới đã hoàn thành hồ sơ mẫu và tự phát hiện một trường dữ liệu chưa khớp.' },
          { person: 'PHÚC', text: 'Cách đánh dấu phần cần người có thẩm quyền xác nhận đã đúng.' },
          { person: 'HẢI', text: 'Từ tuần tới bạn ấy có thể nhận đầu việc rõ phạm vi với một vòng rà cuối.' }
        ], effects: { metrics: { morale: 5, quality: 3, efficiency: 2 } } }
      ]
    },
    {
      id: 'equipment-maintenance', type: 'side', title: 'Gia hạn dịch vụ thiết bị văn phòng', durationDays: 7,
      summary: 'Hợp đồng bảo trì máy in và thiết bị mạng sắp hết hạn, nhóm phải đánh giá chất lượng và chọn phương án tiếp theo.',
      beats: [
        { id: 'expiry', dayOffset: 0, title: 'Hợp đồng bảo trì sắp hết hạn', spot: 'print', lines: [
          { person: 'NAM', text: 'Hợp đồng bảo trì máy in và thiết bị mạng còn một tuần là hết hạn.' },
          { person: 'LONG', text: 'Tôi sẽ tổng hợp chi phí sửa chữa, thời gian gián đoạn và số lần hỗ trợ.' }
        ], effects: { metrics: { workload: 2, systemHealth: -1 } } },
        { id: 'evaluate', dayOffset: 3, title: 'Đánh giá chất lượng dịch vụ', spot: 'server', lines: [
          { person: 'NAM', text: 'Nhà cung cấp phản hồi nhanh với máy in nhưng chậm hơn cam kết ở sự cố mạng.' },
          { person: 'LÂM', text: 'Có một nguồn thay thế giá cao hơn nhưng thời gian hỗ trợ rõ hơn.' },
          { person: 'PHÚC', text: 'Phương án phải dựa trên dữ liệu thực hiện, điều kiện hợp đồng và rủi ro gián đoạn.' }
        ], choices: [
          C('renegotiate', 'Đàm phán lại mức dịch vụ', { metrics: { efficiency: 2, workload: 3, systemHealth: 3 } }, 'Nhóm yêu cầu cam kết phản hồi rõ và cơ chế xử lý khi chậm.'),
          C('compare', 'Mở so sánh nguồn thay thế', { metrics: { quality: 3, workload: 5, complianceRisk: -2 } }, 'Nhóm thu thập thêm nguồn để đánh giá tổng chi phí và năng lực hỗ trợ.')
        ] },
        { id: 'renew', dayOffset: 6, title: 'Chốt phương án bảo trì', spot: 'meeting', lines: [
          { person: 'LONG', text: 'Chi phí và mức dịch vụ đã được quy đổi về cùng một bảng so sánh.' },
          { person: 'PHÚC', text: 'Các điều kiện phản hồi, thay thế thiết bị và giới hạn trách nhiệm đã rõ.' },
          { person: 'HẢI', text: 'Nhóm hoàn tất đề xuất để người có thẩm quyền xem xét và quyết định.' }
        ], effects: { metrics: { systemHealth: 6, quality: 3, complianceRisk: -2 } } }
      ]
    }
  ];

  window.OfficeNarrativeCatalog = {
    version: 1,
    weekdayThemes: {
      0: { name: 'Chuẩn bị tuần mới', groups: ['system', 'random'] },
      1: { name: 'Khởi động và giao việc', groups: ['work'] },
      2: { name: 'Ổn định và va chạm nhỏ', groups: ['people', 'random'] },
      3: { name: 'Điểm ngoặt giữa tuần', groups: ['people', 'personal'] },
      4: { name: 'Tăng tốc trước hạn', groups: ['work'] },
      5: { name: 'Tổng kết và giải tỏa', groups: ['work', 'system', 'personal'] },
      6: { name: 'Nhịp nghỉ và quan hệ', groups: ['personal', 'random'] }
    },
    midEvents: midEvents,
    arcs: arcs
  };
}());
