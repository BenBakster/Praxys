import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { Packer } from 'docx';
import { PRACTICE_INFO, buildDocxDocument } from './server/docxDocument.ts';
import { extractTextFromHistoryFile, parseClinicalHistoryData } from './server/historyParser.ts';
import { installPasswordGate } from './server/passwordGate.ts';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const isProduction = process.env.NODE_ENV === 'production';
const appPassword = (process.env.APP_PASSWORD || '').trim();

if (isProduction && appPassword.length < 8) {
  console.error('APP_PASSWORD не задано або коротше 8 символів: без пароля сервер не запускається.');
  process.exit(1);
}

if (appPassword) {
  // Railway terminates TLS in front of the app; req.ip must come from X-Forwarded-For.
  app.set('trust proxy', 1);
  installPasswordGate(app, appPassword, isProduction);
}

app.get('/api/session', (req: Request, res: Response) => {
  res.json({ ok: true });
});

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
    .replace(/\d{6,}:[A-Za-z0-9_-]{30,}/g, '[ключ]')
    .slice(0, 500);
}

const CLINICAL_SYSTEM_INSTRUCTION = `
Ви — провідний клінічний експерт та медичний асистент лікаря-психіатра для приватної психіатричної та наркологічної практики лікаря Віленчика Антона Павловича (ФОП Віленчик А.П., Ліцензія МОЗ України № 854 від 17.05.2024 р.).

СУВОРІ РЕГЛАМЕНТНІ ПРАВИЛА:
0. ЛИШЕ ФАКТИ: скарги, анамнез, препарати, дози, цифри та оцінки брати тільки зі стенограми, приміток лікаря, картки пацієнта, психометричних шкал і попереднього документа. Нічого не домислювати.
1. СПЕЦІАЛЬНІСТЬ ЛІКАРЯ: Тільки "лікар-психіатр, нарколог". Слово "психотерапевт" КАТЕГОРИЧНО НЕ вживати ніде!
2. ВРАХУВАННЯ ПАЦІЄНТА ТА ПОПЕРЕДНЬОГО АНАМНЕЗУ (PATIENT CONTEXT):
   - Якщо вказано ПІБ пацієнта (patientContext.fullName), використати його як єдине справжнє ім'я.
   - Якщо вказано дату народження (patientContext.dob), обчислити вік пацієнта та записати у форматі "ХХ років (ДД.ММ.РРРР)".
   - Розділ "6. Анамнез життя" (form028.anamnesisVitaeSection): якщо надано попередній анамнез життя (patientContext.pastHistory), перенести його дослівно, а потім додати відомості про життя пацієнта зі стенограми, яких у ньому ще немає.
   - Якщо ні patientContext.pastHistory, ні відомостей про життя пацієнта у стенограмі немає, записати: "У записі не зазначено (зі слів пацієнта)".

3. ПСИХОМЕТРИЧНІ ШКАЛИ (ТЕСТИ З БОТА):
   - Якщо надано результати психометричних шкал (PHQ-9, GAD-7, ASRS-6, AUDIT, ASRM тощо), обов'язково інтегрувати їх окремим пунктом в розділ 7 "Об'єктивний статус" (form028.objectiveStatusSection):
     Наприклад: "Психометричне обстеження: PHQ-9 — 14 балів (помірний депресивний епізод); GAD-7 — 11 балів (помірна тривога); ASRS v1.1 — висока ймовірність СДУГ."

4. РЕЖИМ ПОВТОРНОГО ПРИЙОМУ (ДИНАМІКА СТАНУ ТА ТЕРАПІЇ):
   - Якщо тип консультації "повторна" або надано дані попередньої терапії:
     * Описати динаміку так, як її описали пацієнт і лікар: тривога, сон, переносимість ліків, побічні ефекти. Відсотків, балів та інших кількісних оцінок, яких немає у вхідних даних, не вигадувати.
     * В "Анамнез захворювання" (form028.anamnesisMorbiSection) окремо описати: "Динаміка стану на тлі терапії...".
     * В "Рекомендації" (form028.recommendationsSection) внести лише ті зміни терапії, які назвав лікар: корекцію дози, заміну препарату або продовження курсу.

5. МКХ-10 ТА РЕКОМЕНДАЦІЇ:
   - Вказати точний код за МКХ-10 (наприклад F41.2, F41.0, F41.1, F43.2, F32.1 тощо) та повну офіційну клінічну назву. Якщо лікар назвав діагноз, використати саме його.
   - Рекомендації: режим, психоосвіта, психогігієна сну, психофармакотерапія. Препарати, дози та схему прийому (вранці/ввечері) вказувати лише ті, що лікар назвав у стенограмі або примітках. Якщо лікар дозу не назвав, дозу не вказувати.

6. СТАНДАРТИ МОЗ УКРАЇНИ (028/о, 002/тм, 027/о):
   - Якщо лабораторних даних не було: "На момент консультації даних лабораторних та інструментальних досліджень не надано."
   - Внизу документа залишається виключно місце для печатки (М. П.) без рядка ручного підпису.
`;

