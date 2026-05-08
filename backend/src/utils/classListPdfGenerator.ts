import PDFDocument from 'pdfkit';
import sizeOf from 'image-size';
import { Settings } from '../entities/Settings';

interface ClassListData {
  class: {
    id: string;
    name: string;
    form: string;
  };
  term: string;
  students: Array<{
    studentNumber: string;
    firstName: string;
    lastName: string;
    gender: string;
    dateOfBirth: Date | string;
    studentType: string;
    contactNumber?: string;
    phoneNumber?: string;
  }>;
  generatedAt: Date;
}

export function createClassListPDF(
  classListData: ClassListData,
  settings: Settings | null
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 20, size: 'A4', layout: 'portrait' });
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

      // Header with blue background
      let headerHeight = 100;
      doc.rect(0, 0, doc.page.width, headerHeight)
        .fillColor('#4a90e2')
        .fill();

      // Add school logo if available
      let logoX = 20;
      let logoY = 15;
      let logoWidth = 70;
      let logoHeight = 70;
      let textStartX = 20;
      let textWidth = doc.page.width - 40;

      if (settings?.schoolLogo || settings?.schoolLogo2) {
        const logoData = settings.schoolLogo || settings.schoolLogo2;
        try {
          if (typeof logoData === 'string') {
            if (logoData.startsWith('data:')) {
              const base64Data = logoData.split(',')[1];
              const imageBuffer = Buffer.from(base64Data, 'base64');
              
              // Get image dimensions and preserve aspect ratio
              try {
                const dimensions = sizeOf(imageBuffer);
                const imgWidth = dimensions.width || logoWidth;
                const imgHeight = dimensions.height || logoHeight;
                
                // Calculate scale factor to fit within max dimensions
                const scaleX = logoWidth / imgWidth;
                const scaleY = logoHeight / imgHeight;
                const scale = Math.min(scaleX, scaleY);
                
                const finalWidth = imgWidth * scale;
                const finalHeight = imgHeight * scale;
                
                // Center logo vertically in header
                const centeredY = logoY + (logoHeight - finalHeight) / 2;
                
                doc.image(imageBuffer, logoX, centeredY, {
                  width: finalWidth,
                  height: finalHeight
                });
                
                // Adjust text position to accommodate logo
                textStartX = logoX + logoWidth + 20;
                textWidth = doc.page.width - textStartX - 20;
              } catch (sizeError) {
                // If sizeOf fails, use default dimensions
                doc.image(imageBuffer, logoX, logoY, { width: logoWidth, height: logoHeight, fit: [logoWidth, logoHeight] });
                textStartX = logoX + logoWidth + 20;
                textWidth = doc.page.width - textStartX - 20;
              }
            } else {
              console.warn('[createClassListPDF] Logo is not in base64 format, skipping');
            }
          }
        } catch (logoError) {
          console.error('[createClassListPDF] Error loading logo:', logoError);
        }
      }

      // School name - centered if no logo, or to the right of logo
      doc.fontSize(20).font('Helvetica-Bold').fillColor('#FFFFFF');
      if (settings?.schoolLogo || settings?.schoolLogo2) {
        // Position text to the right of logo, vertically centered
        doc.text(schoolName, textStartX, 35, { width: textWidth });
      } else {
        // Center text if no logo
        doc.text(schoolName, 20, 25, { width: doc.page.width - 40, align: 'center' });
      }

      // School address and phone
      if (schoolAddress || schoolPhone) {
        doc.fontSize(10).font('Helvetica').fillColor('#E8F4FD');
        const contactLine = [schoolAddress, schoolPhone].filter(Boolean).join(' | ');
        if (settings?.schoolLogo || settings?.schoolLogo2) {
          doc.text(contactLine, textStartX, 60, { width: textWidth });
        } else {
          doc.text(contactLine, 20, 50, { width: doc.page.width - 40, align: 'center' });
        }
      }

      // Title Section
      let yPos = headerHeight + 20;
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#000000');
      doc.text('CLASS LIST', 20, yPos, { align: 'center', width: doc.page.width - 40 });
      
      yPos += 25;
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000');
      doc.text(`Class: ${classListData.class.name} (${classListData.class.form})`, 20, yPos);
      doc.text(`Term: ${classListData.term}`, doc.page.width - 180, yPos);
      
      yPos += 20;
      const generatedDate = new Date(classListData.generatedAt);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000');
      doc.text(`Generated: ${generatedDate.toLocaleDateString()} ${generatedDate.toLocaleTimeString()}`, 20, yPos);
      doc.text(`Total Students: ${classListData.students.length}`, doc.page.width - 180, yPos);

      // Table Header
      yPos += 30;
      const tableStartY = yPos;
      const rowHeight = 25;
      const colWidths = {
        number: 30,
        studentNumber: 90,
        firstName: 100,
        lastName: 100,
        gender: 50,
        dateOfBirth: 90,
        studentType: 80
      };

      const tableWidth = doc.page.width - 40; // Reduced from 80 to 40 to extend table width
      const totalColWidth = Object.values(colWidths).reduce((sum, width) => sum + width, 0);
      const remainingWidth = tableWidth - totalColWidth;
      // Distribute remaining width to name columns
      if (remainingWidth > 0) {
        colWidths.firstName += remainingWidth * 0.35;
        colWidths.lastName += remainingWidth * 0.35;
        colWidths.studentNumber += remainingWidth * 0.2;
        colWidths.dateOfBirth += remainingWidth * 0.1;
      }

      // Header row
      const tableStartX = 20; // Reduced from 40 to 20 to extend table width
      doc.rect(tableStartX, yPos, tableWidth, rowHeight)
        .fillColor('#4a90e2')
        .fill();

      let xPos = tableStartX;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#FFFFFF');
      
      doc.text('#', xPos + 5, yPos + 8);
      xPos += colWidths.number;
      
      doc.text('Student No.', xPos + 5, yPos + 8);
      xPos += colWidths.studentNumber;
      
      doc.text('First Name', xPos + 5, yPos + 8);
      xPos += colWidths.firstName;
      
      doc.text('Last Name', xPos + 5, yPos + 8);
      xPos += colWidths.lastName;
      
      doc.text('Gender', xPos + 5, yPos + 8);
      xPos += colWidths.gender;
      
      doc.text('Date of Birth', xPos + 5, yPos + 8);
      xPos += colWidths.dateOfBirth;
      
      doc.text('Type', xPos + 5, yPos + 8);

      // Table rows
      yPos += rowHeight;
      doc.fontSize(10).font('Helvetica').fillColor('#000000'); // Changed from Bold to regular
      
      classListData.students.forEach((student, index) => {
        // Check if we need a new page
        if (yPos + rowHeight > doc.page.height - 20) {
          doc.addPage();
          yPos = 20;
          
          // Redraw header on new page
          doc.rect(tableStartX, yPos, tableWidth, rowHeight)
            .fillColor('#4a90e2')
            .fill();
          
          xPos = tableStartX;
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#FFFFFF');
          doc.text('#', xPos + 5, yPos + 8);
          xPos += colWidths.number;
          doc.text('Student No.', xPos + 5, yPos + 8);
          xPos += colWidths.studentNumber;
          doc.text('First Name', xPos + 5, yPos + 8);
          xPos += colWidths.firstName;
          doc.text('Last Name', xPos + 5, yPos + 8);
          xPos += colWidths.lastName;
          doc.text('Gender', xPos + 5, yPos + 8);
          xPos += colWidths.gender;
          doc.text('Date of Birth', xPos + 5, yPos + 8);
          xPos += colWidths.dateOfBirth;
          doc.text('Type', xPos + 5, yPos + 8);
          
          yPos += rowHeight;
          doc.fontSize(10).font('Helvetica').fillColor('#000000'); // Changed from Bold to regular
        }

        // Alternate row background
        if (index % 2 === 0) {
          doc.rect(tableStartX, yPos, tableWidth, rowHeight)
            .fillColor('#f8f9fa')
            .fill();
        }

        // Draw row border
        doc.rect(tableStartX, yPos, tableWidth, rowHeight)
          .strokeColor('#dee2e6')
          .lineWidth(0.5)
          .stroke();

        // IMPORTANT: Reset text color to black after drawing background
        doc.fontSize(10).font('Helvetica').fillColor('#000000'); // Regular font, not bold

        xPos = tableStartX;
        
        // Number
        doc.text(String(index + 1), xPos + 5, yPos + 8);
        xPos += colWidths.number;
        
        // Student Number
        doc.text(student.studentNumber || 'N/A', xPos + 5, yPos + 8, { width: colWidths.studentNumber - 10, ellipsis: true });
        xPos += colWidths.studentNumber;
        
        // First Name
        doc.text(student.firstName || 'N/A', xPos + 5, yPos + 8, { width: colWidths.firstName - 10, ellipsis: true });
        xPos += colWidths.firstName;
        
        // Last Name
        doc.text(student.lastName || 'N/A', xPos + 5, yPos + 8, { width: colWidths.lastName - 10, ellipsis: true });
        xPos += colWidths.lastName;
        
        // Gender
        doc.text(student.gender || 'N/A', xPos + 5, yPos + 8);
        xPos += colWidths.gender;
        
        // Date of Birth
        let dobText = 'N/A';
        if (student.dateOfBirth) {
          const dob = new Date(student.dateOfBirth);
          if (!isNaN(dob.getTime())) {
            dobText = dob.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
          }
        }
        doc.text(dobText, xPos + 5, yPos + 8, { width: colWidths.dateOfBirth - 10, ellipsis: true });
        xPos += colWidths.dateOfBirth;
        
        // Student Type
        doc.text(student.studentType || 'N/A', xPos + 5, yPos + 8);

        yPos += rowHeight;
      });

      // Finalize the PDF document - this triggers the 'end' event which resolves the promise
      doc.end();
    } catch (error: any) {
      reject(error);
    }
  });
}

