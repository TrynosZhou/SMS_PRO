import PDFDocument from 'pdfkit';
import { Invoice } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';
import { parseAmount } from './numberUtils';
import { resolveInvoiceRemainingBalance } from './invoiceBalanceResolve';
import { resolveTuitionFees, isBoarderStudent } from './feesSettingsResolve';
import { drawSchoolLogoInBox, loadPrimarySchoolLogoBuffer } from './schoolLogoPdf';
import { CompactLayout, invoiceLayout, PDF_PAGE, s } from './pdfPageFit';
import {
  shouldIncludeFeeForTermPeriod,
  type TermPeriodType,
} from './termPeriodType';
import {
  formatTuitionLineDescription,
  isTuitionFeeLabel,
} from './tuitionLineDescription';
import { inferStudentFeeLevelBand } from './managedFeesBilling';

interface InvoicePDFData {
  invoice: Invoice;
  student: Student;
  settings: Settings | null;
  termPeriodType?: TermPeriodType;
}

interface InvoiceTableRow {
  label: string;
  amount: number;
  fill?: string;
  textColor?: string;
}

function hasBankingDetails(settings: Settings | null): boolean {
  const b = settings?.bankingDetails;
  if (!b || typeof b !== 'object') return false;
  return !!(
    String(b.accountName || '').trim() ||
    String(b.bank || '').trim() ||
    String(b.branch || '').trim() ||
    String(b.accountNumber || '').trim()
  );
}

