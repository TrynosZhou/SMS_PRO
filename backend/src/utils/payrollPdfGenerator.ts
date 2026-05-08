import PDFDocument from 'pdfkit';
import * as path from 'path';
import * as fs from 'fs';
import sizeOf from 'image-size';
import { Settings } from '../entities/Settings';
import { PayrollRunLine } from '../entities/PayrollRunLine';

interface SalaryLine {
  name: string;
  amount: number;
}

export interface PayrollPayslipPDFData {
  settings: Settings | null;
  /** e.g. 2025-03 */
  periodLabel: string;
  /** e.g. March 2025 */
  payPeriodDisplay?: string;
  dateOfJoining?: string | null;
  /** Defaults to calendar days in payroll month if omitted */
  workedDays?: number;
  runLine: PayrollRunLine & {
    designation?: string | null;
  };
  allowances: SalaryLine[];
  deductions: SalaryLine[];
  extraAllowances: number;
  extraDeductions: number;
  /** Leave days accrued as of this payroll period end. */
  leaveAccruedDays?: number;
  /** Leave days taken up to this payroll period end. */
  leaveTakenDays?: number;
  /** Leave balance (accrued - taken, policy-capped where applicable). */
  leaveBalanceDays?: number;
  /** Date used for leave accrual snapshot (yyyy-mm-dd). */
  leaveAsOfDate?: string;
}

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
    // ignore
  }
  return null;
}

/** Logo 1 (schoolLogo) from Settings — top-left */
function addLogoTopLeft(
  doc: InstanceType<typeof PDFDocument>,
  imageBuffer: Buffer,
  startX: number,
  startY: number,
  maxWidth: number,
  maxHeight: number
) {
  const dimensions = sizeOf(imageBuffer);
  const imgWidth = dimensions.width || maxWidth;
  const imgHeight = dimensions.height || maxHeight;
  const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
  const finalWidth = imgWidth * scale;
  const finalHeight = imgHeight * scale;
  doc.image(imageBuffer, startX, startY, { width: finalWidth, height: finalHeight });
}

/** Decimals from TypeORM/PostgreSQL are often strings */
export function money(n: number | string | null | undefined): string {
  if (typeof n === 'number' && Number.isFinite(n)) return n.toFixed(2);
  const v = Number.parseFloat(String(n ?? '').replace(/,/g, ''));
  return Number.isFinite(v) ? v.toFixed(2) : '0.00';
}

function toNum(n: number | string | null | undefined): number {
  if (typeof n === 'number' && Number.isFinite(n)) return n;
  const v = Number.parseFloat(String(n ?? '').replace(/,/g, ''));
  return Number.isFinite(v) ? v : 0;
}

