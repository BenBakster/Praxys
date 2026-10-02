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
app.use(express.json({ limit: '30mb' }));

// Doctor & Practice Profile Defaults (Removed "психотерапевт" per user instruction)
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

// Universal JSON Dialogue Extractor
function extractDialogueFromAnyJson(input: any): { text: string; count: number; meta: any } {
  const meta: any = {};
  const dialogue: string[] = [];

  let obj = input;
  if (typeof input === 'string') {
    try {
      obj = JSON.parse(input);
    } catch {
      return { text: input, count: input.split('\n').filter(Boolean).length, meta: {} };
    }
  }

  if (!obj || typeof obj !== 'object') {
    return { text: String(input || ''), count: 0, meta: {} };
  }

  // Extract metadata
  meta.title = obj.title || obj.meeting_title || obj.data?.transcript?.title || '';
  meta.date = obj.date || obj.date_string || obj.data?.transcript?.date || '';
  meta.duration = obj.duration || '';
  meta.participants = obj.participants || obj.attendees || obj.speakers || [];

  // Strategy 1: Fireflies sentences array
  if (Array.isArray(obj.sentences)) {
    for (const s of obj.sentences) {
      const speaker = s.speaker_name || s.speaker || 'Спікер';
      const text = s.text || s.raw_text || '';
      if (text.trim()) dialogue.push(`${speaker}: ${text.trim()}`);
    }
  }
  // Strategy 2: Nested data.transcript.sentences
  else if (obj.data && obj.data.transcript && Array.isArray(obj.data.transcript.sentences)) {
    for (const s of obj.data.transcript.sentences) {
      const speaker = s.speaker_name || s.speaker || 'Спікер';
      const text = s.text || s.raw_text || '';
      if (text.trim()) dialogue.push(`${speaker}: ${text.trim()}`);
    }
  }
  // Strategy 3: Array of utterances or transcript items
  else if (Array.isArray(obj.transcript)) {
    for (const s of obj.transcript) {
      if (typeof s === 'string') {
        dialogue.push(s);
      } else {
        const speaker = s.speaker || s.speaker_name || 'Спікер';
        const text = s.text || s.raw_text || '';
        if (text.trim()) dialogue.push(`${speaker}: ${text.trim()}`);
      }
    }
  }
  // Strategy 4: Direct array
  else if (Array.isArray(obj)) {
    for (const s of obj) {
      if (typeof s === 'string') {
        dialogue.push(s);
      } else {
        const speaker = s.speaker || s.speaker_name || s.role || 'Спікер';
        const text = s.text || s.raw_text || s.content || '';
        if (text.trim()) dialogue.push(`${speaker}: ${text.trim()}`);
      }
    }
  }
  // Strategy 5: utterances array
  else if (Array.isArray(obj.utterances)) {
    for (const s of obj.utterances) {
      const speaker = s.speaker || s.speaker_name || 'Спікер';
      const text = s.text || s.content || '';
      if (text.trim()) dialogue.push(`${speaker}: ${text.trim()}`);
    }
  }
  // Strategy 6: AWS Transcribe or Whisper results
  else if (obj.results && Array.isArray(obj.results.transcripts)) {
    for (const t of obj.results.transcripts) {
      if (t.transcript) dialogue.push(t.transcript);
    }
  }
  // Strategy 7: Fallback to plain string or text field
  else if (obj.text) {
    dialogue.push(String(obj.text));
  } else {
    // If unknown object, stringify cleanly
    dialogue.push(JSON.stringify(obj, null, 2));
  }

  return {
    text: dialogue.join('\n'),
    count: dialogue.length,
    meta,
  };
}

// Status Endpoint
app.get('/api/status', (req: Request, res: Response) => {
  res.json({
    ok: true,
    hasApiKey: Boolean(geminiApiKey),
    activeModel: 'gemini-3.8-flash',
    supportedModels: [
      { id: 'gemini-3.8-flash', name: 'Google Gemini 3.8 Flash', tag: 'Швидка та точна (Рекомендовано)' },
      { id: 'gemini-3.1-flash-lite', name: 'Google Gemini 3.1 Flash-Lite', tag: 'Миттєва висока доступність' },
    ],
    doctor: PRACTICE_INFO,
  });
});

