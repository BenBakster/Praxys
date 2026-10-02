import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from 'docx';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Doctor & Practice Profile Defaults (Strict MOH compliance, NO "психотерапевт")
const PRACTICE_INFO = {
  doctorName: 'Віленчик Антон Павлович',
  doctorTitle: 'Лікар-психіатр, нарколог',
  practiceName: 'ФОП ВІЛЕНЧИК А. П.',
  licenseNumber: 'Наказ МОЗ України № 854 від 17.05.2024 р.',
  edrpou: '3331405953',
  address: 'м. Київ, вул. Велика Васильківська / Дистанційний прийом',
  phone: '+380 (50) 412-25-33',
  email: 'Anton.Vilenchyk@gmail.com',
};

// Initialize Gemini Client
const geminiApiKey = process.env.GEMINI_API_KEY;
const ai = geminiApiKey
  ? new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// Age Calculation Helper from Date of Birth
function formatAgeWithDob(dob?: string): string {
  if (!dob || !dob.trim()) return 'У записі не зазначено (зі слів пацієнта)';
  const clean = dob.trim();
  const parts = clean.includes('.')
    ? clean.split('.')
    : clean.includes('-')
    ? clean.split('-').reverse()
    : null;

  if (parts && parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const birthDate = new Date(year, month, day);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    if (!isNaN(age) && age > 0 && age < 120) {
      let suffix = 'років';
      const lastDigit = age % 10;
      const lastTwo = age % 100;
      if (lastTwo < 11 || lastTwo > 19) {
        if (lastDigit === 1) suffix = 'рік';
        else if (lastDigit >= 2 && lastDigit <= 4) suffix = 'роки';
      }
      return `${age} ${suffix} (${clean})`;
    }
  }
  return clean;
}

// Universal Dialogue Extractor (Handles any raw Fireflies, Meet, Zoom, Whisper, or generic JSON)
function extractAllPossibleDialogue(body: any): { text: string; count: number; meta: any } {
  if (!body) return { text: '', count: 0, meta: {} };

  let meta: any = {};
  const lines: string[] = [];

  let target = body;
  if (body.rawJson) target = body.rawJson;

  if (typeof target === 'string') {
    try {
      target = JSON.parse(target);
    } catch {
      const split = target.split('\n').filter(Boolean);
      return { text: target, count: split.length, meta: body.metadata || {} };
    }
  }

  meta.title = target.title || target.meeting_title || target.data?.transcript?.title || body.metadata?.title || '';
  meta.date = target.date || target.date_string || target.data?.transcript?.date || body.metadata?.date || '';
  meta.duration = target.duration || body.metadata?.duration || '';
  meta.participants = target.participants || target.attendees || target.speakers || body.metadata?.participants || [];
  meta.fileName = body.metadata?.fileName || target.fileName || '';
  meta.doctorNotes = body.doctorNotes || body.metadata?.doctorNotes || '';
  meta.patientContext = body.patientContext || body.metadata?.patientContext || {};
  meta.psychometrics = body.psychometrics || body.metadata?.psychometrics || '';
  meta.followUpData = body.followUpData || body.metadata?.followUpData || {};

  const sentences = target.sentences || target.data?.transcript?.sentences;
  if (Array.isArray(sentences)) {
    for (const s of sentences) {
      const spk = s.speaker_name || s.speaker || s.name || 'Спікер';
      const txt = s.text || s.raw_text || '';
      if (txt.trim()) lines.push(`${spk}: ${txt.trim()}`);
    }
  } else if (Array.isArray(target.transcript)) {
    for (const t of target.transcript) {
      if (typeof t === 'string') {
        if (t.trim()) lines.push(t.trim());
      } else {
        const spk = t.speaker || t.speaker_name || 'Спікер';
        const txt = t.text || t.raw_text || '';
        if (txt.trim()) lines.push(`${spk}: ${txt.trim()}`);
      }
    }
  } else if (Array.isArray(target)) {
    for (const item of target) {
      if (typeof item === 'string') {
        if (item.trim()) lines.push(item.trim());
      } else {
        const spk = item.speaker || item.speaker_name || item.name || item.role || 'Спікер';
        const txt = item.text || item.raw_text || item.content || '';
        if (txt.trim()) lines.push(`${spk}: ${txt.trim()}`);
      }
    }
  } else if (Array.isArray(target.utterances)) {
    for (const u of target.utterances) {
      const spk = u.speaker || u.speaker_name || 'Спікер';
      const txt = u.text || u.content || '';
      if (txt.trim()) lines.push(`${spk}: ${txt.trim()}`);
    }
  } else if (target.results && Array.isArray(target.results.transcripts)) {
    for (const r of target.results.transcripts) {
      if (r.transcript) lines.push(r.transcript);
    }
  } else if (typeof target.transcript === 'string' && target.transcript.trim()) {
    lines.push(target.transcript.trim());
  } else if (typeof target.text === 'string' && target.text.trim()) {
    lines.push(target.text.trim());
  } else if (typeof body.transcript === 'string' && body.transcript.trim()) {
    lines.push(body.transcript.trim());
  }

  return {
    text: lines.join('\n'),
    count: lines.length,
    meta,
  };
}

// Status Endpoint
app.get('/api/status', (req: Request, res: Response) => {
  res.json({
    ok: true,
    hasApiKey: Boolean(geminiApiKey),
    activeModel: 'gemini-3.8-flash',
    supportedProviders: [
      { id: 'gemini', name: 'Google Gemini', defaultModel: 'gemini-3.8-flash' },
      { id: 'openai', name: 'OpenAI (ChatGPT)', defaultModel: 'gpt-4o' },
      { id: 'groq', name: 'Groq (Llama 3.3)', defaultModel: 'llama-3.3-70b-versatile' },
      { id: 'deepseek', name: 'DeepSeek', defaultModel: 'deepseek-chat' },
      { id: 'offline', name: 'Без моделі', defaultModel: 'text-only' },
    ],
    supportedModels: [
      { id: 'gemini-3.8-flash', name: 'Google Gemini 3.8 Flash', tag: 'Основна модель' },
      { id: 'gemini-3.5-flash', name: 'Google Gemini 3.5 Flash', tag: 'Швидка / резервна' },
      { id: 'gemini-flash-latest', name: 'Google Gemini Flash Latest', tag: 'Автоматична' },
    ],
    supportedForms: [
      { id: '028_o', name: 'Форма № 028/о (Консультативний висновок спеціаліста)' },
      { id: '002_tm', name: 'Форма № 002/тм (Висновок консультанта телемедицини)' },
      { id: '027_o', name: 'Форма № 027/о (Виписка із медичної карти амбулаторного хворого)' },
    ],
  });
});

