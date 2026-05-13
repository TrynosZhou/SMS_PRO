import PDFDocument from 'pdfkit';
import sizeOf from 'image-size';
import * as fs from 'fs';
import * as path from 'path';
import { Settings } from '../entities/Settings';
import { getGradeLabelOnly, getPassThresholdPercentForMarkSheet } from './gradeBandsResolve';

type PDFDoc = InstanceType<typeof PDFDocument>;

/** Load School Logo 1 / 2 from settings (data URL, file path, or raw base64). */
function loadLogoBufferFromSettings(logo: string | null | undefined): Buffer | null {
  if (!logo || typeof logo !== 'string') return null;
  const trimmed = logo.trim();
  if (!trimmed) return null;

  try {
    if (trimmed.startsWith('data:image')) {
      const idx = trimmed.indexOf('base64,');
      const base64Data = idx >= 0 ? trimmed.slice(idx + 7) : trimmed.split(',')[1];
      return base64Data ? Buffer.from(base64Data, 'base64') : null;
    }
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return null;
    }
    const normalizedPath = trimmed.replace(/^\//, '');
    const absolutePath = path.join(__dirname, '../../', normalizedPath);
    if (fs.existsSync(absolutePath)) {
      return fs.readFileSync(absolutePath);
    }
    if (trimmed.length > 80 && /^[A-Za-z0-9+/=\s]+$/.test(trimmed.replace(/\s/g, ''))) {
      return Buffer.from(trimmed.replace(/\s/g, ''), 'base64');
    }
  } catch (e) {
    console.error('loadLogoBufferFromSettings:', e);
  }
  return null;
}

/**
 * Draw image inside a box using "contain" scaling (preserve aspect ratio, no stretch).
 * Wide letterhead banners stay sharp; empty margins use the background already drawn.
 */
function addContainImage(
  doc: PDFDoc,
  imageBuffer: Buffer,
  x: number,
  y: number,
  maxW: number,
  maxH: number
): void {
  const dimensions = sizeOf(imageBuffer);
  const iw = dimensions.width || maxW;
  const ih = dimensions.height || maxH;
  const scale = Math.min(maxW / iw, maxH / ih);
  const finalW = iw * scale;
  const finalH = ih * scale;
  const drawX = x + (maxW - finalW) / 2;
  const drawY = y + (maxH - finalH) / 2;
  doc.image(imageBuffer, drawX, drawY, { width: finalW, height: finalH });
}

/** Reference-style palette: dark banner, light blue accents, pink divider */
const RC = {
  bar: '#1e40af',
  banner: '#0f2847',
  lightLine: '#7dd3fc',
  frame: '#38bdf8',
  pink: '#ec4899',
  valueBlue: '#2563eb',
  headerGrey: '#e5e7eb',
  rowAlt: '#eff6ff',
  border: '#cbd5e1',
  label: '#111827',
};

interface ReportCardData {
  student: {
    id: string;
    name: string;
    studentNumber: string;
    class: string;
  };
  exam?: {
    name: string;
    type: string;
    examDate: Date;
  };
  examType?: string;
  exams?: Array<{
    id: string;
    name: string;
    examDate: Date;
  }>;
  subjects: Array<{
    subject: string;
    subjectCode?: string;
    score: number;
    maxScore: number;
    percentage: string;
    classAverage?: number;
    grade?: string;
    comments?: string;
    points?: number;
    /** e.g. "14/23" — class rank in this subject for the report exams */
    subjectPosition?: string;
  }>;
  overallAverage: string;
  overallGrade?: string;
  classPosition: number;
  formPosition?: number;
  totalStudents?: number;
  totalStudentsPerStream?: number;
  totalAttendance?: number;
  presentAttendance?: number;
  totalPoints?: number;
  isUpperForm?: boolean;
  remarks?: {
    classTeacherRemarks?: string | null;
    headmasterRemarks?: string | null;
  };
  generatedAt: Date;
  /** e.g. Term 1 2026 — used in PDF title */
  term?: string;
}

