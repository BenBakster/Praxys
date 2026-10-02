import React, { useState, useRef, useEffect } from 'react';
import { Form028Data, PatientInfo } from '../types/clinical';
import { ICD10_PSYCHIATRY_LIST, ICD10Diagnosis } from '../data/icd10Data';
import { Edit3, Search, ChevronDown, Check, X, BookOpen } from 'lucide-react';

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
  const [icdDropdownOpen, setIcdDropdownOpen] = useState(false);
  const [icdSearchQuery, setIcdSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIcdDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter ICD-10 by code or name
  const filteredICD = ICD10_PSYCHIATRY_LIST.filter((item) => {
    const q = icdSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      item.code.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      (item.category && item.category.toLowerCase().includes(q))
    );
  });

  const handleSelectDiagnosis = (diag: ICD10Diagnosis) => {
    onUpdateForm({
      diagnosisCode: diag.code,
      diagnosisDescription: diag.name,
    });
    setIcdDropdownOpen(false);
    setIcdSearchQuery('');
  };

  return (
    <div className="print-container flex flex-col items-center w-full">
      {/* Visual Instruction Badge for Doctor */}
      <div className="no-print w-full max-w-[210mm] mb-3 flex items-center justify-between px-3 py-2 bg-blue-50/70 border border-blue-100 rounded-lg text-xs text-blue-900">
        <div className="flex items-center gap-2">
          <Edit3 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span>
            <strong>Інтерактивний лист А4:</strong> клікніть у будь-яке поле чи діагноз нижче для миттєвого редагування або вибору з довідника МКХ-10.
          </span>
        </div>
        <span className="text-[11px] font-medium text-blue-700 bg-white px-2 py-0.5 rounded shadow-2xs shrink-0">
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

        {/* Doctor & Practice Header (Strictly no "психотерапевт") */}
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

          {/* 2. Age / Date of Birth & 3. Consultation Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 avoid-break">
            <div className="flex items-baseline gap-1">
              <span className="font-bold">2. Вік / дата народження:</span>
              <input
                type="text"
                value={patient.age}
                onChange={(e) => onUpdatePatient({ age: e.target.value })}
                placeholder="напр. 34 роки (14.05.1990)"
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

          {/* 6. Anamnesis Vitae (Past medical history) */}
          <div className="avoid-break">
            <span className="font-bold block mb-1">6. Анамнез життя:</span>
            <textarea
              rows={3}
              value={form028.anamnesisVitaeSection}
              onChange={(e) => onUpdateForm({ anamnesisVitaeSection: e.target.value })}
              placeholder="Розвиток, перенесені захворювання, алергологічний анамнез, примітки попередніх оглядів..."
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

          {/* 9. Diagnosis with Interactive Autocomplete Dropdown */}
          <div className="p-3 bg-gray-50/70 border-l-4 border-gray-900 rounded-r avoid-break relative" ref={dropdownRef}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <div className="flex items-baseline gap-2">
                <span className="font-bold text-[12pt]">9. Діагноз (МКХ-10):</span>
                <input
                  type="text"
                  value={form028.diagnosisCode}
                  onChange={(e) => onUpdateForm({ diagnosisCode: e.target.value })}
                  className="w-24 font-bold text-[12pt] border-b border-gray-900 bg-transparent outline-none px-1 text-blue-900"
                  placeholder="F41.2"
                />
              </div>

              {/* Toggle Autocomplete Dropdown Button */}
              <div className="no-print">
                <button
                  type="button"
                  onClick={() => {
                    setIcdDropdownOpen(!icdDropdownOpen);
                    setTimeout(() => searchInputRef.current?.focus(), 50);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans font-medium text-blue-700 bg-white border border-blue-200 rounded-md hover:bg-blue-50 shadow-2xs transition-colors"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Довідник МКХ-10</span>
                  <ChevronDown className="w-3 h-3 text-blue-500" />
                </button>
              </div>
            </div>

            {/* Diagnosis Description Textarea */}
            <textarea
              rows={2}
              value={form028.diagnosisDescription}
              onChange={(e) => onUpdateForm({ diagnosisDescription: e.target.value })}
              className="w-full font-bold text-[11pt] bg-transparent outline-none resize-none leading-snug border-b border-dashed border-gray-300 hover:border-gray-600 focus:border-blue-600"
              placeholder="Опис діагнозу за МКХ-10..."
            />

            {/* Interactive Searchable Dropdown Popover */}
            {icdDropdownOpen && (
              <div className="no-print absolute left-0 right-0 top-full mt-1 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 font-sans text-xs overflow-hidden max-h-96 flex flex-col">
                {/* Search Bar */}
                <div className="p-2.5 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                  <Search className="w-4 h-4 text-gray-400 shrink-0" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={icdSearchQuery}
                    onChange={(e) => setIcdSearchQuery(e.target.value)}
                    placeholder="Пошук за кодом або назвою (напр. F41, тривожний, депресивний, безсоння, алкоголь)..."
                    className="w-full bg-transparent outline-none text-xs text-gray-800 placeholder-gray-400"
                  />
                  {icdSearchQuery && (
                    <button
                      onClick={() => setIcdSearchQuery('')}
                      className="text-gray-400 hover:text-gray-600 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Diagnosis List */}
                <div className="overflow-y-auto divide-y divide-gray-50 p-1 flex-1">
                  {filteredICD.length === 0 ? (
                    <div className="py-6 text-center text-gray-400 text-xs">
                      Діагноз не знайдено. Ви можете ввести його вручну.
                    </div>
                  ) : (
                    filteredICD.map((diag) => {
                      const isSelected = form028.diagnosisCode === diag.code;
                      return (
                        <button
                          key={diag.code}
                          type="button"
                          onClick={() => handleSelectDiagnosis(diag)}
                          className={`w-full px-3 py-2 text-left flex items-start justify-between gap-3 hover:bg-blue-50/80 transition-colors rounded-lg ${
                            isSelected ? 'bg-blue-50 font-medium' : ''
                          }`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-blue-700 bg-blue-100/70 px-1.5 py-0.5 rounded text-[11px]">
                                {diag.code}
                              </span>
                              <span className="text-gray-900 font-medium">{diag.name}</span>
                            </div>
                            {diag.category && (
                              <span className="text-[10px] text-gray-400 block mt-0.5">
                                {diag.category}
                              </span>
                            )}
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0 mt-1" />}
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="p-2 border-t border-gray-100 bg-gray-50/70 text-[10px] text-gray-500 text-right">
                  Оберіть рядок для автоматичного заповнення або закрийте вікно
                </div>
              </div>
            )}
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

          {/* Bottom Stamp Block: ONLY circle for "М. П." without signature line */}
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
