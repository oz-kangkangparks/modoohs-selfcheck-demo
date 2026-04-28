import jsPDF from 'jspdf';

// A4 + 25mm 균일 여백
const PAGE_W_MM = 210;
const PAGE_H_MM = 297;
const MARGIN = 25;
const CONTENT_W_MM = PAGE_W_MM - MARGIN * 2;

// 본문 폰트 사이즈/줄간격(mm) — 12pt 본문, 줄간격 약 6.8mm
const TITLE_FONT_PT = 20;
const BODY_FONT_PT = 12;
const BODY_LINE_H_MM = 6.8;
const PARAGRAPH_SPACING_MM = 3.5;

// 한글 TTF — jsdelivr에서 NanumGothic Regular 직링크 (CORS 허용)
const KOREAN_FONT_URL = 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nanumgothic/NanumGothic-Regular.ttf';
const KOREAN_FONT_BOLD_URL = 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nanumgothic/NanumGothic-Bold.ttf';
const FONT_NAME = 'NanumGothic';

// 메모리 캐시 — 한 번 받은 폰트는 재사용
let cachedRegular = null;
let cachedBold = null;

async function fetchAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`폰트 로딩 실패: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // 큰 바이너리를 안전하게 base64 변환 (8KB 청크)
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function loadKoreanFonts() {
  if (!cachedRegular) cachedRegular = await fetchAsBase64(KOREAN_FONT_URL);
  if (!cachedBold)    cachedBold    = await fetchAsBase64(KOREAN_FONT_BOLD_URL);
  return { regular: cachedRegular, bold: cachedBold };
}

function parseStatementSections(text) {
  const raw = String(text || '');
  let paragraphs = raw.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  // 마지막 단락 안에 "...귀중" 줄이 본문과 합쳐져 있으면 분리
  if (paragraphs.length > 0) {
    const last = paragraphs[paragraphs.length - 1];
    const lines = last.split(/\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      const lastLine = lines[lines.length - 1];
      if (/귀중\s*$/.test(lastLine)) {
        const head = lines.slice(0, lines.length - 1).join('\n').trim();
        paragraphs = paragraphs.slice(0, -1);
        if (head) paragraphs.push(head);
        paragraphs.push(lastLine);
      }
    }
  }

  // AI가 실수로 "채무자 : 본인 (인)" 류 서명 줄을 넣었다면 제거
  paragraphs = paragraphs.filter((p) => !/^채무자\s*[:：]/.test(p.split(/\n/).pop().trim()) || /귀중\s*$/.test(p));
  // 위 필터는 마지막 줄이 "채무자"로 시작하는 단독 단락만 거름. 단락 안에 "채무자" 줄이 섞여 있으면 그 줄만 제거
  paragraphs = paragraphs.map((p) => {
    const lines = p.split(/\n/).filter((l) => !/^채무자\s*[:：]/.test(l.trim()));
    return lines.join('\n').trim();
  }).filter(Boolean);

  const sections = [];
  const n = paragraphs.length;
  if (n >= 1 && /귀중\s*$/.test(paragraphs[n - 1])) {
    for (let i = 0; i < n - 1; i++) sections.push({ type: 'body', text: paragraphs[i] });
    sections.push({ type: 'sig-right', text: paragraphs[n - 1] });
  } else {
    for (const p of paragraphs) sections.push({ type: 'body', text: p });
  }
  return sections;
}

/**
 * AI가 생성한 진술서 텍스트를 jsPDF의 직접 텍스트 렌더링으로 A4 PDF에 작성합니다.
 * iText 스타일 — 한글 폰트 임베딩 + splitTextToSize 자동 줄바꿈 + 수동 y 좌표 페이지 분기.
 *
 * @param {string} text - 진술서 본문 (단락 사이는 빈 줄)
 * @param {string} fileName - 다운로드 파일명
 */
export async function downloadStatementPdf(text, fileName = '진술서.pdf') {
  const sections = parseStatementSections(text);

  const { regular, bold } = await loadKoreanFonts();

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  pdf.addFileToVFS(`${FONT_NAME}-Regular.ttf`, regular);
  pdf.addFileToVFS(`${FONT_NAME}-Bold.ttf`, bold);
  pdf.addFont(`${FONT_NAME}-Regular.ttf`, FONT_NAME, 'normal');
  pdf.addFont(`${FONT_NAME}-Bold.ttf`,    FONT_NAME, 'bold');
  pdf.setFont(FONT_NAME, 'normal');

  let y = MARGIN;

  function ensureSpace(needed) {
    if (y + needed > PAGE_H_MM - MARGIN) {
      pdf.addPage();
      y = MARGIN;
    }
  }

  // 제목 — 가운데 정렬, 굵게
  pdf.setFont(FONT_NAME, 'bold');
  pdf.setFontSize(TITLE_FONT_PT);
  const titleText = '진 술 서';
  pdf.text(titleText, PAGE_W_MM / 2, y + 6, { align: 'center' });
  y += 16;

  pdf.setFont(FONT_NAME, 'normal');
  pdf.setFontSize(BODY_FONT_PT);

  for (const sec of sections) {
    if (sec.type === 'body') {
      const lines = pdf.splitTextToSize(sec.text, CONTENT_W_MM);
      for (const line of lines) {
        ensureSpace(BODY_LINE_H_MM);
        pdf.text(line, MARGIN, y + BODY_LINE_H_MM * 0.75);
        y += BODY_LINE_H_MM;
      }
      y += PARAGRAPH_SPACING_MM;
    } else if (sec.type === 'sig-center') {
      y += 6;
      ensureSpace(BODY_LINE_H_MM);
      pdf.setFont(FONT_NAME, 'normal');
      pdf.text(sec.text, PAGE_W_MM / 2, y + BODY_LINE_H_MM * 0.75, { align: 'center' });
      y += BODY_LINE_H_MM + 2;
    } else if (sec.type === 'sig-right') {
      ensureSpace(BODY_LINE_H_MM);
      pdf.setFont(FONT_NAME, 'bold');
      pdf.text(sec.text, PAGE_W_MM - MARGIN, y + BODY_LINE_H_MM * 0.75, { align: 'right' });
      y += BODY_LINE_H_MM;
      pdf.setFont(FONT_NAME, 'normal');
    }
  }

  pdf.save(fileName);
}
