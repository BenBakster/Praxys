export type FormType = '028_o' | '002_tm' | '027_o';

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
  psychometrics?: string;
  followUpDynamics?: string;
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
  
  // Specific fields for Form 002/тм (Telemedicine)
  telemedDuration?: string;
  telemedChannel?: string;

  // Specific fields for Form 027/о (Medical Card Extract)
  extractRecipient?: string;
  treatmentPeriod?: string;
}

export interface ConsultationResult {
  patient: PatientInfo;
  facts: ClinicalFacts;
  form028: Form028Data;
  formType?: FormType;
}

export type AiProviderType = 'gemini' | 'openai' | 'groq' | 'deepseek' | 'offline';

export interface AiConfig {
  provider: AiProviderType;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