function collectInvoiceTableRows(
  invoice: Invoice,
  student: Student,
  settings: Settings | null,
  termPeriodType?: TermPeriodType
): {
  rows: InvoiceTableRow[];
  previousBalance: number;
  displayedFeesTotal: number;
  uniformTotal: number;
  finalTotal: number;
} {
  const rows: InvoiceTableRow[] = [];
  const invoiceAmount = parseAmount(invoice.amount);
  const previousBalance = parseAmount(invoice.previousBalance);
  const prepaidAmount = parseAmount(invoice.prepaidAmount);
  const uniformTotal = parseAmount((invoice as any).uniformTotal);
  const baseAmount = parseFloat((invoiceAmount - uniformTotal).toFixed(2));

  if (previousBalance > 0) {
    rows.push({ label: 'Previous Balance (Outstanding Fees)', amount: previousBalance });
  }

  let displayedFeesTotal = 0;
  const storedFeeLines = (invoice as any).feeLineItems;
  if (Array.isArray(storedFeeLines) && storedFeeLines.length > 0) {
    const termLabel = String(invoice.term || '').trim();
    const levelBand = inferStudentFeeLevelBand(
      (student as any).classEntity ?? undefined
    );

    for (const row of storedFeeLines) {
      const amt = parseAmount((row as any).amount);
      let desc = String((row as any).description || 'Fee').trim() || 'Fee';
      if (isTuitionFeeLabel(desc) && termLabel) {
        desc = formatTuitionLineDescription(levelBand, termLabel);
      }
      if (!shouldIncludeFeeForTermPeriod(desc, termPeriodType)) continue;
      if (amt > 0.001) {
        rows.push({ label: desc, amount: amt, fill: '#F8F9FA' });
        displayedFeesTotal += amt;
      }
    }
  } else {
    const feesSettings = settings?.feesSettings || {};
    const { dayScholar: dayScholarTuitionFee, boarder: boarderTuitionFee } =
      resolveTuitionFees(feesSettings);
    const registrationFee = parseAmount(feesSettings.registrationFee);
    const deskFee = parseAmount(feesSettings.deskFee);
    const transportCost = parseAmount(feesSettings.transportCost);
    const diningHallCost = parseAmount(feesSettings.diningHallCost);
    const libraryFee = parseAmount(feesSettings.libraryFee);
    const sportsFee = parseAmount(feesSettings.sportsFee);
    const otherFees = feesSettings.otherFees || [];
    const otherFeesTotal = otherFees.reduce(
      (sum: number, fee: any) => sum + parseAmount(fee?.amount),
      0
    );

    let tuitionFee = 0;
    if (!student.isStaffChild) {
      tuitionFee = isBoarderStudent(student.studentType)
        ? boarderTuitionFee
        : dayScholarTuitionFee;
    }

    let transportFee = 0;
    if (!isBoarderStudent(student.studentType) && student.usesTransport && !student.isStaffChild) {
      transportFee = transportCost;
    }

    let diningHallFee = 0;
    if (student.usesDiningHall) {
      diningHallFee = student.isStaffChild ? diningHallCost * 0.5 : diningHallCost;
    }

    if (registrationFee > 0 && !student.isStaffChild) {
      const feesWithoutReg =
        tuitionFee +
        transportFee +
        diningHallFee +
        deskFee +
        (student.isStaffChild ? 0 : libraryFee + sportsFee + otherFeesTotal);
      const expectedWithReg = feesWithoutReg + registrationFee;
      if (Math.abs(baseAmount - expectedWithReg) <= Math.abs(baseAmount - feesWithoutReg) + 1) {
        rows.push({ label: 'Registration Fee', amount: registrationFee, fill: '#F8F9FA' });
        displayedFeesTotal += registrationFee;
      }
    }

    if (!student.isStaffChild) {
      const tuitionLabel = isBoarderStudent(student.studentType)
        ? 'Tuition Fee (Boarder)'
        : 'Tuition Fee (Day Scholar)';
      const tuitionToDisplay =
        tuitionFee > 0
          ? tuitionFee
          : isBoarderStudent(student.studentType)
            ? boarderTuitionFee
            : dayScholarTuitionFee;
      if (tuitionToDisplay > 0) {
        rows.push({ label: tuitionLabel, amount: tuitionToDisplay, fill: '#F8F9FA' });
        displayedFeesTotal += tuitionToDisplay;
      }
    }

    if (deskFee > 0 && !student.isStaffChild) {
      const feesWithoutDesk =
        tuitionFee +
        transportFee +
        diningHallFee +
        (student.isStaffChild ? 0 : libraryFee + sportsFee + otherFeesTotal);
      const expectedWithDesk = feesWithoutDesk + deskFee;
      if (Math.abs(baseAmount - expectedWithDesk) <= Math.abs(baseAmount - feesWithoutDesk) + 1) {
        rows.push({ label: 'Desk Fee', amount: deskFee, fill: '#F8F9FA' });
        displayedFeesTotal += deskFee;
      }
    }

    if (!isBoarderStudent(student.studentType) && student.usesTransport && !student.isStaffChild) {
      const transportToDisplay = transportFee > 0 ? transportFee : transportCost;
      if (transportToDisplay > 0) {
        rows.push({ label: 'Transport Fee', amount: transportToDisplay, fill: '#F8F9FA' });
        displayedFeesTotal += transportToDisplay;
      }
    }

    if (student.usesDiningHall) {
      const dhToDisplay =
        diningHallFee > 0
          ? diningHallFee
          : student.isStaffChild
            ? diningHallCost * 0.5
            : diningHallCost;
      if (dhToDisplay > 0) {
        const dhLabel = student.isStaffChild
          ? 'Dining Hall (DH) Fee (50% - Staff Child)'
          : 'Dining Hall (DH) Fee';
        rows.push({ label: dhLabel, amount: dhToDisplay, fill: '#F8F9FA' });
        displayedFeesTotal += dhToDisplay;
      }
    }

    if (!student.isStaffChild) {
      if (libraryFee > 0) {
        rows.push({ label: 'Library Fee', amount: libraryFee, fill: '#F8F9FA' });
        displayedFeesTotal += libraryFee;
      }
      if (sportsFee > 0) {
        rows.push({ label: 'Sports Fee', amount: sportsFee, fill: '#F8F9FA' });
        displayedFeesTotal += sportsFee;
      }
      if (otherFeesTotal > 0) {
        otherFees.forEach((fee: any) => {
          const feeAmount = parseAmount(fee.amount);
          if (feeAmount > 0) {
            rows.push({ label: fee.name || 'Other Fee', amount: feeAmount, fill: '#F8F9FA' });
            displayedFeesTotal += feeAmount;
          }
        });
      }
    }
  }

  if (displayedFeesTotal < 0.01 && baseAmount > 0.01) {
    rows.push({
      label: (invoice.description && String(invoice.description).trim()) || 'Fees for term',
      amount: baseAmount,
      fill: '#F8F9FA',
    });
    displayedFeesTotal += baseAmount;
  }

  const remainingAmount = baseAmount - displayedFeesTotal;
  if (remainingAmount > 0.01) {
    rows.push({ label: 'Additional Fees', amount: remainingAmount, fill: '#F8F9FA' });
    displayedFeesTotal += remainingAmount;
  }

  const uniformItemsList = Array.isArray((invoice as any).uniformItems)
    ? (invoice as any).uniformItems
    : [];
  if (uniformItemsList.length > 0) {
    for (const ui of uniformItemsList) {
      const qty = Number(ui.quantity) || 1;
      rows.push({
        label: `${ui.itemName || 'Uniform item'} (×${qty})`,
        amount: parseAmount(ui.lineTotal),
        fill: '#FFF7ED',
        textColor: '#9A3412',
      });
    }
    rows.push({
      label: 'School Uniform Subtotal',
      amount: uniformTotal,
      fill: '#FFE8CC',
      textColor: '#C05621',
    });
  } else if (uniformTotal > 0) {
    rows.push({
      label: 'School Uniform Subtotal',
      amount: uniformTotal,
      fill: '#FFE8CC',
      textColor: '#C05621',
    });
  }

  const totalInvoiceAmount = previousBalance + displayedFeesTotal + uniformTotal;
  const appliedPrepaidAmount = Math.min(prepaidAmount, totalInvoiceAmount);
  const finalTotal = totalInvoiceAmount - appliedPrepaidAmount;

  return { rows, previousBalance, displayedFeesTotal, uniformTotal, finalTotal };
}