// Helper for OpenAI-compatible APIs (OpenAI, Groq, DeepSeek, Local Ollama, etc.)
async function callOpenAiCompatibleApi({
  apiKey,
  baseUrl,
  model,
  systemPrompt,
  userPrompt,
}: {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<any> {
  let url = (baseUrl || 'https://api.openai.com/v1').trim();
  if (!url.endsWith('/chat/completions')) {
    url = `${url.replace(/\/+$/, '')}/chat/completions`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `${systemPrompt}\n\nВАЖЛИВО: Обов'язково поверни виключно валідний JSON-об'єкт із трьома кореневими ключами: "patient", "facts", "form028". Жодного тексту за межами JSON!`,
        },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Помилка API (${response.status}): ${errorBody.slice(0, 300)}`);
  }

  const result = await response.json();
  const rawContent = result?.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error('Отримано порожню відповідь від ШІ');
  }

  const cleaned = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(cleaned);
}

// Test AI Connection Endpoint
app.post('/api/test-ai', async (req: Request, res: Response) => {
  try {
    const { provider, model, apiKey, baseUrl } = req.body;

    if (provider === 'offline') {
      return res.json({
        ok: true,
        message: 'Режим без моделі. Текст нікуди не відправляється, діагноз не пишеться.',
      });
    }

    if (provider === 'gemini') {
      const keyToUse = (apiKey || geminiApiKey || '').trim();
      if (!keyToUse) {
        return res.status(400).json({
          ok: false,
          error: 'Ключ Google Gemini не знайдено на сервері та не передано у запиті.',
        });
      }
      const testClient = new GoogleGenAI({ apiKey: keyToUse });
      const testModel = model || 'gemini-3.8-flash';
      const testResp = await testClient.models.generateContent({
        model: testModel,
        contents: 'Дай відповідь одним коротким словом: Працює',
      });
      if (testResp.text) {
        return res.json({
          ok: true,
          message: `Google Gemini (${testModel}) успішно перевірено!`,
        });
      }
    } else {
      let endpointUrl = (baseUrl || '').trim();
      if (!endpointUrl) {
        if (provider === 'openai') endpointUrl = 'https://api.openai.com/v1';
        else if (provider === 'groq') endpointUrl = 'https://api.groq.com/openai/v1';
        else if (provider === 'deepseek') endpointUrl = 'https://api.deepseek.com';
        else endpointUrl = 'https://api.openai.com/v1';
      }

      const keyToUse = (apiKey || '').trim();
      if (!keyToUse) {
        return res.status(400).json({
          ok: false,
          error: `Введіть API-ключ для ${String(provider).toUpperCase()}`,
        });
      }

      const url = endpointUrl.endsWith('/chat/completions')
        ? endpointUrl
        : `${endpointUrl.replace(/\/+$/, '')}/chat/completions`;

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${keyToUse}`,
        },
        body: JSON.stringify({
          model: model || (provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini'),
          messages: [{ role: 'user', content: 'Say OK' }],
          max_tokens: 10,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return res.status(resp.status).json({
          ok: false,
          error: `Помилка ${resp.status}: ${errText.slice(0, 200)}`,
        });
      }

      return res.json({
        ok: true,
        message: `${(provider || 'ШІ').toUpperCase()} (${model}) підключено успішно!`,
      });
    }

    return res.json({ ok: true, message: 'Зв\'язок встановлено успішно!' });
  } catch (err: any) {
    console.error('Test AI error:', err);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Не вдалося встановити зв’язок із ШІ',
    });
  }
});

// Helper: Extract raw text from various history file formats (PDF, DOCX, MD, TXT, JSON)
async function extractTextFromHistoryFile(
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
    const docxResult = await mammoth.extractRawText({ buffer });
    return docxResult.value || '';
  }

  if (lowerName.endsWith('.pdf')) {
    const parser = new PDFParse({ data: buffer });
    const textResult = await parser.getText();
    return textResult.text || '';
  }

  if (lowerName.endsWith('.json')) {
    const jsonStr = buffer.toString('utf-8');
    try {
      const parsed = JSON.parse(jsonStr);
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
          parts.push(`Призначена терапія / рекомендації: ${parsed.form028.recommendationsSection}`);
        }
        if (parsed.form028?.objectiveStatusSection) {
          parts.push(`Об'єктивний стан: ${parsed.form028.objectiveStatusSection}`);
        }
        return parts.join('\n\n');
      }
      return jsonStr;
    } catch {
      return jsonStr;
    }
  }

  return buffer.toString('utf-8');
}

