import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

// mammoth's raw-text mode drops line breaks inside a paragraph, its HTML keeps them as <br />.
function docxHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/(?:p|h[1-6]|li|tr)>/g, '\n\n')
    .replace(/<\/td>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

// Extract raw text from various history file formats (PDF, DOCX, MD, TXT, JSON)
export async function extractTextFromHistoryFile(
  fileName: string,
  fileBase64?: string,
  textContent?: string
): Promise<string> {
  if (textContent && textContent.trim()) {
    return textContent.trim();
  }

  if (!fileBase64) {
    throw new Error('Файл не містить даних');
  }

  const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');
  const lowerName = (fileName || '').toLowerCase();

  if (lowerName.endsWith('.docx')) {
    const docxResult = await mammoth.convertToHtml({ buffer });
    return docxHtmlToText(docxResult.value || '');
  }

  if (lowerName.endsWith('.pdf')) {
    const parser = new PDFParse({ data: buffer });
    const textResult = await parser.getText();
    return textResult.text || '';
  }

  if (lowerName.endsWith('.json')) {
    const jsonStr = buffer.toString('utf-8');
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // Not a saved consultation: the file is read as plain text below.
      return jsonStr;
    }
    if (parsed.form028 || parsed.patient) {
      const parts: string[] = [];
      if (parsed.patient?.fullName) parts.push(`Пацієнт: ${parsed.patient.fullName}`);
      if (parsed.patient?.age) parts.push(`Вік / Дата народження: ${parsed.patient.age}`);
      if (parsed.patient?.consultationDate) parts.push(`Дата огляду: ${parsed.patient.consultationDate}`);
      if (parsed.form028?.diagnosisCode || parsed.form028?.diagnosisDescription) {
        parts.push(`Діагноз: ${parsed.form028.diagnosisCode || ''} ${parsed.form028.diagnosisDescription || ''}`);
      }
      if (parsed.form028?.anamnesisVitaeSection) {
        parts.push(`Анамнез життя: ${parsed.form028.anamnesisVitaeSection}`);
      }
      if (parsed.form028?.anamnesisMorbiSection) {
        parts.push(`Анамнез захворювання: ${parsed.form028.anamnesisMorbiSection}`);
      }
      if (parsed.form028?.recommendationsSection) {
        parts.push(`Рекомендації: ${parsed.form028.recommendationsSection}`);
      }
      if (parsed.form028?.objectiveStatusSection) {
        parts.push(`Об'єктивний стан: ${parsed.form028.objectiveStatusSection}`);
      }
      return parts.join('\n\n');
    }
    return jsonStr;
  }

  return buffer.toString('utf-8');
}

const DATE = String.raw`(\d{2}[./-]\d{2}[./-]\d{4})`;
const NAME_WORD = String.raw`[А-ЯІЇЄҐ][а-яіїєґʼ'’-]+`;
const NAME = String.raw`(${NAME_WORD}(?:\s+${NAME_WORD}){1,2})`;

// Form header lines carry decree and registration dates that are not patient data.
const HEADER_LINE = /наказ|затверджено|єдрпоу|рнокпп|ліценз|форма первинної/i;
const DOCTOR_LINE = /віленчик|vilenchyk|лікар/i;

// A section ends where the next form heading starts.
const SECTION_END = String.raw`(?=\n\s*(?:\d{1,2}\.\s*)?(?:Скарги|Анамнез|Короткий\s+анамнез|Дані|Об[ʼ'’]?єктивн|Діагноз|Рекомендації|Лікувальні|Працездатність|Термін|Повторна\s+явка|Тривалість|Засіб|Технічний|Період)[^\n:]{0,90}:|\n\s*(?:М\.\s*П\.|Лікар[-\s:]|Підпис|Печатка)|\n\s*\n\s*\n|$)`;

const NAME_PATTERNS = [
  new RegExp(String.raw`(?:[Пп]різвище,?\s*ім[ʼ'’]?я[^:\n]*|[Пп]ацієнт(?:ка|а)?|ПІБ|[Пп]іб|[Хх]вор(?:ий|а|ого))\s*:\s*${NAME}`),
  new RegExp(String.raw`(${NAME_WORD}\s+${NAME_WORD}\s+${NAME_WORD})`),
];

const DOB_PATTERNS = [
  new RegExp(String.raw`дата\s*народження[^\n]{0,40}?${DATE}`, 'i'),
  new RegExp(String.raw`народив(?:ся|лася|лась)[^\n]{0,15}?${DATE}`, 'i'),
  new RegExp(String.raw`(?:^|[\s(,;])[др]\.\s*н\.\s*:?\s*${DATE}`, 'i'),
  new RegExp(String.raw`${DATE}\s*(?:р\.\s*н\.|року\s+народження)`, 'i'),
];

