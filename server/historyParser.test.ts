import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Packer } from 'docx';
import { buildDocxDocument } from './docxDocument.ts';
import { extractTextFromHistoryFile, parseClinicalHistoryData } from './historyParser.ts';

const patient = {
  fullName: 'Тестенко Петро Іванович',
  age: '36 років (05.03.1990)',
  consultationDate: '20.09.2026',
  consultationType: 'Первинна консультація',
};

const form028 = {
  documentNumber: '2026/77',
  complaintsSection: 'Тривога, безсоння',
  anamnesisMorbiSection: 'Погіршення протягом пів року',
  anamnesisVitaeSection: 'Алергій немає.\nХронічних захворювань немає.',
  objectiveStatusSection: 'Свідомість ясна',
  diagnosisCode: 'F41.2',
  diagnosisDescription: 'Змішаний тривожний і депресивний розлад',
  recommendationsSection: '1. Сертралін 50 мг вранці\n2. Гідроксизин 25 мг ситуативно',
  disabilityNote: 'Працездатний',
  nextAppointmentDate: 'через 2 тижні',
  treatmentPeriod: 'Консультація від 20.09.2026',
  extractRecipient: 'За місцем вимоги',
};

for (const formType of ['028_o', '002_tm', '027_o']) {
  test(`own ${formType} document reads back as the prior consultation`, async () => {
    const buffer = await Packer.toBuffer(buildDocxDocument(form028, patient, formType));
    const rawText = await extractTextFromHistoryFile('prior.docx', buffer.toString('base64'));
    const extracted = parseClinicalHistoryData(rawText, 'prior.docx');

    assert.equal(extracted.patientName, 'Тестенко Петро Іванович');
    assert.equal(extracted.dob, '05.03.1990');
    assert.equal(extracted.consultationDate, '20.09.2026');
    assert.equal(extracted.pastDiagnosisCode, 'F41.2');
    assert.equal(extracted.pastDiagnosisDescription, 'Змішаний тривожний і депресивний розлад');
    assert.equal(extracted.pastTherapy, form028.recommendationsSection);
    assert.equal(extracted.anamnesisVitae, form028.anamnesisVitaeSection);
  });
}

test('docx keeps line breaks and has no glued header', async () => {
  const buffer = await Packer.toBuffer(buildDocxDocument(form028, patient, '028_o'));
  const rawText = await extractTextFromHistoryFile('prior.docx', buffer.toString('base64'));

  assert.ok(!rawText.includes('ДОКУМЕНТАЦІЯФорма'));
  assert.ok(rawText.includes('Форма первинної облікової документації № 028/о\nЗАТВЕРДЖЕНО\nНаказ МОЗ України 14.02.2012 № 110'));
  assert.ok(rawText.includes('1. Сертралін 50 мг вранці\n2. Гідроксизин 25 мг ситуативно'));
  assert.ok(rawText.includes('ЄДРПОУ/РНОКПП:'));
});

test('foreign text document with labelled fields', () => {
  const rawText = [
    'Наказ МОЗ України 14.02.2012 № 110',
    'Консультативний висновок',
    'Пацієнтка: Мельник Ірина Олександрівна',
    'Дата народження: 12.04.1988',
    'Дата огляду: 01.09.2026',
    'Діагноз: F32.1 — Депресивний епізод середнього ступеня.',
    'Рекомендації: есциталопрам 10 мг вранці',
    'Лікар-психіатр Віленчик А. П.',
  ].join('\n');

  const extracted = parseClinicalHistoryData(rawText);

  assert.equal(extracted.patientName, 'Мельник Ірина Олександрівна');
  assert.equal(extracted.dob, '12.04.1988');
  assert.equal(extracted.consultationDate, '01.09.2026');
  assert.equal(extracted.pastDiagnosisCode, 'F32.1');
  assert.equal(extracted.pastDiagnosisDescription, 'Депресивний епізод середнього ступеня');
  assert.equal(extracted.pastTherapy, 'есциталопрам 10 мг вранці');
});

test('dates from the form header are never taken as patient dates', () => {
  const rawText = [
    'Форма первинної облікової документації № 028/о',
    'ЗАТВЕРДЖЕНО',
    'Наказ МОЗ України 14.02.2012 № 110',
    'Медична практика: психіатрія, наркологія | Наказ МОЗ України № 854 від 17.05.2024 р.',
    'Пацієнт: Коваль Олег',
    'Скарги: тривога',
  ].join('\n');

  const extracted = parseClinicalHistoryData(rawText);

  assert.equal(extracted.dob, '');
  assert.equal(extracted.consultationDate, '');
  assert.equal(extracted.patientName, 'Коваль Олег');
});

test('saved consultation json reads back through its sections', async () => {
  const json = JSON.stringify({ patient, form028 });
  const rawText = await extractTextFromHistoryFile('prior.json', Buffer.from(json).toString('base64'));
  const extracted = parseClinicalHistoryData(rawText, 'prior.json');

  assert.equal(extracted.patientName, 'Тестенко Петро Іванович');
  assert.equal(extracted.dob, '05.03.1990');
  assert.equal(extracted.consultationDate, '20.09.2026');
  assert.equal(extracted.pastTherapy, form028.recommendationsSection);
});
