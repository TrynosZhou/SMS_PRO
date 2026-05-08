import PDFDocument from 'pdfkit';
import * as path from 'path';
import * as fs from 'fs';
import sizeOf from 'image-size';
import { Settings } from '../entities/Settings';

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
    console.error('Failed to load school logo for rankings PDF:', e);
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
    console.error('Failed to draw logo on rankings PDF:', e);
  }
}

export type RankingsPdfRankingType = 'class' | 'subject' | 'overall-performance';

export interface RankingsPdfPayload {
  rankingType: RankingsPdfRankingType;
  examTypeLabel: string;
  filterSubtitle: string;
  rankings: any[];
}

function performanceLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Average';
  return 'Needs Improvement';
}

export function createRankingsPDF(payload: RankingsPdfPayload, settings: Settings | null): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const schoolName = settings?.schoolName || 'School Management System';
      const schoolAddress = settings?.schoolAddress ? String(settings.schoolAddress).trim() : '';
      const schoolPhone = settings?.schoolPhone ? String(settings.schoolPhone).trim() : '';

      const logoLeftBuf = loadSchoolLogo(settings?.schoolLogo);
      const logoRightBuf = loadSchoolLogo(settings?.schoolLogo2) || logoLeftBuf;

      const headerBarHeight = 80;
      const logoBox = 52;
      const sidePad = 40;
      const textGutter = 10;
      const titleTextLeft = sidePad + logoBox + textGutter;
      const titleTextWidth = doc.page.width - 2 * (sidePad + logoBox + textGutter);

      doc.rect(0, 0, doc.page.width, headerBarHeight).fillColor('#4a90e2').fill();

      const logoY = (headerBarHeight - logoBox) / 2;
      if (logoLeftBuf) {
        drawLogoInBox(doc, logoLeftBuf, sidePad, logoY, logoBox, logoBox);
      }
      if (logoRightBuf) {
        drawLogoInBox(doc, logoRightBuf, doc.page.width - sidePad - logoBox, logoY, logoBox, logoBox);
      }

      doc.fontSize(18).font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.text(schoolName, titleTextLeft, 20, { width: titleTextWidth, align: 'center' });

      doc.fontSize(9).font('Helvetica').fillColor('#E8F4FD');
      const addrParts = [schoolAddress, schoolPhone].filter(Boolean);
      if (addrParts.length > 0) {
        doc.text(addrParts.join('  |  '), titleTextLeft, 44, { width: titleTextWidth, align: 'center' });
      }

      let yPos = 100;
      doc.fontSize(15).font('Helvetica-Bold').fillColor('#111');
      doc.text('STUDENT RANKINGS', 40, yPos, { width: doc.page.width - 80, align: 'center' });
      yPos += 22;
      doc.fontSize(11).font('Helvetica').fillColor('#333');
      const typeLabel =
        payload.rankingType === 'class'
          ? 'Class position'
          : payload.rankingType === 'subject'
            ? 'Subject position'
            : 'Form / overall position';
      doc.text(`${typeLabel}  ·  ${payload.examTypeLabel}`, 40, yPos, { width: doc.page.width - 80, align: 'center' });
      yPos += 16;
      doc.fontSize(10).fillColor('#555');
      doc.text(payload.filterSubtitle, 40, yPos, { width: doc.page.width - 80, align: 'center' });
      yPos += 28;

      const tableLeft = 40;
      const tableRight = doc.page.width - 40;
      const rowHeight = 21;
      const { rankingType, rankings } = payload;

      const headers: string[] = ['Position', 'Student Name'];
      const baseWidths: number[] = [52, 210];
      if (rankingType === 'overall-performance') {
        headers.push('Class');
        baseWidths.push(130);
      }
      if (rankingType === 'class' || rankingType === 'overall-performance') {
        headers.push('Average (%)');
        baseWidths.push(88);
      }
      if (rankingType === 'subject') {
        headers.push('Score');
        headers.push('Percentage (%)');
        baseWidths.push(78);
        baseWidths.push(92);
      }
      headers.push('Performance');
      baseWidths.push(110);

      const totalW = baseWidths.reduce((a, b) => a + b, 0);
      const scale = Math.min(1, (tableRight - tableLeft) / totalW);
      const widths = baseWidths.map((w) => Math.max(36, w * scale));

      const verticalXs: number[] = [tableLeft];
      let xAcc = tableLeft;
      for (const w of widths) {
        xAcc += w;
        verticalXs.push(xAcc);
      }

      let tableSpansMultiplePages = false;
      const tableTop = yPos;

      const strokeGridH = (y: number) => {
        doc.save();
        doc.strokeColor('#a8a8a8').lineWidth(0.55);
        doc.moveTo(tableLeft, y).lineTo(tableRight, y).stroke();
        doc.restore();
      };

      strokeGridH(tableTop);

      doc.rect(tableLeft, yPos, tableRight - tableLeft, rowHeight).fillColor('#3d7dcc').fill();
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF');
      let cx = tableLeft;
      for (let hi = 0; hi < headers.length; hi++) {
        doc.text(headers[hi], cx + 4, yPos + 5, { width: widths[hi] - 8, align: 'left' });
        cx += widths[hi];
      }
      yPos += rowHeight;
      strokeGridH(yPos);

      doc.font('Helvetica').fontSize(9).fillColor('#000000');

      for (let i = 0; i < rankings.length; i++) {
        const r = rankings[i];
        if (yPos + rowHeight > doc.page.height - 45) {
          doc.addPage();
          yPos = 40;
          tableSpansMultiplePages = true;
          strokeGridH(yPos);
        }

        const fill = i % 2 === 0 ? '#e8e8e8' : '#ffffff';
        doc.rect(tableLeft, yPos, tableRight - tableLeft, rowHeight).fillColor(fill).fill();

        const pos =
          r.classPosition ?? r.subjectPosition ?? r.overallPosition ?? r.position ?? i + 1;
        const name = String(r.studentName || '');
        const perfScore =
          rankingType === 'subject' ? Number(r.percentage) || 0 : Number(r.average) || 0;
        const perf = performanceLabel(perfScore);

        const cells: string[] = [String(pos), name];
        if (rankingType === 'overall-performance') {
          cells.push(String(r.class || 'N/A'));
        }
        if (rankingType === 'class' || rankingType === 'overall-performance') {
          cells.push(`${Number(r.average).toFixed(2)}%`);
        }
        if (rankingType === 'subject') {
          cells.push(`${r.score} / ${r.maxScore}`);
          cells.push(`${Number(r.percentage).toFixed(2)}%`);
        }
        cells.push(perf);

        cx = tableLeft;
        for (let ci = 0; ci < cells.length; ci++) {
          const isPerf = ci === cells.length - 1;
          if (isPerf) {
            doc.font('Helvetica-Bold');
          }
          doc.text(cells[ci], cx + 4, yPos + 5, { width: widths[ci] - 8, align: 'left' });
          if (isPerf) {
            doc.font('Helvetica');
          }
          cx += widths[ci];
        }

        yPos += rowHeight;
        strokeGridH(yPos);
      }

      if (!tableSpansMultiplePages) {
        doc.save();
        doc.strokeColor('#a8a8a8').lineWidth(0.55);
        for (const vx of verticalXs) {
          doc.moveTo(vx, tableTop).lineTo(vx, yPos).stroke();
        }
        doc.restore();
      }

      doc.fontSize(8).font('Helvetica').fillColor('#888');
      doc.text(`Generated ${new Date().toLocaleString()}`, 40, doc.page.height - 36);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