function drawBankingDetailsSection(
  doc: InstanceType<typeof PDFDocument>,
  settings: Settings | null,
  topY: number,
  layout: CompactLayout
): number {
  const b = settings?.bankingDetails;
  if (!b || !hasBankingDetails(settings)) {
    return topY;
  }

  const labelX = layout.margin + 10;
  const valueX = layout.margin + 140;
  const lineGap = s(11, layout.scale);
  const hintText =
    'Please use the student name and invoice number as your payment reference where possible.';

  const rows: Array<[string, string]> = [
    ['Account Name:', String(b.accountName || '').trim() || '—'],
    ['Bank:', String(b.bank || '').trim() || '—'],
    ['Branch:', String(b.branch || '').trim() || '—'],
    ['Account Number:', String(b.accountNumber || '').trim() || '—'],
  ];

  doc.fontSize(s(7, layout.scale)).font('Helvetica');
  const hintHeight = doc.heightOfString(hintText, { width: PDF_PAGE.width - layout.margin * 2 - 20 });
  const boxWidth = PDF_PAGE.width - layout.margin * 2;
  const boxHeight = s(24, layout.scale) + rows.length * lineGap + hintHeight + s(10, layout.scale);

  const yPos = topY;

  doc.rect(layout.margin, yPos, boxWidth, boxHeight)
    .fillColor('#F8FAFC')
    .fill()
    .strokeColor('#4A90E2')
    .lineWidth(1)
    .stroke();

  doc.fontSize(s(9, layout.scale)).font('Helvetica-Bold').fillColor('#003366');
  doc.text('Banking Details — Fee Deposits', labelX, yPos + s(6, layout.scale));

  doc.strokeColor('#DEE2E6').lineWidth(0.5);
  doc.moveTo(labelX, yPos + s(18, layout.scale)).lineTo(layout.margin + boxWidth - 10, yPos + s(18, layout.scale)).stroke();

  let lineY = yPos + s(24, layout.scale);
  doc.fontSize(s(7.5, layout.scale)).font('Helvetica-Bold').fillColor('#2C3E50');
  for (const [label, value] of rows) {
    doc.text(label, labelX, lineY);
    doc.font('Helvetica').fillColor('#000000');
    doc.text(value, valueX, lineY, { width: boxWidth - 160 });
    doc.font('Helvetica-Bold').fillColor('#2C3E50');
    lineY += lineGap;
  }

  doc.fontSize(s(7, layout.scale)).font('Helvetica').fillColor('#666666');
  doc.text(hintText, labelX, lineY + s(4, layout.scale), { width: boxWidth - 20 });

  return yPos + boxHeight;
}