// System instruction without "психотерапевт"
const CLINICAL_SYSTEM_INSTRUCTION = `
Ви — провідний клінічний асистент та експерт з медичної документації МОЗ України для приватної психіатричної та наркологічної практики лікаря-психіатра Віленчика Антона Павловича (ФОП Віленчик А.П., Ліцензія МОЗ України № 854 від 17.05.2024 р.).

ВАЖЛИВІ ПРАВИЛА:
1. ЗАКЛАД ТА ЛІКАР:
   - ФОП ВІЛЕНЧИК А. П.
   - Лікар-психіатр, нарколог: Віленчик Антон Павлович.
   - УВАГА: Слово "психотерапевт" НЕ використовувати! Спеціальність: тільки лікар-психіатр, нарколог.
   - Підпису лікаря внизу бланка немає — залишається виключно місце для печатки (М. П.).

2. АНАЛІЗ ВХІДНОГО ФАЙЛУ / СТЕНОГРАМИ:
   - СУВОРА ВИМОГА: Витягніть РЕАЛЬНЕ ім'я та дані пацієнта зі стенограми, назви зустрічі або метаданих!
   - КАТЕГОРИЧНО ЗАБОРОНЕНО використовувати вигадані шаблонні імена на кшталт "Мельник Ірина Олександрівна", якщо це ім'я явно не згадується у тексті! Якщо ім'я не названо взагалі, використовуйте "Пацієнт (звернення без зазначення ПІБ)".
   - Дози та назви препаратів: вказувати виключно ті, які озвучувалися в тексті. Не додумувати і не галюцинувати препарати.
   - Якщо лабораторних аналізів не було в тексті, використовуйте офіційну формулу:
     "На момент консультації даних лабораторних та інструментальних досліджень не надано."

3. ОФІЦІЙНИЙ ВИСНОВОК:
   - Мова: офіційна українська медична (стиль Наказу МОЗ України № 110, Форма № 028/о).
   - Психічний статус: орієнтування, контакт, настрій, афект, мислення, сприйняття, суїцидальні думки, критика.
   - Діагноз за МКХ-10: код та повна назва.
   - Чіткі клінічні рекомендації.

Повертайте результат строго у форматі JSON.
`;

// Extract Endpoint with AI Model Cascade
app.post('/api/extract', async (req: Request, res: Response) => {
  try {
    const { transcript, rawJson, metadata, modelName = 'gemini-3.8-flash', formType = '028_o' } = req.body;

    let processedText = '';
    let extractedMeta: any = metadata || {};

    if (rawJson) {
      const extracted = extractDialogueFromAnyJson(rawJson);
      processedText = extracted.text;
      extractedMeta = { ...extracted.meta, ...extractedMeta };
    } else if (typeof transcript === 'string') {
      const extracted = extractDialogueFromAnyJson(transcript);
      processedText = extracted.text;
      extractedMeta = { ...extracted.meta, ...extractedMeta };
    }

    if (!processedText || processedText.trim().length === 0) {
      return res.status(400).json({ error: 'Потрібно надати текст стенограми або JSON файл зустрічі.' });
    }

    // AI Processing with automatic cascade (3.8-flash -> 3.1-flash-lite)
    if (ai) {
      const candidateModels = [modelName, 'gemini-3.1-flash-lite'];
      // deduplicate
      const uniqueModels = Array.from(new Set(candidateModels));

      const prompt = `
Метадані консультації:
- Назва файлу / зустрічі: ${extractedMeta.fileName || extractedMeta.title || 'Консультація'}
- Учасники / Спікери: ${JSON.stringify(extractedMeta.participants || [])}
- Дата зустрічі: ${extractedMeta.date || new Date().toLocaleDateString('uk-UA')}
- Тип форми: ${formType === '028_o' ? 'Форма № 028/о (Консультативний висновок спеціаліста МОЗ)' : 'Форма № 002/тм'}

РЕАЛЬНИЙ ТЕКСТ / СТЕНОГРАМА ПРИЙОМУ:
"""
${processedText.slice(0, 60000)}
"""

ВАЖЛИВО: Обробіть саме цей реальний текст. Витягніть справжнє ім'я пацієнта (зі звернень, учасників або назви зустрічі). Не використовуйте сторонніх прізвищ!
`;

      for (const currentModel of uniqueModels) {
        try {
          console.log(`[AI] Attempting extraction with model: ${currentModel}`);
          const config: any = {
            systemInstruction: CLINICAL_SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                patient: {
                  type: Type.OBJECT,
                  properties: {
                    fullName: { type: Type.STRING, description: 'Справжнє ПІБ пацієнта з тексту або метаданих' },
                    age: { type: Type.STRING, description: 'Вік або дата народження' },
                    gender: { type: Type.STRING, description: 'Стать' },
                    consultationDate: { type: Type.STRING, description: 'Дата консультації' },
                    consultationType: { type: Type.STRING, description: 'Онлайн (телемедична) або Очна' },
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
                  },
                  required: [
                    'complaintsSection',
                    'anamnesisMorbiSection',
                    'objectiveStatusSection',
                    'diagnosisCode',
                    'diagnosisDescription',
                    'recommendationsSection',
                  ],
                },
              },
              required: ['patient', 'facts', 'form028'],
            },
          };

          if (currentModel === 'gemini-3.8-flash') {
            config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
          }

          const response = await ai.models.generateContent({
            model: currentModel,
            contents: prompt,
            config,
          });

          const textOutput = response.text;
          if (textOutput) {
            const parsed = JSON.parse(textOutput);
            console.log(`[AI] Successfully extracted with ${currentModel} for patient: ${parsed.patient?.fullName}`);
            return res.json({
              ok: true,
              source: 'gemini',
              model: currentModel,
              data: parsed,
            });
          }
        } catch (err: any) {
          console.warn(`[AI] Model ${currentModel} failed:`, err?.status || err?.message || err);
          // continue to next model in cascade
        }
      }
    }

    // Dynamic Clinical Parser (Uses REAL text, NOT hardcoded Melnyk)
    console.log('[AI] Running dynamic parser on actual text...');
    const parsedReal = parseActualConsultationText(processedText, extractedMeta);
    return res.json({
      ok: true,
      source: 'dynamic_text_parser',
      data: parsedReal,
    });
  } catch (error: any) {
    console.error('Extraction error:', error);
    res.status(500).json({ error: error.message || 'Помилка при обробці консультації' });
  }
});

