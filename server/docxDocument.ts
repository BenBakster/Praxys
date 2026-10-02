import { AlignmentType, Document, Paragraph, TextRun } from 'docx';

// Doctor & Practice Profile Defaults (Strict MOH compliance, NO "психотерапевт")
export const PRACTICE_INFO = {
  doctorName: 'Віленчик Антон Павлович',
  doctorTitle: 'Лікар-психіатр, нарколог',
  practiceName: 'ФОП ВІЛЕНЧИК А. П.',
  licenseNumber: 'Наказ МОЗ України № 854 від 17.05.2024 р.',
  taxNumber: '3331405953',
  address: 'м. Київ, вул. Велика Васильківська / Дистанційний прийом',
  phone: '+380 (50) 412-25-33',
  email: 'Anton.Vilenchyk@gmail.com',
};

const FONT = 'Times New Roman';

type RunStyle = { size: number; bold?: boolean; italics?: boolean; underline?: {} };

// Word ignores "\n" inside a run, so every line becomes its own run with a line break.
function textRuns(text: string, style: RunStyle): TextRun[] {
  return text.split(/\r?\n/).map(
    (line, index) =>
      new TextRun({
        ...style,
        text: line,
        font: FONT,
        break: index > 0 ? 1 : undefined,
      })
  );
}

function createFieldParagraph(title: string, value: string, isBoldValue: boolean = false): Paragraph {
  return new Paragraph({
    spacing: { before: 80, after: 60 },
    children: [
      new TextRun({ text: title, bold: true, size: 22, font: FONT }),
      ...textRuns(value, { size: 22, bold: isBoldValue }),
    ],
  });
}

// Standard DOCX Document supporting 028/о, 002/тм, 027/о; labels mirror the on-screen A4 form
export function buildDocxDocument(form028: any, patient: any, formType: string = '028_o'): Document {
  const isTelemed = formType === '002_tm';
  const isExtract = formType === '027_o';

  let mohHeader = 'Форма первинної облікової документації № 028/о\nЗАТВЕРДЖЕНО\nНаказ МОЗ України 14.02.2012 № 110';
  let docTitle = 'КОНСУЛЬТАТИВНИЙ ВИСНОВОК СПЕЦІАЛІСТА';

  if (isTelemed) {
    mohHeader = 'Форма первинної облікової документації № 002/тм\nЗАТВЕРДЖЕНО\nНаказ МОЗ України 19.10.2015 № 681';
    docTitle = 'ВИСНОВОК КОНСУЛЬТАНТА (ТЕЛЕМЕДИЦИНА)';
  } else if (isExtract) {
    mohHeader = 'Форма первинної облікової документації № 027/о\nЗАТВЕРДЖЕНО\nНаказ МОЗ України 14.02.2012 № 110';
    docTitle = 'ВИПИСКА ІЗ МЕДИЧНОЇ КАРТИ АМБУЛАТОРНОГО (СТАЦІОНАРНОГО) ХВОРОГО';
  }

  const paragraphs: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 40 },
      children: textRuns(mohHeader, { size: 16, italics: true }),
    }),

    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 80 },
      children: textRuns(PRACTICE_INFO.practiceName, { size: 24, bold: true }),
    }),

    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 180 },
      children: textRuns(
        `Медична практика: психіатрія, наркологія | ${PRACTICE_INFO.licenseNumber}\nЄДРПОУ/РНОКПП: ${PRACTICE_INFO.taxNumber} | ${PRACTICE_INFO.address}`,
        { size: 18 }
      ),
    }),

    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 140, after: 180 },
      children: textRuns(docTitle, { size: 26, bold: true }),
    }),

    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: textRuns(
        `№ ${form028.documentNumber || '2026/01'} від ${patient?.consultationDate || new Date().toLocaleDateString('uk-UA')}`,
        { size: 22, bold: true }
      ),
    }),
  ];

  if (isExtract) {
    paragraphs.push(
      createFieldParagraph('В (найменування закладу / за місцем вимоги): ', form028.extractRecipient || '', true)
    );
  }

  paragraphs.push(
    createFieldParagraph(
      isExtract ? '1. Прізвище, імʼя, по батькові хворого: ' : '1. Прізвище, імʼя, по батькові пацієнта: ',
      patient?.fullName || form028.patientSection || 'Не вказано',
      true
    )
  );

  paragraphs.push(
    createFieldParagraph('2. Вік / дата народження: ', patient?.age || 'У записі не зазначено (зі слів пацієнта)')
  );

  paragraphs.push(
    createFieldParagraph(
      isExtract ? '3. Період нагляду / лікування: ' : '3. Вид консультації: ',
      isExtract
        ? form028.treatmentPeriod || `Консультація від ${patient?.consultationDate}`
        : isTelemed
        ? 'Телемедичне консультування (відеозвʼязок)'
        : patient?.consultationType || ''
    )
  );

  if (isTelemed) {
    paragraphs.push(createFieldParagraph('Тривалість сеансу: ', form028.telemedDuration || ''));
    paragraphs.push(createFieldParagraph('Засіб звʼязку: ', form028.telemedChannel || ''));
  }

  paragraphs.push(
    createFieldParagraph(isExtract ? '4. Скарги при зверненні: ' : '4. Скарги хворого: ', form028.complaintsSection || '')
  );
  paragraphs.push(
    createFieldParagraph(
      isExtract ? '5. Короткий анамнез та перебіг захворювання (динаміка): ' : '5. Анамнез захворювання: ',
      form028.anamnesisMorbiSection || ''
    )
  );
  paragraphs.push(
    createFieldParagraph('6. Анамнез життя: ', form028.anamnesisVitaeSection || 'У записі не зазначено (зі слів пацієнта)')
  );
  paragraphs.push(
    createFieldParagraph(
      '7. Дані обʼєктивного обстеження (психічний, соматичний статус та психометрія): ',
      form028.objectiveStatusSection || ''
    )
  );
  paragraphs.push(
    createFieldParagraph(
      '8. Дані лабораторних та інструментальних досліджень: ',
      form028.laboratorySection || 'На момент консультації даних не надано.'
    )
  );

  paragraphs.push(
    new Paragraph({
      spacing: { before: 140, after: 80 },
      children: [
        new TextRun({ text: '9. Діагноз (МКХ-10): ', bold: true, size: 22, font: FONT }),
        ...textRuns([form028.diagnosisCode, form028.diagnosisDescription].filter(Boolean).join(' '), {
          size: 22,
          bold: true,
          underline: {},
        }),
      ],
    })
  );

  paragraphs.push(
    createFieldParagraph(
      isExtract ? '10. Лікувальні та трудові рекомендації: ' : '10. Рекомендації: ',
      form028.recommendationsSection || ''
    )
  );
  paragraphs.push(createFieldParagraph('11. Працездатність: ', form028.disabilityNote || ''));
  paragraphs.push(createFieldParagraph('12. Повторна явка / контроль: ', form028.nextAppointmentDate || ''));

  // ONLY circle for M.P. without signature line
  paragraphs.push(
    new Paragraph({
      spacing: { before: 500, after: 100 },
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: 'М. П.      ', bold: true, size: 24, font: FONT })],
    })
  );

  return new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1134,
              right: 850,
              bottom: 1134,
              left: 1417,
            },
          },
        },
        children: paragraphs,
      },
    ],
  });
}
