import React, { useState } from 'react';
import {
  Printer,
  FileDown,
  Send,
  Sparkles,
  ShieldCheck,
  ChevronDown,
  Check,
  RefreshCw,
} from 'lucide-react';

interface HeaderProps {
  selectedModel: string;
  onSelectModel: (model: string) => void;
  onPrint: () => void;
  onExportDocx: () => void;
  onSendTelegram: () => void;
  onReset: () => void;
  hasDocument: boolean;
  isProcessing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  selectedModel,
  onSelectModel,
  onPrint,
  onExportDocx,
  onSendTelegram,
  onReset,
  hasDocument,
  isProcessing,
}) => {
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  const models = [
    {
      id: 'gemini-2.5-flash',
      name: 'Google Gemini 2.5 Flash',
      badge: 'Основна',
      desc: 'Основна клінічна модель Google, швидка та точна',
    },
    {
      id: 'gemini-2.0-flash',
      name: 'Google Gemini 2.0 Flash',
      badge: 'Швидка',
      desc: 'Додаткова швидка модель для миттєвого структурування',
    },
  ];

  return (
    <header className="no-print sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-200/80 transition-all">
      <div className="max-w-[1700px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand & Doctor ID (No "психотерапевт") */}
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
            <span className="font-semibold text-lg tracking-tight">VP</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-gray-900 text-[15px] tracking-tight flex items-center gap-1.5">
                VILENCHYK Praxis
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium border border-blue-200/60">
                  Студія МОЗ
                </span>
              </h1>
            </div>
            <p className="text-[11px] text-gray-500 font-normal">
              Лікар-психіатр, нарколог Віленчик А.П. • Ліцензія МОЗ України № 854 від 17.05.2024
            </p>
          </div>
        </div>

        {/* Center: Model Selector & Status */}
        <div className="hidden md:flex items-center gap-2.5">
          <div className="relative">
            <button
              onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50/70 hover:bg-gray-100 text-gray-800 text-xs font-medium transition-colors shadow-2xs"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>{models.find((m) => m.id === selectedModel)?.name || 'Gemini 2.5 Flash'}</span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {modelDropdownOpen && (
              <div className="absolute left-0 mt-1.5 w-76 bg-white rounded-xl shadow-xl border border-gray-200/90 py-1.5 z-50 text-left">
                <div className="px-3 py-1 text-[10px] font-semibold tracking-wider text-gray-400 uppercase">
                  Моделі Google
                </div>
                {models.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      onSelectModel(model.id);
                      setModelDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left flex items-start gap-2.5 hover:bg-gray-50 transition-colors ${
                      selectedModel === model.id ? 'bg-blue-50/60' : ''
                    }`}
                  >
                    <div className="mt-0.5">
                      {selectedModel === model.id ? (
                        <Check className="w-4 h-4 text-blue-600" />
                      ) : (
                        <div className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-gray-900">{model.name}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-100 text-gray-600 font-normal">
                          {model.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 leading-tight mt-0.5">{model.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 text-[11px] border border-emerald-200/60">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Безпечна верифікація активна</span>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {hasDocument && (
            <button
              onClick={onReset}
              title="Завантажити інший прийом"
              className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          {/* Print / CamScanner PDF Button */}
          <button
            onClick={onPrint}
            disabled={!hasDocument || isProcessing}
            title="Швидкий друк або збереження чистого PDF для CamScanner"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-medium shadow-sm transition-all active:scale-[0.98]"
          >
            <Printer className="w-4 h-4" />
            <span className="font-semibold">Друк / PDF для CamScanner</span>
          </button>

          {/* Download DOCX Button */}
          <button
            onClick={onExportDocx}
            disabled={!hasDocument || isProcessing}
            title="Завантажити документ у форматі Word (.docx)"
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none text-gray-700 text-xs font-medium transition-colors"
          >
            <FileDown className="w-4 h-4 text-blue-600" />
            <span>DOCX</span>
          </button>

          {/* Send to Telegram */}
          <button
            onClick={onSendTelegram}
            disabled={!hasDocument || isProcessing}
            title="Надіслати готовий DOCX у свій приватний Telegram"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none text-gray-700 text-xs font-medium transition-colors"
          >
            <Send className="w-3.5 h-3.5 text-sky-500" />
            <span className="hidden sm:inline">В Telegram</span>
          </button>
        </div>
      </div>
    </header>
  );
};
