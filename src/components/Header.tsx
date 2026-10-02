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
  Settings,
  Bot,
  WifiOff,
} from 'lucide-react';
import { AiConfig } from '../types/clinical';

interface HeaderProps {
  selectedModel: string;
  onSelectModel: (model: string) => void;
  aiConfig?: AiConfig;
  onOpenSettings: () => void;
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
  aiConfig,
  onOpenSettings,
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
      id: 'gemini-3.8-flash',
      name: 'Google Gemini 3.8 Flash',
      badge: 'Основна',
      desc: 'Найновіша клінічна модель Google для структурування за Формою № 028/о',
    },
    {
      id: 'gemini-3.5-flash',
      name: 'Google Gemini 3.5 Flash',
      badge: 'Швидка',
      desc: 'Швидка та точна модель для миттєвої обробки стенограм',
    },
  ];

  return (
    <header className="no-print sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-200/80 transition-all">
      <div className="max-w-[1700px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand & Doctor ID (Strictly no "психотерапевт") */}
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

        {/* Center: Model Selector & Settings */}
        <div className="hidden md:flex items-center gap-2.5">
          <button
            onClick={onOpenSettings}
            title="Налаштування ШІ та зміна провайдера (Gemini / OpenAI / Groq / Офлайн)"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50/80 hover:bg-gray-100 text-gray-800 text-xs font-medium transition-colors shadow-2xs group cursor-pointer"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            {aiConfig?.provider === 'offline' ? (
              <WifiOff className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            )}
            <span className="font-semibold text-gray-900">
              {aiConfig?.provider === 'openai'
                ? 'OpenAI'
                : aiConfig?.provider === 'groq'
                ? 'Groq'
                : aiConfig?.provider === 'deepseek'
                ? 'DeepSeek'
                : aiConfig?.provider === 'offline'
                ? 'Без моделі'
                : 'Google Gemini'}:
            </span>
            <span className="text-gray-600 font-mono text-[11px]">
              {aiConfig?.model || selectedModel}
            </span>
            <span className="text-[10px] text-blue-700 bg-blue-100/70 px-1.5 py-0.5 rounded font-medium border border-blue-200 group-hover:bg-blue-200 transition-colors flex items-center gap-1">
              <Settings className="w-3 h-3" />
              <span>Змінити ШІ</span>
            </span>
          </button>

          <div className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 text-[11px] border border-emerald-200/60">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Каскадний захист без збоїв</span>
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

          {/* AI Settings Button */}
          <button
            onClick={onOpenSettings}
            title="Налаштування ШІ: зміна постачальника (Gemini / OpenAI / Groq / Офлайн)"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium transition-colors"
          >
            <Settings className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden lg:inline">Налаштування ШІ</span>
          </button>
        </div>
      </div>
    </header>
  );
};
