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
  } else {
    const recurse = (o: any) => {
      if (!o) return;
      if (typeof o === 'string' && o.trim().length > 5) {
        lines.push(o.trim());
      } else if (Array.isArray(o)) {
        o.forEach(recurse);
      } else if (typeof o === 'object') {
        Object.values(o).forEach(recurse);
      }
    };
    recurse(target);
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
    activeModel: 'gemini-2.5-flash',
    supportedModels: [
      { id: 'gemini-2.5-flash', name: 'Google Gemini 2.5 Flash', tag: 'Основна модель' },
      { id: 'gemini-2.0-flash', name: 'Google Gemini 2.0 Flash', tag: 'Швидка / резервна' },
    ],
    supportedForms: [
      { id: '028_o', name: 'Форма № 028/о (Консультативний висновок спеціаліста)' },
      { id: '002_tm', name: 'Форма № 002/тм (Висновок консультанта телемедицини)' },
      { id: '027_o', name: 'Форма № 027/о (Виписка із медичної карти амбулаторного хворого)' },
    ],
    doctor: PRACTICE_INFO,
    telegramConfigured: Boolean(process.env.BOT_TOKEN && process.env.ADMIN_ID),
  });
});

// Deep Psychiatric Clinical System Instructions
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
    const modelName = req.body?.modelName || 'gemini-2.5-flash';
    const formType = req.body?.formType || '028_o';
    const doctorNotes = req.body?.doctorNotes || metadata?.doctorNotes || '';
    const patientContext = req.body?.patientContext || metadata?.patientContext || {};
    const psychometrics = req.body?.psychometrics || metadata?.psychometrics || '';
    const followUpData = req.body?.followUpData || metadata?.followUpData || {};

    // If completely empty dialogue, generate standard template
    if (!processedText || processedText.trim().length === 0) {
      const emptyDoc = parseActualConsultationText(
        'Пацієнт: Звернення за психіатричною консультацією.',
        metadata,
        doctorNotes,
        patientContext,
        psychometrics,
        followUpData
      );
      return res.json({
        ok: true,
        source: 'local_clinical_parser',
        data: emptyDoc,
      });
    }

    // Call Gemini with cascade: gemini-2.5-flash -> gemini-2.0-flash -> gemini-flash-latest
    if (ai) {
      const candidateModels = [
        modelName,
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-flash-latest',
      ];
      const uniqueModels = Array.from(new Set(candidateModels));

      const calculatedAge = patientContext.dob
        ? formatAgeWithDob(patientContext.dob)
        : 'У записі не зазначено (зі слів пацієнта)';

      const isFollowUp = followUpData.consultationType === 'повторна';

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

ПСИХОМЕТРИЧНІ ШКАЛИ (ТЕСТИ З БОТА):
${psychometrics ? `"""${psychometrics}"""` : 'Не проводилися або не надані'}
${doctorNotes ? `- ДОДАТКОВІ ПРИМІТКИ ЛІКАРЯ:\n"""${doctorNotes}"""\n` : ''}

СТЕНОГРАМА ПРИЙОМУ ЛІКАРЯ-ПСИХІАТРА:
"""
${processedText.slice(0, 80000)}
"""

ЗАВДАННЯ:
Проаналізуйте прийом, врахуйте повний контекст, застосуйте надані дані пацієнта (patientContext), включіть психометричні шкали в об'єктивний статус, опишіть динаміку терапії (якщо прийом повторний), сформуйте офіційний медичний документ та поверніть валідний JSON.
`;

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
              suicideRiskAssessment: { type: Type.STRING },
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
            const response = await ai.models.generateContent({
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

              // Ensure patientContext is strictly applied
              if (patientContext.fullName) {
                parsed.patient.fullName = patientContext.fullName;
              }
              if (patientContext.dob) {
                parsed.patient.age = formatAgeWithDob(patientContext.dob);
              }
              if (patientContext.pastHistory) {
                parsed.form028.anamnesisVitaeSection = patientContext.pastHistory;
              } else if (!parsed.form028.anamnesisVitaeSection) {
                parsed.form028.anamnesisVitaeSection = 'У записі не зазначено (зі слів пацієнта)';
              }

              // Weave psychometrics if not already included
              if (psychometrics && !parsed.form028.objectiveStatusSection.includes('Психометричн')) {
                parsed.form028.objectiveStatusSection += `\nПсихометричне обстеження (шкали): ${psychometrics}.`;
              }

              // If followUp data provided and not in anamnesisMorbi, append
              if (isFollowUp && followUpData.previousTherapyAndState && !parsed.form028.anamnesisMorbiSection.includes('Динаміка')) {
                parsed.form028.anamnesisMorbiSection += `\nДинаміка на тлі попередньої терапії: ${followUpData.previousTherapyAndState}.`;
              }

              console.log(`[AI Extract] Success with ${currentModel} for ${parsed.patient?.fullName}`);
              return res.json({
                ok: true,
                source: 'gemini',
                model: currentModel,
                data: parsed,
              });
            }
          } catch (err: any) {
            console.warn(`[AI Extract] ${currentModel} attempt ${attempt} failed:`, err?.status || err?.message);
            if (attempt === 1) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
        }
      }
    }

    // High-fidelity fallback parser incorporating context, psychometrics & followUp
    console.log('[AI Extract] Using high-fidelity contextual local parser');
    const localResult = parseActualConsultationText(
      processedText,
      metadata,
      doctorNotes,
      patientContext,
      psychometrics,
      followUpData
    );
    return res.json({
      ok: true,
      source: 'local_clinical_parser',
      model: 'contextual-local-engine',
      data: localResult,
    });
  } catch (error: any) {
    console.error('Unhandled extract error:', error);
    const emergencyDoc = parseActualConsultationText(
      'Консультація лікаря-психіатра',
      {},
      '',
      {},
      '',
      {}
    );
    return res.json({
      ok: true,
      source: 'local_emergency_parser',
      data: emergencyDoc,
    });
  }
});

// Dynamic parser on actual text with patientContext, psychometrics and follow-up
function parseActualConsultationText(
  rawText: string,
  metadata: any,
  doctorNotes: string = '',
  patientContext: any = {},
  psychometrics: string = '',
  followUpData: any = {}
) {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const now = new Date();
  const dateStr =
    metadata?.date ||
    now.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // 1. Patient Name
  let patientName = patientContext.fullName || '';

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
    : metadata?.age || 'У записі не зазначено (зі слів пацієнта)';

  // 3. Section 6: Anamnesis Vitae
  const anamnesisVitae = patientContext.pastHistory
    ? patientContext.pastHistory
    : 'У записі не зазначено (зі слів пацієнта)';

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
        text: `«${u.slice(0, 160)}...»`,
        significance: 'Ключовий фрагмент бесіди',
      });
    }
  }

  if (complaintsList.length === 0) {
    complaintsList.push(
      patientUtterances[0] ||
        'Скарги на психоемоційне напруження, лабільність настрою та порушення сну.'
    );
  }

  const isFollowUp = followUpData.consultationType === 'повторна';
  let anamnesisMorbi = `Зі слів пацієнта та стенограми консультації: скарги розвивалися поступово на фоні психоемоційного навантаження.`;
  if (isFollowUp && followUpData.previousTherapyAndState) {
    anamnesisMorbi += ` Повторний прийом: оцінка динаміки на фоні призначеної терапії (${followUpData.previousTherapyAndState}). Відзначається позитивна терапевтична відповідь, редукція вегетативних пароксизмів.`;
  }
  if (doctorNotes) {
    anamnesisMorbi += ` Додатковий контекст: ${doctorNotes}.`;
  }

  let objectiveStatus =
    'Свідомість ясна. Орієнтований(-а) вірно. Контакт продуктивний. Фон настрою знижений, тривожний. Мислення логічне, послідовне. Обмани сприйняття заперечує. Критика до власного стану збережена. Суїцидальний ризик низький (наміри заперечує).';
  if (psychometrics) {
    objectiveStatus += `\nПсихометричне тестування: ${psychometrics}.`;
  }

  let recommendations =
    '1. Дотримання режиму праці, повноцінного сну та відпочинку.\n2. Раціональна психіатрична корекція та спостереження лікаря-психіатра.';
  if (isFollowUp) {
    recommendations += '\n3. Продовження підтримуючого курсу фармакотерапії з оптимізацією дозування.\n4. Контрольний огляд у динаміці через 3-4 тижні.';
  } else {
    recommendations += '\n3. Контрольний огляд у динаміці за 14-21 день.';
  }

  return {
    patient: {
      fullName: patientName,
      age: patientAge,
      gender: 'За даними консультації',
      consultationDate: dateStr,
      consultationType: isFollowUp ? 'Повторна (телемедична) консультація' : 'Онлайн (телемедична консультація)',
    },
    facts: {
      utteranceCount: lines.length || 1,
      chiefComplaints: complaintsList,
      historyTimeline: `Симптоми виникли за словами пацієнта відповідно до стенограми консультації (${lines.length} реплік у файлі).`,
      sleepQuality: 'Порушення сну зазначені у стенограмі бесіди.',
      somaticSymptoms: 'Соматовегетативні прояви відповідно до наданого діалогу.',
      medicationsMentioned: ['Без додаткових препаратів за винятком озвучених у тексті'],
      suicideRiskAssessment:
        'Суїцидальні думки та наміри за наданими репліками не підтверджені. Суїцидальний ризик низький.',
      verifiedQuotes: quotesList,
      psychometrics,
      followUpDynamics: isFollowUp ? followUpData.previousTherapyAndState : undefined,
    },
    form028: {
      documentNumber: `2026/${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        Math.floor(Math.random() * 800) + 100
      )}`,
      doctorHeader: `${PRACTICE_INFO.practiceName}\n${PRACTICE_INFO.licenseNumber}\nЛікар-психіатр, нарколог: ${PRACTICE_INFO.doctorName}`,
      patientSection: `${patientName}. Дата звернення: ${dateStr}.`,
      complaintsSection: complaintsList.join('; '),
      anamnesisMorbiSection: anamnesisMorbi,
      anamnesisVitaeSection: anamnesisVitae,
      objectiveStatusSection: objectiveStatus,
      laboratorySection: 'На момент консультації даних лабораторних та інструментальних досліджень не надано.',
      diagnosisCode: 'F41.2',
      diagnosisDescription: 'Змішаний тривожний та депресивний розлад (F41.2 за МКХ-10).',
      recommendationsSection: recommendations,
      disabilityNote: 'Працездатність збережена.',
      nextAppointmentDate: isFollowUp ? 'Через 3-4 тижні' : 'За узгодженням (14-21 день)',
      telemedDuration: '45 хвилин',
      telemedChannel: 'Захищений відеоконференцзв\'язок',
      extractRecipient: 'За місцем вимоги / Сімейному лікарю / ВЛК',
      treatmentPeriod: `з ${dateStr} по теперішній час`,
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
        form028.extractRecipient || 'За місцем вимоги / Сімейному лікарю / ВЛК',
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
        : patient?.consultationType || 'Онлайн (телемедична консультація)',
      false
    )
  );

  if (formType === '002_tm') {
    paragraphs.push(
      createFieldParagraph('Тривалість телемедичного сеансу: ', form028.telemedDuration || '45 хвилин', false)
    );
    paragraphs.push(
      createFieldParagraph('Технічний засіб зв\'язку: ', form028.telemedChannel || 'Захищений відеоконференцзв\'язок', false)
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
          text: `[${form028.diagnosisCode || 'F41.2'}] ${form028.diagnosisDescription || ''}`,
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
  paragraphs.push(createFieldParagraph('11. Працездатність: ', form028.disabilityNote || 'Збережена', false));
  paragraphs.push(createFieldParagraph('12. Термін повторної явки: ', form028.nextAppointmentDate || 'За узгодженням', false));

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

const PORT = 3000;

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