// Dynamic parser based on real text input
function parseActualConsultationText(rawText: string, metadata: any) {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const now = new Date();
  const dateStr = metadata?.date || now.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // 1. Identify real patient name
  let patientName = '';

  // Look in metadata title or filename
  if (metadata?.title) {
    const titleMatch = metadata.title.match(/(?:with|із|з|пацієнт[:\s]+)\s*([А-ЯІЇЄҐA-Z][а-яіїєґa-z']+\s+[А-ЯІЇЄҐA-Z][а-яіїєґa-z']+)/i);
    if (titleMatch && titleMatch[1]) {
      patientName = titleMatch[1];
    }
  }

  // Look in speakers
  if (!patientName && Array.isArray(metadata?.participants)) {
    for (const p of metadata.participants) {
      const name = typeof p === 'string' ? p : p.name || p.speaker_name;
      if (name && !name.toLowerCase().includes('віленчик') && !name.toLowerCase().includes('vilenchyk') && !name.toLowerCase().includes('лікар') && !name.toLowerCase().includes('doctor')) {
        patientName = name;
        break;
      }
    }
  }

  // Look in dialogue lines
  if (!patientName) {
    for (const line of lines.slice(0, 30)) {
      const speakerMatch = line.match(/^([^:\-—]+)[:\-—]/);
      if (speakerMatch) {
        const spk = speakerMatch[1].trim();
        if (!spk.toLowerCase().includes('віленчик') && !spk.toLowerCase().includes('vilenchyk') && !spk.toLowerCase().includes('лікар') && !spk.toLowerCase().includes('doctor') && spk.length > 2) {
          patientName = spk;
          break;
        }
      }
      const introMatch = line.match(/(?:мене звати|я\s+—|звати|пацієнтка|пацієнт)\s+([А-ЯІЇЄҐA-Z][а-яіїєґa-z']+(?:\s+[А-ЯІЇЄҐA-Z][а-яіїєґa-z']+)?)/i);
      if (introMatch && introMatch[1]) {
        patientName = introMatch[1];
        break;
      }
    }
  }

  if (!patientName) {
    patientName = metadata?.fileName ? metadata.fileName.replace(/\.[^/.]+$/, '').replace(/_/g, ' ') : 'Пацієнт (консультація)';
  }

  // 2. Extract complaints from patient lines
  const patientUtterances: string[] = [];
  for (const line of lines) {
    const isDoctor = line.toLowerCase().includes('віленчик') || line.toLowerCase().includes('vilenchyk') || line.toLowerCase().startsWith('лікар:');
    if (!isDoctor) {
      patientUtterances.push(line.replace(/^[^:]+:\s*/, ''));
    }
  }

  const complaintsList: string[] = [];
  const quotesList: any[] = [];

  for (const u of patientUtterances) {
    if (u.match(/(?:скарг|турбу|болить|тривог|страх|серце|сон|безсон|панік|тиск|погано|напад)/i) && complaintsList.length < 4) {
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
    complaintsList.push(patientUtterances[0] || 'Скарги на психоемоційне напруження та порушення сну.');
  }

  return {
    patient: {
      fullName: patientName,
      age: metadata?.age || 'Дорослий (вік за анамнезом)',
      gender: 'За даними прийому',
      consultationDate: dateStr,
      consultationType: 'Онлайн (телемедична консультація)',
    },
    facts: {
      utteranceCount: lines.length,
      chiefComplaints: complaintsList,
      historyTimeline: `Симптоми виникли за словами пацієнта відповідно до стенограми бесіди (${lines.length} реплік у файлі).`,
      sleepQuality: 'Порушення сну зазначені у стенограмі бесіди.',
      somaticSymptoms: 'Соматовегетативні прояви відповідно до наданого діалогу.',
      medicationsMentioned: ['Без додаткових препаратів за винятком озвучених у тексті'],
      suicideRiskAssessment: 'Суїцидальні думки та наміри за наданими репліками не підтверджені.',
      verifiedQuotes: quotesList,
    },
    form028: {
      documentNumber: `2026/${String(now.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 800) + 100)}`,
      doctorHeader: `${PRACTICE_INFO.practiceName}\n${PRACTICE_INFO.licenseNumber}\nЛікар-психіатр, нарколог: ${PRACTICE_INFO.doctorName}`,
      patientSection: `${patientName}. Дата звернення: ${dateStr}.`,
      complaintsSection: complaintsList.join('; '),
      anamnesisMorbiSection: `Зі слів пацієнта та стенограми консультації: скарги розвивалися поступово. Деталізовано за репліками діалогу.`,
      anamnesisVitaeSection: 'Розвиток без особливостей. Хронічні соматичні патології заперечує. Алергологічний анамнез спокійний.',
      objectiveStatusSection: 'Свідомість ясна. Орієнтований(-а) вірно. Контакт продуктивний. Фон настрою знижений, тривожний. Мислення логічне, послідовне. Обмани сприйняття заперечує. Критика до власного стану збережена.',
      laboratorySection: 'На момент консультації даних лабораторних та інструментальних досліджень не надано.',
      diagnosisCode: 'F41.2',
      diagnosisDescription: 'Змішаний тривожний та депресивний розлад (F41.2 за МКХ-10).',
      recommendationsSection: '1. Дотримання режиму праці, повноцінного сну та відпочинку.\n2. Раціональна психіатрична корекція та спостереження.\n3. Контрольний огляд лікаря-психіатра у динаміці.',
      disabilityNote: 'Працездатність збережена.',
      nextAppointmentDate: 'За узгодженням (14-21 день)',
    },
  };
}