// Doctor-entered data wins over the model's reading of the transcript
function applyConsultationContext(
  parsed: any,
  { patientContext, priorConsultationHistory, psychometrics, isFollowUp, followUpData }: {
    patientContext: any;
    priorConsultationHistory: any;
    psychometrics: string;
    isFollowUp: boolean;
    followUpData: any;
  }
) {
  const form = parsed.form028;

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

  const knownLifeHistory = String(patientContext.pastHistory || priorConsultationHistory?.anamnesisVitae || '').trim();
  const modelLifeHistory = String(form.anamnesisVitaeSection || '').trim();
  const sameText = (a: string, b: string) => a.replace(/\s+/g, ' ').includes(b.replace(/\s+/g, ' '));
  if (knownLifeHistory && !sameText(modelLifeHistory, knownLifeHistory)) {
    const fromConversation = modelLifeHistory.includes('У записі не зазначено') ? '' : modelLifeHistory;
    form.anamnesisVitaeSection = [knownLifeHistory, fromConversation].filter(Boolean).join('\n');
  } else if (!modelLifeHistory) {
    form.anamnesisVitaeSection = 'У записі не зазначено (зі слів пацієнта)';
  }

  if (parsed.patient.fullName && (!form.patientSection || form.patientSection.includes('Не зазначено'))) {
    form.patientSection = `${parsed.patient.fullName}, ${parsed.patient.age || ''}`.trim();
  }

  const objectiveStatus = String(form.objectiveStatusSection || '');
  if (psychometrics && !objectiveStatus.includes('Психометричн')) {
    form.objectiveStatusSection = `${objectiveStatus}\nПсихометричне обстеження (шкали): ${psychometrics}.`.trim();
  }

  const anamnesisMorbi = String(form.anamnesisMorbiSection || '');
  if (isFollowUp && followUpData.previousTherapyAndState && !anamnesisMorbi.includes('Динаміка')) {
    form.anamnesisMorbiSection = `${anamnesisMorbi}\nДинаміка на тлі попередньої терапії: ${followUpData.previousTherapyAndState}.`.trim();
  }
}

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
    const consultationContext = { patientContext, priorConsultationHistory, psychometrics, isFollowUp, followUpData };

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
- Попередній анамнез життя (для розділу 6): ${patientContext.pastHistory || 'Не надано'}

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

        if (parsed && parsed.patient && parsed.form028) {
          applyConsultationContext(parsed, consultationContext);

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

              applyConsultationContext(parsed, consultationContext);

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

// DOCX Download Endpoint supporting 028/о, 002/тм, 027/о
app.post('/api/export-docx', async (req: Request, res: Response) => {
  try {
    const { form028, patient, formType = '028_o' } = req.body;
    if (!form028) {
      return res.status(400).json({ ok: false, error: 'Дані форми відсутні' });
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
      `attachment; filename="${prefix}Patient.docx"; filename*=UTF-8''${encodeURIComponent(`${prefix}${patient?.fullName || 'Patient'}.docx`)}`
    );
    res.send(buffer);
  } catch (error: any) {
    console.error('DOCX export error:', error);
    res.status(500).json({ ok: false, error: errorText(error) });
  }
});

// Real Telegram Bot Dispatch Endpoint supporting 028/о, 002/тм, 027/о
app.post('/api/send-telegram', async (req: Request, res: Response) => {
  try {
    const { form028, patient, formType = '028_o' } = req.body;
    const botToken = process.env.BOT_TOKEN;
    const adminId = process.env.ADMIN_ID;

    if (!form028) {
      return res.status(400).json({ ok: false, error: 'Дані форми відсутні' });
    }
    if (!botToken || !adminId) {
      return res.status(503).json({
        ok: false,
        error: 'Telegram не налаштовано: додайте BOT_TOKEN та ADMIN_ID у змінні середовища.',
      });
    }

    const patientName = patient?.fullName || 'Пацієнт';
    const consultationDate = patient?.consultationDate || new Date().toLocaleDateString('uk-UA');

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
    formData.append('document', fileBlob, `${titleWord}_${patientName}.docx`.replace(/\s+/g, '_'));

    console.log(`[Telegram] Sending document to chat ${adminId}...`);
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: 'POST',
      body: formData,
    });

    const tgJson: any = await tgRes.json();
    if (!tgJson.ok) {
      console.warn('[Telegram API Error]', tgJson);
      return res.status(502).json({
        ok: false,
        error: `Telegram не прийняв документ: ${tgJson.description || `код ${tgRes.status}`}`,
      });
    }

    return res.json({
      ok: true,
      message: `Документ DOCX (${formLabel}) для ${patientName} успішно надіслано у ваш Telegram!`,
      tgMessageId: tgJson.result?.message_id,
    });
  } catch (err: any) {
    const message = errorText(err);
    console.error(`[Telegram] ${message}`);
    return res.status(500).json({ ok: false, error: `Помилка зв'язку з Telegram: ${message}` });
  }
});

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  if (isProduction) {
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

  // Without a password the app is reachable only from this computer.
  const host = appPassword ? '0.0.0.0' : '127.0.0.1';
  app.listen(PORT, host, () => {
    console.log(`Praxis Studio server running at http://localhost:${PORT}`);
  });
}

startServer();
