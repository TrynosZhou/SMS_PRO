import PDFDocument from 'pdfkit';
import * as path from 'path';
import * as fs from 'fs';
import sizeOf from 'image-size';
import { Settings } from '../entities/Settings';
import { getPassThresholdPercentForMarkSheet } from './gradeBandsResolve';

/** Load logo from settings: base64 data URL or file path under project root */
function loadSchoolLogo(logo?: string | null): Buffer | null {
  if (!logo) return null;
  try {
    if (logo.startsWith('data:image')) {
      const base64Data = logo.split(',')[1];
      return base64Data ? Buffer.from(base64Data, 'base64') : null;
    }
    const normalizedPath = String(logo).replace(/^\//, '');
    const absolutePath = path.join(__dirname, '../../', normalizedPath);
    if (fs.existsSync(absolutePath)) {
      return fs.readFileSync(absolutePath);
    }
  } catch (e) {
    console.error('Failed to load school logo for mark sheet PDF:', e);
  }
  return null;
}

function drawLogoInBox(
  doc: InstanceType<typeof PDFDocument>,
  imageBuffer: Buffer,
  startX: number,
  startY: number,
  boxWidth: number,
  boxHeight: number
): void {
  try {
    const dimensions = sizeOf(imageBuffer);
    const imgWidth = dimensions.width || boxWidth;
    const imgHeight = dimensions.height || boxHeight;
    const scale = Math.min(boxWidth / imgWidth, boxHeight / imgHeight);
    const finalWidth = imgWidth * scale;
    const finalHeight = imgHeight * scale;
    const centeredX = startX + (boxWidth - finalWidth) / 2;
    const centeredY = startY + (boxHeight - finalHeight) / 2;
    doc.image(imageBuffer, centeredX, centeredY, { width: finalWidth, height: finalHeight });
  } catch (e) {
    console.error('Failed to draw school logo on mark sheet PDF:', e);
  }
}

function getPassThresholdPercent(settings: Settings | null): number {
  return getPassThresholdPercentForMarkSheet(settings);
}

interface MarkSheetData {
  class: {
    id: string;
    name: string;
    form: string;
  };
  examType: string;
  subjects: Array<{
    id: string;
    name: string;
  }>;
  exams: Array<{
    id: string;
    name: string;
    examDate: Date;
    term: string | null;
  }>;
  markSheet: Array<{
    studentId: string;
    studentNumber: string;
    studentName: string;
    position: number;
    subjects: {
      [subjectId: string]: {
        subjectName: string;
        score: number;
        maxScore: number;
        percentage: number;
      };
    };
    totalScore: number;
    totalMaxScore: number;
    average: number;
  }>;
  generatedAt: Date;
}

export function createMarkSheetPDF(
  markSheetData: MarkSheetData,
  settings: Settings | null
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);

      // School Header
      const schoolName = settings?.schoolName || 'School Management System';
      const schoolAddress = settings?.schoolAddress ? String(settings.schoolAddress).trim() : '';
      const schoolPhone = settings?.schoolPhone ? String(settings.schoolPhone).trim() : '';
      const academicYear = settings?.academicYear || new Date().getFullYear().toString();

      // Logo 1 (schoolLogo) = top-left; second logo or same = top-right — from Settings
      const logoLeftBuf = loadSchoolLogo(settings?.schoolLogo);
      const logoRightBuf = loadSchoolLogo(settings?.schoolLogo2) || logoLeftBuf;

      const headerBarHeight = 80;
      const logoBox = 52;
      const sidePad = 40;
      const textGutter = 10;
      const titleTextLeft = sidePad + logoBox + textGutter;
      const titleTextWidth = doc.page.width - 2 * (sidePad + logoBox + textGutter);

      // Header with blue background
      doc.rect(0, 0, doc.page.width, headerBarHeight)
        .fillColor('#4a90e2')
        .fill();

      const logoY = (headerBarHeight - logoBox) / 2;
      if (logoLeftBuf) {
        drawLogoInBox(doc, logoLeftBuf, sidePad, logoY, logoBox, logoBox);
      }
      if (logoRightBuf) {
        const rightBoxX = doc.page.width - sidePad - logoBox;
        drawLogoInBox(doc, logoRightBuf, rightBoxX, logoY, logoBox, logoBox);
      }

      doc.fontSize(20).font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.text(schoolName, titleTextLeft, 25, { width: titleTextWidth, align: 'center' });

      if (schoolAddress || schoolPhone) {
        doc.fontSize(10).font('Helvetica').fillColor('#E8F4FD');
        const contactLine = [schoolAddress, schoolPhone].filter(Boolean).join(' | ');
        doc.text(contactLine, titleTextLeft, 50, { width: titleTextWidth, align: 'center' });
      }

      // Title Section
      let yPos = 100;
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#000000');
      doc.text('MARK SHEET', 40, yPos, { align: 'center', width: doc.page.width - 80 });
      
      yPos += 25;
      doc.fontSize(12).font('Helvetica');
      doc.text(`Class: ${markSheetData.class.name} (${markSheetData.class.form})`, 40, yPos);
      doc.text(`Exam Type: ${markSheetData.examType.toUpperCase().replace('_', ' ')}`, doc.page.width - 200, yPos);
      
      yPos += 20;
      const generatedDate = new Date(markSheetData.generatedAt);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Generated: ${generatedDate.toLocaleDateString()} ${generatedDate.toLocaleTimeString()}`, 40, yPos);

      // Table Header
      yPos += 30;
      const tableStartY = yPos;
      const rowHeight = 25;
      /** Tall second header row so subject names can be drawn vertically (-90°) */
      const subjectHeaderRowHeight = 92;
      const colWidths = {
        position: 35,
        studentNumber: 70,
        studentName: 120,
        subject: 28,
        total: 60,
        average: 58
      };

      // Narrow columns for marks; vertical labels need less horizontal space
      const availableWidth = doc.page.width - 80 - colWidths.position - colWidths.studentNumber - colWidths.studentName - colWidths.total - colWidths.average;
      const subjectColWidth = Math.max(
        24,
        Math.min(36, availableWidth / Math.max(1, markSheetData.subjects.length))
      );

      const tableLeft = 40;
      const tableRight = doc.page.width - 40;
      const verticalXs: number[] = [tableLeft];
      {
        let x = tableLeft;
        x += colWidths.position;
        verticalXs.push(x);
        x += colWidths.studentNumber;
        verticalXs.push(x);
        x += colWidths.studentName;
        verticalXs.push(x);
        for (let s = 0; s < markSheetData.subjects.length; s++) {
          x += subjectColWidth;
          verticalXs.push(x);
        }
        x += colWidths.total;
        verticalXs.push(x);
        x += colWidths.average;
        verticalXs.push(x);
      }

      const passThreshold = getPassThresholdPercent(settings);
      const nStudents = markSheetData.markSheet.length;
      const subjectPassRates: number[] = markSheetData.subjects.map((subject) => {
        if (nStudents === 0) return 0;
        let passed = 0;
        for (const row of markSheetData.markSheet) {
          const sd = row.subjects[subject.id];
          if (sd && Number(sd.percentage) >= passThreshold) {
            passed++;
          }
        }
        return (passed / nStudents) * 100;
      });
      let classPassedCount = 0;
      for (const row of markSheetData.markSheet) {
        if (Number(row.average) >= passThreshold) {
          classPassedCount++;
        }
      }
      const classPassRate = nStudents > 0 ? (classPassedCount / nStudents) * 100 : 0;
      const meanSubjectPassRate =
        subjectPassRates.length > 0
          ? subjectPassRates.reduce((a, b) => a + b, 0) / subjectPassRates.length
          : 0;

      const horizontalYs: number[] = [yPos];
      let pageBreakInTable = false;

      // Header row 1
      doc.rect(40, yPos, doc.page.width - 80, rowHeight)
        .fillColor('#4a90e2')
        .fill();

      let xPos = 40;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#FFFFFF');
      
      // Position
      doc.text('Pos', xPos + 5, yPos + 8);
      xPos += colWidths.position;
      
      // Student Number
      doc.text('Student No.', xPos + 5, yPos + 8);
      xPos += colWidths.studentNumber;
      
      // Student Name
      doc.text('Student Name', xPos + 5, yPos + 8);
      xPos += colWidths.studentName;
      
      // Subjects header (spans multiple columns)
      doc.text('SUBJECTS', xPos + 5, yPos + 8, { width: subjectColWidth * markSheetData.subjects.length });
      xPos += subjectColWidth * markSheetData.subjects.length;
      
      // Total
      doc.text('Total', xPos + 5, yPos + 8);
      xPos += colWidths.total;
      
      // Average
      doc.text('Avg %', xPos + 5, yPos + 8);

      // Header row 2 - Subject names (rotated -90° so full names fit in narrow columns)
      yPos += rowHeight;
      horizontalYs.push(yPos);
      doc.rect(40, yPos, doc.page.width - 80, subjectHeaderRowHeight)
        .fillColor('#4a90e2')
        .fill();

      xPos = 40;
      xPos += colWidths.position; // Skip position
      xPos += colWidths.studentNumber; // Skip student number
      xPos += colWidths.studentName; // Skip student name

      doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF');
      // Max line length (before -90° rotation) — wraps long names; reads vertically on page
      const labelMaxWidth = subjectHeaderRowHeight - 16;

      for (const subject of markSheetData.subjects) {
        const label = subject.name;
        const centerX = xPos + subjectColWidth / 2;
        const anchorY = yPos + subjectHeaderRowHeight - 8;

        doc.save();
        doc.translate(centerX, anchorY);
        doc.rotate(-90);
        doc.text(label, 0, 0, {
          width: labelMaxWidth,
          align: 'center'
        });
        doc.restore();

        xPos += subjectColWidth;
      }

      yPos += subjectHeaderRowHeight;
      horizontalYs.push(yPos);

      // Table Body (yPos already after tall subject header)
      doc.fontSize(9).font('Helvetica').fillColor('#000000');

      for (let i = 0; i < markSheetData.markSheet.length; i++) {
        const row = markSheetData.markSheet[i];

        // Check if we need a new page before drawing this row
        if (yPos + rowHeight > doc.page.height - 40) {
          doc.addPage();
          yPos = 40;
          pageBreakInTable = true;
        }

        // Alternating row shading (light grey / white)
        if (i % 2 === 0) {
          doc.rect(tableLeft, yPos, tableRight - tableLeft, rowHeight)
            .fillColor('#e8e8e8')
            .fill();
        } else {
          doc.rect(tableLeft, yPos, tableRight - tableLeft, rowHeight)
            .fillColor('#ffffff')
            .fill();
        }

        xPos = tableLeft;

        // Position
        doc.fillColor('#000000');
        doc.text(String(row.position), xPos + 5, yPos + 8);
        xPos += colWidths.position;

        // Student Number
        doc.text(row.studentNumber, xPos + 5, yPos + 8);
        xPos += colWidths.studentNumber;

        // Student Name
        const studentName = row.studentName.length > 18 ? row.studentName.substring(0, 16) + '..' : row.studentName;
        doc.text(studentName, xPos + 5, yPos + 8);
        xPos += colWidths.studentName;

        // Subject marks — score only
        for (const subject of markSheetData.subjects) {
          const subjectData = row.subjects[subject.id];
          if (subjectData) {
            const score = Math.round(Number(subjectData.score)) || 0;
            doc.text(String(score), xPos + 2, yPos + 8, { width: subjectColWidth - 4, align: 'center' });
          } else {
            doc.text('-', xPos + 2, yPos + 8, { width: subjectColWidth - 4, align: 'center' });
          }
          xPos += subjectColWidth;
        }

        // Total — sum of scores only
        doc.font('Helvetica-Bold');
        const totalOnly = Math.round(Number(row.totalScore)) || 0;
        doc.text(String(totalOnly), xPos + 5, yPos + 8);
        xPos += colWidths.total;

        // Average — two decimal places
        const avgNum = Number(row.average);
        doc.text(`${(Number.isFinite(avgNum) ? avgNum : 0).toFixed(2)}%`, xPos + 4, yPos + 8);
        doc.font('Helvetica');

        yPos += rowHeight;
        horizontalYs.push(yPos);
      }

      // Pass rate row (per subject + class)
      if (yPos + rowHeight > doc.page.height - 40) {
        doc.addPage();
        yPos = 40;
        pageBreakInTable = true;
      }

      doc.rect(tableLeft, yPos, tableRight - tableLeft, rowHeight)
        .fillColor('#d8dce0')
        .fill();

      xPos = tableLeft;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#1a1a1a');
      doc.text('', xPos + 5, yPos + 9);
      xPos += colWidths.position;
      doc.text('', xPos + 5, yPos + 9);
      xPos += colWidths.studentNumber;
      doc.text(`Pass rate (≥${passThreshold}%)`, xPos + 4, yPos + 9, {
        width: colWidths.studentName - 8
      });
      xPos += colWidths.studentName;

      doc.fontSize(8).font('Helvetica-Bold').fillColor('#1a1a1a');
      for (let si = 0; si < markSheetData.subjects.length; si++) {
        const pr = subjectPassRates[si];
        doc.text(`${(Number.isFinite(pr) ? pr : 0).toFixed(2)}%`, xPos + 2, yPos + 9, {
          width: subjectColWidth - 4,
          align: 'center'
        });
        xPos += subjectColWidth;
      }

      doc.text(`${classPassRate.toFixed(2)}%`, xPos + 5, yPos + 9, { width: colWidths.total - 8, align: 'center' });
      xPos += colWidths.total;
      doc.text(`${meanSubjectPassRate.toFixed(2)}%`, xPos + 4, yPos + 9, { width: colWidths.average - 8, align: 'center' });
      doc.font('Helvetica').fillColor('#000000');

      yPos += rowHeight;
      horizontalYs.push(yPos);

      // Grey grid lines (horizontal + vertical when table fits on one page)
      const tableGridTop = horizontalYs[0];
      const tableGridBottom = horizontalYs[horizontalYs.length - 1];
      doc.save();
      doc.strokeColor('#a8a8a8').lineWidth(0.55);
      for (let hi = 0; hi < horizontalYs.length; hi++) {
        const hy = horizontalYs[hi];
        doc.moveTo(tableLeft, hy).lineTo(tableRight, hy).stroke();
      }
      if (!pageBreakInTable) {
        for (let vi = 0; vi < verticalXs.length; vi++) {
          const vx = verticalXs[vi];
          doc.moveTo(vx, tableGridTop).lineTo(vx, tableGridBottom).stroke();
        }
      }
      doc.restore();

      // Footer
      const footerY = doc.page.height - 40;
      doc.fontSize(9).font('Helvetica').fillColor('#666666');
      doc.text(`Total Students: ${markSheetData.markSheet.length}`, 40, footerY);
      doc.text(`Exams Included: ${markSheetData.exams.length}`, doc.page.width - 200, footerY);
      doc.text(
        `Pass: ≥ ${passThreshold}% (settings). Subject columns = % passing that subject; Total = class pass (overall avg); Avg = mean of subject pass rates.`,
        40,
        footerY - 14,
        { width: doc.page.width - 80 }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

