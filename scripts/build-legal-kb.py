#!/usr/bin/env python3
"""Trích văn bản pháp luật (PDF trong thư mục phaply/) thành kho tri thức JSON cho chatbot và trang tra cứu.

Chạy: python scripts/build-legal-kb.py   (cần: pip install pypdf)
Kết quả: server/knowledge/legal-kb.json (commit vào git vì *.pdf bị .gitignore)
"""
import json
import os
import re
import sys
from datetime import datetime, timezone

from pypdf import PdfReader

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'phaply')
OUT = os.path.join(ROOT, 'server', 'knowledge', 'legal-kb.json')

# Siêu dữ liệu từng văn bản (đối chiếu với phần đầu và Điều "Hiệu lực thi hành" của chính văn bản)
DOCS = [
    {
        'file': 'VBHN-VPQH LUẬT ĐẤU THẦU.pdf', 'id': 'LDT', 'short': 'Luật Đấu thầu',
        'number': '22/2023/QH15 (văn bản hợp nhất)', 'type': 'Luật',
        'title': 'Luật Đấu thầu số 22/2023/QH15 (đã được sửa đổi, bổ sung)',
        'issueDate': '2023-06-23', 'effectiveDate': '2024-01-01', 'group': 'Đấu thầu',
    },
    {
        'file': '36_2026_VBHN-ND-BTC_726560.pdf', 'id': 'ND214', 'short': 'NĐ 214/2025 (VBHN 36/2026)',
        'number': '36/2026/VBHN-NĐ-BTC (NĐ 214/2025/NĐ-CP)', 'type': 'Nghị định (văn bản hợp nhất)',
        'title': 'Nghị định quy định chi tiết một số điều và biện pháp thi hành Luật Đấu thầu về lựa chọn nhà thầu (đã sửa đổi bởi NĐ 165/2026, 170/2026, 349/2026)',
        'issueDate': '2025-08-04', 'effectiveDate': '2025-08-04', 'group': 'Đấu thầu',
    },
    {
        'file': 'Thông tư 79.pdf', 'id': 'TT79-2025', 'short': 'TT 79/2025/TT-BTC',
        'number': '79/2025/TT-BTC', 'type': 'Thông tư',
        'title': 'Thông tư hướng dẫn việc cung cấp, đăng tải thông tin về đấu thầu và mẫu hồ sơ đấu thầu trên Hệ thống mạng đấu thầu quốc gia',
        'issueDate': '2025-08-04', 'effectiveDate': '2025-08-04', 'group': 'Đấu thầu',
    },
    {
        'file': 'Thông tư 134.pdf', 'id': 'TT134-2026', 'short': 'TT 134/2026/TT-BTC',
        'number': '134/2026/TT-BTC', 'type': 'Thông tư',
        'title': 'Thông tư quy định chi tiết mẫu hồ sơ yêu cầu áp dụng hình thức chỉ định thầu, báo cáo đánh giá, báo cáo thẩm định, kiểm tra, giám sát, báo cáo tình hình thực hiện hoạt động đấu thầu',
        'issueDate': '2026-09-09', 'effectiveDate': '2026-09-09', 'group': 'Đấu thầu',
    },
    {
        'file': 'Phụ lục 1-8 Thông tư 134.pdf', 'id': 'TT134-PL', 'short': 'Phụ lục TT 134/2026',
        'number': 'Phụ lục 1-8 kèm TT 134/2026/TT-BTC', 'type': 'Phụ lục',
        'title': 'Phụ lục 1-8 Thông tư 134/2026/TT-BTC: biên bản đóng thầu, mở thầu, quyết định/thông báo kiểm tra, bản cam kết, hướng dẫn mẫu hồ sơ yêu cầu',
        'issueDate': '2026-09-09', 'effectiveDate': '2026-09-09', 'group': 'Đấu thầu',
    },
    {
        'file': '2026_528-VBHN_146_2026_VBHN-LQ-VPQH.pdf', 'id': 'LXD', 'short': 'Luật Xây dựng',
        'number': '135/2025/QH15 (VBHN 146/2026/VBHN-LQ-VPQH)', 'type': 'Luật (văn bản hợp nhất)',
        'title': 'Luật Xây dựng số 135/2025/QH15 (đã được sửa đổi, bổ sung)',
        'issueDate': '2025-12-10', 'effectiveDate': '2026-07-01', 'group': 'Xây dựng',
    },
    {
        'file': '89_2026_VBHN-TT-BXD_727448.pdf', 'id': 'TT36-BXD', 'short': 'TT 36/2026/TT-BXD (VBHN 89/2026)',
        'number': '89/2026/VBHN-TT-BXD (TT 36/2026/TT-BXD)', 'type': 'Thông tư (văn bản hợp nhất)',
        'title': 'Thông tư hướng dẫn một số nội dung, phương pháp xác định và quản lý chi phí đầu tư xây dựng',
        'issueDate': '2026-06-26', 'effectiveDate': '2026-07-01', 'group': 'Chi phí xây dựng',
    },
    {
        'file': '254_2025_ND-CP_674480.pdf', 'id': 'ND254', 'short': 'NĐ 254/2025/NĐ-CP',
        'number': '254/2025/NĐ-CP', 'type': 'Nghị định',
        'title': 'Nghị định quy định về quản lý, thanh toán, quyết toán dự án sử dụng vốn đầu tư công',
        'issueDate': '2025-09-26', 'effectiveDate': '2025-09-26', 'group': 'Thanh toán, quyết toán',
    },
    {
        'file': '193_2026_ND-CP_709388.pdf', 'id': 'ND193', 'short': 'NĐ 193/2026/NĐ-CP',
        'number': '193/2026/NĐ-CP', 'type': 'Nghị định',
        'title': 'Nghị định quy định về quyết toán vốn đầu tư dự án',
        'issueDate': '2026-06-01', 'effectiveDate': '2026-07-01', 'group': 'Thanh toán, quyết toán',
    },
    {
        'file': '73_2026_TT-BTC_712590.pdf', 'id': 'TT73-2026', 'short': 'TT 73/2026/TT-BTC',
        'number': '73/2026/TT-BTC', 'type': 'Thông tư',
        'title': 'Thông tư quy định về hệ thống mẫu biểu sử dụng trong công tác quyết toán vốn đầu tư dự án',
        'issueDate': '2026-06-25', 'effectiveDate': '2026-07-01', 'group': 'Thanh toán, quyết toán',
    },
    {
        'file': 'NGHỊ ĐỊNH 104.2026_ND-CP_3132026.pdf', 'id': 'ND104', 'short': 'NĐ 104/2026/NĐ-CP',
        'number': '104/2026/NĐ-CP', 'type': 'Nghị định',
        'title': 'Nghị định quy định việc lập dự toán, quản lý, sử dụng và quyết toán chi thường xuyên để thực hiện các nhiệm vụ quy định tại Điều 40 Luật Ngân sách nhà nước',
        'issueDate': '2026-03-31', 'effectiveDate': '2026-03-31', 'group': 'Chi thường xuyên',
    },
]