const UNITS = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** Integer 0 .. 999999 to English words (for payslip amount in words) */
function numberToWordsEn(n: number): string {
  const num = Math.floor(Math.abs(n));
  if (num === 0) return 'Zero';

  function hundredsChunk(x: number): string {
    let s = '';
    if (x >= 100) {
      s += UNITS[Math.floor(x / 100)] + ' Hundred';
      x %= 100;
      if (x) s += ' ';
    }
    if (x >= 20) {
      s += TENS[Math.floor(x / 10)];
      if (x % 10) s += ' ' + UNITS[x % 10];
    } else if (x > 0) {
      s += UNITS[x];
    }
    return s.trim();
  }

  let rest = num;
  const parts: string[] = [];
  if (rest >= 1000000) {
    parts.push(hundredsChunk(Math.floor(rest / 1000000)) + ' Million');
    rest %= 1000000;
  }
  if (rest >= 1000) {
    parts.push(hundredsChunk(Math.floor(rest / 1000)) + ' Thousand');
    rest %= 1000;
  }
  if (rest > 0) {
    parts.push(hundredsChunk(rest));
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function netSalaryInWords(net: number): string {
  const fixed = Math.round(toNum(net) * 100) / 100;
  const whole = Math.floor(fixed);
  const cents = Math.round((fixed - whole) * 100);
  let w = numberToWordsEn(whole);
  if (cents > 0) {
    w += ' and ' + numberToWordsEn(cents) + ' Cents';
  }
  return w + ' Only';
}

function drawCenterTitle(
  doc: InstanceType<typeof PDFDocument>,
  text: string,
  y: number,
  fontSize: number,
  pageWidth: number
) {
  doc.fontSize(fontSize).font('Helvetica-Bold').fillColor('#000000');
  const w = doc.widthOfString(text);
  const x = (pageWidth - w) / 2;
  doc.text(text, x, y, { underline: false });
}

export function createPayslipPDF(data: PayrollPayslipPDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const {
        settings,
        periodLabel,
        payPeriodDisplay,
        dateOfJoining,
        workedDays,
        runLine,
        allowances,
        deductions,
        extraAllowances,
        extraDeductions,
        leaveAccruedDays,
        leaveTakenDays,
        leaveBalanceDays,
        leaveAsOfDate,
      } = data;

      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageW = doc.page.width;
      const margin = 40;
      const contentW = pageW - margin * 2;
      const schoolName = settings?.schoolName || 'School Management System';
      const address = settings?.schoolAddress ? String(settings.schoolAddress).trim() : '';
      const currency = settings?.currencySymbol ? String(settings.currencySymbol).trim() : '';
      const currencyPrefix = currency ? `${currency} ` : '';

      // White page
      doc.rect(0, 0, pageW, doc.page.height).fillColor('#FFFFFF').fill();

      let y = margin;

      // Logo 1 — top-left (draw first so title stays readable)
      const logoBuffer = loadSchoolLogo(settings?.schoolLogo);
      const logoW = 64;
      const logoH = 52;
      if (logoBuffer) {
        addLogoTopLeft(doc, logoBuffer, margin, y, logoW, logoH);
      }

      // Centered Payslip title (no underline)
      drawCenterTitle(doc, 'Payslip', y + 8, 20, pageW);
      y += 42;

      // School name + address — centered (no underline)
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000');
      const nameW = doc.widthOfString(schoolName);
      const nameX = (pageW - nameW) / 2;
      doc.text(schoolName, nameX, y, { underline: false });
      y += 28;

      doc.fontSize(10).font('Helvetica').fillColor('#333333');
      if (address) {
        address.split(/\n|,/).forEach((line) => {
          const t = line.trim();
          if (!t) return;
          doc.text(t, margin, y, { width: contentW, align: 'center' });
          y += 14;
        });
      } else {
        y += 4;
      }
      y += 12;

      const periodStr = payPeriodDisplay || periodLabel;
      const joinStr = dateOfJoining || '—';
      const workDaysStr =
        workedDays !== undefined && workedDays !== null ? String(workedDays) : '—';
      const designation = runLine.designation ? String(runLine.designation) : '—';
      const department = runLine.department ? String(runLine.department) : '—';

      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      const colGap = 24;
      const leftColW = (contentW - colGap) / 2;
      const rightX = margin + leftColW + colGap;
      const metaTop = y;

      doc.font('Helvetica-Bold').text('Date of Joining:', margin, metaTop);
      doc.font('Helvetica').text(joinStr, margin + 100, metaTop, { width: leftColW - 100 });

      doc.font('Helvetica-Bold').text('Employee Name:', rightX, metaTop);
      doc.font('Helvetica').text(runLine.employeeName || '—', rightX + 100, metaTop, { width: contentW / 2 - 100 });

      doc.font('Helvetica-Bold').text('Pay Period:', margin, metaTop + 18);
      doc.font('Helvetica').text(periodStr, margin + 100, metaTop + 18, { width: leftColW - 100 });

      doc.font('Helvetica-Bold').text('Designation:', rightX, metaTop + 18);
      doc.font('Helvetica').text(designation, rightX + 100, metaTop + 18, { width: contentW / 2 - 100 });

      doc.font('Helvetica-Bold').text('Worked Days:', margin, metaTop + 36);
      doc.font('Helvetica').text(workDaysStr, margin + 100, metaTop + 36, { width: leftColW - 100 });

      doc.font('Helvetica-Bold').text('Department:', rightX, metaTop + 36);
      doc.font('Helvetica').text(department, rightX + 100, metaTop + 36, { width: contentW / 2 - 100 });

      doc.font('Helvetica-Bold').text('Leave Accrued:', margin, metaTop + 54);
      doc
        .font('Helvetica')
        .text(
          `${money(leaveAccruedDays ?? 0)} days`,
          margin + 100,
          metaTop + 54,
          { width: leftColW - 100 }
        );

      doc.font('Helvetica-Bold').text('Leave Taken:', rightX, metaTop + 54);
      doc
        .font('Helvetica')
        .text(
          `${money(leaveTakenDays ?? 0)} days`,
          rightX + 100,
          metaTop + 54,
          { width: contentW / 2 - 100 }
        );

      doc.font('Helvetica-Bold').text('Leave Balance:', margin, metaTop + 72);
      doc
        .font('Helvetica')
        .text(
          `${money(leaveBalanceDays ?? 0)} days`,
          margin + 100,
          metaTop + 72,
          { width: leftColW - 100 }
        );

      if (leaveAsOfDate) {
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#555555')
          .text(`Leave figures as of ${leaveAsOfDate}`, rightX, metaTop + 74, {
            width: contentW / 2,
            align: 'left',
          });
      }

      y = metaTop + 98;

      // Build table rows
      const basic = toNum(runLine.basicSalary);
      const net = toNum(runLine.netSalary);

      const earningRows: { name: string; amount: number }[] = [{ name: 'Basic Pay', amount: basic }];
      allowances.forEach((a) => earningRows.push({ name: a.name || 'Allowance', amount: toNum(a.amount) }));
      if (toNum(extraAllowances) > 0) {
        earningRows.push({ name: 'Adjustment Allowance', amount: toNum(extraAllowances) });
      }

      const deductionRows: { name: string; amount: number }[] = deductions.map((d) => ({
        name: d.name || 'Deduction',
        amount: toNum(d.amount),
      }));
      if (toNum(extraDeductions) > 0) {
        deductionRows.push({ name: 'Adjustment Deduction', amount: toNum(extraDeductions) });
      }

      const lineRows = Math.max(earningRows.length, deductionRows.length, 1);
      const headerH = 22;
      const rowH = 20;
      const totalRowH = 22;
      const netRowH = 22;
      const tableH = headerH + lineRows * rowH + totalRowH + netRowH;

      const tLeft = margin;
      const c1 = contentW * 0.34;
      const c2 = contentW * 0.16;
      const c3 = contentW * 0.34;
      const c4 = contentW * 0.16;

      // Table frame
      doc.rect(tLeft, y, contentW, tableH).strokeColor('#000000').lineWidth(0.75).stroke();

      // Header row background
      doc.rect(tLeft, y, contentW, headerH).fillColor('#E8E8E8').fill();
      doc.rect(tLeft, y, contentW, headerH).strokeColor('#000000').lineWidth(0.75).stroke();

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000');
      doc.text('Earnings', tLeft + 6, y + 6, { width: c1 - 12 });
      doc.text('Amount', tLeft + c1 + 6, y + 6, { width: c2 - 12, align: 'right' });
      doc.text('Deductions', tLeft + c1 + c2 + 6, y + 6, { width: c3 - 12 });
      doc.text('Amount', tLeft + c1 + c2 + c3 + 6, y + 6, { width: c4 - 12, align: 'right' });

      // Vertical lines header
      const lineY2 = y + tableH;
      doc.moveTo(tLeft + c1, y).lineTo(tLeft + c1, lineY2).strokeColor('#000000').lineWidth(0.5).stroke();
      doc.moveTo(tLeft + c1 + c2, y).lineTo(tLeft + c1 + c2, lineY2).strokeColor('#000000').lineWidth(0.5).stroke();
      doc.moveTo(tLeft + c1 + c2 + c3, y).lineTo(tLeft + c1 + c2 + c3, lineY2).strokeColor('#000000').lineWidth(0.5).stroke();

      doc.moveTo(tLeft, y + headerH).lineTo(tLeft + contentW, y + headerH).strokeColor('#000000').lineWidth(0.5).stroke();

      let ry = y + headerH;
      doc.font('Helvetica').fontSize(9).fillColor('#000000');

      for (let i = 0; i < lineRows; i++) {
        const er = earningRows[i];
        const dr = deductionRows[i];
        const rowTop = ry + 4;
        if (er) {
          doc.text(er.name, tLeft + 6, rowTop, { width: c1 - 12 });
          doc.text(money(er.amount), tLeft + c1 + 6, rowTop, { width: c2 - 12, align: 'right' });
        } else {
          doc.text('—', tLeft + 6, rowTop, { width: c1 - 12 });
          doc.text('—', tLeft + c1 + 6, rowTop, { width: c2 - 12, align: 'right' });
        }
        if (dr) {
          doc.text(dr.name, tLeft + c1 + c2 + 6, rowTop, { width: c3 - 12 });
          doc.text(money(dr.amount), tLeft + c1 + c2 + c3 + 6, rowTop, { width: c4 - 12, align: 'right' });
        } else {
          doc.text('—', tLeft + c1 + c2 + 6, rowTop, { width: c3 - 12 });
          doc.text('—', tLeft + c1 + c2 + c3 + 6, rowTop, { width: c4 - 12, align: 'right' });
        }
        ry += rowH;
        doc.moveTo(tLeft, ry).lineTo(tLeft + contentW, ry).strokeColor('#cccccc').lineWidth(0.35).stroke();
      }

      const totalEarningsAmount = earningRows.reduce((s, r) => s + r.amount, 0);
      const totalDeductionsAmount = deductionRows.reduce((s, r) => s + r.amount, 0);

      // Totals row
      doc.moveTo(tLeft, ry).lineTo(tLeft + contentW, ry).strokeColor('#000000').lineWidth(0.5).stroke();
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Total Earnings', tLeft + 6, ry + 5, { width: c1 - 12 });
      doc.text(money(totalEarningsAmount), tLeft + c1 + 6, ry + 5, { width: c2 - 12, align: 'right' });
      doc.text('Total Deductions', tLeft + c1 + c2 + 6, ry + 5, { width: c3 - 12 });
      doc.text(money(totalDeductionsAmount), tLeft + c1 + c2 + c3 + 6, ry + 5, { width: c4 - 12, align: 'right' });
      ry += totalRowH;

      doc.moveTo(tLeft, ry).lineTo(tLeft + contentW, ry).strokeColor('#000000').lineWidth(0.5).stroke();
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text('Net Pay', tLeft + c1 + c2 + 6, ry + 5, { width: c3 - 12 });
      doc.text(`${currencyPrefix}${money(net)}`, tLeft + c1 + c2 + c3 + 6, ry + 5, { width: c4 - 12, align: 'right' });
      ry += netRowH;

      // Amount in words (centered)
      const wordsY = ry + 16;
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000');
      doc.text(`${currencyPrefix}${money(net)}`, margin, wordsY, { width: contentW, align: 'center' });
      doc.fontSize(10).font('Helvetica').fillColor('#333333');
      doc.text(netSalaryInWords(net), margin, wordsY + 18, { width: contentW, align: 'center' });

      // Signatures
      const sigY = doc.page.height - 100;
      doc.fontSize(9).font('Helvetica').fillColor('#000000');
      doc.text('Employer Signature', margin, sigY);
      doc.moveTo(margin, sigY + 36).lineTo(margin + 180, sigY + 36).strokeColor('#000000').lineWidth(0.75).stroke();

      const sigRightX = pageW - margin - 180;
      doc.text('Employee Signature', sigRightX, sigY);
      doc.moveTo(sigRightX, sigY + 36).lineTo(sigRightX + 180, sigY + 36).strokeColor('#000000').lineWidth(0.75).stroke();

      doc.fontSize(8).font('Helvetica').fillColor('#888888');
      doc.text('This payslip is system generated.', margin, doc.page.height - 36, { width: contentW, align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
