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
  Activity,
  Repeat,
  FileCheck2,
} from 'lucide-react';
import { FormType } from '../types/clinical';

export interface PatientContextData {
  fullName?: string;
  dob?: string;
  pastHistory?: string;
}

export interface ConsultationModeData {
  consultationType: 'первинна' | 'повторна';
  previousTherapyAndState?: string;
}

interface UploadProps {
  onProcessTranscript: (
    transcript: string,
    metadata?: any,
    formType?: FormType,
    rawJson?: any,
    doctorNotes?: string,
    patientContext?: PatientContextData,
    psychometrics?: string,
    followUpData?: ConsultationModeData
  ) => void;
  onLoadDemo: () => void;
  isProcessing: boolean;
  initialFormType?: FormType;
}

export const UploadCard: React.FC<UploadProps> = ({
  onProcessTranscript,
  onLoadDemo,
  isProcessing,
  initialFormType = '028_o',
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');
  const [pasteText, setPasteText] = useState('');
  const [formType, setFormType] = useState<FormType>(initialFormType);
  const [doctorNotes, setDoctorNotes] = useState('');

  // 1. Patient Card & Prior History (Anamnesis Vitae)
  const [patientFullName, setPatientFullName] = useState('');
  const [patientDob, setPatientDob] = useState('');
  const [patientPastHistory, setPatientPastHistory] = useState('');
  const [showPatientCard, setShowPatientCard] = useState(false);

  // 2. Follow-Up Mode (Первинна vs Повторна)
  const [consultationNature, setConsultationNature] = useState<'первинна' | 'повторна'>('первинна');
  const [previousTherapy, setPreviousTherapy] = useState('');

  // 3. Psychometric Scales (Tests from Bot / Telegram)
  const [showScalesPanel, setShowScalesPanel] = useState(false);
  const [phq9Score, setPhq9Score] = useState('');
  const [gad7Score, setGad7Score] = useState('');
  const [asrsScore, setAsrsScore] = useState('');
  const [auditScore, setAuditScore] = useState('');
  const [asrmScore, setAsrmScore] = useState('');
  const [customScalesText, setCustomScalesText] = useState('');

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

  const followUpPresets = [
    'Позитивна динаміка: редукція тривоги >50%',
    'Нормалізація сну, панічні атаки купіровано',
    'Стійка клінічна ремісія',
    'Залишкова субдепресія та астенізація',
    'Препарат переноситься добре, побічні відсутні',
    'Потреба в титрації дози (підвищення)',
    'Потреба в аугментації терапії',
  ];

  const addHistoryPreset = (preset: string) => {
    setPatientPastHistory((prev) => (prev ? `${prev}; ${preset}` : preset));
  };

  const addFollowUpPreset = (preset: string) => {
    setPreviousTherapy((prev) => (prev ? `${prev}; ${preset}` : preset));
  };

  const getCombinedPsychometrics = (): string => {
    const parts: string[] = [];
    if (phq9Score.trim()) parts.push(`PHQ-9 (депресія): ${phq9Score.trim()}`);
    if (gad7Score.trim()) parts.push(`GAD-7 (тривога): ${gad7Score.trim()}`);
    if (asrsScore.trim()) parts.push(`ASRS-6 (СДУГ): ${asrsScore.trim()}`);
    if (auditScore.trim()) parts.push(`AUDIT (алкоголь): ${auditScore.trim()}`);
    if (asrmScore.trim()) parts.push(`ASRM (манія/гіпоманія): ${asrmScore.trim()}`);
    if (customScalesText.trim()) parts.push(customScalesText.trim());
    return parts.join('; ');
  };

  const getPatientContext = (): PatientContextData => ({
    fullName: patientFullName.trim() || undefined,
    dob: patientDob.trim() || undefined,
    pastHistory: patientPastHistory.trim() || undefined,
  });

  const getFollowUpData = (): ConsultationModeData => ({
    consultationType: consultationNature,
    previousTherapyAndState: consultationNature === 'повторна' ? previousTherapy.trim() || undefined : undefined,
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
      const psychometrics = getCombinedPsychometrics();
      const followUp = getFollowUpData();

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
          pContext,
          psychometrics,
          followUp
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
          pContext,
          psychometrics,
          followUp
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
      getPatientContext(),
      getCombinedPsychometrics(),
      getFollowUpData()
    );
  };

  return (
    <div className="w-full max-w-4xl mx-auto my-6 px-4">
      {/* Hero Welcome Banner */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-xs font-medium mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Клінічне структурування Форм МОЗ: 028/о • 002/тм • 027/о</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
          Студія клінічних висновків лікаря Віленчика А.П.
        </h2>
        <p className="mt-2 text-sm text-gray-600 max-w-2xl mx-auto leading-relaxed">
          Завантажте файл зустрічі Fireflies / Google Meet або вставте текст.
          Система автоматично формує офіційні медичні бланки МОЗ України із врахуванням психометрії та динаміки терапії.
        </p>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200/90 overflow-hidden transition-all">
        {/* Navigation Tabs & Official MOH Form Switcher */}
        <div className="flex flex-col sm:flex-row items-center justify-between px-6 pt-4 pb-3 border-b border-gray-100 gap-3 bg-gray-50/50">
          <div className="flex items-center gap-1 bg-gray-200/60 p-1 rounded-xl w-full sm:w-auto">
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
                Вставити текст
              </span>
            </button>
          </div>

          {/* Segmented Selector for 3 MOH Ukraine Forms */}
          <div className="flex items-center gap-1 bg-white border border-gray-200/90 p-1 rounded-xl shadow-2xs w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setFormType('028_o')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                formType === '028_o'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
              title="Консультативний висновок спеціаліста (МОЗ № 110)"
            >
              028/о (Висновок)
            </button>
            <button
              type="button"
              onClick={() => setFormType('002_tm')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                formType === '002_tm'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
              title="Висновок консультанта телемедицини (МОЗ № 681)"
            >
              002/тм (Телемедицина)
            </button>
            <button
              type="button"
              onClick={() => setFormType('027_o')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                formType === '027_o'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
              title="Виписка із медичної карти амбулаторного хворого (МОЗ № 110)"
            >
              027/о (Виписка)
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6 space-y-4">
          {/* SECTION A: Consultation Mode (Первинна vs Повторна / Динаміка) */}
          <div className="border border-sky-100 rounded-xl bg-sky-50/20 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <Repeat className="w-4 h-4 text-sky-600" />
                <span className="text-xs font-semibold text-gray-900">
                  Тип консультації:
                </span>
                <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
                  <button
                    type="button"
                    onClick={() => setConsultationNature('первинна')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      consultationNature === 'первинна'
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Первинна
                  </button>
                  <button
                    type="button"
                    onClick={() => setConsultationNature('повторна')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      consultationNature === 'повторна'
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Повторна (Динаміка)
                  </button>
                </div>
              </div>

              {consultationNature === 'повторна' && (
                <span className="text-[11px] font-medium text-sky-700 bg-sky-100/70 px-2 py-0.5 rounded-full">
                  Режим аналізу динаміки терапії активний
                </span>
              )}
            </div>

            {consultationNature === 'повторна' && (
              <div className="mt-3 pt-3 border-t border-sky-100 space-y-2">
                <label className="block text-[11px] font-medium text-gray-700">
                  Попередня терапія, початковий стан та переносимість:
                </label>
                <textarea
                  rows={2}
                  value={previousTherapy}
                  onChange={(e) => setPreviousTherapy(e.target.value)}
                  placeholder="напр. Есциталопрам 10 мг/добу 6 тижнів, початково важка тривога; скарги на залишкове ранкове напруження..."
                  className="w-full p-2.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-gray-400 font-medium">Швидка оцінка динаміки:</span>
                  {followUpPresets.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => addFollowUpPreset(preset)}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-sky-200 text-sky-800 hover:bg-sky-50 transition-colors"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* SECTION B: Psychometric Scales (Tests from Bot / Telegram) */}
          <div className="border border-purple-100 rounded-xl bg-purple-50/20 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowScalesPanel(!showScalesPanel)}
              className="w-full px-4 py-2.5 flex items-center justify-between text-left text-xs font-semibold text-purple-950 hover:bg-purple-50/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-600" />
                <span>Психометричні шкали (тести з бота / опитувальники)</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                {(phq9Score || gad7Score || asrsScore || auditScore || customScalesText) && (
                  <span className="text-[11px] font-normal text-purple-700 bg-purple-100/60 px-2 py-0.5 rounded">
                    Шкали заповнено
                  </span>
                )}
                {showScalesPanel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {showScalesPanel && (
              <div className="p-4 pt-2 space-y-3 border-t border-purple-100/70 bg-white/70">
                <p className="text-[11px] text-gray-500">
                  Введіть бали тестів, отримані з вашого Telegram-бота чи на прийомі. Дані будуть офіційно зафіксовані в об'єктивному статусі.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                  <div className="p-2 border border-gray-200 rounded-lg bg-white">
                    <label className="block text-[11px] font-bold text-gray-800 mb-1">
                      PHQ-9 (Депресія)
                    </label>
                    <input
                      type="text"
                      value={phq9Score}
                      onChange={(e) => setPhq9Score(e.target.value)}
                      placeholder="напр. 14 балів"
                      className="w-full p-1.5 text-xs border border-gray-200 rounded outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="p-2 border border-gray-200 rounded-lg bg-white">
                    <label className="block text-[11px] font-bold text-gray-800 mb-1">
                      GAD-7 (Тривога)
                    </label>
                    <input
                      type="text"
                      value={gad7Score}
                      onChange={(e) => setGad7Score(e.target.value)}
                      placeholder="напр. 11 балів"
                      className="w-full p-1.5 text-xs border border-gray-200 rounded outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="p-2 border border-gray-200 rounded-lg bg-white">
                    <label className="block text-[11px] font-bold text-gray-800 mb-1">
                      ASRS-6 (СДУГ)
                    </label>
                    <input
                      type="text"
                      value={asrsScore}
                      onChange={(e) => setAsrsScore(e.target.value)}
                      placeholder="напр. 5/6 позитивних"
                      className="w-full p-1.5 text-xs border border-gray-200 rounded outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="p-2 border border-gray-200 rounded-lg bg-white">
                    <label className="block text-[11px] font-bold text-gray-800 mb-1">
                      AUDIT (Алкоголь)
                    </label>
                    <input
                      type="text"
                      value={auditScore}
                      onChange={(e) => setAuditScore(e.target.value)}
                      placeholder="напр. 8 балів"
                      className="w-full p-1.5 text-xs border border-gray-200 rounded outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="p-2 border border-gray-200 rounded-lg bg-white">
                    <label className="block text-[11px] font-bold text-gray-800 mb-1">
                      ASRM (Манія)
                    </label>
                    <input
                      type="text"
                      value={asrmScore}
                      onChange={(e) => setAsrmScore(e.target.value)}
                      placeholder="напр. 4 бали"
                      className="w-full p-1.5 text-xs border border-gray-200 rounded outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">
                    Додаткові тести або розгорнутий коментар (PID-5, HCL-32, BDI тощо):
                  </label>
                  <input
                    type="text"
                    value={customScalesText}
                    onChange={(e) => setCustomScalesText(e.target.value)}
                    placeholder="напр. HCL-32: негативний; тест Бека: 18 балів"
                    className="w-full p-2 text-xs border border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>
              </div>
            )}
          </div>

          {/* SECTION C: Patient Card & Anamnesis Vitae */}
          <div className="border border-indigo-100 rounded-xl bg-indigo-50/20 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowPatientCard(!showPatientCard)}
              className="w-full px-4 py-2.5 flex items-center justify-between text-left text-xs font-semibold text-indigo-950 hover:bg-indigo-50/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-indigo-600" />
                <span>Дані пацієнта та попередній анамнез життя (Anamnesis Vitae)</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                {(patientFullName || patientDob || patientPastHistory) && (
                  <span className="text-[11px] font-normal text-indigo-700">Заповнено</span>
                )}
                {showPatientCard ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
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
                    Попередній анамнез життя (для розділу «Анамнез життя» / соматика / алергії):
                  </label>
                  <textarea
                    rows={2}
                    value={patientPastHistory}
                    onChange={(e) => setPatientPastHistory(e.target.value)}
                    placeholder="Вкажіть особливості розвитку, перенесені захворювання, алергії чи примітки з минулих оглядів..."
                    className="w-full p-2.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
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

          {/* SECTION D: File Dropzone or Paste Box */}
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
                  <span>Аналізувати та сформувати документ</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Quick Demo Button */}
          <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-50/70 p-3 rounded-xl">
            <div className="flex items-center gap-3 text-left">
              <div className="w-8 h-8 rounded-lg bg-blue-600/10 flex items-center justify-center text-blue-700 shrink-0">
                <Play className="w-3.5 h-3.5 fill-blue-700" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-900">
                  Тестовий зразок (демо)
                </p>
                <p className="text-[11px] text-gray-500">
                  Демо-прийом з оцінкою шкали GAD-7, динаміки та Form 028/о
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
            <FileCheck2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>Стандарти МОЗ: 028/о, 002/тм, 027/о</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-purple-600 shrink-0" />
            <span>Інтеграція PHQ-9, GAD-7, ASRS</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Пряма відправка DOCX у Telegram</span>
          </div>
        </div>
      </div>
    </div>
  );
};
