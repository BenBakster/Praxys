import React from 'react';
import { Form028Data, PatientInfo } from '../types/clinical';
import { Edit3 } from 'lucide-react';

interface DocumentProps {
  form028: Form028Data;
  patient: PatientInfo;
  onUpdateForm: (updated: Partial<Form028Data>) => void;
  onUpdatePatient: (updated: Partial<PatientInfo>) => void;
}

export const MedicalDocumentA4: React.FC<DocumentProps> = ({
  form028,
  patient,
  onUpdateForm,
  onUpdatePatient,
}) => {
  return (
    <div className="print-container flex flex-col items-center">
      {/* Visual Instruction Badge for Doctor */}
      <div className="no-print w-full max-w-[210mm] mb-3 flex items-center justify-between px-3 py-2 bg-blue-50/70 border border-blue-100 rounded-lg text-xs text-blue-900">
        <div className="flex items-center gap-2">
          <Edit3 className="w-3.5 h-3.5 text-blue-600" />
          <span>
            <strong>Інтерактивний лист А4:</strong> ви можете клікнути в будь-який абзац або поле нижче, щоб відредагувати текст перед печаткою або CamScanner.
          </span>
        </div>
        <span className="text-[11px] font-medium text-blue-700 bg-white px-2 py-0.5 rounded shadow-2xs">
          Форма № 028/о МОЗ
        </span>
      </div>

      {/* A4 Sheet Container */}
      <div className="medical-document-page bg-white w-full max-w-[210mm] min-h-[297mm] p-8 sm:p-12 border border-gray-200 rounded-none sm:rounded-sm text-gray-900 text-[12pt] leading-normal transition-all shadow-md">
        {/* MOH Ukraine Form Designation (Upper Right) */}
        <div className="text-right text-[9pt] leading-tight text-gray-600 italic mb-4 font-serif avoid-break">
          <div>Форма первинної облікової документації № 028/о</div>
          <div>ЗАТВЕРДЖЕНО</div>
          <div>Наказ МОЗ України 14.02.2012 № 110</div>
        </div>

        {/* Doctor & Practice Header (No "психотерапевт") */}
        <div className="text-center border-b-2 border-gray-900 pb-3 mb-6 font-serif avoid-break">
          <div className="font-bold text-[14pt] tracking-wide uppercase">
            ФОП ВІЛЕНЧИК АНТОН ПАВЛОВИЧ
          </div>
          <div className="text-[10pt] text-gray-800 mt-1">
            Медична практика: психіатрія, наркологія
          </div>
          <div className="text-[9pt] text-gray-600 mt-0.5">
            Ліцензія МОЗ України: Наказ МОЗ № 854 від 17.05.2024 р. | ЄДРПОУ/РНОКПП: 3331405953
          </div>
          <div className="text-[9pt] text-gray-600">
            м. Київ, вул. Велика Васильківська | Тел: +380 (50) 412-25-33 | Email: Anton.Vilenchyk@gmail.com
          </div>
        </div>

        {/* Title */}
        <div className="text-center my-4 font-serif avoid-break">
          <h2 className="text-[15pt] font-bold tracking-tight uppercase">
            КОНСУЛЬТАТИВНИЙ ВИСНОВОК СПЕЦІАЛІСТА
          </h2>
          <div className="text-[11pt] font-semibold text-gray-800 mt-1 flex items-center justify-center gap-2">
            <span>№</span>
            <input
              type="text"
              value={form028.documentNumber}
              onChange={(e) => onUpdateForm({ documentNumber: e.target.value })}
              className="border-b border-dashed border-gray-400 text-center font-bold outline-none bg-transparent hover:border-gray-900 focus:border-blue-600 px-1 py-0.5 w-32"
            />
            <span>від</span>
            <input
              type="text"
              value={patient.consultationDate}
              onChange={(e) => onUpdatePatient({ consultationDate: e.target.value })}
              className="border-b border-dashed border-gray-400 text-center font-semibold outline-none bg-transparent hover:border-gray-900 focus:border-blue-600 px-1 py-0.5 w-32"
            />
          </div>
        </div>

        {/* Clinical Document Content Sections */}
        <div className="space-y-4 font-serif text-[11pt] text-justify leading-relaxed">
          {/* 1. Patient Info */}
          <div className="avoid-break">
            <div className="flex flex-wrap items-baseline gap-1">
              <span className="font-bold">1. Прізвище, ім'я, по батькові пацієнта:</span>
              <input
                type="text"
                value={patient.fullName}
                onChange={(e) => onUpdatePatient({ fullName: e.target.value })}
                className="flex-1 min-w-[200px] font-bold border-b border-dashed border-gray-300 hover:border-gray-800 focus:border-blue-600 outline-none bg-transparent px-1"
              />
            </div>
          </div>

          {/* 2. Age & Consultation Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 avoid-break">
            <div className="flex items-baseline gap-1">
              <span className="font-bold">2. Вік:</span>
              <input
                type="text"
                value={patient.age}
                onChange={(e) => onUpdatePatient({ age: e.target.value })}
                className="flex-1 border-b border-dashed border-gray-300 hover:border-gray-800 focus:border-blue-600 outline-none bg-transparent px-1"
              />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-bold">3. Вид консультації:</span>
              <input
                type="text"
                value={patient.consultationType}
                onChange={(e) => onUpdatePatient({ consultationType: e.target.value })}
                className="flex-1 border-b border-dashed border-gray-300 hover:border-gray-800 focus:border-blue-600 outline-none bg-transparent px-1"
              />
            </div>
          </div>

          {/* 4. Complaints */}
          <div className="avoid-break">
            <span className="font-bold block mb-1">4. Скарги хворого:</span>
            <textarea
              rows={3}
              value={form028.complaintsSection}
              onChange={(e) => onUpdateForm({ complaintsSection: e.target.value })}
              className="w-full p-2 border border-gray-200/60 hover:border-gray-400 focus:border-blue-600 rounded bg-transparent outline-none resize-y leading-relaxed font-serif text-[11pt]"
            />
          </div>

          {/* 5. Anamnesis Morbi */}
          <div className="avoid-break">
            <span className="font-bold block mb-1">5. Анамнез захворювання:</span>
            <textarea
              rows={4}
              value={form028.anamnesisMorbiSection}
              onChange={(e) => onUpdateForm({ anamnesisMorbiSection: e.target.value })}
              className="w-full p-2 border border-gray-200/60 hover:border-gray-400 focus:border-blue-600 rounded bg-transparent outline-none resize-y leading-relaxed font-serif text-[11pt]"
            />
          </div>

          {/* 6. Anamnesis Vitae */}
          <div className="avoid-break">
            <span className="font-bold block mb-1">6. Анамнез життя:</span>
            <textarea
              rows={2}
              value={form028.anamnesisVitaeSection}
              onChange={(e) => onUpdateForm({ anamnesisVitaeSection: e.target.value })}
              className="w-full p-2 border border-gray-200/60 hover:border-gray-400 focus:border-blue-600 rounded bg-transparent outline-none resize-y leading-relaxed font-serif text-[11pt]"
            />
          </div>

          {/* 7. Objective Status */}
          <div className="avoid-break">
            <span className="font-bold block mb-1">
              7. Дані об'єктивного обстеження (соматичний та психічний статус):
            </span>
            <textarea
              rows={5}
              value={form028.objectiveStatusSection}
              onChange={(e) => onUpdateForm({ objectiveStatusSection: e.target.value })}
              className="w-full p-2 border border-gray-200/60 hover:border-gray-400 focus:border-blue-600 rounded bg-transparent outline-none resize-y leading-relaxed font-serif text-[11pt]"
            />
          </div>

          {/* 8. Laboratory / Instrumental */}
          <div className="avoid-break">
            <span className="font-bold block mb-1">
              8. Дані лабораторних та інструментальних досліджень:
            </span>
            <textarea
              rows={2}
              value={form028.laboratorySection}
              onChange={(e) => onUpdateForm({ laboratorySection: e.target.value })}
              className="w-full p-2 border border-gray-200/60 hover:border-gray-400 focus:border-blue-600 rounded bg-transparent outline-none resize-y leading-relaxed font-serif text-[11pt]"
            />
          </div>

          {/* 9. Diagnosis */}
          <div className="p-3 bg-gray-50/70 border-l-4 border-gray-900 rounded-r avoid-break">
            <div className="flex flex-wrap items-baseline gap-2 mb-1">
              <span className="font-bold text-[12pt]">9. Діагноз (МКХ-10):</span>
              <input
                type="text"
                value={form028.diagnosisCode}
                onChange={(e) => onUpdateForm({ diagnosisCode: e.target.value })}
                className="w-24 font-bold text-[12pt] border-b border-gray-900 bg-transparent outline-none px-1"
                placeholder="F41.2"
              />
            </div>
            <textarea
              rows={2}
              value={form028.diagnosisDescription}
              onChange={(e) => onUpdateForm({ diagnosisDescription: e.target.value })}
              className="w-full font-bold text-[11pt] bg-transparent outline-none resize-none leading-snug"
            />
          </div>

          {/* 10. Recommendations */}
          <div className="avoid-break">
            <span className="font-bold block mb-1">10. Рекомендації:</span>
            <textarea
              rows={6}
              value={form028.recommendationsSection}
              onChange={(e) => onUpdateForm({ recommendationsSection: e.target.value })}
              className="w-full p-2 border border-gray-200/60 hover:border-gray-400 focus:border-blue-600 rounded bg-transparent outline-none resize-y leading-relaxed font-serif text-[11pt]"
            />
          </div>

          {/* 11 & 12. Disability & Next appointment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 avoid-break">
            <div className="flex items-baseline gap-1">
              <span className="font-bold">11. Працездатність:</span>
              <input
                type="text"
                value={form028.disabilityNote}
                onChange={(e) => onUpdateForm({ disabilityNote: e.target.value })}
                className="flex-1 border-b border-dashed border-gray-300 hover:border-gray-800 focus:border-blue-600 outline-none bg-transparent px-1"
              />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-bold">12. Повторна явка:</span>
              <input
                type="text"
                value={form028.nextAppointmentDate}
                onChange={(e) => onUpdateForm({ nextAppointmentDate: e.target.value })}
                className="flex-1 border-b border-dashed border-gray-300 hover:border-gray-800 focus:border-blue-600 outline-none bg-transparent px-1"
              />
            </div>
          </div>

          {/* Bottom Stamp Block: ONLY circle for "М. П." without signature */}
          <div className="mt-12 pt-6 border-t border-gray-200 flex justify-end font-serif avoid-break">
            <div className="w-24 h-24 border-2 border-dashed border-gray-400 rounded-full flex flex-col items-center justify-center text-center p-2 text-gray-500 opacity-90 mr-4">
              <span className="text-[12pt] font-bold tracking-wider">М. П.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
