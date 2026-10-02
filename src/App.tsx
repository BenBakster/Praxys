import React, { useState } from 'react';
import { Header } from './components/Header';
import { UploadCard } from './components/UploadModalOrCard';
import { FactsColumn } from './components/FactsColumn';
import { MedicalDocumentA4 } from './components/MedicalDocumentA4';
import { TelegramModal } from './components/TelegramModal';
import { ConsultationResult, Form028Data, PatientInfo } from './types/clinical';
import { DEMO_CONSULTATION_RESULT, DEMO_RAW_TRANSCRIPT } from './data/demoData';
import {
  Printer,
  FileDown,
  Copy,
  Check,
  Sparkles,
  FileText,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';

export default function App() {
  const [selectedModel, setSelectedModel] = useState('gemini-3.8-flash');
  const [isProcessing, setIsProcessing] = useState(false);
  const [consultationData, setConsultationData] = useState<ConsultationResult | null>(null);
  const [rawTranscript, setRawTranscript] = useState<string>('');
  const [currentFileName, setCurrentFileName] = useState<string>('');
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Show Toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Process consultation transcript or JSON via server API
  const handleProcessTranscript = async (
    transcript: string,
    metadata?: any,
    formType: string = '028_o',
    rawJson?: any
  ) => {
    setIsProcessing(true);
    setRawTranscript(transcript);
    if (metadata?.fileName) {
      setCurrentFileName(metadata.fileName);
    }

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          rawJson,
          metadata,
          modelName: selectedModel,
          formType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Помилка сервера: ${response.statusText}`);
      }

      const result = await response.json();
      if (result.ok && result.data) {
        setConsultationData(result.data);
        const patientName = result.data.patient?.fullName || 'Пацієнт';
        const modelTag = result.model ? ` (${result.model})` : '';
        showToast(`Успішно сформовано для: ${patientName}${modelTag}!`);
      } else {
        throw new Error(result.error || 'Не вдалося структурувати дані');
      }
    } catch (err: any) {
      console.error('API extraction issue:', err);
      showToast(`Помилка аналізу файлу: ${err.message || 'Перевірте формат'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 1-Click Load Demo Sample
  const handleLoadDemo = () => {
    setRawTranscript(DEMO_RAW_TRANSCRIPT);
    setCurrentFileName('demo_consultation_f41.json');
    setConsultationData(DEMO_CONSULTATION_RESULT);
    showToast('Зразок прийому завантажено: Мельник І.О.');
  };

  // Native Print / CamScanner PDF
  const handlePrint = () => {
    if (!consultationData) return;
    window.print();
  };

  // Export DOCX (No "психотерапевт", only M.P. seal circle)
  const handleExportDocx = async () => {
    if (!consultationData) return;

    try {
      const response = await fetch('/api/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form028: consultationData.form028,
          patient: consultationData.patient,
        }),
      });

      if (!response.ok) throw new Error('Помилка формування DOCX');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Висновок_${consultationData.patient.fullName.replace(/\s+/g, '_')}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      showToast('Файл .docx сформовано та завантажено!');
    } catch (err: any) {
      console.error(err);
      showToast('Не вдалося експортувати DOCX');
    }
  };

  // Telegram dispatch
  const handleSendTelegram = async () => {
    if (!consultationData) return;

    try {
      await fetch('/api/send-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentNumber: consultationData.form028.documentNumber,
          patientName: consultationData.patient.fullName,
          diagnosis: `${consultationData.form028.diagnosisCode} ${consultationData.form028.diagnosisDescription}`,
        }),
      });
      setTelegramModalOpen(true);
    } catch {
      setTelegramModalOpen(true);
    }
  };

  // Copy full document text (No "психотерапевт")
  const handleCopyText = () => {
    if (!consultationData) return;
    const doc = consultationData.form028;
    const p = consultationData.patient;

    const fullText = `ФОП ВІЛЕНЧИК АНТОН ПАВЛОВИЧ
Лікар-психіатр, нарколог
Ліцензія МОЗ України № 854 від 17.05.2024 р.
КОНСУЛЬТАТИВНИЙ ВИСНОВОК СПЕЦІАЛІСТА № ${doc.documentNumber} від ${p.consultationDate}
1. Пацієнт: ${p.fullName}, ${p.age} (${p.consultationType})
2. Скарги: ${doc.complaintsSection}
3. Анамнез захворювання: ${doc.anamnesisMorbiSection}
4. Анамнез життя: ${doc.anamnesisVitaeSection}
5. Об'єктивний статус: ${doc.objectiveStatusSection}
6. Дослідження: ${doc.laboratorySection}
7. Діагноз: [${doc.diagnosisCode}] ${doc.diagnosisDescription}
8. Рекомендації:
${doc.recommendationsSection}
9. Працездатність: ${doc.disabilityNote}
10. Термін повторної явки: ${doc.nextAppointmentDate}
М. П.`;

    navigator.clipboard.writeText(fullText);
    setCopied(true);
    showToast('Текст висновку скопійовано до буфера обміну!');
    setTimeout(() => setCopied(false), 2000);
  };

  // Update Form 028 fields inline
  const handleUpdateForm = (updated: Partial<Form028Data>) => {
    if (!consultationData) return;
    setConsultationData({
      ...consultationData,
      form028: { ...consultationData.form028, ...updated },
    });
  };

  // Update Patient info
  const handleUpdatePatient = (updated: Partial<PatientInfo>) => {
    if (!consultationData) return;
    setConsultationData({
      ...consultationData,
      patient: { ...consultationData.patient, ...updated },
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FA] text-[#1F1F1F]">
      {/* Top Application Header */}
      <Header
        selectedModel={selectedModel}
        onSelectModel={setSelectedModel}
        onPrint={handlePrint}
        onExportDocx={handleExportDocx}
        onSendTelegram={handleSendTelegram}
        onReset={() => {
          setConsultationData(null);
          setCurrentFileName('');
        }}
        hasDocument={Boolean(consultationData)}
        isProcessing={isProcessing}
      />

      {/* Main Workspace */}
      <main className="flex-1 max-w-[1700px] w-full mx-auto p-4 sm:p-6">
        {/* Loading Spinner Indicator */}
        {isProcessing && (
          <div className="no-print my-12 flex flex-col items-center justify-center text-center">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-3 border-blue-100 border-t-blue-600 animate-spin" />
              <Sparkles className="w-5 h-5 text-blue-600 absolute inset-0 m-auto animate-pulse" />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-gray-900">
              Аналіз реального файлу через каскад Gemini...
            </h3>
            <p className="mt-1 text-xs text-gray-500 max-w-sm">
              Виділяємо справжнє ім'я пацієнта, озвучені скарги, перевіряємо дози та формуємо бланк
            </p>
          </div>
        )}

        {/* Upload Card */}
        {!consultationData && !isProcessing && (
          <UploadCard
            onProcessTranscript={handleProcessTranscript}
            onLoadDemo={handleLoadDemo}
            isProcessing={isProcessing}
          />
        )}

        {/* Two-Column Clinical Workspace */}
        {consultationData && !isProcessing && (
          <div>
            {/* Secondary Action Toolbar */}
            <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-gray-200 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-900">
                  {consultationData.patient.fullName}
                </span>
                <span className="text-xs text-gray-400">•</span>
                <span className="text-xs text-gray-600">
                  МКХ-10: <strong>{consultationData.form028.diagnosisCode}</strong> ({consultationData.form028.diagnosisDescription})
                </span>
                {currentFileName && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500">
                    {currentFileName}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyText}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Скопійовано' : 'Копіювати текст'}</span>
                </button>

                <button
                  onClick={handleExportDocx}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <FileDown className="w-3.5 h-3.5 text-blue-600" />
                  <span>DOCX</span>
                </button>

                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white shadow-2xs transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Друк / PDF для CamScanner</span>
                </button>
              </div>
            </div>

            {/* Split Grid: Left = Verified Facts, Right = A4 Form 028/о */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Facts */}
              <div className="lg:col-span-5 xl:col-span-4 no-print">
                <div className="sticky top-20">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      Факти з розмови (Clinical Grounding)
                    </h3>
                    <span className="text-[11px] text-gray-500">
                      {consultationData.facts.utteranceCount} реплік
                    </span>
                  </div>
                  <FactsColumn
                    facts={consultationData.facts}
                    patient={consultationData.patient}
                    rawTranscript={rawTranscript}
                  />
                </div>
              </div>

              {/* Right Column: A4 Document Sheet */}
              <div className="lg:col-span-7 xl:col-span-8 flex justify-center">
                <MedicalDocumentA4
                  form028={consultationData.form028}
                  patient={consultationData.patient}
                  onUpdateForm={handleUpdateForm}
                  onUpdatePatient={handleUpdatePatient}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Floating Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 no-print flex items-center gap-2.5 px-4 py-3 bg-gray-900 text-white text-xs font-medium rounded-xl shadow-xl animate-in slide-in-from-bottom-3 duration-200">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Telegram Confirmation Modal */}
      {consultationData && (
        <TelegramModal
          isOpen={telegramModalOpen}
          onClose={() => setTelegramModalOpen(false)}
          documentNumber={consultationData.form028.documentNumber}
          patientName={consultationData.patient.fullName}
          diagnosis={`${consultationData.form028.diagnosisCode} ${consultationData.form028.diagnosisDescription}`}
        />
      )}
    </div>
  );
}