export function createInvoicePDF(data: InvoicePDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const { invoice, student, settings, termPeriodType } = data;
      const paidAmount = parseAmount(invoice.paidAmount);
      const prepaidAmount = parseAmount(invoice.prepaidAmount);
      const balance = resolveInvoiceRemainingBalance(invoice);
      const hasPaymentBox = paidAmount > 0 || prepaidAmount > 0;
      const hasBanking = hasBankingDetails(settings);

      const { rows, finalTotal } = collectInvoiceTableRows(
        invoice,
        student,
        settings,
        termPeriodType
      );
      const layout = invoiceLayout(rows.length, { hasPaymentBox, hasBanking });

      const doc = new PDFDocument({
        margin: layout.margin,
        size: 'A4',
        autoFirstPage: true,
      });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const currencySymbol = settings?.currencySymbol || '$';
      const schoolName = settings?.schoolName || 'School Management System';
      const schoolAddress = settings?.schoolAddress ? String(settings.schoolAddress).trim() : '';
      const schoolPhone = settings?.schoolPhone || '';
      const schoolEmail = settings?.schoolEmail || '';

      const contentRight = PDF_PAGE.width - layout.margin;
      const contentWidth = contentRight - layout.margin;

      let yPos = layout.margin;

      const logoBoxX = layout.margin;
      const logoBoxY = yPos;
      const logoBuffer = loadPrimarySchoolLogoBuffer(settings);
      const logoDrawn = logoBuffer
        ? drawSchoolLogoInBox(doc, logoBuffer, logoBoxX, logoBoxY, layout.logoSize, layout.logoSize)
        : false;

      const textStartX = logoDrawn ? layout.margin + layout.logoSize + 12 : layout.margin;
      doc.fontSize(s(14, layout.scale)).font('Helvetica-Bold').text(schoolName, textStartX, yPos);
      yPos += s(16, layout.scale);

      doc.fontSize(layout.bodySize).font('Helvetica');
      if (schoolAddress) {
        doc.text(schoolAddress, textStartX, yPos, { width: contentWidth - (textStartX - layout.margin) });
        yPos += s(11, layout.scale);
      }
      if (schoolPhone) {
        doc.text(`Phone: ${schoolPhone}`, textStartX, yPos);
        yPos += s(11, layout.scale);
      }
      if (schoolEmail) {
        doc.text(`Email: ${schoolEmail}`, textStartX, yPos);
        yPos += s(11, layout.scale);
      }
      if (logoDrawn) {
        yPos = Math.max(yPos, logoBoxY + layout.logoSize + 4);
      }

      yPos += layout.gap;
      doc.strokeColor('#CCCCCC').lineWidth(0.75);
      doc.moveTo(layout.margin, yPos).lineTo(contentRight, yPos).stroke();
      yPos += layout.gap;

      doc.fontSize(layout.titleSize).font('Helvetica-Bold').fillColor('#003366');
      doc.text('INVOICE STATEMENT', layout.margin, yPos, { align: 'center', width: contentWidth });
      yPos += s(20, layout.scale);

      const detailsBoxHeight = s(88, layout.scale);
      doc.rect(layout.margin, yPos, contentWidth, detailsBoxHeight)
        .fillColor('#F8F9FA')
        .fill()
        .strokeColor('#4A90E2')
        .lineWidth(1.5)
        .stroke();

      const dividerX = layout.margin + contentWidth * 0.5;
      doc.strokeColor('#DEE2E6').lineWidth(0.5);
      doc
        .moveTo(dividerX, yPos + 4)
        .lineTo(dividerX, yPos + detailsBoxHeight - 4)
        .stroke();

      const col1 = layout.margin + 10;
      const col2 = dividerX + 10;
      const lineStep = s(13, layout.scale);
      let dy = yPos + s(8, layout.scale);

      doc.fontSize(layout.bodySize).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Invoice Number:', col1, dy);
      doc.font('Helvetica').fillColor('#000000');
      doc.text(invoice.invoiceNumber, col1, dy + lineStep);
      dy += lineStep * 2;

      doc.font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Invoice Date:', col1, dy);
      doc.font('Helvetica').fillColor('#000000');
      doc.text(new Date(invoice.createdAt).toLocaleDateString(), col1, dy + lineStep);
      dy += lineStep * 2;

      doc.font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Due Date:', col1, dy);
      doc.font('Helvetica').fillColor('#000000');
      doc.text(new Date(invoice.dueDate).toLocaleDateString(), col1, dy + lineStep);

      dy = yPos + s(8, layout.scale);
      doc.font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Bill To:', col2, dy);
      doc.font('Helvetica').fillColor('#000000');
      doc.text(`${student.firstName} ${student.lastName}`, col2, dy + lineStep);
      doc.text(`Student Number: ${student.studentNumber}`, col2, dy + lineStep * 2);
      let studentLine = 3;
      if (student.classEntity) {
        doc.text(`Class: ${student.classEntity.name}`, col2, dy + lineStep * studentLine);
        studentLine++;
      }
      doc.text(`Term: ${invoice.term}`, col2, dy + lineStep * studentLine);

      yPos += detailsBoxHeight + layout.gap;
      doc.strokeColor('#CCCCCC').lineWidth(0.75);
      doc.moveTo(layout.margin, yPos).lineTo(contentRight, yPos).stroke();
      yPos += layout.gap;

      doc.fontSize(layout.sectionTitleSize).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Invoice Details', layout.margin, yPos);
      yPos += s(16, layout.scale);

      const tableStartX = layout.margin;
      const tableEndX = contentRight;
      const tableWidth = contentWidth;
      const amountColumnWidth = s(95, layout.scale);
      const amountColumnStartX = tableEndX - amountColumnWidth;
      const rowHeight = layout.rowHeight;

      doc.rect(tableStartX, yPos, tableWidth, rowHeight)
        .fillColor('#4A90E2')
        .fill()
        .strokeColor('#003366')
        .lineWidth(1)
        .stroke();
      doc.strokeColor('#FFFFFF').lineWidth(0.5);
      doc.moveTo(amountColumnStartX, yPos + 1).lineTo(amountColumnStartX, yPos + rowHeight - 1).stroke();
      doc.fontSize(layout.tableHeaderSize).font('Helvetica-Bold').fillColor('#FFFFFF');
      const headerTextY = yPos + (rowHeight - layout.tableHeaderSize) / 2 - 1;
      doc.text('Description', tableStartX + 6, headerTextY);
      doc.text('Amount', amountColumnStartX, headerTextY, {
        align: 'right',
        width: amountColumnWidth - 6,
      });
      yPos += rowHeight;

      const renderTableRow = (row: InvoiceTableRow) => {
        doc.rect(tableStartX, yPos, tableWidth, rowHeight)
          .fillColor(row.fill || '#FFFFFF')
          .fill()
          .strokeColor('#CCCCCC')
          .lineWidth(0.5)
          .stroke();
        doc.strokeColor('#E0E0E0').lineWidth(0.5);
        doc.moveTo(amountColumnStartX, yPos + 1).lineTo(amountColumnStartX, yPos + rowHeight - 1).stroke();
        doc.fontSize(layout.tableRowSize).font('Helvetica').fillColor(row.textColor || '#000000');
        const textY = yPos + (rowHeight - layout.tableRowSize) / 2 - 1;
        const maxDescriptionWidth = amountColumnStartX - tableStartX - 12;
        doc.text(row.label, tableStartX + 6, textY, { width: maxDescriptionWidth, ellipsis: true });
        doc.text(`${currencySymbol} ${row.amount.toFixed(2)}`, amountColumnStartX, textY, {
          align: 'right',
          width: amountColumnWidth - 6,
        });
        yPos += rowHeight;
      };

      for (const row of rows) {
        renderTableRow(row);
      }

      yPos += s(4, layout.scale);
      doc.strokeColor('#4A90E2').lineWidth(1);
      doc.moveTo(tableStartX, yPos).lineTo(tableEndX, yPos).stroke();
      yPos += s(3, layout.scale);

      const totalRowH = rowHeight + s(2, layout.scale);
      doc.rect(tableStartX, yPos, tableWidth, totalRowH)
        .fillColor('#E8F4F8')
        .fill()
        .strokeColor('#4A90E2')
        .lineWidth(1.5)
        .stroke();
      doc.strokeColor('#4A90E2').lineWidth(0.75);
      doc.moveTo(amountColumnStartX, yPos + 1).lineTo(amountColumnStartX, yPos + totalRowH - 1).stroke();
      doc.fontSize(s(10, layout.scale)).font('Helvetica-Bold').fillColor('#003366');
      const totalTextY = yPos + (totalRowH - s(10, layout.scale)) / 2 - 1;
      doc.text('Total Amount Due', tableStartX + 6, totalTextY);
      doc.text(`${currencySymbol} ${finalTotal.toFixed(2)}`, amountColumnStartX, totalTextY, {
        align: 'right',
        width: amountColumnWidth - 6,
      });
      yPos += totalRowH + layout.gap;

      if (hasPaymentBox) {
        const paymentBoxHeight = s(48, layout.scale) + (prepaidAmount > 0 ? s(11, layout.scale) : 0);
        doc.rect(layout.margin, yPos, contentWidth, paymentBoxHeight)
          .fillColor('#F0F8FF')
          .fill()
          .strokeColor('#4A90E2')
          .lineWidth(1)
          .stroke();
        doc.fontSize(s(9, layout.scale)).font('Helvetica-Bold').fillColor('#2C3E50');
        doc.text('Payment Information', layout.margin + 10, yPos + s(6, layout.scale));
        doc.strokeColor('#D0E0F0').lineWidth(0.5);
        doc
          .moveTo(layout.margin + 10, yPos + s(18, layout.scale))
          .lineTo(contentRight - 10, yPos + s(18, layout.scale))
          .stroke();
        let infoY = yPos + s(24, layout.scale);
        doc.fontSize(layout.bodySize).font('Helvetica').fillColor('#000000');
        if (paidAmount > 0) {
          doc.text(`Amount Paid: ${currencySymbol} ${paidAmount.toFixed(2)}`, layout.margin + 10, infoY);
          infoY += s(11, layout.scale);
        }
        if (prepaidAmount > 0) {
          doc.font('Helvetica-Bold').fillColor('#1976D2');
          doc.text(
            `Prepaid Amount (for future terms): ${currencySymbol} ${prepaidAmount.toFixed(2)}`,
            layout.margin + 10,
            infoY
          );
          infoY += s(11, layout.scale);
        }
        doc.font('Helvetica').fillColor('#000000');
        doc.text(`Remaining Balance: ${currencySymbol} ${balance.toFixed(2)}`, layout.margin + 10, infoY);
        yPos += paymentBoxHeight + layout.gap;
      }

      const statusBoxH = s(22, layout.scale);
      doc.rect(layout.margin, yPos, contentWidth, statusBoxH)
        .fillColor('#FFFFFF')
        .fill()
        .strokeColor('#DEE2E6')
        .lineWidth(0.75)
        .stroke();
      doc.fontSize(s(9, layout.scale)).font('Helvetica-Bold').fillColor('#2C3E50');
      const statusTextY = yPos + (statusBoxH - s(9, layout.scale)) / 2 - 1;
      doc.text('Status:', layout.margin + 10, statusTextY);
      doc.font('Helvetica').fillColor('#000000');
      const statusText = invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1);
      doc.text(statusText, layout.margin + 55, statusTextY);
      yPos += statusBoxH;

      const footerY = PDF_PAGE.height - layout.margin - s(12, layout.scale);
      if (hasBanking) {
        const estimatedBanking = s(98, layout.scale);
        const bankingTop = footerY - estimatedBanking - layout.gap;
        drawBankingDetailsSection(doc, settings, bankingTop, layout);
      }

      doc.strokeColor('#CCCCCC').lineWidth(0.5);
      doc.moveTo(layout.margin, footerY).lineTo(contentRight, footerY).stroke();
      doc.fontSize(s(7, layout.scale)).font('Helvetica').fillColor('#666666');
      doc.text(`Generated on: ${new Date().toLocaleString()}`, layout.margin, footerY + s(4, layout.scale), {
        align: 'center',
        width: contentWidth,
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