# Một chữ cái đứng tách khỏi phần còn lại của từ do PDF (vd "c ủa" -> "của")
SPLIT_FIX = re.compile(
    r'\b([bcdđghklmnpqrstvx]{1,3}) ([àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]\w*)')
SPLIT_SKIP = {'điểm', 'được', 'đối', 'đến', 'để', 'đó', 'đã', 'đây', 'đồng', 'đầu', 'đơn', 'địa', 'điều'}

BLOCK = re.compile(
    r'^(Chương\s+[IVXLC\d]+|CHƯƠNG|Mục\s+\d+|Điều\s+\d+[a-z]?\.|\d+[\.\)]\s|[a-zđ]\)\s|[-–•+]\s|Phụ lục|PHỤ LỤC|Mẫu số|Mẫu\s+\d|\[\d+\]|\d+\s+[A-ZĐ])')
ARTICLE = re.compile(r'^Điều\s+(\d+[a-z]?)\.\s*(.*)$')
CHAPTER = re.compile(r'^(Chương|CHƯƠNG)\s+([IVXLC\d]+)\b\s*(.*)$')
APPENDIX = re.compile(r'^(Phụ lục|PHỤ LỤC)\s+(\w+)\b(.*)$')
# Tóm tắt nội dung (chỉ nêu những gì có trong văn bản) hiển thị trên trang tra cứu
SUMMARIES = {
    'LDT': 'Nguyên tắc và các hình thức lựa chọn nhà thầu (Điều 20-29b), kế hoạch lựa chọn nhà thầu cho dự án và dự toán mua sắm (Điều 36-41), quy trình, thời gian, hợp đồng (Điều 64-70), trách nhiệm của chủ đầu tư, xử lý vi phạm, giải quyết kiến nghị.',
    'ND214': 'Hướng dẫn chi tiết Luật Đấu thầu về lựa chọn nhà thầu: giá gói thầu (Điều 18), quy trình đấu thầu, các trường hợp và quy trình chỉ định thầu (Điều 78-80), chào hàng cạnh tranh, mua sắm trực tiếp, tự thực hiện, hợp đồng, tạm ứng, thanh toán, thanh lý (Điều 113-121), kiểm tra, kiến nghị. Bản hợp nhất đã gồm sửa đổi của NĐ 349/2026 (hiệu lực 09/9/2026).',
    'TT79-2025': 'Cung cấp, đăng tải thông tin đấu thầu và các mẫu hồ sơ đấu thầu trên Hệ thống mạng đấu thầu quốc gia: thông tin dự án, KHLCNT, thông báo mời thầu, kết quả lựa chọn nhà thầu, hợp đồng điện tử.',
    'TT134-2026': 'Mẫu hồ sơ yêu cầu áp dụng hình thức chỉ định thầu, báo cáo đánh giá, báo cáo thẩm định, kiểm tra, giám sát và báo cáo tình hình thực hiện hoạt động đấu thầu; thay thế TT 80/2025/TT-BTC.',
    'TT134-PL': 'Biên bản đóng thầu, mở thầu, quyết định/thông báo kiểm tra, bản cam kết, hướng dẫn xây dựng mẫu hồ sơ yêu cầu (Phụ lục 1-8 TT 134/2026).',
    'LXD': 'Trình tự đầu tư xây dựng (Điều 16), phân loại dự án (Điều 17), lập, thẩm định, phê duyệt dự án và thiết kế (Điều 23-31), quản lý dự án, giấy phép xây dựng, thi công, nghiệm thu, bàn giao, bảo hành, bảo trì (Điều 48-65), quản lý chi phí (Điều 73-79), hợp đồng xây dựng (Điều 80-87).',
    'TT36-BXD': 'Xác định sơ bộ tổng mức đầu tư, tổng mức đầu tư và điều chỉnh (Điều 3-5), dự toán xây dựng công trình, dự toán gói thầu, dự toán công việc (Điều 6-8), định mức, giá xây dựng, chỉ số giá, chi phí tư vấn.',
    'ND254': 'Quản lý, thanh toán vốn đầu tư công: hồ sơ pháp lý, tạm ứng, thanh toán khối lượng hoàn thành (Điều 8-10, 18-20), quyết toán theo niên độ (Điều 25-29). Lưu ý: các Điều 30-47 (quyết toán dự án hoàn thành) đã bị bãi bỏ từ 01/07/2026 bởi NĐ 193/2026.',
    'ND193': 'Quyết toán vốn đầu tư dự án: vốn được quyết toán (Điều 4), báo cáo và hồ sơ trình thẩm tra, phê duyệt (Điều 6-7, 19), thẩm quyền, kiểm toán độc lập, thẩm tra hồ sơ pháp lý (Điều 12), thời gian lập hồ sơ, thẩm tra, phê duyệt theo nhóm dự án (Điều 21), trách nhiệm của chủ đầu tư (Điều 28).',
    'TT73-2026': 'Hệ thống 12 mẫu biểu quyết toán vốn đầu tư dự án (Mẫu 01-12/QTDA) và cách sử dụng: dự án hoàn thành dùng Mẫu 01-07/QTDA; Mẫu 02 là danh mục văn bản, Mẫu 04 là chi tiết chi phí đầu tư đề nghị quyết toán.',
    'ND104': 'Lập dự toán, quản lý, sử dụng và quyết toán chi thường xuyên để mua sắm, sửa chữa, cải tạo, nâng cấp tài sản, trang thiết bị; chi thuê hàng hóa, dịch vụ và các nhiệm vụ cần thiết khác (thay thế NĐ 98/2025/NĐ-CP).',
}

