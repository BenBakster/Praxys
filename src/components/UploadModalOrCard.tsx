import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileCode,
  FileText,
  Play,
  ClipboardPaste,
  Shield,
  CheckCircle2,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { DEMO_RAW_TRANSCRIPT, DEMO_FIREFLIES_JSON } from '../data/demoData';

interface UploadProps {
  onProcessTranscript: (transcript: string, metadata?: any, formType?: string) => void;
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

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      try {
        // Attempt to parse as JSON (Fireflies, Zoom, Whisper)
        const parsed = JSON.parse(content);
        let extractedText = '';

        if (Array.isArray(parsed.sentences)) {
          extractedText = parsed.sentences
            .map((s: any) => `${s.speaker_name || 'Спікер'}: ${s.text || ''}`)
            .join('\n');
        } else if (Array.isArray(parsed.transcript)) {
          extractedText = parsed.transcript
            .map((s: any) => `${s.speaker || s.speaker_name || 'Спікер'}: ${s.text || ''}`)
            .join('\n');
        } else if (parsed.text) {
          extractedText = parsed.text;
        } else {
          extractedText = JSON.stringify(parsed, null, 2);
        }

        onProcessTranscript(extractedText, { fileName: file.name, ...parsed }, formType);
      } catch {
        // Fallback to raw text file
        onProcessTranscript(content, { fileName: file.name }, formType);
      }
    };
    reader.readAsText(file);
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
          <span>Пряма інтеграція з Gemini 3.8 & Форма № 028/о МОЗ України</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
          Студія клінічних висновків лікаря Віленчика А.П.
        </h2>
        <p className="mt-2 text-sm text-gray-600 max-w-xl mx-auto leading-relaxed">
          Перетягніть JSON-файл зустрічі з Fireflies або вставте текст бесіди.
          Система виділить тверді факти без додумування доз та сформує офіційний бланк для якісного друку чи CamScanner.
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
                Вставити текст вручну
              </span>
            </button>
          </div>

          {/* Form standard selector */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500 font-medium">Стандарт:</span>
            <select
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
              className="bg-gray-50 border border-gray-200 text-gray-800 rounded-lg px-2.5 py-1 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="028_o">Форма № 028/о (Консультативний висновок)</option>
              <option value="002_tm">Форма № 002/тм (Телемедицина)</option>
              <option value="027_o">Форма № 027/о (Виписка з амбулаторної карти)</option>
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
                Перетягніть сюди JSON або TXT файл консультації
              </h4>
              <p className="text-xs text-gray-500 max-w-sm mx-auto mb-4">
                Підтримуються файли експорту транскрипту Fireflies.ai, Zoom, Google Meet або диктофонні розшифровки
              </p>

              <div className="inline-flex items-center gap-2">
                <span className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-800 shadow-2xs hover:bg-gray-50 transition-colors">
                  Обрати файл на комп'ютері
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Вставте сюди текст розмови між лікарем та пацієнтом..."
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
                  Бажаєте протестувати прямо зараз без завантаження файлу?
                </p>
                <p className="text-[11px] text-gray-500">
                  Завантажує реальний клінічний кейс: тривожно-депресивний розлад (F41.2), нічні панічні атаки, рецептура
                </p>
              </div>
            </div>

            <button
              onClick={onLoadDemo}
              disabled={isProcessing}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-white border border-blue-200 hover:border-blue-300 hover:bg-blue-50 text-blue-700 text-xs font-semibold shadow-2xs transition-all shrink-0 active:scale-95"
            >
              Завантажити демо-прийом
            </button>
          </div>
        </div>

        {/* Feature Guarantees (Google & Apple cleanliness) */}
        <div className="bg-gray-50/70 px-6 py-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] text-gray-600">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Двокрокова схема відсікання галюцинацій</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>Ідеальний векторний PDF для CamScanner</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>Прямий інтелект Google Gemini 3.8</span>
          </div>
        </div>
      </div>
    </div>
  );
};
