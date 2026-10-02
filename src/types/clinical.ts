export interface PatientInfo {
  fullName: string;
  age: string;
  gender: string;
  consultationDate: string;
  consultationType: string;
}

export interface FactQuote {
  speaker: string;
  text: string;
  significance: string;
}

export interface ClinicalFacts {
  utteranceCount: number;
  chiefComplaints: string[];
  historyTimeline: string;
  sleepQuality: string;
  somaticSymptoms: string;
  medicationsMentioned: string[];
  suicideRiskAssessment: string;
  verifiedQuotes: FactQuote[];
}

export interface Form028Data {
  documentNumber: string;
  doctorHeader: string;
  patientSection: string;
  complaintsSection: string;
  anamnesisMorbiSection: string;
  anamnesisVitaeSection: string;
  objectiveStatusSection: string;
  laboratorySection: string;
  diagnosisCode: string;
  diagnosisDescription: string;
  recommendationsSection: string;
  disabilityNote: string;
  nextAppointmentDate: string;
}

export interface ConsultationResult {
  patient: PatientInfo;
  facts: ClinicalFacts;
  form028: Form028Data;
}
