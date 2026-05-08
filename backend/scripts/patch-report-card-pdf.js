const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '../src/utils/pdfGenerator.ts');
let s = fs.readFileSync(filePath, 'utf8');
const startMarker = "      const doc = new PDFDocument({ margin: 50, size: 'A4' });";
const endMarker = '      doc.end();';
const start = s.indexOf(startMarker);
const end = s.indexOf(endMarker, start);
if (start < 0 || end < 0) {
  console.error('markers not found', start, end);
  process.exit(1);
}
const endLine = s.indexOf('\n', end);
const afterEnd = endLine >= 0 ? endLine + 1 : end + endMarker.length;

const newBody = `      const doc = new PDFDocument({ size: 'A4', margin: 0 });
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
        doc.text(\`Email: \${schoolEmail}\`, innerL + bannerPad, ty, { width: textW });
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
          doc.text(\`www.\${domainHint}\`, logoX, y + bannerH - 14, {
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

      const thresholds = settings?.gradeThresholds || {};
      const passMin = thresholds.satisfactory ?? 40;
      const passed = countSubjectsPassed(reportCard.subjects, passMin);
      const totalInClass = reportCard.totalStudents || 0;
      const classPos =
        totalInClass > 0 && reportCard.classPosition
          ? \`\${reportCard.classPosition} / \${totalInClass}\`
          : reportCard.classPosition
            ? String(reportCard.classPosition)
            : '—';
      const streamTotal = reportCard.totalStudentsPerStream || 0;
      const formPos =
        streamTotal > 0 && reportCard.formPosition
          ? \`\${reportCard.formPosition} / \${streamTotal}\`
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

      const headerH = 16;
      const rowFont = 7;
      doc.rect(tableLeft, y, tw, headerH).fill(RC.headerGrey);
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#000000');
      const heads = ['Ser', 'Subject', 'Mark', 'Average', 'Position', 'Grade', "Teacher's Comment"];
      const wids = [cols.ser, cols.subject, cols.mark, cols.avg, cols.pos, cols.grade, cols.comment];
      heads.forEach((h, i) => {
        doc.text(h, colX(i) + 2, y + 4, {
          width: wids[i] - 4,
          align: i === 1 || i === 6 ? 'left' : 'center',
        });
      });
      doc.strokeColor(RC.border).lineWidth(0.35);
      for (let i = 0; i <= 7; i++) {
        doc.moveTo(colX(i), y).lineTo(colX(i), y + headerH).stroke();
      }
      doc.moveTo(tableLeft, y).lineTo(tableRight, y).stroke();
      doc.moveTo(tableLeft, y + headerH).lineTo(tableRight, y + headerH).stroke();
      y += headerH;

      const sanitizeNumber = (value: any): number | null => {
        if (value === null || value === undefined) return null;
        const cleaned = typeof value === 'string' ? value.replace(/[^\\d.-]/g, '') : value;
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : null;
      };

      const getGradeLocal = (pct: number): string => {
        const th = settings?.gradeThresholds || {
          veryGood: 80,
          good: 60,
          satisfactory: 40,
          needsImprovement: 20,
          basic: 1,
        };
        const gl = settings?.gradeLabels || {};
        if (pct === 0) return (gl as any).fail || 'N/A';
        if (pct >= (th.veryGood ?? 80)) return (gl as any).veryGood || 'A';
        if (pct >= (th.good ?? 60)) return (gl as any).good || 'B';
        if (pct >= (th.satisfactory ?? 40)) return (gl as any).satisfactory || 'C';
        if (pct >= (th.needsImprovement ?? 20)) return (gl as any).needsImprovement || 'D';
        if (pct >= (th.basic ?? 1)) return (gl as any).basic || 'E';
        return (gl as any).fail || 'N/A';
      };

      const bottomReserve = 118;
      const maxTableY = maxY - bottomReserve;
      const baseRow = 12;

      for (let index = 0; index < reportCard.subjects.length; index++) {
        if (y + baseRow > maxTableY) break;
        const subject = reportCard.subjects[index];
        const subjectName = subject?.subject || 'N/A';
        const subjectCode = subject?.subjectCode || '';
        const subjDisplay = truncatePdf((subjectCode ? subjectCode + ' ' : '') + subjectName, 48);
        const scoreVal = sanitizeNumber(subject?.score);
        const pct = sanitizeNumber(subject?.percentage) ?? 0;
        const gradeVal = subject?.grade || getGradeLocal(pct);
        const hasMarks = scoreVal !== null && gradeVal !== 'N/A';
        const markStr = hasMarks ? String(Math.round(scoreVal)) : '—';
        const avgStr =
          subject?.classAverage !== undefined && subject.classAverage !== null
            ? String(Math.round(Number(subject.classAverage)))
            : '—';
        const posStr = '—';
        let gradeStr = String(gradeVal);
        if (reportCard.isUpperForm && subject?.points !== undefined && subject?.points !== null) {
          gradeStr = gradeStr + ' (' + subject.points + ')';
        }
        const comStr = truncatePdf(subject?.comments || '—', 42);

        const rowH = baseRow;
        const fill = index % 2 === 0 ? '#ffffff' : RC.rowAlt;
        doc.rect(tableLeft, y, tw, rowH).fill(fill);

        doc.font('Helvetica').fontSize(rowFont);
        doc.fillColor('#000000').text(String(index + 1), colX(0) + 2, y + 3, {
          width: cols.ser - 4,
          align: 'center',
        });
        doc.fillColor('#000000').text(subjDisplay, colX(1) + 2, y + 3, { width: cols.subject - 4 });
        doc.fillColor(RC.valueBlue).text(markStr, colX(2) + 1, y + 3, {
          width: cols.mark - 2,
          align: 'center',
        });
        doc.fillColor('#000000').text(avgStr, colX(3) + 1, y + 3, {
          width: cols.avg - 2,
          align: 'center',
        });
        doc.fillColor('#000000').text(posStr, colX(4) + 1, y + 3, {
          width: cols.pos - 2,
          align: 'center',
        });
        doc.fillColor('#000000').text(gradeStr, colX(5) + 1, y + 3, {
          width: cols.grade - 2,
          align: 'center',
        });
        doc.fillColor('#374151').text(comStr, colX(6) + 2, y + 3, { width: cols.comment - 4 });

        for (let i = 0; i <= 7; i++) {
          doc.moveTo(colX(i), y).lineTo(colX(i), y + rowH).stroke();
        }
        doc.moveTo(tableLeft, y + rowH).lineTo(tableRight, y + rowH).stroke();
        y += rowH;
      }

      const avgRowH = 14;
      if (y + avgRowH <= maxY - 60) {
        doc.rect(tableLeft, y, tw, avgRowH).fill('#dbeafe');
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#000000');
        doc.text('Average Mark', colX(1) + 2, y + 4, { width: cols.subject + cols.ser - 4 });
        const ov = parseFloat(reportCard.overallAverage);
        const avgTxt = Number.isFinite(ov) ? ov.toFixed(2) : reportCard.overallAverage;
        doc.fillColor(RC.valueBlue).text(avgTxt, colX(2) + 1, y + 3, {
          width: cols.mark - 2,
          align: 'center',
        });
        for (let i = 0; i <= 7; i++) {
          doc.moveTo(colX(i), y).lineTo(colX(i), y + avgRowH).stroke();
        }
        doc.moveTo(tableLeft, y + avgRowH).lineTo(tableRight, y + avgRowH).stroke();
        y += avgRowH + 8;
      }

      const classTeacherRemarks = reportCard.remarks?.classTeacherRemarks || 'No remarks provided.';
      const headmasterRemarks = reportCard.remarks?.headmasterRemarks || 'No remarks provided.';

      const splitMid = innerL + innerW / 2;
      const gap = 8;
      const boxW = (innerW - gap) / 2;
      const boxH = 64;

      const underTitle = (label: string, bx: number, by: number) => {
        doc.font('Helvetica-Bold').fontSize(9).fillColor(RC.label).text(label, bx, by);
        const w = doc.widthOfString(label);
        doc.moveTo(bx, by + 11).lineTo(bx + w, by + 11).lineWidth(0.5).strokeColor('#000000').stroke();
      };

      underTitle("Form Teacher's Comment", innerL + 6, y);
      underTitle("Head's Comment", splitMid + gap / 2, y);
      y += 16;

      const tRem = truncatePdf(classTeacherRemarks, 320);
      const hRem = truncatePdf(headmasterRemarks, 320);

      doc.rect(innerL + 6, y, boxW - 6, boxH).strokeColor(RC.border).lineWidth(0.6).stroke();
      doc.font('Helvetica').fontSize(7.5).fillColor('#111827');
      doc.text(tRem, innerL + 9, y + 4, { width: boxW - 14 });

      doc.rect(splitMid + gap / 2, y, boxW - 6, boxH).strokeColor(RC.border).lineWidth(0.6).stroke();
      doc.text(hRem, splitMid + gap / 2 + 3, y + 4, { width: boxW - 10 });

      y += boxH + 10;

      const headmasterName = settings?.headmasterName || '';
      if (headmasterName) {
        doc.font('Helvetica-Bold').fontSize(7).fillColor('#000000');
        doc.text(headmasterName, splitMid + gap / 2 + 3, y, { width: boxW - 10, align: 'right' });
      }

      y = maxY - 14;
      doc.fontSize(6).font('Helvetica').fillColor('#64748b');
      doc.text(
        \`Generated on: \${new Date(reportCard.generatedAt).toLocaleString()}\`,
        innerL,
        y,
        { width: innerW, align: 'center' }
      );

      doc.end();
`;

fs.writeFileSync(filePath, s.slice(0, start) + newBody + s.slice(afterEnd));
console.log('patched ok', newBody.length);
