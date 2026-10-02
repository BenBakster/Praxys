import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Key,
  ShieldCheck,
  Check,
  AlertCircle,
  ExternalLink,
  Loader2,
  Cpu,
  WifiOff,
  Bot,
  HelpCircle,
} from 'lucide-react';
import { AiConfig, AiProviderType } from '../types/clinical';

interface AiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AiConfig;
  onSaveConfig: (newConfig: AiConfig) => void;
}

interface ProviderOption {
  id: AiProviderType;
  name: string;
  badge: string;
  tagline: string;
  models: { id: string; name: string; desc: string }[];
  requiresKey: boolean;
  keyPlaceholder: string;
  keyHelpUrl?: string;
  keyHelpTitle?: string;
}

const PROVIDERS: ProviderOption[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    badge: 'За замовчуванням',
    tagline: 'Оптимальний вибір для клінічної документації та аналізу стенограм',
    models: [
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', desc: 'Найновіша модель Google з високою точністю' },
      { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', desc: 'Швидка та точна модель' },
      { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', desc: 'Автоматичний вибір актуальної моделі' },
    ],
    requiresKey: true,
    keyPlaceholder: 'AIzaSy... або вбудований ключ сервера',
    keyHelpUrl: 'https://aistudio.google.com/app/apikey',
    keyHelpTitle: 'Отримати безкоштовний ключ у Google AI Studio',
  },
  {
    id: 'openai',
    name: 'OpenAI (ChatGPT)',
    badge: 'Світовий стандарт',
    tagline: 'Надійна незалежна альтернатива, якщо сервіси Google тимчасово недоступні',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', desc: 'Флагманська модель з максимальною точністю' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', desc: 'Швидка та економна модель' },
    ],
    requiresKey: true,
    keyPlaceholder: 'sk-proj-...',
    keyHelpUrl: 'https://platform.openai.com/api-keys',
    keyHelpTitle: 'Отримати ключ на платформі OpenAI',
  },
  {
    id: 'groq',
    name: 'Groq (Llama 3.3)',
    badge: 'Блискавична швидкість',
    tagline: 'Обробка цілої консультації за 1-2 секунди на ультрашвидких чіпах LPU',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', desc: 'Потужний відкритий ШІ зі швидкістю 300+ слів/с' },
    ],
    requiresKey: true,
    keyPlaceholder: 'gsk_...',
    keyHelpUrl: 'https://console.groq.com/keys',
    keyHelpTitle: 'Отримати безкоштовний ключ Groq Console',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    badge: 'Економічний ШІ',
    tagline: 'Доступна та потужна модель для детального аналізу діалогів',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat (V3)', desc: 'Збалансована модель загального призначення' },
    ],
    requiresKey: true,
    keyPlaceholder: 'sk-...',
    keyHelpUrl: 'https://platform.deepseek.com/api_keys',
    keyHelpTitle: 'Отримати ключ DeepSeek Platform',
  },
  {
    id: 'offline',
    name: 'Без моделі',
    badge: 'Лише текст',
    tagline: 'Текст лишається тут. Діагноз, статус і рекомендації не пишуться',
    models: [
      { id: 'text-only', name: 'Тільки текст запису', desc: 'Бере з запису ім’я, скарги і ваші примітки' },
    ],
    requiresKey: false,
    keyPlaceholder: 'Ключ не потрібен (працює локально)',
  },
];

