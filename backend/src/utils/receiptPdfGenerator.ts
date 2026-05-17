import PDFDocument from 'pdfkit';
import { Invoice } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';
import { drawSchoolLogoInBox, loadPrimarySchoolLogoBuffer } from './schoolLogoPdf';
import { PDF_PAGE, receiptLayout, s } from './pdfPageFit';

interface ReceiptPDFData {
  invoice: Invoice;
  student: Student;
  settings: Settings | null;
  paymentAmount: number;
  paymentDate: Date;
  paymentMethod?: string;
  notes?: string;
  receiptNumber: string;
  isPrepayment?: boolean;
}

export function createReceiptPDF(data: ReceiptPDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const {
        invoice,
        student,
        settings,
        paymentAmount,
        paymentDate,
        paymentMethod,
        notes,
        receiptNumber,
        isPrepayment,
      } = data;

      const layout = receiptLayout({
        hasNotes: !!notes,
        isPrepayment: !!isPrepayment,
      });

      const doc = new PDFDocument({ margin: layout.margin, size: 'A4' });
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

      doc.fontSize(layout.titleSize).font('Helvetica-Bold').fillColor('#28A745');
      doc.text('PAYMENT RECEIPT', layout.margin, yPos, { align: 'center', width: contentWidth });
      yPos += s(20, layout.scale);

      const detailsBoxHeight = s(88, layout.scale);
      doc.rect(layout.margin, yPos, contentWidth, detailsBoxHeight)
        .fillColor('#F8F9FA')
        .fill()
        .strokeColor('#28A745')
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
      doc.text('Receipt Number:', col1, dy);
      doc.font('Helvetica').fillColor('#000000');
      doc.text(receiptNumber, col1, dy + lineStep);
      dy += lineStep * 2;

      doc.font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Payment Date:', col1, dy);
      doc.font('Helvetica').fillColor('#000000');
      doc.text(paymentDate.toLocaleDateString(), col1, dy + lineStep);
      dy += lineStep * 2;

      doc.font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Invoice Number:', col1, dy);
      doc.font('Helvetica').fillColor('#000000');
      doc.text(invoice.invoiceNumber, col1, dy + lineStep);

      dy = yPos + s(8, layout.scale);
      doc.font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Received From:', col2, dy);
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
      doc.text('Payment Details', layout.margin, yPos);
      yPos += s(16, layout.scale);

      const tableStartX = layout.margin;
      const tableEndX = contentRight;
      const tableWidth = contentWidth;
      const amountColumnWidth = s(120, layout.scale);
      const amountColumnStartX = tableEndX - amountColumnWidth;
      const rowHeight = layout.rowHeight;
      const paymentAmountNum = parseFloat(String(paymentAmount || 0));

      const drawPaymentRow = (
        label: string,
        value: string,
        opts: { fill: string; stroke: string; labelColor?: string; valueColor?: string; valueSize?: number }
      ) => {
        doc.rect(tableStartX, yPos, tableWidth, rowHeight)
          .fillColor(opts.fill)
          .fill()
          .strokeColor(opts.stroke)
          .lineWidth(0.75)
          .stroke();
        doc.strokeColor('#E0E0E0').lineWidth(0.5);
        doc.moveTo(amountColumnStartX, yPos + 1).lineTo(amountColumnStartX, yPos + rowHeight - 1).stroke();
        const textY = yPos + (rowHeight - layout.tableRowSize) / 2 - 1;
        doc.fontSize(layout.tableRowSize).font('Helvetica-Bold').fillColor(opts.labelColor || '#000000');
        doc.text(label, tableStartX + 6, textY);
        doc.fontSize(opts.valueSize || s(10, layout.scale)).font('Helvetica-Bold').fillColor(opts.valueColor || '#000000');
        doc.text(value, amountColumnStartX, textY, { align: 'right', width: amountColumnWidth - 6 });
        yPos += rowHeight;
      };

      drawPaymentRow('Amount Paid', `${currencySymbol} ${paymentAmountNum.toFixed(2)}`, {
        fill: '#E8F5E9',
        stroke: '#28A745',
        valueColor: '#28A745',
        valueSize: s(11, layout.scale),
      });

      if (isPrepayment) {
        drawPaymentRow(
          'Prepaid Amount (for future terms)',
          `${currencySymbol} ${paymentAmountNum.toFixed(2)}`,
          { fill: '#E3F2FD', stroke: '#2196F3', labelColor: '#1976D2', valueColor: '#1976D2' }
        );
      }

      if (paymentMethod) {
        doc.rect(tableStartX, yPos, tableWidth, rowHeight)
          .fillColor('#F8F9FA')
          .fill()
          .strokeColor('#CCCCCC')
          .lineWidth(0.5)
          .stroke();
        doc.strokeColor('#E0E0E0').lineWidth(0.5);
        doc.moveTo(amountColumnStartX, yPos + 1).lineTo(amountColumnStartX, yPos + rowHeight - 1).stroke();
        const textY = yPos + (rowHeight - layout.tableRowSize) / 2 - 1;
        doc.fontSize(layout.tableRowSize).font('Helvetica').fillColor('#000000');
        doc.text('Payment Method', tableStartX + 6, textY);
        doc.text(paymentMethod, amountColumnStartX, textY, {
          align: 'right',
          width: amountColumnWidth - 6,
          ellipsis: true,
        });
        yPos += rowHeight;
      }

      yPos += s(4, layout.scale);
      doc.strokeColor('#CCCCCC').lineWidth(0.75);
      doc.moveTo(tableStartX, yPos).lineTo(tableEndX, yPos).stroke();
      yPos += layout.gap;

      doc.fontSize(layout.sectionTitleSize).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Transaction Details', layout.margin, yPos);
      yPos += s(14, layout.scale);

      const invoiceAmount = parseFloat(String(invoice.amount || 0));
      const previousBalance = parseFloat(String(invoice.previousBalance || 0));
      const paidAmount = parseFloat(String(invoice.paidAmount || 0));
      const balance = parseFloat(String(invoice.balance || 0));
      const prepaidAmount = parseFloat(String(invoice.prepaidAmount || 0));
      const totalInvoiceAmount = invoiceAmount + previousBalance;

      const transactionRowHeight = s(16, layout.scale);
      const valueColumnWidth = s(115, layout.scale);
      const valueColumnStartX = tableEndX - valueColumnWidth;
      const numRows = 5;
      const tableStartY = yPos;
      const tableHeight = numRows * transactionRowHeight;

      doc.strokeColor('#000000').lineWidth(0.75);
      doc.rect(tableStartX, tableStartY, tableWidth, tableHeight).stroke();
      doc.moveTo(valueColumnStartX, tableStartY).lineTo(valueColumnStartX, tableStartY + tableHeight).stroke();
      for (let i = 1; i < numRows; i++) {
        const dividerY = tableStartY + i * transactionRowHeight;
        doc.moveTo(tableStartX, dividerY).lineTo(tableEndX, dividerY).stroke();
      }

      const txRows: Array<{ label: string; value: string; bold?: boolean; color?: string }> = [
        { label: 'Total Invoice Amount:', value: `${currencySymbol} ${totalInvoiceAmount.toFixed(2)}` },
        {
          label: 'Invoice balance b/f (Previous Balance):',
          value: `${currencySymbol} ${previousBalance.toFixed(2)}`,
        },
        {
          label: 'Payment:Total Paid (including this payment)',
          value: `${currencySymbol} ${paidAmount.toFixed(2)}`,
        },
        {
          label: 'Invoice balance c/f (Remaining Balance):',
          value: `${currencySymbol} ${balance.toFixed(2)}`,
          bold: true,
          color: '#DC3545',
        },
        { label: 'Prepaid Amount:', value: `${currencySymbol} ${prepaidAmount.toFixed(2)}` },
      ];

      let rowY = tableStartY;
      for (const row of txRows) {
        const textY = rowY + (transactionRowHeight - layout.bodySize) / 2 - 1;
        doc.fontSize(layout.bodySize).font(row.bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(row.color || '#000000');
        doc.text(row.label, tableStartX + 4, textY, { width: valueColumnStartX - tableStartX - 8 });
        doc.text(row.value, valueColumnStartX + 4, textY, {
          align: 'right',
          width: valueColumnWidth - 8,
        });
        rowY += transactionRowHeight;
      }

      yPos = tableStartY + tableHeight + layout.gap;
      doc.strokeColor('#CCCCCC').lineWidth(0.75);
      doc.moveTo(layout.margin, yPos).lineTo(contentRight, yPos).stroke();
      yPos += layout.gap;

      if (notes) {
        doc.fontSize(s(7, layout.scale)).font('Helvetica');
        const notesTextHeight = doc.heightOfString(notes, { width: contentWidth - 20 });
        const notesBoxHeight = Math.min(s(36, layout.scale) + notesTextHeight, s(56, layout.scale));
        doc.rect(layout.margin, yPos, contentWidth, notesBoxHeight)
          .fillColor('#F5F5F5')
          .fill()
          .strokeColor('#DEE2E6')
          .lineWidth(0.75)
          .stroke();
        doc.fontSize(s(8, layout.scale)).font('Helvetica-Bold').fillColor('#2C3E50');
        doc.text('Notes:', layout.margin + 10, yPos + s(5, layout.scale));
        doc.fontSize(s(7.5, layout.scale)).font('Helvetica').fillColor('#000000');
        doc.text(notes, layout.margin + 10, yPos + s(14, layout.scale), {
          width: contentWidth - 20,
          height: notesBoxHeight - s(16, layout.scale),
          ellipsis: true,
        });
        yPos += notesBoxHeight + layout.gap;
      }

      const statusBoxH = s(22, layout.scale);
      doc.rect(layout.margin, yPos, contentWidth, statusBoxH)
        .fillColor('#E8F5E9')
        .fill()
        .strokeColor('#28A745')
        .lineWidth(1)
        .stroke();
      const statusTextY = yPos + (statusBoxH - s(9, layout.scale)) / 2 - 1;
      doc.fontSize(s(9, layout.scale)).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Payment Status:', layout.margin + 10, statusTextY);
      doc.font('Helvetica-Bold').fillColor('#28A745');
      const statusText = invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1);
      doc.text(statusText, layout.margin + 105, statusTextY);
      yPos += statusBoxH + layout.gap;

      const thankYouH = s(26, layout.scale);
      doc.rect(layout.margin, yPos, contentWidth, thankYouH)
        .fillColor('#E8F5E9')
        .fill()
        .strokeColor('#28A745')
        .lineWidth(1)
        .stroke();
      doc.fontSize(s(10, layout.scale)).font('Helvetica-Bold').fillColor('#28A745');
      doc.text('Thank you for your payment!', layout.margin, yPos + s(7, layout.scale), {
        align: 'center',
        width: contentWidth,
      });

      const footerY = PDF_PAGE.height - layout.margin - s(12, layout.scale);
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
