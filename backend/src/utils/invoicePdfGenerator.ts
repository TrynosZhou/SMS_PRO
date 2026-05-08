import PDFDocument from 'pdfkit';
import { Invoice } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';
import { parseAmount } from './numberUtils';
import { resolveInvoiceRemainingBalance } from './invoiceBalanceResolve';
import { resolveTuitionFees, isBoarderStudent } from './feesSettingsResolve';

interface InvoicePDFData {
  invoice: Invoice;
  student: Student;
  settings: Settings | null;
}

export function createInvoicePDF(
  data: InvoicePDFData
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);

      const { invoice, student, settings } = data;
      const currencySymbol = settings?.currencySymbol || '$';

      // School Header
      const schoolName = settings?.schoolName || 'School Management System';
      const schoolAddress = settings?.schoolAddress ? String(settings.schoolAddress).trim() : '';
      const schoolPhone = settings?.schoolPhone || '';
      const schoolEmail = settings?.schoolEmail || '';

      // Header Section
      let yPos = 50;

      // School Logo (if available)
      if (settings?.schoolLogo) {
        try {
          if (settings.schoolLogo.startsWith('data:image')) {
            const base64Data = settings.schoolLogo.split(',')[1];
            if (base64Data) {
              const imageBuffer = Buffer.from(base64Data, 'base64');
              doc.image(imageBuffer, 50, yPos, { width: 80, height: 80 });
            }
          }
        } catch (error) {
          console.error('Could not add school logo to invoice:', error);
        }
      }

      // School Information
      const textStartX = settings?.schoolLogo ? 150 : 50;
      doc.fontSize(18).font('Helvetica-Bold').text(schoolName, textStartX, yPos);
      yPos += 25;

      if (schoolAddress) {
        doc.fontSize(10).font('Helvetica').text(schoolAddress, textStartX, yPos);
        yPos += 15;
      }

      if (schoolPhone) {
        doc.fontSize(10).font('Helvetica').text(`Phone: ${schoolPhone}`, textStartX, yPos);
        yPos += 15;
      }

      if (schoolEmail) {
        doc.fontSize(10).font('Helvetica').text(`Email: ${schoolEmail}`, textStartX, yPos);
        yPos += 15;
      }

      yPos += 20;

      // Horizontal divider line after header
      doc.strokeColor('#CCCCCC').lineWidth(1);
      doc.moveTo(50, yPos).lineTo(545, yPos).stroke();
      yPos += 15;

      // Invoice Title
      doc.fontSize(20).font('Helvetica-Bold').fillColor('#003366');
      doc.text('INVOICE STATEMENT', 50, yPos, { align: 'center', width: 500 });
      yPos += 30;

      // Invoice Details Box with improved styling
      const detailsBoxY = yPos;
      const detailsBoxHeight = 110;
      doc.rect(50, detailsBoxY, 500, detailsBoxHeight)
        .fillColor('#F8F9FA')
        .fill()
        .strokeColor('#4A90E2')
        .lineWidth(2)
        .stroke();

      // Vertical divider line in details box
      const dividerX = 300;
      doc.strokeColor('#DEE2E6').lineWidth(0.5);
      doc.moveTo(dividerX, detailsBoxY + 5).lineTo(dividerX, detailsBoxY + detailsBoxHeight - 5).stroke();

      // Left Column - Invoice Info
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Invoice Number:', 60, detailsBoxY + 10);
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text(invoice.invoiceNumber, 60, detailsBoxY + 25);

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Invoice Date:', 60, detailsBoxY + 45);
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text(new Date(invoice.createdAt).toLocaleDateString(), 60, detailsBoxY + 60);

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Due Date:', 60, detailsBoxY + 80);
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text(new Date(invoice.dueDate).toLocaleDateString(), 60, detailsBoxY + 95);

      // Right Column - Student Info
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Bill To:', 320, detailsBoxY + 10);
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text(`${student.firstName} ${student.lastName}`, 320, detailsBoxY + 25);
      doc.text(`Student Number: ${student.studentNumber}`, 320, detailsBoxY + 40);
      if (student.classEntity) {
        doc.text(`Class: ${student.classEntity.name}`, 320, detailsBoxY + 55);
      }
      doc.text(`Term: ${invoice.term}`, 320, detailsBoxY + 70);

      yPos = detailsBoxY + detailsBoxHeight + 15;

      // Horizontal divider line before items table
      doc.strokeColor('#CCCCCC').lineWidth(1);
      doc.moveTo(50, yPos).lineTo(545, yPos).stroke();
      yPos += 15;

      // Items Table Section Header
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Invoice Details', 50, yPos);
      yPos += 25;

      // Table Header with improved styling
      // A4 page width is 595pt, with 50pt margins = 495pt usable width
      const tableStartX = 50;
      const tableEndX = 545; // Keep within page margins (50pt left + 495pt content + 50pt right = 595pt)
      const tableWidth = tableEndX - tableStartX; // 495pt
      const amountColumnWidth = 120; // Width for amount column
      const amountColumnStartX = tableEndX - amountColumnWidth; // Start position for amount column
      const rowHeight = 28;

      // Table header with border
      doc.rect(tableStartX, yPos, tableWidth, rowHeight)
        .fillColor('#4A90E2')
        .fill()
        .strokeColor('#003366')
        .lineWidth(2)
        .stroke();

      // Vertical divider in header
      doc.strokeColor('#FFFFFF').lineWidth(0.5);
      doc.moveTo(amountColumnStartX, yPos + 2).lineTo(amountColumnStartX, yPos + rowHeight - 2).stroke();

      doc.fontSize(11).font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.text('Description', tableStartX + 10, yPos + 9);
      doc.text('Amount', amountColumnStartX, yPos + 9, { align: 'right', width: amountColumnWidth - 10 });

      yPos += rowHeight;

      // Ensure all numeric values are properly converted to numbers
      const invoiceAmount = parseAmount(invoice.amount);
      const previousBalance = parseAmount(invoice.previousBalance);
      const paidAmount = parseAmount(invoice.paidAmount);
      const balance = resolveInvoiceRemainingBalance(invoice);
      const prepaidAmount = parseAmount(invoice.prepaidAmount);
      const uniformTotal = parseAmount((invoice as any).uniformTotal);
      const baseAmount = parseFloat((invoiceAmount - uniformTotal).toFixed(2));
      // Note: uniformItems array is NOT used for display - only uniformTotal subtotal is shown
      // Individual uniform items should NOT appear on the invoice

      const renderTableRow = (label: string, amountValue: number, options: { fill?: string; textColor?: string } = {}) => {
        doc.rect(tableStartX, yPos, tableWidth, rowHeight)
          .fillColor(options.fill || '#FFFFFF')
          .fill()
          .strokeColor('#CCCCCC')
          .lineWidth(0.5)
          .stroke();

        doc.strokeColor('#E0E0E0').lineWidth(0.5);
        doc.moveTo(amountColumnStartX, yPos + 2).lineTo(amountColumnStartX, yPos + rowHeight - 2).stroke();

        doc.fontSize(10).font('Helvetica').fillColor(options.textColor || '#000000');
        const maxDescriptionWidth = amountColumnStartX - tableStartX - 20;
        doc.text(label, tableStartX + 10, yPos + 9, { width: maxDescriptionWidth, ellipsis: true });
        doc.text(`${currencySymbol} ${amountValue.toFixed(2)}`, amountColumnStartX, yPos + 9, { align: 'right', width: amountColumnWidth - 10 });
        yPos += rowHeight;
      };

      if (previousBalance > 0) {
        renderTableRow('Previous Balance (Outstanding Fees)', previousBalance);
      }

      // Prefer line items saved from Finance → Manage → Fees when present
      let displayedFeesTotal = 0;
      const storedFeeLines = (invoice as any).feeLineItems;
      if (Array.isArray(storedFeeLines) && storedFeeLines.length > 0) {
        for (const row of storedFeeLines) {
          const amt = parseAmount((row as any).amount);
          const desc = String((row as any).description || 'Fee').trim() || 'Fee';
          if (amt > 0.001) {
            renderTableRow(desc, amt, { fill: '#F8F9FA' });
            displayedFeesTotal += amt;
          }
        }
      } else {
      // Calculate fee breakdown from student data and settings
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
      const otherFeesTotal = otherFees.reduce((sum: number, fee: any) => sum + parseAmount(fee?.amount), 0);

      // Calculate individual fees based on student status
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
        if (student.isStaffChild) {
          diningHallFee = diningHallCost * 0.5; // 50% for staff children
        } else {
          diningHallFee = diningHallCost; // Full price for regular students
        }
      }

      // Calculate other fees (desk, library, sports, other fees - only for non-staff children)
      const otherFeesAmount = (student.isStaffChild ? 0 : (deskFee + libraryFee + sportsFee + otherFeesTotal));

      // Track all displayed fees to calculate correct total

      // Always display fees as separate line items based on student data
      // These fees should be charged for every term (except desk fee and registration fee which are only once)
      // Display registration fee: only on first invoice (registration) and only for non-staff children
      // Check if this is likely the first invoice by checking if baseAmount includes registration fee
      if (registrationFee > 0 && !student.isStaffChild) {
        // Calculate expected fees without registration fee (but with desk fee since both are charged at registration)
        const feesWithoutReg = tuitionFee + transportFee + diningHallFee + deskFee +
          (student.isStaffChild ? 0 : (libraryFee + sportsFee + otherFeesTotal));
        const expectedWithReg = feesWithoutReg + registrationFee;
        
        // Show registration fee if baseAmount is close to expectedWithReg (within 1 unit tolerance)
        // This indicates registration fee is likely included in the invoice
        if (Math.abs(baseAmount - expectedWithReg) <= Math.abs(baseAmount - feesWithoutReg) + 1) {
          renderTableRow('Registration Fee', registrationFee, { fill: '#F8F9FA' });
          displayedFeesTotal += registrationFee;
        }
      }

      // Display tuition fee - always show if student is not a staff child
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
          renderTableRow(tuitionLabel, tuitionToDisplay, { fill: '#F8F9FA' });
          displayedFeesTotal += tuitionToDisplay;
        }
      }

      // Desk fee: only for non-staff children and only on first invoice (registration)
      // Check if this is likely the first invoice by checking if baseAmount includes desk fee
      // We'll show desk fee if the invoice amount suggests it's included
      if (deskFee > 0 && !student.isStaffChild) {
        // Calculate expected fees without desk fee
        const feesWithoutDesk = tuitionFee + transportFee + diningHallFee + 
          (student.isStaffChild ? 0 : (libraryFee + sportsFee + otherFeesTotal));
        const expectedWithDesk = feesWithoutDesk + deskFee;
        
        // Show desk fee if baseAmount is close to expectedWithDesk (within 1 unit tolerance)
        // This indicates desk fee is likely included in the invoice
        if (Math.abs(baseAmount - expectedWithDesk) <= Math.abs(baseAmount - feesWithoutDesk) + 1) {
          renderTableRow('Desk Fee', deskFee, { fill: '#F8F9FA' });
          displayedFeesTotal += deskFee;
        }
      }

      // Always show transport fee if student uses transport (for Day Scholars)
      if (!isBoarderStudent(student.studentType) && student.usesTransport && !student.isStaffChild) {
        const transportToDisplay = transportFee > 0 ? transportFee : transportCost;
        if (transportToDisplay > 0) {
          renderTableRow('Transport Fee', transportToDisplay, { fill: '#F8F9FA' });
          displayedFeesTotal += transportToDisplay;
        }
      }

      // Always show dining hall fee if student uses dining hall
      if (student.usesDiningHall) {
        const dhToDisplay = diningHallFee > 0 ? diningHallFee : (student.isStaffChild ? diningHallCost * 0.5 : diningHallCost);
        if (dhToDisplay > 0) {
          const dhLabel = student.isStaffChild ? 'Dining Hall (DH) Fee (50% - Staff Child)' : 'Dining Hall (DH) Fee';
          renderTableRow(dhLabel, dhToDisplay, { fill: '#F8F9FA' });
          displayedFeesTotal += dhToDisplay;
        }
      }

      // Always show other fees for non-staff children (library, sports, other fees)
      // These are charged every term
      if (!student.isStaffChild) {
        // Library fee - always show if configured
        if (libraryFee > 0) {
          renderTableRow('Library Fee', libraryFee, { fill: '#F8F9FA' });
          displayedFeesTotal += libraryFee;
        }
        
        // Sports fee - always show if configured (charged every term)
        if (sportsFee > 0) {
          renderTableRow('Sports Fee', sportsFee, { fill: '#F8F9FA' });
          displayedFeesTotal += sportsFee;
        }
        
        // Other fees - show each configured fee
        if (otherFeesTotal > 0) {
          otherFees.forEach((fee: any) => {
            const feeAmount = parseAmount(fee.amount);
            if (feeAmount > 0) {
              renderTableRow(fee.name || 'Other Fee', feeAmount, { fill: '#F8F9FA' });
              displayedFeesTotal += feeAmount;
            }
          });
        }
      }
      }

      // Invoice amount is set but nothing was rendered (e.g. legacy data or threshold mismatch) — show one line so PDF matches stored amount
      if (displayedFeesTotal < 0.01 && baseAmount > 0.01) {
        renderTableRow(
          (invoice.description && String(invoice.description).trim()) || 'Fees for term',
          baseAmount,
          { fill: '#F8F9FA' }
        );
        displayedFeesTotal += baseAmount;
      }

      // Calculate what the total should be based on displayed fees
      // If there's a discrepancy with baseAmount, it might be due to discounts or adjustments
      const displayedFeesSum = displayedFeesTotal;
      const remainingAmount = baseAmount - displayedFeesSum;
      
      // If there's a significant difference, show it as an adjustment
      // But prioritize showing all applicable fees first
      if (Math.abs(remainingAmount) > 0.01) {
        if (remainingAmount > 0.01) {
          // Additional amount not accounted for in standard fees
          renderTableRow('Additional Fees', remainingAmount, { fill: '#F8F9FA' });
          displayedFeesTotal += remainingAmount;
        } else if (remainingAmount < -0.01) {
          // Negative amount indicates a discount or adjustment
          // We'll show it, but the displayed fees are what should be charged
          // The final total will be correct
        }
      }

      // Show each uniform line separately, then subtotal (distinct from tuition fees)
      const uniformItemsList = Array.isArray((invoice as any).uniformItems) ? (invoice as any).uniformItems : [];
      if (uniformItemsList.length > 0) {
        for (const ui of uniformItemsList) {
          const qty = Number(ui.quantity) || 1;
          const label = `${ui.itemName || 'Uniform item'} (×${qty})`;
          renderTableRow(label, parseAmount(ui.lineTotal), { fill: '#FFF7ED', textColor: '#9A3412' });
        }
        renderTableRow('School Uniform Subtotal', uniformTotal, { fill: '#FFE8CC', textColor: '#C05621' });
      } else if (uniformTotal > 0) {
        renderTableRow('School Uniform Subtotal', uniformTotal, { fill: '#FFE8CC', textColor: '#C05621' });
      }

      // Horizontal divider before total
      yPos += 10;
      doc.strokeColor('#4A90E2').lineWidth(1.5);
      doc.moveTo(tableStartX, yPos).lineTo(tableEndX, yPos).stroke();
      yPos += 5;

      // Total Row with enhanced styling
      doc.rect(tableStartX, yPos, tableWidth, rowHeight + 5)
        .fillColor('#E8F4F8')
        .fill()
        .strokeColor('#4A90E2')
        .lineWidth(2.5)
        .stroke();

      // Vertical divider in total row
      doc.strokeColor('#4A90E2').lineWidth(1);
      doc.moveTo(amountColumnStartX, yPos + 2).lineTo(amountColumnStartX, yPos + rowHeight + 3).stroke();

      // Calculate total from displayed items: previousBalance + displayed fees + uniform - appliedPrepaidAmount
      // displayedFeesTotal already includes all fees (tuition, desk, sports, etc.) but NOT uniform items
      // Uniform items are displayed separately and their subtotal is shown
      // So total = previousBalance + displayedFeesTotal + uniformTotal
      const totalInvoiceAmount = previousBalance + displayedFeesTotal + uniformTotal;
      const appliedPrepaidAmount = Math.min(prepaidAmount, totalInvoiceAmount);
      const calculatedTotal = totalInvoiceAmount - appliedPrepaidAmount;
      
      // Always use the calculated total from displayed items as the source of truth
      // This ensures the total matches what's actually displayed on the invoice
      // The invoice.balance might be incorrect if fees weren't calculated properly during creation
      // We calculate: previousBalance + displayedFeesTotal + uniformTotal - prepaidAmount
      const finalTotal = calculatedTotal;
      
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#003366');
      doc.text('Total Amount Due', tableStartX + 10, yPos + 10);
      doc.text(`${currencySymbol} ${finalTotal.toFixed(2)}`, amountColumnStartX, yPos + 10, { align: 'right', width: amountColumnWidth - 10 });
      yPos += rowHeight + 15;

      // Horizontal divider after total
      doc.strokeColor('#CCCCCC').lineWidth(1);
      doc.moveTo(tableStartX, yPos).lineTo(tableEndX, yPos).stroke();
      yPos += 20;

      // Payment Information Box
      if (paidAmount > 0 || prepaidAmount > 0) {
        const paymentBoxY = yPos;
        const paymentBoxHeight = 60 + (prepaidAmount > 0 ? 15 : 0);
        
        doc.rect(50, paymentBoxY, 500, paymentBoxHeight)
          .fillColor('#F0F8FF')
          .fill()
          .strokeColor('#4A90E2')
          .lineWidth(1.5)
          .stroke();

        doc.fontSize(12).font('Helvetica-Bold').fillColor('#2C3E50');
        doc.text('Payment Information', 60, paymentBoxY + 10);
        
        // Horizontal divider in payment box
        doc.strokeColor('#D0E0F0').lineWidth(0.5);
        doc.moveTo(60, paymentBoxY + 25).lineTo(540, paymentBoxY + 25).stroke();

        doc.fontSize(10).font('Helvetica').fillColor('#000000');
        let infoY = paymentBoxY + 35;
        
        if (paidAmount > 0) {
          doc.text(`Amount Paid: ${currencySymbol} ${paidAmount.toFixed(2)}`, 60, infoY);
          infoY += 15;
        }
        
        if (prepaidAmount > 0) {
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#1976D2');
          doc.text(`Prepaid Amount (for future terms): ${currencySymbol} ${prepaidAmount.toFixed(2)}`, 60, infoY);
          infoY += 15;
        }
        
        doc.fontSize(10).font('Helvetica').fillColor('#000000');
        doc.text(`Remaining Balance: ${currencySymbol} ${balance.toFixed(2)}`, 60, infoY);
        yPos = paymentBoxY + paymentBoxHeight + 20;
      }

      // Status Box
      const statusBoxY = yPos;
      doc.rect(50, statusBoxY, 500, 30)
        .fillColor('#FFFFFF')
        .fill()
        .strokeColor('#DEE2E6')
        .lineWidth(1)
        .stroke();

      doc.fontSize(11).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Status:', 60, statusBoxY + 10);
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      const statusText = invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1);
      doc.text(statusText, 120, statusBoxY + 10);
      yPos = statusBoxY + 50;

      // Footer with divider line
      const pageHeight = doc.page.height;
      const footerY = pageHeight - 50;
      
      // Horizontal divider line before footer
      doc.strokeColor('#CCCCCC').lineWidth(0.5);
      doc.moveTo(50, footerY).lineTo(545, footerY).stroke();
      
      doc.fontSize(8).font('Helvetica').fillColor('#666666');
      doc.text(
        `Generated on: ${new Date().toLocaleString()}`,
        50,
        footerY + 10,
        { align: 'center', width: 500 }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

