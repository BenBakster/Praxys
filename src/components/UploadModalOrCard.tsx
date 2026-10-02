import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileCode,
  Play,
  ClipboardPaste,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Calendar,
  User,
  FileText,
} from 'lucide-react';

export interface PatientContextData {
  fullName?: string;
  dob?: string;
  pastHistory?: string;
}

interface UploadProps {
  onProcessTranscript: (
    transcript: string,
    metadata?: any,
    formType?: string,
    rawJson?: any,
    doctorNotes?: string,
    patientContext?: PatientContextData
  ) => void;
  onLoadDemo: () => void;
  isProcessing: boolean;
}

export const UploadCard: React.FC<UploadProps> = ({
  onProcessTranscript,
  onLoadDemo,
  isProcessing,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');
  const [pasteText, setPasteText] = useState('');
  const [formType, setFormType] = useState('028_o');
  const [doctorNotes, setDoctorNotes] = useState('');

  // Patient Card & Prior History (Anamnesis Vitae)
  const [patientFullName, setPatientFullName] = useState('');
  const [patientDob, setPatientDob] = useState('');
  const [patientPastHistory, setPatientPastHistory] = useState('');
  const [showPatientCard, setShowPatientCard] = useState(true);

  const [lastUploadedInfo, setLastUploadedInfo] = useState<{
    fileName: string;
    utterancesCount: number;
    title?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const historyPresets = [
    'Хронічні соматичні патології заперечує',
    'ЧМТ та судомні напади заперечує',
    'Алергологічний анамнез спокійний',
    'Спадковий психіатричний анамнез не обтяжений',
    'Попередній епізод тривожності 1-2 роки тому',
    'Соматично обстежений (ЕКГ та щитоподібна залоза норма)',
  ];

  const addHistoryPreset = (preset: string) => {
    setPatientPastHistory((prev) => (prev ? `${prev}; ${preset}` : preset));
  };

  const getPatientContext = (): PatientContextData => ({
    fullName: patientFullName.trim() || undefined,
    dob: patientDob.trim() || undefined,
    pastHistory: patientPastHistory.trim() || undefined,
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const rawContent = event.target?.result as string;
      if (!rawContent) return;

      const pContext = getPatientContext();

      try {
        const parsedJson = JSON.parse(rawContent);
        const extracted = parseAnyJson(parsedJson);

        setLastUploadedInfo({
          fileName: file.name,
          utterancesCount: extracted.dialogueLines.length || 1,
          title: extracted.title || file.name,
        });

        const meta = {
          fileName: file.name,
          title: extracted.title,
          date: extracted.date,
          participants: extracted.participants,
          fileSize: file.size,
          doctorNotes,
        };

        const transcriptText =
          extracted.dialogueLines.length > 0
            ? extracted.dialogueLines.join('\n')
            : rawContent;

        onProcessTranscript(
          transcriptText,
          meta,
          formType,
          parsedJson,
          doctorNotes,
          pContext
        );
      } catch {
        const lines = rawContent.split('\n').filter(Boolean);
        setLastUploadedInfo({
          fileName: file.name,
          utterancesCount: lines.length,
        });

        onProcessTranscript(
          rawContent,
          {
            fileName: file.name,
            date: new Date().toLocaleDateString('uk-UA'),
            doctorNotes,
          },
          formType,
          undefined,
          doctorNotes,
          pContext
        );
      }
    };
    reader.readAsText(file);
  };

  const parseAnyJson = (
    obj: any
  ): {
    dialogueLines: string[];
    title?: string;
    date?: string;
    participants?: string[];
  } => {
    const dialogueLines: string[] = [];
    const title = obj.title || obj.meeting_title || obj.data?.transcript?.title;
    const date = obj.date || obj.date_string || obj.data?.transcript?.date;
    const participants = obj.participants || obj.attendees || obj.speakers;

    if (Array.isArray(obj.sentences)) {
      for (const s of obj.sentences) {
        const speaker = s.speaker_name || s.speaker || 'Спікер';
        const txt = s.text || s.raw_text || '';
        if (txt.trim()) dialogueLines.push(`${speaker}: ${txt.trim()}`);
      }
    } else if (
      obj.data &&
      obj.data.transcript &&
      Array.isArray(obj.data.transcript.sentences)
    ) {
      for (const s of obj.data.transcript.sentences) {
        const speaker = s.speaker_name || s.speaker || 'Спікер';
        const txt = s.text || s.raw_text || '';
        if (txt.trim()) dialogueLines.push(`${speaker}: ${txt.trim()}`);
      }
    } else if (Array.isArray(obj.transcript)) {
      for (const s of obj.transcript) {
        if (typeof s === 'string') {
          dialogueLines.push(s);
        } else {
          const speaker = s.speaker || s.speaker_name || 'Спікер';
          const txt = s.text || s.raw_text || '';
          if (txt.trim()) dialogueLines.push(`${speaker}: ${txt.trim()}`);
        }
      }
    } else if (Array.isArray(obj)) {
      for (const s of obj) {
        if (typeof s === 'string') {
          dialogueLines.push(s);
        } else {
          const speaker =
            s.speaker || s.speaker_name || s.name || s.role || 'Спікер';
          const txt = s.text || s.raw_text || s.content || '';
          if (txt.trim()) dialogueLines.push(`${speaker}: ${txt.trim()}`);
        }
      }
    } else if (Array.isArray(obj.utterances)) {
      for (const s of obj.utterances) {
        const speaker = s.speaker || s.speaker_name || 'Спікер';
        const txt = s.text || s.content || '';
        if (txt.trim()) dialogueLines.push(`${speaker}: ${txt.trim()}`);
      }
    }

    return { dialogueLines, title, date, participants };
  };

  const handlePasteSubmit = () => {
    if (!pasteText.trim()) return;
    onProcessTranscript(
      pasteText.trim(),
      { source: 'manual_paste', doctorNotes },
      formType,
      undefined,
      doctorNotes,
      getPatientContext()
    );
  };

  return (
    <div className="w-full max-w-4xl mx-auto my-6 px-4">
      {/* Hero Welcome Banner */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-xs font-medium mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Клінічне структурування Форми № 028/о • Автоматичний розбір стенограм</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
          Студія клінічних висновків лікаря Віленчика А.П.
        </h2>
        <p className="mt-2 text-sm text-gray-600 max-w-2xl mx-auto leading-relaxed">
          Завантажте файл зустрічі Fireflies / Google Meet або вставте текст.
          Система формує офіційний Консультативний висновок за Наказом МОЗ № 110.
        </p>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200/90 overflow-hidden transition-all">
        {/* Navigation Tabs & Form Switcher */}
        <div className="flex flex-col sm:flex-row items-center justify-between px-6 pt-4 pb-2 border-b border-gray-100 gap-3">
          <div className="flex items-center gap-1 bg-gray-100/80 p-1 rounded-xl w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex-1 sm:flex-initial px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === 'upload'
                  ? 'bg-white text-gray-900 shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-blue-600" />
                Файл Fireflies / JSON
              </span>
            </button>

            <button
              onClick={() => setActiveTab('paste')}
              className={`flex-1 sm:flex-initial px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === 'paste'
                  ? 'bg-white text-gray-900 shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <ClipboardPaste className="w-3.5 h-3.5 text-indigo-600" />
                Вставити текст бесіди
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500 font-medium">Формат:</span>
            <select
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
              className="bg-gray-50 border border-gray-200 text-gray-800 rounded-lg px-2.5 py-1 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="028_o">Форма № 028/о (Консультативний висновок)</option>
              <option value="002_tm">Форма № 002/тм (Телемедицина)</option>
            </select>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6">
          {/* 1. Patient Card & Past History (Anamnesis Vitae) Input */}
          <div className="mb-5 border border-indigo-100 rounded-xl bg-indigo-50/20 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowPatientCard(!showPatientCard)}
              className="w-full px-4 py-2.5 flex items-center justify-between text-left text-xs font-semibold text-indigo-950 hover:bg-indigo-50/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-indigo-600" />
                <span>Дані пацієнта та попередній анамнез (опціонально)</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <span className="text-[11px] font-normal text-indigo-700">
                  {patientFullName || patientDob ? 'Заповнено' : 'Розгорнути'}
                </span>
                {showPatientCard ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </div>
            </button>

            {showPatientCard && (
              <div className="p-4 pt-2 space-y-3 border-t border-indigo-100/70 bg-white/70">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                      <User className="w-3 h-3 text-indigo-600" />
                      ПІБ пацієнта (якщо відомо):
                    </label>
                    <input
                      type="text"
                      value={patientFullName}
                      onChange={(e) => setPatientFullName(e.target.value)}
                      placeholder="напр. Шевченко Андрій Олександрович"
                      className="w-full p-2 rounded-lg border border-gray-200 bg-white text-xs text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-indigo-600" />
                      Дата народження:
                    </label>
                    <input
                      type="text"
                      value={patientDob}
                      onChange={(e) => setPatientDob(e.target.value)}
                      placeholder="напр. 14.05.1990"
                      className="w-full p-2 rounded-lg border border-gray-200 bg-white text-xs text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                    <FileText className="w-3 h-3 text-indigo-600" />
                    Попередній анамнез життя (для розділу 6 «Анамнез життя» / соматика / алергії):
                  </label>
                  <textarea
                    rows={2}
                    value={patientPastHistory}
                    onChange={(e) => setPatientPastHistory(e.target.value)}
                    placeholder="Вкажіть особливості розвитку, перенесені захворювання, алергії чи примітки з минулих оглядів..."
                    className="w-full p-2.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  {/* Quick Preset Chips for History */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="text-[10px] text-gray-400 font-medium">Швидкі факти:</span>
                    {historyPresets.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => addHistoryPreset(preset)}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-800 hover:bg-indigo-50 transition-colors"
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. File Dropzone or Paste Box */}
          {activeTab === 'upload' ? (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                dragActive
                  ? 'border-blue-500 bg-blue-50/50 scale-[1.005]'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/40 bg-gray-50/20'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.txt"
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
                <UploadCloud className="w-7 h-7" />
              </div>

              <h4 className="text-sm font-semibold text-gray-900 mb-1">
                Перетягніть сюди JSON або TXT файл консультації
              </h4>
              <p className="text-xs text-gray-500 max-w-sm mx-auto mb-4">
                Підтримуються файли Fireflies.ai, Google Meet, Zoom, Whisper
              </p>

              <div className="inline-flex items-center gap-2">
                <span className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-800 shadow-2xs hover:bg-gray-50 transition-colors">
                  Обрати JSON файл на комп'ютері
                </span>
              </div>

              {lastUploadedInfo && (
                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs border border-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>
                    Завантажено: <strong>{lastUploadedInfo.fileName}</strong> ({lastUploadedInfo.utterancesCount} реплік)
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Вставте сюди стенограму або текст бесіди лікаря з пацієнтом..."
                rows={7}
                className="w-full p-4 rounded-xl border border-gray-200 text-xs text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-mono"
              />
              <div className="flex justify-end">
                <button
                  onClick={handlePasteSubmit}
                  disabled={!pasteText.trim() || isProcessing}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                >
                  <span>Аналізувати та сформувати висновок</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Quick Demo Button */}
          <div className="mt-5 pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-50/70 p-3.5 rounded-xl">
            <div className="flex items-center gap-3 text-left">
              <div className="w-8 h-8 rounded-lg bg-blue-600/10 flex items-center justify-center text-blue-700 shrink-0">
                <Play className="w-3.5 h-3.5 fill-blue-700" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-900">
                  Тестовий прийом (демо)
                </p>
                <p className="text-[11px] text-gray-500">
                  Зразок консультації з повним контекстом (F41.2, нічні пароксизми, соматичне обстеження)
                </p>
              </div>
            </div>

            <button
              onClick={onLoadDemo}
              disabled={isProcessing}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-blue-700 text-xs font-semibold shadow-2xs transition-all shrink-0 active:scale-95"
            >
              Завантажити зразок
            </button>
          </div>
        </div>

        {/* Feature Guarantees */}
        <div className="bg-gray-50/70 px-6 py-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] text-gray-600">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Інтерактивний довідник МКХ-10</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>Чистий бланк А4 та CamScanner (тільки М. П.)</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>Пряма відправка DOCX у Telegram лікаря</span>
          </div>
        </div>
      </div>
    </div>
  );
};