# Điều còn trong văn bản nhưng đã hết hiệu lực: (doc, số điều từ, đến) -> ghi chú
REPEALED = [
    ('ND254', 30, 47, 'Bãi bỏ từ 01/07/2026 bởi Điều 31 khoản 5 NĐ 193/2026/NĐ-CP; quyết toán dự án thực hiện theo NĐ 193/2026'),
]

MAX_CHUNK = 3800
PAGE_MARK = '\x00PAGE'
FORM_START = re.compile(r'^Mẫu số (\d+/[A-ZĐ]+)\s*\(kèm theo')
FORM_TITLES = {
    '01/QTDA': 'Báo cáo tổng hợp quyết toán vốn đầu tư dự án',
    '02/QTDA': 'Danh mục văn bản',
    '03/QTDA': 'Bảng đối chiếu số liệu',
    '04/QTDA': 'Chi tiết chi phí đầu tư đề nghị quyết toán',
    '05/QTDA': 'Chi tiết giá trị tài sản hình thành',
    '06/QTDA': 'Chi tiết giá trị vật tư, vật liệu, thiết bị tồn đọng',
    '07/QTDA': 'Tình hình công nợ của dự án',
    '08/QTDA': 'Báo cáo quyết toán dự án quy hoạch, chuẩn bị đầu tư, dừng thực hiện chưa có khối lượng',
    '09/QTDA': 'Báo cáo kết quả phê duyệt tổng quyết toán dự án quan trọng quốc gia',
    '10/QTDA': 'Quyết định phê duyệt quyết toán vốn đầu tư',
    '11/QTDA': 'Báo cáo tình hình quyết toán dự án sử dụng vốn đầu tư công trong năm',
    '12/QTDA': 'Phiếu giao nhận hồ sơ quyết toán vốn đầu tư dự án',
}