function buildReportCardTitle(reportCard: ReportCardData, settings: Settings | null): string {
  const term = reportCard.term || settings?.activeTerm || settings?.currentTerm || '';
  const raw = (reportCard.examType || reportCard.exam?.type || '').toLowerCase();
  let examLabel = 'Report Card';
  if (raw.includes('mid')) examLabel = 'Mid Term';
  else if (raw.includes('end')) examLabel = 'End Of Term';
  else if (reportCard.examType) {
    examLabel = String(reportCard.examType).replace(/_/g, ' ');
    examLabel = examLabel.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  if (term) return `${examLabel} ${term} Report Card`.replace(/\s+/g, ' ').trim();
  const y = settings?.academicYear;
  if (y) return `${examLabel} ${y} Report Card`;
  return `${examLabel} Report Card`;
}

function countSubjectsPassed(
  subjects: Array<{ percentage?: string; grade?: string }>,
  minPct: number
): number {
  return subjects.filter((s) => {
    const g = String(s.grade || '').toUpperCase();
    if (!g || g === 'N/A') return false;
    const pct = parseFloat(String(s.percentage ?? '0'));
    return Number.isFinite(pct) && pct >= minPct;
  }).length;
}

function truncatePdf(s: string, max: number): string {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function createReportCardPDF(
  reportCard: ReportCardData,
  settings: Settings | null
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0 });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);

      const W = doc.page.width;
      const H = doc.page.height;
      const mOut = 22;
      const barW = 8;
      const innerL = mOut + barW;
      const innerR = W - mOut - barW;
      const innerW = innerR - innerL;
      const minY = mOut;
      const maxY = H - mOut;

      doc.rect(mOut, 0, barW, H).fill(RC.bar);
      doc.rect(W - mOut - barW, 0, barW, H).fill(RC.bar);

      doc.lineWidth(1).strokeColor(RC.frame);
      doc.rect(innerL, minY, innerW, maxY - minY).stroke();

      let y = minY + 4;

      const schoolName = (settings?.schoolName || 'School').trim();
      const schoolAddress = settings?.schoolAddress ? String(settings.schoolAddress).trim() : '';
      const schoolEmail = settings?.schoolEmail ? String(settings.schoolEmail).trim() : '';
      const logoBuffer = loadLogoBufferFromSettings(settings?.schoolLogo ?? null);

      const bannerH = 66;
      doc.rect(innerL, y, innerW, bannerH).fill(RC.banner);

      const bannerPad = 9;
      const rightBand = 86;
      const textW = Math.max(120, innerW - rightBand - bannerPad * 2);

      doc.fillColor('#ffffff').font('Times-Bold').fontSize(11);
      let ty = y + 10;
      doc.text(schoolName.toUpperCase(), innerL + bannerPad, ty, { width: textW });
      ty += 13;
      doc.font('Times-Roman').fontSize(8);
      if (schoolAddress) {
        doc.text(schoolAddress, innerL + bannerPad, ty, { width: textW });
        ty += doc.heightOfString(schoolAddress, { width: textW }) + 3;
      }
      if (schoolEmail) {
        doc.text(`Email: ${schoolEmail}`, innerL + bannerPad, ty, { width: textW });
        ty += 11;
      }

      const logoX = innerR - rightBand + 6;
      const logoY = y + 7;
      if (logoBuffer) {
        try {
          addContainImage(doc, logoBuffer, logoX, logoY, rightBand - 18, 48);
        } catch (e) {
          console.error('PDF logo:', e);
        }
      }
      if (schoolEmail.includes('@')) {
        const domainHint = schoolEmail.split('@')[1] || '';
        if (domainHint) {
          doc.fontSize(6.5).fillColor('#e2e8f0');
          doc.text(`www.${domainHint}`, logoX, y + bannerH - 14, {
            width: rightBand - 12,
            align: 'center',
          });
        }
      }

      y += bannerH;

      doc.lineWidth(2).strokeColor(RC.lightLine);
      doc.moveTo(innerL, y).lineTo(innerR, y).stroke();
      y += 6;

      const titleText = buildReportCardTitle(reportCard, settings);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000');
      doc.text(titleText, innerL, y, { width: innerW, align: 'center' });
      y += 14;

      doc.lineWidth(1).strokeColor(RC.pink);
      doc.moveTo(innerL + 28, y).lineTo(innerR - 28, y).stroke();
      y += 10;

      const passMin = getPassThresholdPercentForMarkSheet(settings);
      const passed = countSubjectsPassed(reportCard.subjects, passMin);
      const totalInClass = reportCard.totalStudents || 0;
      const classPos =
        totalInClass > 0 && reportCard.classPosition
          ? `${reportCard.classPosition} / ${totalInClass}`
          : reportCard.classPosition
            ? String(reportCard.classPosition)
            : '—';
      const streamTotal = reportCard.totalStudentsPerStream || 0;
      const formPos =
        streamTotal > 0 && reportCard.formPosition
          ? `${reportCard.formPosition} / ${streamTotal}`
          : reportCard.formPosition
            ? String(reportCard.formPosition)
            : '';

      const colW = innerW / 3;
      const c1 = innerL + 6;
      const c2 = innerL + colW;
      const c3 = innerL + colW * 2;

      const drawKV = (x: number, yy: number, label: string, value: string) => {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(RC.label);
        doc.text(label, x, yy);
        const lw = doc.widthOfString(label);
        doc.font('Helvetica-Bold').fontSize(8).fillColor(RC.valueBlue);
        doc.text(value || '—', x + lw, yy, { width: colW - lw - 12 });
      };

      drawKV(c1, y, 'Student Number: ', reportCard.student.studentNumber);
      drawKV(c2, y, 'Name: ', reportCard.student.name);
      drawKV(c3, y, 'Class: ', reportCard.student.class);
      y += 14;
      drawKV(c1, y, 'Position in Class: ', classPos);
      drawKV(c2, y, 'Position in Form: ', formPos);
      drawKV(c3, y, 'Subjects Passed: ', String(passed));

      y += 18;
      doc.strokeColor(RC.border).lineWidth(0.5);
      doc.moveTo(innerL + 4, y).lineTo(innerR - 4, y).stroke();
      y += 8;

      const tableLeft = innerL + 4;
      const tableRight = innerR - 4;
      const tw = tableRight - tableLeft;

      const cols = {
        ser: 22,
        subject: 0 as number,
        mark: 34,
        avg: 38,
        pos: 38,
        grade: 30,
        comment: 0 as number,
      };
      const rest = tw - cols.ser - cols.mark - cols.avg - cols.pos - cols.grade;
      cols.subject = Math.max(100, Math.floor(rest * 0.45));
      cols.comment = rest - cols.subject;

      const colKeys = ['ser', 'subject', 'mark', 'avg', 'pos', 'grade', 'comment'] as const;
      const colX = (idx: number): number => {
        let x = tableLeft;
        for (let i = 0; i < idx; i++) x += cols[colKeys[i]];
        return x;
      };

      const headerH = Math.round(16 * 1.2);
      const rowFont = 7;
      const headerTextDy = Math.round((headerH - rowFont) / 2);
      const heads = ['Ser', 'Subject', 'Mark', 'Average', 'Position', 'Grade', "Teacher's Comment"];
      const wids = [cols.ser, cols.subject, cols.mark, cols.avg, cols.pos, cols.grade, cols.comment];

      const drawOuterFrame = () => {
        const pageH = doc.page.height;
        doc.rect(mOut, 0, barW, pageH).fill(RC.bar);
        doc.rect(W - mOut - barW, 0, barW, pageH).fill(RC.bar);
        doc.lineWidth(1).strokeColor(RC.frame);
        doc.rect(innerL, minY, innerW, maxY - minY).stroke();
      };

      const paintSubjectTableHeader = (yy: number): number => {
        doc.rect(tableLeft, yy, tw, headerH).fill(RC.headerGrey);
        doc.font('Helvetica-Bold').fontSize(7).fillColor('#000000');
        heads.forEach((h, i) => {
          doc.text(h, colX(i) + 2, yy + headerTextDy, {
            width: wids[i] - 4,
            align: i === 1 || i === 6 ? 'left' : 'center',
          });
        });
        doc.strokeColor(RC.border).lineWidth(0.35);
        for (let i = 0; i <= 7; i++) {
          doc.moveTo(colX(i), yy).lineTo(colX(i), yy + headerH).stroke();
        }
        doc.moveTo(tableLeft, yy).lineTo(tableRight, yy).stroke();
        doc.moveTo(tableLeft, yy + headerH).lineTo(tableRight, yy + headerH).stroke();
        return yy + headerH;
      };

      y = paintSubjectTableHeader(y);

      const sanitizeNumber = (value: any): number | null => {
        if (value === null || value === undefined) return null;
        const cleaned = typeof value === 'string' ? value.replace(/[^\d.-]/g, '') : value;
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : null;
      };

      const getGradeLocal = (pct: number): string => getGradeLabelOnly(pct, settings);

      const bottomReserve = 118;
      let subjectPageBottom = maxY - bottomReserve;
      const baseRow = Math.round(12 * 1.2);
      const rowTextDy = Math.round((baseRow - rowFont) / 2);

      for (let index = 0; index < reportCard.subjects.length; index++) {
        if (y + baseRow > subjectPageBottom) {
          doc.addPage();
          drawOuterFrame();
          y = minY + 10;
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor(RC.label);
          const contLine = `${reportCard.student.name} — ${buildReportCardTitle(reportCard, settings)} (continued)`;
          doc.text(contLine, innerL + 6, y, { width: innerW - 12 });
          y += 14;
          y = paintSubjectTableHeader(y);
          subjectPageBottom = maxY - 40;
        }
        const subject = reportCard.subjects[index];
        const subjectName = subject?.subject || 'N/A';
        const subjectCode = subject?.subjectCode || '';
        const subjDisplay = truncatePdf((subjectCode ? subjectCode + ' ' : '') + subjectName, 48);
        const scoreVal = sanitizeNumber(subject?.score);
        const pct = sanitizeNumber(subject?.percentage) ?? 0;
        const gradeVal = subject?.grade || getGradeLocal(pct);
        const hasMarks = scoreVal !== null && gradeVal !== 'N/A';
        const markStr = hasMarks ? String(Math.round(scoreVal as number)) : '—';
        const avgStr =
          subject?.classAverage !== undefined && subject.classAverage !== null
            ? String(Math.round(Number(subject.classAverage)))
            : '—';
        const posStr =
          subject?.subjectPosition && String(subject.subjectPosition).trim()
            ? String(subject.subjectPosition).trim()
            : '—';
        let gradeStr = String(gradeVal);
        if (reportCard.isUpperForm && subject?.points !== undefined && subject?.points !== null) {
          gradeStr = gradeStr + ' (' + subject.points + ')';
        }
        const comStr = truncatePdf(subject?.comments || '—', 42);

        const rowH = baseRow;
        const fill = index % 2 === 0 ? '#ffffff' : RC.rowAlt;
        doc.rect(tableLeft, y, tw, rowH).fill(fill);

        doc.font('Helvetica').fontSize(rowFont).fillColor('#000000');
        doc.text(String(index + 1), colX(0) + 2, y + rowTextDy, {
          width: cols.ser - 4,
          align: 'center',
        });
        doc.font('Helvetica').fillColor('#000000').text(subjDisplay, colX(1) + 2, y + rowTextDy, { width: cols.subject - 4 });

        /* Mark, grade, and teacher comment — same bold weight and colour (matches on_SCREEN report table) */
        doc.font('Helvetica-Bold').fillColor('#0f172a').text(markStr, colX(2) + 1, y + rowTextDy, {
          width: cols.mark - 2,
          align: 'center',
        });

        doc.font('Helvetica').fontSize(rowFont).fillColor('#000000').text(avgStr, colX(3) + 1, y + rowTextDy, {
          width: cols.avg - 2,
          align: 'center',
        });
        doc.font('Helvetica').fillColor('#000000').text(posStr, colX(4) + 1, y + rowTextDy, {
          width: cols.pos - 2,
          align: 'center',
        });

        doc.font('Helvetica-Bold').fillColor('#0f172a').text(gradeStr, colX(5) + 1, y + rowTextDy, {
          width: cols.grade - 2,
          align: 'center',
        });

        doc.font('Helvetica-Bold').fillColor('#0f172a').text(comStr, colX(6) + 2, y + rowTextDy, { width: cols.comment - 4 });

        for (let i = 0; i <= 7; i++) {
          doc.moveTo(colX(i), y).lineTo(colX(i), y + rowH).stroke();
        }
        doc.moveTo(tableLeft, y + rowH).lineTo(tableRight, y + rowH).stroke();
        y += rowH;
      }

      const avgRowH = Math.round(14 * 1.2);
      const avgRowFont = 8;
      const avgTextDy = Math.round((avgRowH - avgRowFont) / 2);
      const footerBlockMin = avgRowH + 8 + 24 + 40 + 140;
      if (y + footerBlockMin > maxY) {
        doc.addPage();
        drawOuterFrame();
        y = minY + 10;
      }

      if (y + avgRowH <= maxY - 24) {
        doc.rect(tableLeft, y, tw, avgRowH).fill('#dbeafe');
        doc.font('Helvetica-Bold').fontSize(avgRowFont).fillColor('#000000');
        doc.text('Average Mark', colX(1) + 2, y + avgTextDy, { width: cols.subject + cols.ser - 4 });
        const ov = parseFloat(reportCard.overallAverage);
        const avgTxt = Number.isFinite(ov) ? ov.toFixed(2) : reportCard.overallAverage;
        doc.font('Helvetica-Bold').fillColor('#0f172a').text(avgTxt, colX(2) + 1, y + avgTextDy, {
          width: cols.mark - 2,
          align: 'center',
        });
        for (let i = 0; i <= 7; i++) {
          doc.moveTo(colX(i), y).lineTo(colX(i), y + avgRowH).stroke();
        }
        doc.moveTo(tableLeft, y + avgRowH).lineTo(tableRight, y + avgRowH).stroke();
        y += avgRowH + 8;
      }

      // Space before remarks: 3×8pt + further 5×8pt so results and remarks read clearly apart
      y += 24 + 40;

      /** Stacked remarks block (matches app UI: title + labeled rounded boxes, full width). */
      const remarksX = innerL + 6;
      const remarksW = innerW - 12;
      const remarkRadius = 5;
      const remarkBorderColor = '#d1d5db';
      const remarkPad = 10;
      const remarkFont = 8.5;

      const classTeacherBody =
        (reportCard.remarks?.classTeacherRemarks || '').trim() || '—';
      const headmasterBody =
        (reportCard.remarks?.headmasterRemarks || '').trim() || '—';
      const tRem = truncatePdf(classTeacherBody, 900);
      const hRem = truncatePdf(headmasterBody, 900);

      doc.font('Helvetica-Bold').fontSize(12).fillColor('#000000');
      doc.text('Remarks', remarksX, y);
      y += 16;

      const footerReserve = 40;
      const availableForRemarks = Math.max(80, maxY - y - footerReserve);
      const perBoxContentMax = Math.max(36, Math.min(96, (availableForRemarks - 52) / 2));

      const drawRemarkBlock = (label: string, body: string) => {
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000');
        doc.text(label, remarksX, y);
        y += 11;

        const innerTextW = remarksW - 2 * remarkPad;
        doc.font('Helvetica').fontSize(remarkFont).fillColor('#111827');
        const naturalH = doc.heightOfString(body, { width: innerTextW });
        const contentH = Math.max(28, Math.min(perBoxContentMax, naturalH + 4));
        const boxH = contentH + 2 * remarkPad;

        doc.lineWidth(0.55);
        doc.roundedRect(remarksX, y, remarksW, boxH, remarkRadius);
        doc.fillAndStroke('#ffffff', remarkBorderColor);

        doc.font('Helvetica').fontSize(remarkFont).fillColor('#111827');
        doc.text(body, remarksX + remarkPad, y + remarkPad, {
          width: innerTextW,
          height: contentH,
        });
        y += boxH + 12;
      };

      drawRemarkBlock('Class Teacher Remarks', tRem);
      drawRemarkBlock('Headmaster/Principal Remarks', hRem);

      const headmasterName = settings?.headmasterName || '';
      if (headmasterName) {
        doc.font('Helvetica-Bold').fontSize(7).fillColor('#000000');
        doc.text(headmasterName, remarksX, y, { width: remarksW, align: 'right' });
      }

      y = maxY - 14;
      doc.fontSize(6).font('Helvetica').fillColor('#64748b');
      doc.text(
        `Generated on: ${new Date(reportCard.generatedAt).toLocaleString()}`,
        innerL,
        y,
        { width: innerW, align: 'center' }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