// Helper: Extract structured clinical history and psychiatry facts from text
function parseClinicalHistoryData(rawText: string, fileName: string = '') {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);

  // 1. Patient Name
  let patientName = '';
  const namePatterns = [
    /(?:пацієнт(?:ка)?|піб|прізвище,?\s*ім'?я(?:\s*та\s*по\s*батькові)?|хворий|хвора)[:\s]+([А-ЯІЇЄҐ][а-яіїєґ']+(?:\s+[А-ЯІЇЄҐ][а-яіїєґ']+){1,2})/i,
    /(?:1\.\s*Прізвище,?\s*ім'?я)[:\s]+([А-ЯІЇЄҐ][а-яіїєґ']+(?:\s+[А-ЯІЇЄҐ][а-яіїєґ']+){1,2})/i,
    /([А-ЯІЇЄҐ][а-яіїєґ']+\s+[А-ЯІЇЄҐ][а-яіїєґ']+\s+[А-ЯІЇЄҐ][а-яіїєґ']+)/,
  ];

  for (const pat of namePatterns) {
    for (const line of lines.slice(0, 30)) {
      if (
        line.toLowerCase().includes('віленчик') ||
        line.toLowerCase().includes('vilenchyk') ||
        line.toLowerCase().includes('лікар')
      ) {
        continue;
      }
      const m = line.match(pat);
      if (m && m[1]) {
        patientName = m[1].trim();
        break;
      }
    }
    if (patientName) break;
  }

  // 2. Date of Birth
  let dob = '';
  const dobPatterns = [
    /(?:дата\s*народження|д\.?н\.?|народив(?:ся|лась)|р\.?н\.?)[:\s]*(\d{2}[./-]\d{2}[./-]\d{4})/i,
    /(\d{2}[./-]\d{2}[./-]\d{4})\s*(?:р\.?н\.?|року\s+народження)/i,
    /(\d{2}\.\d{2}\.\d{4})/,
  ];

  for (const pat of dobPatterns) {
    for (const line of lines.slice(0, 35)) {
      const m = line.match(pat);
      if (m && m[1]) {
        dob = m[1].replace(/[-/]/g, '.');
        break;
      }
    }
    if (dob) break;
  }

  // 3. Consultation Date
  let consultationDate = '';
  for (const line of lines) {
    if (line.includes('14.02.2012') || line.includes('19.10.2015')) continue; // Skip MOH decree dates
    const m = line.match(/(?:дата\s*(?:звернення|консультації|огляду)|висновок\s+від|від)[:\s]*(\d{2}[./-]\d{2}[./-]\d{4})/i);
    if (m && m[1]) {
      consultationDate = m[1].replace(/[-/]/g, '.');
      break;
    }
  }

  // 4. Past Diagnosis (ICD-10)
  let pastDiagnosisCode = '';
  let pastDiagnosisDescription = '';
  const diagMatch = rawText.match(/(?:діагноз|шифр\s*мкх|мкх-10|код)[:\s]*([Ff]\d{2}(?:\.\d{1,2})?)[^.\n]*?(?:[:\s\-—]+([^\n.]+))?/i);
  if (diagMatch) {
    pastDiagnosisCode = diagMatch[1].toUpperCase();
    if (diagMatch[2]) {
      pastDiagnosisDescription = diagMatch[2].trim();
    }
  } else {
    const icdOnly = rawText.match(/\b([Ff]\d{2}(?:\.\d{1,2})?)\b/);
    if (icdOnly) {
      pastDiagnosisCode = icdOnly[1].toUpperCase();
    }
  }

  // 5. Past Anamnesis Vitae (Section 6)
  let anamnesisVitae = '';
  const vitaeMatch = rawText.match(/(?:6\.\s*Анамнез\s*життя|Анамнез\s*життя)[:\s]*([\s\S]*?)(?=(?:\n\s*(?:7\.|Об'єктивний|Статус|Діагноз)|\n\n\n|$))/i);
  if (vitaeMatch && vitaeMatch[1]) {
    anamnesisVitae = vitaeMatch[1].trim();
  }

  // 6. Past Therapy & Recommendations
  let pastTherapy = '';
  const recMatch = rawText.match(/(?:9\.\s*Рекомендації|Рекомендації|Призначення|Фармакотерапія|Лікування|Схема\s*лікування)[:\s]*([\s\S]*?)(?=(?:\n\s*(?:10\.|Лікар|М\.\s*П\.|Печатка|Дата|Підпис)|\n\n\n|$))/i);
  if (recMatch && recMatch[1]) {
    pastTherapy = recMatch[1].trim();
  } else {
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

// Endpoint: Parse History File (PDF, DOCX, MD, TXT, JSON)
app.post('/api/parse-history-file', async (req: Request, res: Response) => {
  try {
    const { fileName, fileBase64, textContent } = req.body;
    if (!fileBase64 && !textContent) {
      return res.status(400).json({ ok: false, error: 'Файл або текст не передано' });
    }

    const rawText = await extractTextFromHistoryFile(fileName || 'history_document.txt', fileBase64, textContent);
    if (!rawText || !rawText.trim()) {
      return res.status(400).json({ ok: false, error: 'Не вдалося витягти текст із наданого файлу' });
    }

    const extracted = parseClinicalHistoryData(rawText, fileName);

    return res.json({
      ok: true,
      fileName,
      rawText: rawText.slice(0, 15000),
      extracted,
    });
  } catch (err: any) {
    console.error('Error parsing history file:', err);
    return res.status(500).json({
      ok: false,
      error: `Помилка обробки файлу: ${err.message || 'Непідтримуваний формат'}`,
    });
  }
});

// Deep Psychiatric Clinical System Instructions
function formatPsychometrics(psy: any): string {
  if (!psy) return '';
  if (typeof psy === 'string') return psy.trim();
  if (typeof psy === 'object') {
    const parts: string[] = [];
    if (psy.phq9) parts.push(`PHQ-9 (депресія): ${psy.phq9}`);
    if (psy.gad7) parts.push(`GAD-7 (тривога): ${psy.gad7}`);
    if (psy.asrs) parts.push(`ASRS-6 (СДУГ): ${psy.asrs}`);
    if (psy.audit) parts.push(`AUDIT (алкоголь): ${psy.audit}`);
    if (psy.asrm) parts.push(`ASRM (манія/гіпоманія): ${psy.asrm}`);
    if (psy.pid5) parts.push(`PID-5: ${psy.pid5}`);
    if (psy.custom) parts.push(psy.custom);
    for (const [k, v] of Object.entries(psy)) {
      if (!['phq9', 'gad7', 'asrs', 'audit', 'asrm', 'pid5', 'custom'].includes(k) && v) {
        parts.push(`${k}: ${v}`);
      }
    }
    return parts.join('; ');
  }
  return String(psy).trim();
}

function errorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Невідома помилка';
  return raw
    .replace(/AIza[0-9A-Za-z_-]{8,}/g, '[ключ]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, '[ключ]')
    .slice(0, 500);
}

const CLINICAL_SYSTEM_INSTRUCTION = `
Ви — провідний клінічний експерт та медичний асистент лікаря-психіатра для приватної психіатричної та наркологічної практики лікаря Віленчика Антона Павловича (ФОП Віленчик А.П., Ліцензія МОЗ України № 854 від 17.05.2024 р.).

СУВОРІ РЕГЛАМЕНТНІ ПРАВИЛА:
1. СПЕЦІАЛЬНІСТЬ ЛІКАРЯ: Тільки "лікар-психіатр, нарколог". Слово "психотерапевт" КАТЕГОРИЧНО НЕ вживати ніде!
2. ВРАХУВАННЯ ПАЦІЄНТА ТА ПОПЕРЕДНЬОГО АНАМНЕЗУ (PATIENT CONTEXT):
   - Якщо вказано ПІБ пацієнта (patientContext.fullName), використати його як єдине справжнє ім'я.
   - Якщо вказано дату народження (patientContext.dob), обчислити вік пацієнта та записати у форматі "ХХ років (ДД.ММ.РРРР)".
   - Якщо надано попередній анамнез життя (patientContext.pastHistory), безпосередньо вплести його у розділ "6. Анамнез життя" (form028.anamnesisVitaeSection).
   - Якщо patientContext.pastHistory НЕ надано, записати: "У записі не зазначено (зі слів пацієнта)".

3. ПСИХОМЕТРИЧНІ ШКАЛИ (ТЕСТИ З БОТА):
   - Якщо надано результати психометричних шкал (PHQ-9, GAD-7, ASRS-6, AUDIT, ASRM тощо), обов'язково інтегрувати їх окремим пунктом в розділ 7 "Об'єктивний статус" (form028.objectiveStatusSection):
     Наприклад: "Психометричне обстеження: PHQ-9 — 14 балів (помірний депресивний епізод); GAD-7 — 11 балів (помірна тривога); ASRS v1.1 — висока ймовірність СДУГ."

4. РЕЖИМ ПОВТОРНОГО ПРИЙОМУ (ДИНАМІКА СТАНУ ТА ТЕРАПІЇ):
   - Якщо тип консультації "повторна" або надано дані попередньої терапії:
     * Оцінити терапевтичну динаміку: редукцію тривоги (у %), нормалізацію сну, переносимість ліків та побічні ефекти.
     * В "Анамнез захворювання" (form028.anamnesisMorbiSection) окремо описати: "Динаміка стану на тлі терапії...".
     * В "Рекомендації" (form028.recommendationsSection) клінічно обґрунтувати корекцію дози, ескалацію, заміну препарату або продовження підтримуючого курсу.

5. МКХ-10 ТА РЕКОМЕНДАЦІЇ:
   - Вказати точний код за МКХ-10 (наприклад F41.2, F41.0, F41.1, F43.2, F32.1 тощо) та повну офіційну клінічну назву.
   - Рекомендації: режим, психоосвіта, психогігієна сну, психофармакотерапія з точним зазначенням доз і схеми титрації (вранці/ввечері).

6. СТАНДАРТИ МОЗ УКРАЇНИ (028/о, 002/тм, 027/о):
   - Якщо лабораторних даних не було: "На момент консультації даних лабораторних та інструментальних досліджень не надано."
   - Внизу документа залишається виключно місце для печатки (М. П.) без рядка ручного підпису.
`;

// Extract Endpoint with robust Model Cascade
app.post('/api/extract', async (req: Request, res: Response) => {
  try {
    const extracted = extractAllPossibleDialogue(req.body);
    const processedText = extracted.text;
    const metadata = extracted.meta;

    const aiConfig = req.body?.aiConfig || {};
    const provider: string = (aiConfig.provider || req.body?.aiProvider || 'gemini').toLowerCase();
    const modelName = aiConfig.model || req.body?.modelName || req.body?.customModel || 'gemini-3.8-flash';
    const customApiKey: string = (aiConfig.apiKey || '').trim();
    const customBaseUrl: string = (aiConfig.baseUrl || '').trim();
    const formType = req.body?.formType || '028_o';
    const doctorNotes = req.body?.doctorNotes || metadata?.doctorNotes || '';
    const patientContext = req.body?.patientContext || metadata?.patientContext || {};
    const psychometrics = formatPsychometrics(req.body?.psychometrics || metadata?.psychometrics || '');
    const followUpData = req.body?.followUpData || metadata?.followUpData || {};
    const priorConsultationHistory = req.body?.priorConsultationHistory || metadata?.priorConsultationHistory || null;

    if (!processedText || processedText.trim().length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'У записі немає тексту розмови.',
      });
    }

    if (provider === 'offline') {
      const localResult = parseActualConsultationText(
        processedText,
        metadata,
        doctorNotes,
        patientContext,
        psychometrics,
        followUpData,
        priorConsultationHistory
      );
      return res.json({
        ok: true,
        source: 'text_only',
        model: 'text-only',
        data: localResult,
      });
    }

    const calculatedAge = patientContext.dob
      ? formatAgeWithDob(patientContext.dob)
      : 'У записі не зазначено (зі слів пацієнта)';

    const isFollowUp = followUpData.consultationType === 'повторна' || Boolean(priorConsultationHistory);

    const prompt = `
ВХІДНІ КЛІНІЧНІ ДАНІ ТА КОНТЕКСТ:
- Назва зустрічі / файлу: ${metadata.title || metadata.fileName || 'Консультація'}
- Дата консультації: ${metadata.date || new Date().toLocaleDateString('uk-UA')}
- Учасники бесіди: ${JSON.stringify(metadata.participants || [])}
- Обрана форма МОЗ: ${
        formType === '002_tm'
          ? 'Форма № 002/тм (Телемедицина, Наказ МОЗ № 681)'
          : formType === '027_o'
          ? 'Форма № 027/о (Виписка із медичної карти амбулаторного хворого, Наказ МОЗ № 110)'
          : 'Форма № 028/о (Консультативний висновок спеціаліста, Наказ МОЗ № 110)'
      }

КАРТКА ПАЦІЄНТА (PATIENT CONTEXT):
- ПІБ: ${patientContext.fullName || 'Визначити зі стенограми або метаданих'}
- Дата народження: ${patientContext.dob || 'Не зазначено'} (Розрахований вік: ${calculatedAge})
- Попередній анамнез життя (для розділу 6): ${
        patientContext.pastHistory || 'У записі не зазначено (зі слів пацієнта)'
      }

РЕЖИМ КОНСУЛЬТАЦІЇ:
- Вид: ${isFollowUp ? 'ПОВТОРНА (Оцінка терапевтичної динаміки)' : 'ПЕРВИННА'}
${
  isFollowUp && followUpData.previousTherapyAndState
    ? `- Попередня терапія та динаміка: """${followUpData.previousTherapyAndState}"""\n`
    : ''
}
${
  priorConsultationHistory
    ? `
ДОКУМЕНТ ПОПЕРЕДНЬОГО ОГЛЯДУ / ЛОНГІТЮДНИЙ АНАМНЕЗ:
- Попередній діагноз: ${priorConsultationHistory.pastDiagnosisCode || ''} ${priorConsultationHistory.pastDiagnosisDescription || ''}
- Призначена попередня терапія: ${priorConsultationHistory.pastTherapy || 'Не вказана'}
- Попередній анамнез життя (соматика, алергії, травми): ${priorConsultationHistory.anamnesisVitae || 'Без особливостей'}
- Короткий зміст попереднього огляду: """${priorConsultationHistory.summary || ''}"""
- Витяг із тексту попереднього документа:
"""
${(priorConsultationHistory.rawText || '').slice(0, 4000)}
"""
`
    : ''
}

ПСИХОМЕТРИЧНІ ШКАЛИ (ТЕСТИ З БОТА):
${psychometrics ? `"""${psychometrics}"""` : 'Не проводилися або не надані'}
${doctorNotes ? `- ДОДАТКОВІ ПРИМІТКИ ЛІКАРЯ:\n"""${doctorNotes}"""\n` : ''}

СТЕНОГРАМА ПРИЙОМУ ЛІКАРЯ-ПСИХІАТРА:
"""
${processedText.slice(0, 80000)}
"""

ЗАВДАННЯ:
Проаналізуйте прийом, врахуйте повний контекст (включно з попереднім оглядом), застосуйте надані дані пацієнта (patientContext), включіть психометричні шкали в об'єктивний статус, опишіть динаміку терапії у розділі "Анамнез захворювання" (порівнявши з попереднім оглядом), сформуйте офіційний медичний документ та поверніть валідний JSON.
`;

    // 3. If OpenAI-compatible provider (OpenAI, Groq, DeepSeek, Custom)
    if (['openai', 'groq', 'deepseek', 'custom'].includes(provider)) {
      try {
        console.log(`[AI Extract] Calling ${provider.toUpperCase()} with model ${modelName}`);
        let baseUrl = customBaseUrl;
        if (!baseUrl) {
          if (provider === 'openai') baseUrl = 'https://api.openai.com/v1';
          else if (provider === 'groq') baseUrl = 'https://api.groq.com/openai/v1';
          else if (provider === 'deepseek') baseUrl = 'https://api.deepseek.com';
        }
        const parsed = await callOpenAiCompatibleApi({
          apiKey: customApiKey,
          baseUrl,
          model: modelName,
          systemPrompt: CLINICAL_SYSTEM_INSTRUCTION,
          userPrompt: prompt,
        });

        if (parsed && parsed.form028) {
          if (patientContext.fullName && parsed.patient) {
            parsed.patient.fullName = patientContext.fullName;
          } else if (priorConsultationHistory?.patientName && parsed.patient) {
            parsed.patient.fullName = priorConsultationHistory.patientName;
          }

          if (patientContext.dob && parsed.patient) {
            parsed.patient.age = formatAgeWithDob(patientContext.dob);
          } else if (priorConsultationHistory?.dob && parsed.patient) {
            parsed.patient.age = formatAgeWithDob(priorConsultationHistory.dob);
          } else if (calculatedAge && parsed.patient) {
            parsed.patient.age = calculatedAge;
          }

          if (patientContext.pastHistory) {
            parsed.form028.anamnesisVitaeSection = patientContext.pastHistory;
          } else if (priorConsultationHistory?.anamnesisVitae) {
            parsed.form028.anamnesisVitaeSection = priorConsultationHistory.anamnesisVitae;
          }
          if (psychometrics && !parsed.form028.objectiveStatusSection.includes('Психометричн')) {
            parsed.form028.objectiveStatusSection += `\nПсихометричне обстеження (шкали): ${psychometrics}.`;
          }
          if (isFollowUp && followUpData.previousTherapyAndState && !parsed.form028.anamnesisMorbiSection.includes('Динаміка')) {
            parsed.form028.anamnesisMorbiSection += `\nДинаміка на тлі попередньої терапії: ${followUpData.previousTherapyAndState}.`;
          }

          console.log(`[AI Extract] Success with ${provider} (${modelName})`);
          return res.json({
            ok: true,
            source: provider,
            model: modelName,
            data: parsed,
          });
        }
        return res.status(502).json({
          ok: false,
          error: 'Модель повернула відповідь без документа.',
        });
      } catch (provErr: any) {
        const message = errorText(provErr);
        console.warn(`[AI Extract] ${provider} failed: ${message}`);
        return res.status(502).json({
          ok: false,
          error: message,
        });
      }
    }

    let lastModelError = '';
    const geminiClient = customApiKey
      ? new GoogleGenAI({ apiKey: customApiKey })
      : ai;

    if (!geminiClient) {
      return res.status(400).json({
        ok: false,
        error: 'Ключ Google Gemini на сервері не налаштовано.',
      });
    }

    if (geminiClient) {
      const candidateModels = [
        modelName || 'gemini-3.8-flash',
        'gemini-3.8-flash',
        'gemini-3.5-flash',
        'gemini-flash-latest',
      ].filter((m) => m && m !== 'gemini-2.5-flash' && m !== 'gemini-2.0-flash');
      const uniqueModels = Array.from(new Set(candidateModels));

      const schemaConfig = {
        type: Type.OBJECT,
        properties: {
          patient: {
            type: Type.OBJECT,
            properties: {
              fullName: { type: Type.STRING },
              age: { type: Type.STRING },
              gender: { type: Type.STRING },
              consultationDate: { type: Type.STRING },
              consultationType: { type: Type.STRING },
            },
            required: ['fullName', 'consultationDate'],
          },
          facts: {
            type: Type.OBJECT,
            properties: {
              utteranceCount: { type: Type.INTEGER },
              chiefComplaints: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              historyTimeline: { type: Type.STRING },
              sleepQuality: { type: Type.STRING },
              somaticSymptoms: { type: Type.STRING },
              medicationsMentioned: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              verifiedQuotes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    speaker: { type: Type.STRING },
                    text: { type: Type.STRING },
                    significance: { type: Type.STRING },
                  },
                  required: ['speaker', 'text'],
                },
              },
            },
            required: ['chiefComplaints', 'sleepQuality', 'medicationsMentioned'],
          },
          form028: {
            type: Type.OBJECT,
            properties: {
              documentNumber: { type: Type.STRING },
              doctorHeader: { type: Type.STRING },
              patientSection: { type: Type.STRING },
              complaintsSection: { type: Type.STRING },
              anamnesisMorbiSection: { type: Type.STRING },
              anamnesisVitaeSection: { type: Type.STRING },
              objectiveStatusSection: { type: Type.STRING },
              laboratorySection: { type: Type.STRING },
              diagnosisCode: { type: Type.STRING },
              diagnosisDescription: { type: Type.STRING },
              recommendationsSection: { type: Type.STRING },
              disabilityNote: { type: Type.STRING },
              nextAppointmentDate: { type: Type.STRING },
              telemedDuration: { type: Type.STRING },
              telemedChannel: { type: Type.STRING },
              extractRecipient: { type: Type.STRING },
              treatmentPeriod: { type: Type.STRING },
            },
            required: [
              'complaintsSection',
              'anamnesisMorbiSection',
              'anamnesisVitaeSection',
              'objectiveStatusSection',
              'diagnosisCode',
              'diagnosisDescription',
              'recommendationsSection',
            ],
          },
        },
        required: ['patient', 'facts', 'form028'],
      };

      for (const currentModel of uniqueModels) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            console.log(`[AI Extract] Calling ${currentModel} (attempt ${attempt})...`);
            const response = await geminiClient.models.generateContent({
              model: currentModel,
              contents: prompt,
              config: {
                systemInstruction: CLINICAL_SYSTEM_INSTRUCTION,
                responseMimeType: 'application/json',
                responseSchema: schemaConfig,
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              },
            });

            if (response.text) {
              const parsed = JSON.parse(response.text);

              // Ensure patientContext is strictly applied, fallback to priorConsultationHistory
              if (patientContext.fullName) {
                parsed.patient.fullName = patientContext.fullName;
              } else if (priorConsultationHistory?.patientName) {
                parsed.patient.fullName = priorConsultationHistory.patientName;
              }

              if (patientContext.dob) {
                parsed.patient.age = formatAgeWithDob(patientContext.dob);
              } else if (priorConsultationHistory?.dob) {
                parsed.patient.age = formatAgeWithDob(priorConsultationHistory.dob);
              }

              if (patientContext.pastHistory) {
                parsed.form028.anamnesisVitaeSection = patientContext.pastHistory;
              } else if (priorConsultationHistory?.anamnesisVitae) {
                parsed.form028.anamnesisVitaeSection = priorConsultationHistory.anamnesisVitae;
              } else if (!parsed.form028.anamnesisVitaeSection) {
                parsed.form028.anamnesisVitaeSection = 'У записі не зазначено (зі слів пацієнта)';
              }

              if (parsed.patient?.fullName && (!parsed.form028.patientSection || parsed.form028.patientSection.includes('Не зазначено'))) {
                parsed.form028.patientSection = `${parsed.patient.fullName}, ${parsed.patient.age || ''}`.trim();
              }

              // Weave psychometrics if not already included
              if (psychometrics && !parsed.form028.objectiveStatusSection.includes('Психометричн')) {
                parsed.form028.objectiveStatusSection += `\nПсихометричне обстеження (шкали): ${psychometrics}.`;
              }

              // If followUp data provided and not in anamnesisMorbi, append
              if (isFollowUp && followUpData.previousTherapyAndState && !parsed.form028.anamnesisMorbiSection.includes('Динаміка')) {
                parsed.form028.anamnesisMorbiSection += `\nДинаміка на тлі попередньої терапії: ${followUpData.previousTherapyAndState}.`;
              }

              console.log(`[AI Extract] Success with ${currentModel}`);
              return res.json({
                ok: true,
                source: 'gemini',
                model: currentModel,
                data: parsed,
              });
            }
          } catch (err: any) {
            lastModelError = errorText(err);
            console.warn(`[AI Extract] ${currentModel} attempt ${attempt} failed: ${lastModelError}`);
            if (attempt === 1) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
        }
      }
    }

    return res.status(502).json({
      ok: false,
      error: lastModelError || 'Модель не повернула висновок.',
    });
  } catch (error: any) {
    const message = errorText(error);
    console.error(`[AI Extract] ${message}`);
    return res.status(500).json({
      ok: false,
      error: message,
    });
  }
});

// Dynamic parser on actual text with patientContext, psychometrics, follow-up and prior history
function parseActualConsultationText(
  rawText: string,
  metadata: any,
  doctorNotes: string = '',
  patientContext: any = {},
  psychometrics: string = '',
  followUpData: any = {},
  priorConsultationHistory: any = null
) {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const now = new Date();
  const dateStr =
    metadata?.date ||
    now.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // 1. Patient Name
  let patientName = patientContext.fullName || priorConsultationHistory?.patientName || '';

  if (!patientName && metadata?.title) {
    const titleMatch = metadata.title.match(
      /(?:with|із|з|пацієнт(?:ом|ка|кою)?[:\s]+|зустріч\s+(?:з|із)\s+(?:пацієнтом\s+)?)\s*([А-ЯІЇЄҐA-Z][а-яіїєґa-z']+(?:\s+[А-ЯІЇЄҐA-Z][а-яіїєґa-z']+)?)/i
    );
    if (titleMatch && titleMatch[1]) {
      patientName = titleMatch[1];
    }
  }

  if (!patientName && Array.isArray(metadata?.participants)) {
    for (const p of metadata.participants) {
      const name = typeof p === 'string' ? p : p.name || p.speaker_name;
      if (
        name &&
        !name.toLowerCase().includes('віленчик') &&
        !name.toLowerCase().includes('vilenchyk') &&
        !name.toLowerCase().includes('лікар') &&
        !name.toLowerCase().includes('doctor')
      ) {
        patientName = name;
        break;
      }
    }
  }

  if (!patientName) {
    for (const line of lines.slice(0, 30)) {
      const speakerMatch = line.match(/^([^:\-—]+)[:\-—]/);
      if (speakerMatch) {
        const spk = speakerMatch[1].trim();
        if (
          !spk.toLowerCase().includes('віленчик') &&
          !spk.toLowerCase().includes('vilenchyk') &&
          !spk.toLowerCase().includes('лікар') &&
          !spk.toLowerCase().includes('doctor') &&
          spk.length > 2
        ) {
          patientName = spk;
          break;
        }
      }
      const introMatch = line.match(
        /(?:мене звати|я\s+—|звати|пацієнтка|пацієнт)\s+([А-ЯІЇЄҐA-Z][а-яіїєґa-z']+(?:\s+[А-ЯІЇЄҐA-Z][а-яіїєґa-z']+)?)/i
      );
      if (introMatch && introMatch[1]) {
        patientName = introMatch[1];
        break;
      }
    }
  }

  if (!patientName) {
    patientName = metadata?.fileName
      ? metadata.fileName.replace(/\.[^/.]+$/, '').replace(/_/g, ' ')
      : 'Пацієнт (консультація)';
  }

  // 2. Age / Date of birth
  const patientAge = patientContext.dob
    ? formatAgeWithDob(patientContext.dob)
    : priorConsultationHistory?.dob
    ? formatAgeWithDob(priorConsultationHistory.dob)
    : metadata?.age || 'У записі не зазначено (зі слів пацієнта)';

  // 3. Section 6: Anamnesis Vitae
  const anamnesisVitae =
    patientContext.pastHistory ||
    priorConsultationHistory?.anamnesisVitae ||
    'У записі не зазначено (зі слів пацієнта)';

  // 4. Utterances & Complaints
  const patientUtterances: string[] = [];
  for (const line of lines) {
    const isDoctor =
      line.toLowerCase().includes('віленчик') ||
      line.toLowerCase().includes('vilenchyk') ||
      line.toLowerCase().startsWith('лікар:');
    if (!isDoctor) {
      patientUtterances.push(line.replace(/^[^:]+:\s*/, ''));
    }
  }

  const complaintsList: string[] = [];
  const quotesList: any[] = [];

  for (const u of patientUtterances) {
    if (
      u.match(/(?:скарг|турбу|болить|тривог|страх|серце|сон|безсон|панік|тиск|погано|напад|пригніч|втом|напруг)/i) &&
      complaintsList.length < 4
    ) {
      complaintsList.push(u);
    }
    if (u.length > 20 && quotesList.length < 2) {
      quotesList.push({
        speaker: patientName,
        text: u.length > 160 ? `«${u.slice(0, 160)}...»` : `«${u}»`,
        significance: '',
      });
    }
  }

  const isFollowUp = followUpData.consultationType === 'повторна' || Boolean(priorConsultationHistory);
  const anamnesisParts: string[] = [];
  if (priorConsultationHistory?.pastDiagnosisCode || priorConsultationHistory?.pastDiagnosisDescription) {
    anamnesisParts.push(
      `Раніше: ${[priorConsultationHistory.pastDiagnosisCode, priorConsultationHistory.pastDiagnosisDescription].filter(Boolean).join(' ')}`
    );
  }
  if (priorConsultationHistory?.pastTherapy) {
    anamnesisParts.push(`Раніше отримувана фармакотерапія: ${priorConsultationHistory.pastTherapy}`);
  }
  if (followUpData.previousTherapyAndState) {
    anamnesisParts.push(String(followUpData.previousTherapyAndState).trim());
  }
  if (doctorNotes) {
    anamnesisParts.push(String(doctorNotes).trim());
  }

  const formattedPsy = typeof psychometrics === 'object' ? formatPsychometrics(psychometrics) : String(psychometrics || '').trim();

  return {
    patient: {
      fullName: patientName,
      age: patientAge,
      gender: '',
      consultationDate: dateStr,
      consultationType: isFollowUp ? 'Повторна консультація' : 'Первинна консультація',
    },
    facts: {
      utteranceCount: lines.length,
      chiefComplaints: complaintsList,
      historyTimeline: '',
      sleepQuality: '',
      somaticSymptoms: '',
      medicationsMentioned: [],
      suicideRiskAssessment: '',
      verifiedQuotes: quotesList,
      psychometrics: formattedPsy,
      followUpDynamics: followUpData.previousTherapyAndState || undefined,
    },
    form028: {
      documentNumber: '',
      doctorHeader: `${PRACTICE_INFO.practiceName}\n${PRACTICE_INFO.licenseNumber}\nЛікар-психіатр, нарколог: ${PRACTICE_INFO.doctorName}`,
      patientSection: `${patientName}. Дата звернення: ${dateStr}.`,
      complaintsSection: complaintsList.join('; '),
      anamnesisMorbiSection: anamnesisParts.join('\n'),
      anamnesisVitaeSection: anamnesisVitae,
      objectiveStatusSection: formattedPsy ? `Психометричне обстеження: ${formattedPsy}.` : '',
      laboratorySection: 'На момент консультації даних лабораторних та інструментальних досліджень не надано.',
      diagnosisCode: '',
      diagnosisDescription: '',
      recommendationsSection: '',
      disabilityNote: '',
      nextAppointmentDate: '',
      telemedDuration: '',
      telemedChannel: '',
      extractRecipient: '',
      treatmentPeriod: '',
    },
  };
}

// Helper: Build standard DOCX Document supporting 028/о, 002/тм, 027/о
function buildDocxDocument(form028: any, patient: any, formType: string = '028_o'): Document {
  let mohHeader = 'Форма первинної облікової документації № 028/о\nЗАТВЕРДЖЕНО\nНаказ МОЗ України 14.02.2012 № 110';
  let docTitle = 'КОНСУЛЬТАТИВНИЙ ВИСНОВОК СПЕЦІАЛІСТА';

  if (formType === '002_tm') {
    mohHeader = 'Форма первинної облікової документації № 002/тм\nЗАТВЕРДЖЕНО\nНаказ МОЗ України 19.10.2015 № 681';
    docTitle = 'ВИСНОВОК КОНСУЛЬТАНТА (ТЕЛЕМЕДИЦИНА)';
  } else if (formType === '027_o') {
    mohHeader = 'Форма первинної облікової документації № 027/о\nЗАТВЕРДЖЕНО\nНаказ МОЗ України 14.02.2012 № 110';
    docTitle = 'ВИПИСКА ІЗ МЕДИЧНОЇ КАРТИ АМБУЛАТОРНОГО (СТАЦІОНАРНОГО) ХВОРОГО';
  }

  const paragraphs: Paragraph[] = [
    new Paragraph({
      text: 'МЕДИЧНА ДОКУМЕНТАЦІЯ',
      alignment: AlignmentType.RIGHT,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: mohHeader,
          size: 16,
          font: 'Times New Roman',
          italics: true,
        }),
      ],
    }),

    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 80 },
      children: [
        new TextRun({
          text: `${PRACTICE_INFO.practiceName}`,
          bold: true,
          size: 24,
          font: 'Times New Roman',
        }),
      ],
    }),

    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 180 },
      children: [
        new TextRun({
          text: `Медична практика: психіатрія, наркологія | ${PRACTICE_INFO.licenseNumber}\nЄДРПОУ: ${PRACTICE_INFO.edrpou} | ${PRACTICE_INFO.address}`,
          size: 18,
          font: 'Times New Roman',
        }),
      ],
    }),

    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 140, after: 180 },
      children: [
        new TextRun({
          text: docTitle,
          bold: true,
          size: 26,
          font: 'Times New Roman',
        }),
      ],
    }),

    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `№ ${form028.documentNumber || '2026/01'} від ${patient?.consultationDate || new Date().toLocaleDateString('uk-UA')}`,
          bold: true,
          size: 22,
          font: 'Times New Roman',
        }),
      ],
    }),
  ];

  if (formType === '027_o') {
    paragraphs.push(
      createFieldParagraph(
        'В (найменування закладу, куди направляється): ',
        form028.extractRecipient || '',
        true
      )
    );
  }

  paragraphs.push(
    createFieldParagraph(
      formType === '027_o' ? '1. Прізвище, імʼя, по батькові хворого: ' : '1. Прізвище, імʼя, по батькові пацієнта: ',
      patient?.fullName || form028.patientSection || 'Не вказано',
      true
    )
  );

  paragraphs.push(
    createFieldParagraph(
      '2. Вік / дата народження: ',
      patient?.age || 'У записі не зазначено (зі слів пацієнта)',
      false
    )
  );

  paragraphs.push(
    createFieldParagraph(
      formType === '027_o' ? '3. Період нагляду / лікування: ' : '3. Вид консультації: ',
      formType === '027_o'
        ? form028.treatmentPeriod || `Консультація від ${patient?.consultationDate}`
        : formType === '002_tm'
        ? 'Телемедичне консультування (відеоконференцзв\'язок)'
        : patient?.consultationType || '',
      false
    )
  );

  if (formType === '002_tm') {
    paragraphs.push(
      createFieldParagraph('Тривалість телемедичного сеансу: ', form028.telemedDuration || '', false)
    );
    paragraphs.push(
      createFieldParagraph('Технічний засіб зв\'язку: ', form028.telemedChannel || '', false)
    );
  }

  paragraphs.push(createFieldParagraph('4. Скарги хворого: ', form028.complaintsSection || '', false));
  paragraphs.push(createFieldParagraph('5. Анамнез захворювання: ', form028.anamnesisMorbiSection || '', false));
  paragraphs.push(createFieldParagraph('6. Анамнез життя: ', form028.anamnesisVitaeSection || 'У записі не зазначено (зі слів пацієнта)', false));
  paragraphs.push(
    createFieldParagraph(
      '7. Дані обʼєктивного обстеження (соматичний, психічний статус та психометрія): ',
      form028.objectiveStatusSection || '',
      false
    )
  );
  paragraphs.push(createFieldParagraph('8. Дані лабораторних та інструментальних досліджень: ', form028.laboratorySection || 'На момент консультації даних не надано.', false));

  paragraphs.push(
    new Paragraph({
      spacing: { before: 140, after: 80 },
      children: [
        new TextRun({
          text: '9. Діагноз (МКХ-10): ',
          bold: true,
          size: 22,
          font: 'Times New Roman',
        }),
        new TextRun({
          text: [form028.diagnosisCode, form028.diagnosisDescription].filter(Boolean).join(' '),
          bold: true,
          underline: {},
          size: 22,
          font: 'Times New Roman',
        }),
      ],
    })
  );

  paragraphs.push(
    createFieldParagraph(
      formType === '027_o' ? '10. Лікувальні та трудові рекомендації: ' : '10. Рекомендації: ',
      form028.recommendationsSection || '',
      false
    )
  );
  paragraphs.push(createFieldParagraph('11. Працездатність: ', form028.disabilityNote || '', false));
  paragraphs.push(createFieldParagraph('12. Термін повторної явки: ', form028.nextAppointmentDate || '', false));

  // ONLY circle for M.P. without signature line
  paragraphs.push(
    new Paragraph({
      spacing: { before: 500, after: 100 },
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({
          text: 'М. П.      ',
          bold: true,
          size: 24,
          font: 'Times New Roman',
        }),
      ],
    })
  );

  return new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1134,
              right: 850,
              bottom: 1134,
              left: 1417,
            },
          },
        },
        children: paragraphs,
      },
    ],
  });
}