def fix_split(m):
    if m.group(2).lower() in SPLIT_SKIP:
        return m.group(0)
    return m.group(1) + m.group(2)


def is_caps(line):
    return line.upper() == line and re.search(r'[A-ZĐ]', line) is not None


def clean_pages(pages):
    out = []
    for p in pages:
        lines = [l.rstrip() for l in p.split('\n')]
        lines = [l for l in lines if not re.match(r'^\s*(\d+\s+)?CÔNG BÁO\b', l)]
        idx = [i for i, l in enumerate(lines) if l.strip()]
        for i in {idx[0], idx[-1]} if idx else ():
            if re.fullmatch(r'\s*\d{1,3}\s*', lines[i]):
                lines[i] = ''
        out.append(PAGE_MARK)
        out.extend(lines)
    return out


def to_paragraphs(lines):
    paras = []
    new_page = False
    for raw in lines:
        if raw == PAGE_MARK:
            new_page = True
            continue
        line = re.sub(r'\s+', ' ', raw).strip()
        if not line:
            continue
        line = SPLIT_FIX.sub(fix_split, line)
        prev = paras[-1] if paras else ''
        # Chú thích cuối trang không dính vào dòng đầu trang sau; dòng viết hoa sau tiêu đề Điều là thân điều
        after_footnote = new_page and re.match(r'^\[\d+\]', prev)
        after_heading = ARTICLE.match(prev) and not re.match(r'^[a-zđà-ỹ]', line)
        if not paras or BLOCK.match(line) or is_caps(line) or is_caps(prev) or after_footnote or after_heading:
            paras.append(line)
        else:
            paras[-1] += ' ' + line
        new_page = False
    return paras


def split_long(heading, paras):
    """Tách một Điều/Phụ lục dài thành nhiều phần ≤ MAX_CHUNK ký tự, ranh giới theo đoạn."""
    parts, cur, size = [], [], 0
    for p in paras:
        if cur and size + len(p) > MAX_CHUNK:
            parts.append(cur)
            cur, size = [], 0
        cur.append(p)
        size += len(p)
    if cur:
        parts.append(cur)
    return parts