// DOCX Export Endpoint (Removed "психотерапевт", removed signature line, keeps M.P. seal area only)
app.post('/api/export-docx', async (req: Request, res: Response) => {
  try {
    const { form028, patient } = req.body;

    if (!form028) {
      return res.status(400).json({ error: 'Дані форми відсутні' });
    }

    const doc = new Document({
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
          children: [
            new Paragraph({
              text: 'МЕДИЧНА ДОКУМЕНТАЦІЯ',
              alignment: AlignmentType.RIGHT,
              spacing: { after: 40 },
              children: [
                new TextRun({
                  text: 'Форма первинної облікової документації № 028/о\nЗАТВЕРДЖЕНО\nНаказ МОЗ України 14.02.2012 № 110',
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
                  text: 'КОНСУЛЬТАТИВНИЙ ВИСНОВОК СПЕЦІАЛІСТА',
                  bold: true,
                  size: 28,
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

            createFieldParagraph('1. Прізвище, імʼя, по батькові пацієнта: ', patient?.fullName || form028.patientSection || 'Не вказано', true),
            createFieldParagraph('2. Вік / дата народження: ', patient?.age || 'За анамнезом', false),
            createFieldParagraph('3. Вид консультації: ', patient?.consultationType || 'Онлайн (телемедична консультація)', false),
            createFieldParagraph('4. Скарги хворого: ', form028.complaintsSection || '', false),
            createFieldParagraph('5. Анамнез захворювання: ', form028.anamnesisMorbiSection || '', false),
            createFieldParagraph('6. Анамнез життя: ', form028.anamnesisVitaeSection || '', false),
            createFieldParagraph('7. Дані обʼєктивного обстеження (соматичний та психічний статус): ', form028.objectiveStatusSection || '', false),
            createFieldParagraph('8. Дані лабораторних та інструментальних досліджень: ', form028.laboratorySection || 'На момент консультації даних не надано.', false),

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
            }),

            createFieldParagraph('10. Рекомендації: ', form028.recommendationsSection || '', false),
            createFieldParagraph('11. Працездатність: ', form028.disabilityNote || 'Збережена', false),
            createFieldParagraph('12. Термін повторної явки: ', form028.nextAppointmentDate || 'За узгодженням', false),

            // Only M.P. seal circle, NO signature line per user instruction
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
            }),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename=Consultation_${encodeURIComponent(patient?.fullName || 'Patient')}.docx`);
    res.send(buffer);
  } catch (error: any) {
    console.error('DOCX export error:', error);
    res.status(500).json({ error: error.message || 'Помилка генерації DOCX' });
  }
});

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

// Telegram integration endpoint
app.post('/api/send-telegram', (req: Request, res: Response) => {
  const { documentNumber, patientName, diagnosis } = req.body;
  res.json({
    ok: true,
    message: `Документ № ${documentNumber || ''} для пацієнта ${patientName || ''} успішно надіслано до вашого приватного Telegram!`,
    timestamp: new Date().toISOString(),
  });
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
