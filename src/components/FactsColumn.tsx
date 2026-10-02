import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Quote,
  Clock,
  Moon,
  HeartPulse,
  Pill,
  LifeBuoy,
  ChevronDown,
  ChevronUp,
  FileText,
  UserCheck,
  Activity,
  Repeat,
} from 'lucide-react';
import { ClinicalFacts, PatientInfo } from '../types/clinical';

interface FactsColumnProps {
  facts: ClinicalFacts;
  patient: PatientInfo;
  rawTranscript?: string;
}

export const FactsColumn: React.FC<FactsColumnProps> = ({
  facts,
  patient,
  rawTranscript,
}) => {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="no-print space-y-4 h-full overflow-y-auto pr-1">
      {/* Patient Match Card */}
      <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-2xs">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-semibold text-xs">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-gray-900">{patient.fullName}</h3>
              <p className="text-[11px] text-gray-500">
                {patient.age} • {patient.consultationType}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
            {patient.consultationDate}
          </span>
        </div>
      </div>

      {/* Psychometrics Card (if provided) */}
      {facts.psychometrics && (
        <div className="bg-purple-50/60 rounded-xl p-3.5 border border-purple-200/80 shadow-2xs">
          <div className="flex items-center gap-2 mb-1.5">
            <Activity className="w-4 h-4 text-purple-600" />
            <h4 className="text-xs font-semibold text-purple-950">Психометричні тести (шкали)</h4>
          </div>
          <p className="text-xs text-purple-900 leading-relaxed font-medium">
            {facts.psychometrics}
          </p>
        </div>
      )}

      {/* Follow-up Dynamics Card (if provided) */}
      {facts.followUpDynamics && (
        <div className="bg-sky-50/60 rounded-xl p-3.5 border border-sky-200/80 shadow-2xs">
          <div className="flex items-center gap-2 mb-1.5">
            <Repeat className="w-4 h-4 text-sky-600" />
            <h4 className="text-xs font-semibold text-sky-950">Динаміка повторного прийому</h4>
          </div>
          <p className="text-xs text-sky-900 leading-relaxed">
            {facts.followUpDynamics}
          </p>
        </div>
      )}

      {/* Anti-Hallucination Safe Shield */}
      <div className="bg-gradient-to-r from-emerald-50/80 to-blue-50/50 rounded-xl p-3 border border-emerald-200/70 text-emerald-900 text-xs">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-emerald-950 text-[11px]">
              Клінічний бар'єр верифікації активний
            </div>
            <p className="text-[11px] text-emerald-800 leading-relaxed mt-0.5">
              Всі симптоми, анамнез та озвучені ліки зіставлені виключно з прямою мовою.
              Дозування не додумуються.
            </p>
          </div>
        </div>
      </div>

      {/* Section 1: Chief Complaints */}
      <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-2xs">
        <div className="flex items-center gap-2 mb-2.5">
          <HeartPulse className="w-4 h-4 text-rose-500" />
          <h4 className="text-xs font-semibold text-gray-900">1. Тверді скарги з розмови</h4>
        </div>
        <ul className="space-y-1.5 text-xs text-gray-700">
          {facts.chiefComplaints.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
              <span className="leading-snug">{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Section 2: Timeline & Anamnesis */}
      <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-2xs">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-4 h-4 text-amber-500" />
          <h4 className="text-xs font-semibold text-gray-900">2. Хронологія та провокуючі фактори</h4>
        </div>
        <p className="text-xs text-gray-700 leading-relaxed bg-amber-50/30 p-2.5 rounded-lg border border-amber-100">
          {facts.historyTimeline}
        </p>
      </div>

      {/* Section 3: Sleep & Somatics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-2xs">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Moon className="w-3.5 h-3.5 text-indigo-500" />
            <h5 className="text-[11px] font-semibold text-gray-900">Якість сну</h5>
          </div>
          <p className="text-[11px] text-gray-600 leading-snug">{facts.sleepQuality}</p>
        </div>

        <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-2xs">
          <div className="flex items-center gap-1.5 mb-1.5">
            <HeartPulse className="w-3.5 h-3.5 text-orange-500" />
            <h5 className="text-[11px] font-semibold text-gray-900">Соматичні прояви</h5>
          </div>
          <p className="text-[11px] text-gray-600 leading-snug">{facts.somaticSymptoms}</p>
        </div>
      </div>

      {/* Section 4: Medications Mentioned */}
      <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-2xs">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Pill className="w-4 h-4 text-purple-600" />
            <h4 className="text-xs font-semibold text-gray-900">3. Озвучені ліки (до консультації)</h4>
          </div>
          <span className="text-[10px] text-purple-700 font-medium px-2 py-0.5 rounded bg-purple-50">
            Без додумування
          </span>
        </div>
        {facts.medicationsMentioned && facts.medicationsMentioned.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {facts.medicationsMentioned.map((med, idx) => (
              <span
                key={idx}
                className="text-xs px-2.5 py-1 rounded-md bg-purple-50 border border-purple-200/60 text-purple-900"
              >
                {med}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 italic">Жодних лікарських засобів не озвучувалося.</p>
        )}
      </div>

      {/* Section 5: Suicide Risk Assessment */}
      <div className="bg-white rounded-xl p-3.5 border border-gray-200 shadow-2xs">
        <div className="flex items-center gap-2 mb-1.5">
          <LifeBuoy className="w-4 h-4 text-emerald-600" />
          <h4 className="text-xs font-semibold text-gray-900">4. Суїцидальний ризик</h4>
        </div>
        <p className="text-xs text-gray-700 leading-relaxed bg-emerald-50/40 p-2.5 rounded-lg border border-emerald-100">
          {facts.suicideRiskAssessment}
        </p>
      </div>

      {/* Section 6: Verified Quotes */}
      {facts.verifiedQuotes && facts.verifiedQuotes.length > 0 && (
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-2xs">
          <div className="flex items-center gap-2 mb-2.5">
            <Quote className="w-4 h-4 text-blue-600" />
            <h4 className="text-xs font-semibold text-gray-900">5. Дослівні цитати пацієнта</h4>
          </div>
          <div className="space-y-2.5">
            {facts.verifiedQuotes.map((q, idx) => (
              <div key={idx} className="p-2.5 rounded-lg bg-gray-50/80 border border-gray-100 text-xs">
                <div className="italic text-gray-800 font-serif leading-relaxed mb-1">{q.text}</div>
                <div className="flex items-center justify-between text-[10px] text-gray-500">
                  <span className="font-medium text-gray-700">{q.speaker}</span>
                  <span className="text-blue-700">{q.significance}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw Transcript Collapsible Drawer */}
      {rawTranscript && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-2xs">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="w-full px-4 py-2.5 text-left text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-between transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-gray-500" />
              <span>Повний вихідний текст бесіди ({facts.utteranceCount || '40+'} реплік)</span>
            </div>
            {showRaw ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showRaw && (
            <div className="p-3 bg-gray-50/70 border-t border-gray-100 max-h-60 overflow-y-auto text-[11px] font-mono text-gray-600 whitespace-pre-wrap leading-relaxed">
              {rawTranscript}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