def build_doc(meta):
    reader = PdfReader(os.path.join(SRC, meta['file']))
    pages = [(pg.extract_text() or '') for pg in reader.pages]
    paras = to_paragraphs(clean_pages(pages))

    chapter, sections = '', []
    cur = {'article': 'Mở đầu', 'heading': 'Mở đầu và căn cứ ban hành', 'chapter': '', 'paras': []}
    pending_chapter = False
    in_form = False
    for p in paras:
        m = ARTICLE.match(p)
        a = APPENDIX.match(p)
        c = CHAPTER.match(p)
        f = FORM_START.match(p)
        if f:
            sections.append(cur)
            code = f.group(1)
            title = FORM_TITLES.get(code, '')
            cur = {'article': f'Mẫu số {code}', 'heading': f'Mẫu số {code}' + (f' — {title}' if title else ''), 'chapter': 'Mẫu biểu', 'paras': [p]}
            in_form = True
            continue
        if in_form or meta['type'] == 'Phụ lục':
            m = None  # Điều/Chương nằm trong biểu mẫu chỉ là nội dung mẫu
            c = None
        if c:
            chapter = f'Chương {c.group(2)}' + (f'. {c.group(3)}' if c.group(3) else '')
            pending_chapter = not c.group(3)
            continue
        if pending_chapter and is_caps(p):
            chapter += f'. {p}'
            pending_chapter = False
            continue
        pending_chapter = False
        if m:
            sections.append(cur)
            title = m.group(2)
            cur = {'article': f'Điều {m.group(1)}', 'heading': f'Điều {m.group(1)}. {title[:160]}', 'chapter': chapter, 'paras': [p]}
        elif a and meta['type'] == 'Phụ lục':
            sections.append(cur)
            cur = {'article': f'Phụ lục {a.group(2)}', 'heading': p[:160], 'chapter': '', 'paras': [p]}
        else:
            cur['paras'].append(p)
    sections.append(cur)

    chunks = []
    for s in sections:
        body = [x for x in s['paras']]
        if not ''.join(body).strip():
            continue
        parts = split_long(s['heading'], body)
        for n, part in enumerate(parts, 1):
            suffix = f' (phần {n}/{len(parts)})' if len(parts) > 1 else ''
            slug = re.sub(r'\W+', '', s['article'].lower())
            heading = re.sub(r'(?<=[^\W\d_])\d{1,3}(?= |$)', '', s['heading'] + suffix)  # bỏ số chú thích dính sau tiêu đề
            item = {
                'id': f"{meta['id']}#{slug}" + (f'.{n}' if len(parts) > 1 else ''),
                'doc': meta['id'],
                'article': s['article'] + suffix,
                'heading': heading,
                'chapter': s['chapter'],
                'text': '\n'.join(part),
            }
            num = re.match(r'Điều (\d+)', s['article'])
            for doc_id, lo, hi, note in REPEALED:
                if num and doc_id == meta['id'] and lo <= int(num.group(1)) <= hi:
                    item['repealed'] = note
            if 'được bãi bỏ' in heading:
                item['repealed'] = 'Điều này đã được bãi bỏ'
            chunks.append(item)
    return chunks, len(reader.pages)


def main():
    docs, chunks = [], []
    for meta in DOCS:
        c, npages = build_doc(meta)
        d = {k: v for k, v in meta.items() if k != 'file'}
        d.update({'sourceFile': meta['file'], 'pages': npages, 'chunks': len(c), 'summary': SUMMARIES.get(meta['id'], '')})
        docs.append(d)
        chunks.extend(c)
        print(f"{meta['id']:<10} pages={npages:<4} chunks={len(c):<4} chars={sum(len(x['text']) for x in c)}")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump({'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'documents': docs, 'chunks': chunks},
                  fh, ensure_ascii=False, separators=(',', ':'))
    print('->', OUT, os.path.getsize(OUT) // 1024, 'KB')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
