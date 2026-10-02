import React from 'react';
import { Send, CheckCircle2, X, ExternalLink, ShieldCheck } from 'lucide-react';

interface TelegramModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentNumber: string;
  patientName: string;
  diagnosis: string;
  customMessage?: string | null;
}

export const TelegramModal: React.FC<TelegramModalProps> = ({
  isOpen,
  onClose,
  documentNumber,
  patientName,
  diagnosis,
  customMessage,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs no-print">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between mb-4">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
            <Send className="w-5 h-5" />
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 text-emerald-600 mb-1">
          <CheckCircle2 className="w-5 h-5" />
          <h3 className="font-semibold text-gray-900 text-base">
            Telegram-відправка
          </h3>
        </div>

        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
          {customMessage ||
            'Медичний висновок сформовано у форматі DOCX та направлено до особистого приватного чату лікаря (не надсилається пацієнту!).'}
        </p>

        <div className="mt-4 p-3.5 rounded-xl bg-gray-50 border border-gray-100 text-xs space-y-1.5 font-mono">
          <div className="flex justify-between">
            <span className="text-gray-500">Документ:</span>
            <span className="font-semibold text-gray-800">№ {documentNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Пацієнт:</span>
            <span className="font-semibold text-gray-800">{patientName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Діагноз:</span>
            <span className="font-semibold text-blue-700">{diagnosis}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Формати:</span>
            <span className="text-emerald-700 font-semibold">PDF для CamScanner / DOCX</span>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-[11px] text-gray-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Передача захищена шифруванням Telegram Bot API</span>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors shadow-sm"
          >
            Зрозуміло
          </button>
        </div>
      </div>
    </div>
  );
};
