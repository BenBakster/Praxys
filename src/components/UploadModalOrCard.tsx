import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileCode,
  Play,
  ClipboardPaste,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  FileText,
  AlertCircle,
} from 'lucide-react';

interface UploadProps {
  onProcessTranscript: (transcript: string, metadata?: any, formType?: string, rawJson?: any) => void;
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
  const [lastUploadedInfo, setLastUploadedInfo] = useState<{
    fileName: string;
    utterancesCount: number;
    title?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Robust Universal JSON & Text Parser
  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const rawContent = event.target?.result as string;
      if (!rawContent) return;

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
        };

        const transcriptText = extracted.dialogueLines.length > 0
          ? extracted.dialogueLines.join('\n')
          : rawContent;

        onProcessTranscript(transcriptText, meta, formType, parsedJson);
      } catch {
        // Plain text file (not JSON)
        const lines = rawContent.split('\n').filter(Boolean);
        setLastUploadedInfo({
          fileName: file.name,
          utterancesCount: lines.length,
        });

        onProcessTranscript(
          rawContent,
          { fileName: file.name, date: new Date().toLocaleDateString('uk-UA') },
          formType
        );
      }
    };
    reader.readAsText(file);
  };

  // Extract dialogue from any known JSON format
  const parseAnyJson = (obj: any): { dialogueLines: string[]; title?: string; date?: string; participants?: string[] } => {
    const dialogueLines: string[] = [];
    let title = obj.title || obj.meeting_title || obj.data?.transcript?.title;
    let date = obj.date || obj.date_string || obj.data?.transcript?.date;
    let participants = obj.participants || obj.attendees || obj.speakers;

    // 1. Fireflies sentences
    if (Array.isArray(obj.sentences)) {
      for (const s of obj.sentences) {
        const speaker = s.speaker_name || s.speaker || 'Спікер';
        const txt = s.text || s.raw_text || '';
        if (txt.trim()) dialogueLines.push(`${speaker}: ${txt.trim()}`);
      }
    }
    // 2. Nested data.transcript.sentences
    else if (obj.data && obj.data.transcript && Array.isArray(obj.data.transcript.sentences)) {
      for (const s of obj.data.transcript.sentences) {
        const speaker = s.speaker_name || s.speaker || 'Спікер';
        const txt = s.text || s.raw_text || '';
        if (txt.trim()) dialogueLines.push(`${speaker}: ${txt.trim()}`);
      }
    }
    // 3. Transcript array
    else if (Array.isArray(obj.transcript)) {
      for (const s of obj.transcript) {
        if (typeof s === 'string') {
          dialogueLines.push(s);
        } else {
          const speaker = s.speaker || s.speaker_name || 'Спікер';
          const txt = s.text || s.raw_text || '';
          if (txt.trim()) dialogueLines.push(`${speaker}: ${txt.trim()}`);
        }
      }
    }
    // 4. Raw Array of turns
    else if (Array.isArray(obj)) {
      for (const s of obj) {
        if (typeof s === 'string') {
          dialogueLines.push(s);
        } else {
          const speaker = s.speaker || s.speaker_name || s.role || 'Спікер';
          const txt = s.text || s.raw_text || s.content || '';
          if (txt.trim()) dialogueLines.push(`${speaker}: ${txt.trim()}`);
        }
      }
    }
    // 5. Utterances format
    else if (Array.isArray(obj.utterances)) {
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
    onProcessTranscript(pasteText.trim(), { source: 'manual_paste' }, formType);
  };

  return (
    <div className="w-full max-w-4xl mx-auto my-6 px-4">
      {/* Hero Welcome Banner */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-xs font-medium mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Пряме структурування прийому • Форма № 028/о МОЗ України</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
          Студія клінічних висновків лікаря Віленчика А.П.
        </h2>
        <p className="mt-2 text-sm text-gray-600 max-w-xl mx-auto leading-relaxed">
          Перетягніть ваш реальний JSON-файл із Fireflies, Zoom або Whisper.
          Система розпізнає справжнього пацієнта, виділить скарги та сформує висновок для друку або CamScanner.
        </p>
      </div>

      {/* Main Upload Box */}
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
            <span className="text-gray-500 font-medium">Стандарт:</span>
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
                Перетягніть сюди файл JSON консультації
              </h4>
              <p className="text-xs text-gray-500 max-w-sm mx-auto mb-4">
                Підтримується повний експорт Fireflies.ai, Zoom, Whisper або структуровані транскрипти зустрічей
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
                rows={8}
                className="w-full p-4 rounded-xl border border-gray-200 text-xs text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-mono"
              />
              <div className="flex justify-end">
                <button
                  onClick={handlePasteSubmit}
                  disabled={!pasteText.trim() || isProcessing}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                >
                  <span>Обробити консультацію</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Quick Demo Button */}
          <div className="mt-6 pt-5 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-blue-50/40 p-4 rounded-xl">
            <div className="flex items-center gap-3 text-left">
              <div className="w-9 h-9 rounded-lg bg-blue-600/10 flex items-center justify-center text-blue-700 shrink-0">
                <Play className="w-4 h-4 fill-blue-700" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-900">
                  Тестовий прийом (демо)
                </p>
                <p className="text-[11px] text-gray-500">
                  Зразок заповнення форми на основі реалістичного кейсу тривожного розладу
                </p>
              </div>
            </div>

            <button
              onClick={onLoadDemo}
              disabled={isProcessing}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-white border border-blue-200 hover:border-blue-300 hover:bg-blue-50 text-blue-700 text-xs font-semibold shadow-2xs transition-all shrink-0 active:scale-95"
            >
              Завантажити зразок
            </button>
          </div>
        </div>

        {/* Feature Guarantees */}
        <div className="bg-gray-50/70 px-6 py-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] text-gray-600">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Аналіз реальних даних без сторонніх шаблонів</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>Чистий аркуш для CamScanner (тільки М. П.)</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>Пряма обробка Gemini 3.8 / 3.1</span>
          </div>
        </div>
      </div>
    </div>
  );
};