function createFieldParagraph(title: string, value: string, isBoldValue: boolean = false): Paragraph {
  return new Paragraph({
    spacing: { before: 80, after: 60 },
    children: [
      new TextRun({
        text: title,
        bold: true,
        size: 22,
        font: 'Times New Roman',
      }),
      new TextRun({
        text: value,
        bold: isBoldValue,
        size: 22,
        font: 'Times New Roman',
      }),
    ],
  });
}

// DOCX Download Endpoint supporting 028/о, 002/тм, 027/о
app.post('/api/export-docx', async (req: Request, res: Response) => {
  try {
    const { form028, patient, formType = '028_o' } = req.body;
    if (!form028) {
      return res.status(400).json({ error: 'Дані форми відсутні' });
    }

    const doc = buildDocxDocument(form028, patient, formType);
    const buffer = await Packer.toBuffer(doc);

    const prefix = formType === '002_tm' ? 'Telemed_' : formType === '027_o' ? 'Extract_' : 'Consultation_';

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${prefix}${encodeURIComponent(patient?.fullName || 'Patient')}.docx`
    );
    res.send(buffer);
  } catch (error: any) {
    console.error('DOCX export error:', error);
    res.status(500).json({ error: error.message || 'Помилка генерації DOCX' });
  }
});

// Real Telegram Bot Dispatch Endpoint supporting 028/о, 002/тм, 027/о
app.post('/api/send-telegram', async (req: Request, res: Response) => {
  try {
    const { form028, patient, formType = '028_o' } = req.body;
    const botToken = process.env.BOT_TOKEN;
    const adminId = process.env.ADMIN_ID;

    const patientName = patient?.fullName || 'Пацієнт';
    const consultationDate = patient?.consultationDate || new Date().toLocaleDateString('uk-UA');

    if (botToken && adminId && form028) {
      const doc = buildDocxDocument(form028, patient, formType);
      const buffer = await Packer.toBuffer(doc);

      let formLabel = 'Форма № 028/о';
      let captionIcon = '📋';
      let titleWord = 'Консультативний висновок';

      if (formType === '002_tm') {
        formLabel = 'Форма № 002/тм';
        captionIcon = '💻';
        titleWord = 'Телемедичний висновок';
      } else if (formType === '027_o') {
        formLabel = 'Форма № 027/о';
        captionIcon = '📑';
        titleWord = 'Медична виписка';
      }

      const caption = `${captionIcon} ${titleWord} (${formLabel}) — ${patientName} від ${consultationDate}`;

      const formData = new FormData();
      formData.append('chat_id', adminId);
      formData.append('caption', caption);

      const fileBlob = new Blob([new Uint8Array(buffer)], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      formData.append(
        'document',
        fileBlob,
        `${titleWord.replace(/\s+/g, '_')}_${encodeURIComponent(patientName.replace(/\s+/g, '_'))}.docx`
      );

      console.log(`[Telegram] Sending document to chat ${adminId}...`);
      const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
        method: 'POST',
        body: formData,
      });

      const tgJson: any = await tgRes.json();
      if (tgJson.ok) {
        return res.json({
          ok: true,
          sent: true,
          message: `Документ DOCX (${formLabel}) для ${patientName} успішно надіслано у ваш Telegram!`,
          tgMessageId: tgJson.result?.message_id,
        });
      } else {
        console.warn('[Telegram API Error]', tgJson);
        return res.json({
          ok: true,
          sent: false,
          warning: tgJson.description || 'Помилка Telegram API',
          message: `Telegram API повернув: ${tgJson.description || 'невідома помилка'}`,
        });
      }
    }

    res.json({
      ok: true,
      sent: false,
      simulated: true,
      message: `Документ підготовлено. Для прямої доставки додайте BOT_TOKEN та ADMIN_ID у Secrets або файл .env`,
    });
  } catch (err: any) {
    console.error('Telegram dispatch error:', err);
    res.json({
      ok: true,
      sent: false,
      message: `Висновок зафіксовано. Помилка зв'язку з Telegram: ${err.message}`,
    });
  }
});

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Praxis Studio server running at http://localhost:${PORT}`);
  });
}

startServer();