const CONSULTATION_DATE_PATTERNS = [
  new RegExp(String.raw`дата\s*(?:звернення|консультації|огляду|прийому)[^\n]{0,20}?${DATE}`, 'i'),
  new RegExp(String.raw`^№\s*\S+\s+від\s+${DATE}`),
  new RegExp(String.raw`(?:висновок|огляд|консультація|прийом)[^\n]{0,40}?від\s+${DATE}`, 'i'),
];

function firstMatch(lines: string[], patterns: RegExp[]): string {
  for (const pattern of patterns) {
    for (const line of lines) {
      const m = line.match(pattern);
      if (m && m[1]) return m[1].trim();
    }
  }
  return '';
}

function sectionText(rawText: string, headingPattern: string): string {
  const m = rawText.match(
    new RegExp(String.raw`(?:^|\n)\s*(?:\d{1,2}\.\s*)?(?:${headingPattern})\s*(?::|(?=\n))\s*([\s\S]*?)${SECTION_END}`, 'i')
  );
  return m && m[1] ? m[1].trim() : '';
}

// Extract structured clinical history and psychiatry facts from text
export function parseClinicalHistoryData(rawText: string, fileName: string = '') {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const bodyLines = lines.filter((l) => !HEADER_LINE.test(l));

  const patientName = firstMatch(
    bodyLines.slice(0, 30).filter((l) => !DOCTOR_LINE.test(l)),
    NAME_PATTERNS
  );
  const dob = firstMatch(bodyLines, DOB_PATTERNS).replace(/[-/]/g, '.');
  const consultationDate = firstMatch(bodyLines, CONSULTATION_DATE_PATTERNS).replace(/[-/]/g, '.');

  let pastDiagnosisCode = '';
  let pastDiagnosisDescription = '';
  const diagMatch = rawText.match(
    /(?:діагноз|шифр\s*мкх|мкх-10)[^\n:]*:\s*\[?([A-Z]\d{2}(?:\.\d{1,2})?)\]?\s*[-—:]?\s*([^\n]*)/i
  );
  if (diagMatch) {
    pastDiagnosisCode = diagMatch[1].toUpperCase();
    pastDiagnosisDescription = diagMatch[2].trim().replace(/\.$/, '');
  } else {
    const icdOnly = rawText.match(/(?:^|[^A-Za-z0-9])([Ff]\d{2}(?:\.\d{1,2})?)(?![\d.]*\d)/);
    if (icdOnly) {
      pastDiagnosisCode = icdOnly[1].toUpperCase();
    }
  }

  const anamnesisVitae = sectionText(rawText, String.raw`Анамнез\s+життя`);

  let pastTherapy = sectionText(
    rawText,
    String.raw`Лікувальні\s+та\s+трудові\s+рекомендації|Рекомендації|Призначення|Фармакотерапія|Схема\s+лікування|Лікування`
  );
  if (!pastTherapy) {
    const medRegex = /(?:есциталопрам|сертралін|золофт|пароксетин|флуоксетин|ципралекс|паксил|венлафаксин|велаксин|дулоксетин|симбалта|міртазапін|міртел|тразодон|триттіко|прегабалін|лірика|гідазепам|клоназепам|ксанакс|алпразолам|кветіапін|сероквель|оланзапін|арипіпразол|ламотриджин|ламіктал|вальпроат|депакін|літій|бупропіон|атомоксетин|страттера)[^.;\n]*/gi;
    const medsFound = rawText.match(medRegex);
    if (medsFound && medsFound.length > 0) {
      pastTherapy = Array.from(new Set(medsFound.map((m) => m.trim()))).join('; ');
    }
  }

  const summaryParts: string[] = [];
  if (consultationDate) summaryParts.push(`Огляд від ${consultationDate}`);
  if (pastDiagnosisCode) summaryParts.push(`Діагноз: ${pastDiagnosisCode}${pastDiagnosisDescription ? ` (${pastDiagnosisDescription})` : ''}`);
  if (pastTherapy) summaryParts.push(`Попередня терапія: ${pastTherapy.replace(/\n+/g, ' ').slice(0, 150)}`);

  return {
    patientName,
    dob,
    pastDiagnosisCode,
    pastDiagnosisDescription,
    pastTherapy: pastTherapy.slice(0, 1000),
    anamnesisVitae: anamnesisVitae.slice(0, 1000),
    consultationDate,
    summary: summaryParts.join(' | ') || `Документ: ${fileName}`,
  };
}