export const AiSettingsModal: React.FC<AiSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
}) => {
  const [selectedProvider, setSelectedProvider] = useState<AiProviderType>(config.provider || 'gemini');
  const [selectedModel, setSelectedModel] = useState<string>(config.model || 'gemini-3.8-flash');
  const [apiKey, setApiKey] = useState<string>(config.apiKey || '');
  const [customBaseUrl, setCustomBaseUrl] = useState<string>(config.baseUrl || '');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');

  if (!isOpen) return null;

  const activeProviderObj = PROVIDERS.find((p) => p.id === selectedProvider) || PROVIDERS[0];

  const handleProviderChange = (newProvider: AiProviderType) => {
    setSelectedProvider(newProvider);
    const targetProvider = PROVIDERS.find((p) => p.id === newProvider) || PROVIDERS[0];
    setSelectedModel(targetProvider.models[0].id);
    setTestStatus('idle');
    setTestMessage('');
  };

  const handleTestConnection = async () => {
    if (selectedProvider === 'offline') {
      setTestStatus('success');
      setTestMessage('Режим без моделі. Текст нікуди не відправляється, діагноз не пишеться.');
      return;
    }

    setTestStatus('testing');
    setTestMessage('Перевірка зв’язку з обраним ШІ...');

    try {
      const response = await fetch('/api/test-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          model: selectedModel,
          apiKey: apiKey.trim(),
          baseUrl: customBaseUrl.trim() || undefined,
        }),
      });

      const res = await response.json();
      if (res.ok) {
        setTestStatus('success');
        setTestMessage(res.message || 'З’єднання успішне! ШІ готовий до формування висновків.');
      } else {
        setTestStatus('error');
        setTestMessage(res.error || 'Помилка авторизації. Перевірте правильність ключа API.');
      }
    } catch (err: any) {
      setTestStatus('error');
      setTestMessage('Не вдалося з’єднатися із сервером: ' + (err.message || 'Помилка мережі'));
    }
  };

  const handleSave = () => {
    const updated: AiConfig = {
      provider: selectedProvider,
      model: selectedModel,
      apiKey: apiKey.trim() || undefined,
      baseUrl: customBaseUrl.trim() || undefined,
    };
    onSaveConfig(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/30">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 tracking-tight flex items-center gap-2">
                Налаштування штучного інтелекту (ШІ)
              </h2>
              <p className="text-xs text-slate-500">
                Ви можете замінити постачальника ШІ в будь-який момент в один клік
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800 text-sm">
          
          {/* Step 1: Select AI Provider */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2.5">
              1. Оберіть штучний інтелект (Провайдер):
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PROVIDERS.map((prov) => {
                const isSelected = selectedProvider === prov.id;
                return (
                  <button
                    key={prov.id}
                    type="button"
                    onClick={() => handleProviderChange(prov.id)}
                    className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                          {prov.id === 'offline' ? (
                            <WifiOff className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Bot className="w-4 h-4 text-blue-600" />
                          )}
                          {prov.name}
                        </span>
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                        {prov.tagline}
                      </p>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-100/80 flex items-center justify-between">
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                        {prov.badge}
                      </span>
                      {prov.requiresKey ? (
                        <span className="text-[10px] text-slate-400">Потрібен ключ</span>
                      ) : (
                        <span className="text-[10px] text-emerald-600 font-medium">Безкоштовно</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Select Specific Model */}
          {activeProviderObj.models.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                2. Оберіть модель {activeProviderObj.name}:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {activeProviderObj.models.map((m) => {
                  const isSelected = selectedModel === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setSelectedModel(m.id);
                        setTestStatus('idle');
                      }}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-white ring-1 ring-blue-500 shadow-2xs font-medium text-blue-900'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="text-xs font-semibold">{m.name}</div>
                      <div className="text-[11px] text-slate-500">{m.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: API Key Input (if required) */}
          {activeProviderObj.requiresKey ? (
            <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-slate-500" />
                  Ваш API-ключ {activeProviderObj.name}:
                </label>
                {activeProviderObj.keyHelpUrl && (
                  <a
                    href={activeProviderObj.keyHelpUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline"
                  >
                    <span>{activeProviderObj.keyHelpTitle || 'Як отримати ключ?'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setTestStatus('idle');
                  }}
                  placeholder={
                    selectedProvider === 'gemini'
                      ? 'Використовується ключ із сервера (або введіть свій власний)'
                      : activeProviderObj.keyPlaceholder
                  }
                  className="w-full px-3 py-2 pr-20 bg-white rounded-lg border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:font-sans placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[11px] text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                >
                  {showKey ? 'Приховати' : 'Показати'}
                </button>
              </div>

              <p className="text-[11px] text-slate-500 leading-normal">
                🔒 Ключ зберігається у вашому браузері та використовується лише для надсилання запитів під час аналізу стенограм.
              </p>

              {/* Test Button & Status */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testStatus === 'testing'}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 disabled:opacity-50 transition-colors shadow-2xs"
                >
                  {testStatus === 'testing' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                      <span>Перевірка зв’язку...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                      <span>Перевірити з’єднання</span>
                    </>
                  )}
                </button>

                {testStatus === 'success' && (
                  <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 text-xs">
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>{testMessage}</span>
                  </div>
                )}

                {testStatus === 'error' && (
                  <div className="flex items-center gap-1.5 text-red-700 bg-red-50 px-2.5 py-1 rounded-md border border-red-200 text-xs">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{testMessage}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-semibold text-emerald-950">Текст нікуди не йде</h4>
                <p className="text-xs text-emerald-800 mt-0.5 leading-relaxed">
                  У бланк потрапляє лише те, що вже є в записі і у ваших полях. Діагноз, психічний статус і рекомендації лишаються порожніми.
                </p>
              </div>
            </div>
          )}

          {/* Quick Doctor's Guarantee note */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
              Якщо модель не відповіла:
            </div>
            <p>
              Програма покаже помилку. Діагноз і висновок самі не з’являться.
            </p>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-3.5 bg-slate-50/80 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Скасувати
          </button>
          
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-lg shadow-sm shadow-blue-500/20 transition-all flex items-center gap-1.5"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>Зберегти та застосувати</span>
          </button>
        </div>

      </div>
    </div>
  );
};
