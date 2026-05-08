import PDFDocument from 'pdfkit';
import { Settings } from '../entities/Settings';
import { Teacher } from '../entities/Teacher';
import { Class } from '../entities/Class';
import { TimetableSlot } from '../entities/TimetableSlot';
import { TimetableConfig } from '../entities/TimetableConfig';
import { formatTeacherTitleName, formatTeacherTimetableHeaderLabel } from './teacherDisplayName';
import { calculateTeachingPeriodTimes } from './timetablePeriodTimes';

interface TimetablePDFData {
  type: 'teacher' | 'class' | 'consolidated';
  teacher?: Teacher;
  class?: Class;
  teachers?: Teacher[];
  slots: TimetableSlot[];
  settings: Settings | null;
  config?: TimetableConfig | null;
  versionName?: string;
}

// Helper function to parse time string (HH:MM) to minutes
function parseTime(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

// Helper function to format minutes to time string (HH:MM)
function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/** Second line on class timetable PDF cells: prefer short title, then code, then name. */
function subjectLineForClassPdf(slot: TimetableSlot): string {
  const s = slot.subject;
  if (!s) return '—';
  const st = (s.shortTitle || '').trim();
  if (st) return st;
  const c = (s.code || '').trim();
  if (c) return c.length > 8 ? c.slice(0, 8) : c;
  const n = (s.name || '').trim();
  return n || '—';
}

/** Tea-style breaks → "BREAK TIME"; lunch → "LUNCH TIME" (preview + PDF vertical banners). */
function standardBreakBannerLabel(rawName: string): string {
  const n = (rawName || '').toLowerCase();
  if (n.includes('lunch')) return 'LUNCH TIME';
  if (n.includes('tea')) return 'BREAK TIME';
  return (rawName || 'Break').trim().toUpperCase();
}

/** Font size for one vertical banner spanning many rows (teacher/class or consolidated strip). */
function mergedBreakBannerFontSize(spanHeight: number, colWidth: number): number {
  const h = Math.max(spanHeight, 24);
  const w = Math.max(colWidth, 12);
  return Math.min(17, Math.max(7, Math.floor(Math.min(h / 5.8, w * 0.55))));
}

/** Draw a single line rotated −90° around (centerX, centerY) for narrow break columns (readable vertical). */
function drawPdfBreakBannerVertical(
  doc: InstanceType<typeof PDFDocument>,
  centerX: number,
  centerY: number,
  rawBreakName: string,
  options: { fontSize?: number; fillColor?: string }
): void {
  const label = standardBreakBannerLabel(rawBreakName);
  const fontSize = options.fontSize ?? 7;
  const fill = options.fillColor ?? '#FFFFFF';
  doc.save();
  doc.translate(centerX, centerY);
  doc.rotate(-90);
  doc.fontSize(fontSize).font('Helvetica-Bold').fillColor(fill);
  const tw = Math.max(160, label.length * fontSize * 0.62);
  doc.text(label, -tw / 2, -fontSize * 0.35, { width: tw, align: 'center' });
  doc.restore();
}

/** Column count for teacher/class PDF row (must match draw loops; each break = one column). */
function teacherClassTableColumnCount(
  allPeriods: number[],
  breakPeriods: Array<{ period: number }>
): number {
  let n = 0;
  for (let i = 0; i < allPeriods.length; i++) {
    const period = allPeriods[i];
    const breakBefore = breakPeriods.find((bp) => bp.period === period);
    if (breakBefore && i === 0) {
      n += 1;
      continue;
    }
    n += 1;
    const breakAfter = breakPeriods.find((bp) => bp.period === period + 1);
    if (breakAfter && i < allPeriods.length - 1) {
      n += 1;
    }
  }
  return Math.max(n, 1);
}

export function createTimetablePDF(data: TimetablePDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const { type, teacher, class: classEntity, slots, settings, config } = data;
      
      const doc = new PDFDocument({ margin: 0, size: 'A4', layout: 'landscape' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });

      // Add logo and school name at the top
      const logoX = 40;
      const logoY = 30;
      const logoBox = 60;
      let logoPlaced = false;
      if (settings?.schoolLogo || settings?.schoolLogo2) {
        const logoData = settings.schoolLogo || settings.schoolLogo2;
        try {
          if (typeof logoData === 'string') {
            if (logoData.startsWith('data:')) {
              const base64Data = logoData.split(',')[1];
              const imageBuffer = Buffer.from(base64Data, 'base64');
              doc.image(imageBuffer, logoX, logoY, { width: logoBox, height: logoBox, fit: [logoBox, logoBox] });
              logoPlaced = true;
            } else {
              // Assume it's a URL or file path - for now, skip if not base64
              console.warn('[createTimetablePDF] Logo is not in base64 format, skipping');
            }
          }
        } catch (logoError) {
          console.error('[createTimetablePDF] Error loading logo:', logoError);
        }
      }

      let title = 'TIMETABLE';
      let subtitle = '';
      if (type === 'teacher' && teacher) {
        title = `${settings?.schoolName || 'School'}: ${data.versionName || 'Timetable'}`;
        subtitle = `Teacher: ${formatTeacherTimetableHeaderLabel(
          teacher.firstName,
          teacher.lastName,
          teacher.gender,
          teacher.maritalStatus
        )}`;
      } else if (type === 'class' && classEntity) {
        title = `${settings?.schoolName || 'School'}: ${data.versionName || 'Timetable'}`;
        subtitle = `Class: ${classEntity.name}`;
      } else if (type === 'consolidated') {
        title = `${settings?.schoolName || 'School'}: ${data.versionName || 'Timetable'}`;
        subtitle = 'Summary of teachers';
      }

      const isConsolidatedWithTeachers =
        type === 'consolidated' && data.teachers && data.teachers.length > 0;

      /** Title/subtitle to the right of crest; vertically in line with logo (teacher, class, summary PDFs). */
      const headerTextBesideLogo = (): { yPos: number } => {
        const margin = 40;
        const textGap = 14;
        let textX = margin;
        const titleTop = logoPlaced ? logoY + 4 : 36;
        if (logoPlaced) {
          textX = logoX + logoBox + textGap;
        }
        const textW = doc.page.width - textX - margin;
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#000000');
        doc.text(title, textX, titleTop, { align: 'left', width: textW });
        let rowBelow = titleTop + 20;
        if (subtitle) {
          doc.fontSize(12).font('Helvetica').fillColor('#666666');
          doc.text(subtitle, textX, rowBelow, { align: 'left', width: textW });
          rowBelow += 22;
        }
        const tableStartY = Math.max(rowBelow + 12, logoY + logoBox + 18);
        return { yPos: tableStartY };
      };

      if (isConsolidatedWithTeachers) {
        const { yPos: tableStartY } = headerTextBesideLogo();
        createConsolidatedTimetableLayout(doc, data, settings, config, tableStartY);
        return;
      }

      const isTeacherOrClass =
        (type === 'teacher' && !!teacher) || (type === 'class' && !!classEntity);
      let yPos: number;

      if (isTeacherOrClass) {
        const { yPos: headerBottom } = headerTextBesideLogo();
        yPos = headerBottom;
      } else {
        yPos = 100;
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#000000');
        doc.text(title, 40, yPos, { align: 'center', width: doc.page.width - 80 });
        if (subtitle) {
          yPos += 20;
          doc.fontSize(12).font('Helvetica').fillColor('#666666');
          doc.text(subtitle, 40, yPos, { align: 'center', width: doc.page.width - 80 });
        }
        yPos += 25;
      }

      // Get days of week from slots or config
      const daysOfWeek = config?.daysOfWeek || Array.from(new Set(slots.map(s => s.dayOfWeek))).sort();
      const periods = Array.from(new Set(slots.map(s => s.periodNumber))).sort((a, b) => a - b);
      
      // Get all periods including breaks - calculate time slots
      const allPeriods: number[] = [];
      const periodTimeSlots: Map<number, { startTime: string; endTime: string }> = new Map();
      
      if (config) {
        const timeSlots = calculateTeachingPeriodTimes(config);
        for (let i = 1; i <= config.periodsPerDay; i++) {
          allPeriods.push(i);
          if (timeSlots[i - 1]) {
            periodTimeSlots.set(i, timeSlots[i - 1]);
          }
        }
      } else {
        allPeriods.push(...periods);
        periods.forEach(period => {
          const slot = slots.find(s => s.periodNumber === period && !s.isBreak);
          if (slot && slot.startTime && slot.endTime) {
            periodTimeSlots.set(period, { startTime: slot.startTime, endTime: slot.endTime });
          }
        });
      }

      // Identify break periods and their positions
      const breakPeriods: Array<{ period: number; name: string; startTime: string; endTime: string }> = [];
      if (config?.breakPeriods && config.breakPeriods.length > 0) {
        const timeSlots = calculateTeachingPeriodTimes(config);
        config.breakPeriods.forEach(breakPeriod => {
          // Find which period(s) the break overlaps with
          const breakStart = parseTime(breakPeriod.startTime);
          const breakEnd = parseTime(breakPeriod.endTime);
          
          for (let i = 0; i < timeSlots.length; i++) {
            const periodStart = parseTime(timeSlots[i].startTime);
            const periodEnd = parseTime(timeSlots[i].endTime);
            
            // Check if break overlaps with this period
            if ((breakStart >= periodStart && breakStart < periodEnd) ||
                (breakEnd > periodStart && breakEnd <= periodEnd) ||
                (breakStart <= periodStart && breakEnd >= periodEnd)) {
              breakPeriods.push({
                period: i + 1,
                name: breakPeriod.name,
                startTime: breakPeriod.startTime,
                endTime: breakPeriod.endTime
              });
              break; // Only add once per break
            }
          }
        });
      }

      if (daysOfWeek.length === 0 || allPeriods.length === 0) {
        doc.fontSize(12).font('Helvetica').fillColor('#666666');
        doc.text('No timetable data available.', 40, yPos);
        return;
      }

      // Days as rows, periods as columns — column count must match break insertion logic
      const marginX = 40;
      const pageInner = doc.page.width - marginX * 2;
      const tableStartX = marginX;
      const tableStartY = yPos + 20;
      const dayColumnWidth = Math.min(96, Math.floor(pageInner * 0.12));
      const colCount = teacherClassTableColumnCount(allPeriods, breakPeriods);
      let cellWidth = Math.floor((pageInner - dayColumnWidth) / colCount);
      cellWidth = Math.min(78, Math.max(30, cellWidth));
      const periodHeaderHeight = 46;
      const cellHeight = 46;
      const bodyTopY = tableStartY + periodHeaderHeight;
      const bodyTotalH = daysOfWeek.length * cellHeight;
      const breakBodyBannerFs = mergedBreakBannerFontSize(bodyTotalH, cellWidth);

      const drawBreakHeader = (x: number, bp: { name: string; startTime: string; endTime: string }) => {
        doc.rect(x, tableStartY, cellWidth, periodHeaderHeight).fillColor('#95a5a6').fill();
        doc.fontSize(6).font('Helvetica-Bold').fillColor('#FFFFFF');
        doc.text(`${bp.startTime} – ${bp.endTime}`, x + 3, tableStartY + 15, {
          width: cellWidth - 6,
          align: 'center',
          lineGap: 2,
        });
      };

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.rect(tableStartX, tableStartY, dayColumnWidth, periodHeaderHeight).fillColor('#2c3e50').fill();
      doc.text('Day', tableStartX + 5, tableStartY + 17, { width: dayColumnWidth - 10, align: 'center' });

      let currentX = tableStartX + dayColumnWidth;

      for (let i = 0; i < allPeriods.length; i++) {
        const period = allPeriods[i];
        const timeSlot = periodTimeSlots.get(period);

        const breakBefore = breakPeriods.find((bp) => bp.period === period);
        if (breakBefore && i === 0) {
          drawBreakHeader(currentX, breakBefore);
          currentX += cellWidth;
          continue;
        }

        doc.rect(currentX, tableStartY, cellWidth, periodHeaderHeight).fillColor('#2c3e50').fill();
        if (timeSlot) {
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF');
          doc.text(`${period}`, currentX + 2, tableStartY + 5, { width: cellWidth - 4, align: 'center' });
          doc.fontSize(6).font('Helvetica').fillColor('#E8F4FD');
          doc.text(timeSlot.startTime, currentX + 2, tableStartY + 17, { width: cellWidth - 4, align: 'center' });
          doc.text(timeSlot.endTime, currentX + 2, tableStartY + 26, { width: cellWidth - 4, align: 'center' });
        } else {
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF');
          doc.text(`P${period}`, currentX + 2, tableStartY + 18, { width: cellWidth - 4, align: 'center' });
        }
        currentX += cellWidth;

        const breakAfter = breakPeriods.find((bp) => bp.period === period + 1);
        if (breakAfter && i < allPeriods.length - 1) {
          drawBreakHeader(currentX, breakAfter);
          currentX += cellWidth;
        }
      }

      daysOfWeek.forEach((day, dayIndex) => {
        const rowY = tableStartY + periodHeaderHeight + dayIndex * cellHeight;

        doc.rect(tableStartX, rowY, dayColumnWidth, cellHeight).fillColor('#ecf0f1').fill();
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#2c3e50');
        doc.text(day, tableStartX + 5, rowY + 16, { width: dayColumnWidth - 10, align: 'center' });

        currentX = tableStartX + dayColumnWidth;

        for (let i = 0; i < allPeriods.length; i++) {
          const period = allPeriods[i];

          const breakBefore = breakPeriods.find((bp) => bp.period === period);
          if (breakBefore && i === 0) {
            if (dayIndex === 0) {
              doc.rect(currentX, bodyTopY, cellWidth, bodyTotalH).fillColor('#f0f0f0').fill();
              doc.rect(currentX, bodyTopY, cellWidth, bodyTotalH).strokeColor('#bdc3c7').lineWidth(0.5).stroke();
              drawPdfBreakBannerVertical(doc, currentX + cellWidth / 2, bodyTopY + bodyTotalH / 2, breakBefore.name, {
                fontSize: breakBodyBannerFs,
                fillColor: '#111827',
              });
            }
            currentX += cellWidth;
            continue;
          }

          const cellSlots = slots.filter(
            (s) => s.dayOfWeek === day && s.periodNumber === period && !s.isBreak
          );

          doc.rect(currentX, rowY, cellWidth, cellHeight).strokeColor('#bdc3c7').lineWidth(0.5).stroke();

          if (cellSlots.length > 0) {
            const slot = cellSlots[0];
            const textPad = 5;
            const textW = cellWidth - textPad * 2;

            if (type === 'teacher') {
              const classText = (slot.class?.name || 'N/A').trim();
              const subjectText = (slot.subject?.name || 'N/A').trim();
              doc.fillColor('#2c3e50');
              doc.fontSize(cellWidth < 38 ? 7 : 8).font('Helvetica-Bold');
              doc.text(classText, currentX + textPad, rowY + 5, {
                width: textW,
                align: 'center',
                lineGap: 1,
              });
              const yAfterClass = doc.y;
              doc.fontSize(cellWidth < 38 ? 6.5 : 7).font('Helvetica').fillColor('#34495e');
              doc.text(subjectText, currentX + textPad, yAfterClass + 2, {
                width: textW,
                align: 'center',
                lineGap: 1,
              });
            } else if (type === 'class') {
              const tch = slot.teacher;
              const teacherText = tch
                ? formatTeacherTitleName(tch.firstName, tch.lastName, tch.gender, tch.maritalStatus)
                : '—';
              const subjectText = subjectLineForClassPdf(slot);
              doc.fontSize(cellWidth < 38 ? 7 : 7.5).font('Helvetica-Bold').fillColor('#1a1a2e');
              doc.text(teacherText, currentX + textPad, rowY + 5, {
                width: textW,
                align: 'center',
                lineGap: 1,
              });
              const yAfterT = doc.y;
              doc.fontSize(cellWidth < 38 ? 6.5 : 7).font('Helvetica').fillColor('#34495e');
              doc.text(subjectText, currentX + textPad, yAfterT + 2, {
                width: textW,
                align: 'center',
                lineGap: 1,
              });
            } else {
              doc.fontSize(7).font('Helvetica').fillColor('#34495e');
              doc.text(
                `${slot.teacher?.firstName || ''} ${slot.teacher?.lastName || ''}`.trim(),
                currentX + textPad,
                rowY + 3,
                { width: textW, align: 'center', lineGap: 1 }
              );
              const y1 = doc.y;
              doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#2c3e50');
              doc.text((slot.class?.name || 'N/A').trim(), currentX + textPad, y1 + 1, {
                width: textW,
                align: 'center',
              });
              const y2 = doc.y;
              doc.fontSize(6.5).font('Helvetica').fillColor('#7f8c8d');
              doc.text((slot.subject?.name || 'N/A').trim(), currentX + textPad, y2 + 1, {
                width: textW,
                align: 'center',
              });
            }
          }

          currentX += cellWidth;

          const breakAfter = breakPeriods.find((bp) => bp.period === period + 1);
          if (breakAfter && i < allPeriods.length - 1) {
            if (dayIndex === 0) {
              doc.rect(currentX, bodyTopY, cellWidth, bodyTotalH).fillColor('#f0f0f0').fill();
              doc.rect(currentX, bodyTopY, cellWidth, bodyTotalH).strokeColor('#bdc3c7').lineWidth(0.5).stroke();
              drawPdfBreakBannerVertical(doc, currentX + cellWidth / 2, bodyTopY + bodyTotalH / 2, breakAfter.name, {
                fontSize: breakBodyBannerFs,
                fillColor: '#111827',
              });
            }
            currentX += cellWidth;
          }
        }
      });

      // Footer
      const footerY = tableStartY + periodHeaderHeight + daysOfWeek.length * cellHeight + 20;
      doc.fontSize(8).font('Helvetica').fillColor('#666666');
      doc.text(
        `Timetable generated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}`,
        marginX,
        footerY
      );

      // Finalize the PDF - this triggers the 'end' event
      doc.end();
    } catch (error: any) {
      console.error('[createTimetablePDF] Error:', error);
      console.error('[createTimetablePDF] Error stack:', error.stack);
      reject(error);
    }
  });
}

/**
 * Summary timetable: break/lunch columns are narrow strips (reference PDFs), not as wide as a period.
 * `breakCols` count × this ratio + `periodCols` = relative width units for layout.
 */
const CONSOLIDATED_BREAK_WIDTH_RATIO = 0.18;
const CONSOLIDATED_MIN_BREAK_COL_PX = 8;

/** Count teaching vs break sub-columns in each day strip (order matches draw loops). */
function consolidatedStripColumnCounts(
  allPeriods: number[],
  breakPeriods: Array<{ period: number }>
): { periodCols: number; breakCols: number } {
  let periodCols = 0;
  let breakCols = 0;
  for (let i = 0; i < allPeriods.length; i++) {
    const period = allPeriods[i];
    const breakBefore = breakPeriods.find((bp) => bp.period === period);
    if (breakBefore && i === 0) {
      breakCols++;
      continue;
    }
    periodCols++;
    const breakAfter = breakPeriods.find((bp) => bp.period === period + 1);
    if (breakAfter && i < allPeriods.length - 1) {
      breakCols++;
    }
  }
  return { periodCols: Math.max(periodCols, 0), breakCols };
}

// Special layout for consolidated timetable: Teachers as rows, Days as columns, Periods as sub-columns
function createConsolidatedTimetableLayout(
  doc: InstanceType<typeof PDFDocument>,
  data: TimetablePDFData,
  settings: Settings | null,
  config: TimetableConfig | null,
  startY: number
) {
  const { teachers, slots } = data;
  if (!teachers || teachers.length === 0) {
    doc.fontSize(12).font('Helvetica').fillColor('#666666');
    doc.text('No teachers available.', 40, startY);
    doc.end();
    return;
  }

  const daysOfWeek = config?.daysOfWeek || Array.from(new Set(slots.map((s) => s.dayOfWeek))).sort();
  const allPeriods: number[] = [];

  if (config) {
    for (let i = 1; i <= config.periodsPerDay; i++) {
      allPeriods.push(i);
    }
  } else {
    const periods = Array.from(new Set(slots.map((s) => s.periodNumber))).sort((a, b) => a - b);
    allPeriods.push(...periods);
  }

  const breakPeriods: Array<{ period: number; name: string; startTime: string; endTime: string }> = [];
  if (config?.breakPeriods && config.breakPeriods.length > 0) {
    const timeSlots = calculateTeachingPeriodTimes(config);
    config.breakPeriods.forEach((breakPeriod) => {
      const breakStart = parseTime(breakPeriod.startTime);
      const breakEnd = parseTime(breakPeriod.endTime);

      for (let i = 0; i < timeSlots.length; i++) {
        const periodStart = parseTime(timeSlots[i].startTime);
        const periodEnd = parseTime(timeSlots[i].endTime);

        if (
          (breakStart >= periodStart && breakStart < periodEnd) ||
          (breakEnd > periodStart && breakEnd <= periodEnd) ||
          (breakStart <= periodStart && breakEnd >= periodEnd)
        ) {
          breakPeriods.push({
            period: i + 1,
            name: breakPeriod.name,
            startTime: breakPeriod.startTime,
            endTime: breakPeriod.endTime,
          });
          break;
        }
      }
    });
  }

  const marginX = 40;
  const pageInnerWidth = doc.page.width - marginX * 2;
  const tableStartX = marginX;
  const tableStartY = startY + 10;
  const dayHeaderHeight = 13;
  const periodHeaderHeight = 18;
  const cellHeight = 17;
  const bodyTopY = tableStartY + dayHeaderHeight + periodHeaderHeight;
  const bodyTotalH = teachers.length * cellHeight;
  const { periodCols, breakCols } = consolidatedStripColumnCounts(allPeriods, breakPeriods);
  const numDays = Math.max(1, daysOfWeek.length);
  const effWidthUnits = Math.max(periodCols + breakCols * CONSOLIDATED_BREAK_WIDTH_RATIO, 0.5);

  const gridStroke = '#000000';
  const gridLine = 0.6;

  let teacherColumnWidth = Math.min(72, Math.floor(pageInnerWidth * 0.09));
  let periodColumnWidth = Math.floor(
    (pageInnerWidth - teacherColumnWidth) / (numDays * effWidthUnits)
  );
  const MIN_PERIOD_COL = 14;
  const MAX_PERIOD_COL = 36;
  periodColumnWidth = Math.min(MAX_PERIOD_COL, Math.max(MIN_PERIOD_COL, periodColumnWidth));
  let breakColumnWidth = Math.max(
    CONSOLIDATED_MIN_BREAK_COL_PX,
    Math.round(periodColumnWidth * CONSOLIDATED_BREAK_WIDTH_RATIO)
  );
  let dayWidth = periodCols * periodColumnWidth + breakCols * breakColumnWidth;
  while (teacherColumnWidth + numDays * dayWidth > pageInnerWidth && periodColumnWidth > MIN_PERIOD_COL) {
    periodColumnWidth -= 1;
    breakColumnWidth = Math.max(
      CONSOLIDATED_MIN_BREAK_COL_PX,
      Math.round(periodColumnWidth * CONSOLIDATED_BREAK_WIDTH_RATIO)
    );
    dayWidth = periodCols * periodColumnWidth + breakCols * breakColumnWidth;
  }

  /** Break sub-columns: empty grey band (summary sheet shows no break/lunch wording). */
  const drawBreakHeader = (periodX: number, _bp: { name: string; startTime: string; endTime: string }) => {
    const bw = breakColumnWidth;
    const y0 = tableStartY + dayHeaderHeight;
    doc.rect(periodX, y0, bw, periodHeaderHeight).fillColor('#95a5a6').fill();
    doc.rect(periodX, y0, bw, periodHeaderHeight).strokeColor(gridStroke).lineWidth(gridLine).stroke();
  };

  /** Period sub-columns: number only (summary sheet matches common school printout). */
  const drawPeriodHeader = (periodX: number, period: number) => {
    const y0 = tableStartY + dayHeaderHeight;
    doc.rect(periodX, y0, periodColumnWidth, periodHeaderHeight).fillColor('#2c3e50').fill();
    doc.rect(periodX, y0, periodColumnWidth, periodHeaderHeight).strokeColor(gridStroke).lineWidth(gridLine).stroke();
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF');
    doc.text(String(period), periodX + 1, y0 + periodHeaderHeight / 2 - 3, {
      width: periodColumnWidth - 4,
      align: 'center',
    });
  };

  // Teacher column header
  const hdrH = dayHeaderHeight + periodHeaderHeight;
  doc.rect(tableStartX, tableStartY, teacherColumnWidth, hdrH).fillColor('#2c3e50').fill();
  doc.rect(tableStartX, tableStartY, teacherColumnWidth, hdrH).strokeColor(gridStroke).lineWidth(gridLine).stroke();
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF');
  doc.text('Teacher', tableStartX + 3, tableStartY + hdrH / 2 - 4, {
    width: teacherColumnWidth - 10,
    align: 'center',
  });

  let dayX = tableStartX + teacherColumnWidth;
  daysOfWeek.forEach((day) => {
    doc.rect(dayX, tableStartY, dayWidth, dayHeaderHeight).fillColor('#34495e').fill();
    doc.rect(dayX, tableStartY, dayWidth, dayHeaderHeight).strokeColor(gridStroke).lineWidth(gridLine).stroke();
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF');
    doc.text(day, dayX + 2, tableStartY + 2, { width: dayWidth - 4, align: 'center' });

    let periodX = dayX;
    for (let i = 0; i < allPeriods.length; i++) {
      const period = allPeriods[i];
      const breakBefore = breakPeriods.find((bp) => bp.period === period);
      if (breakBefore && i === 0) {
        drawBreakHeader(periodX, breakBefore);
        periodX += breakColumnWidth;
        continue;
      }
      drawPeriodHeader(periodX, period);
      periodX += periodColumnWidth;

      const breakAfter = breakPeriods.find((bp) => bp.period === period + 1);
      if (breakAfter && i < allPeriods.length - 1) {
        drawBreakHeader(periodX, breakAfter);
        periodX += breakColumnWidth;
      }
    }

    dayX += dayWidth;
  });

  teachers.forEach((teacher, teacherIndex) => {
    const rowY = tableStartY + dayHeaderHeight + periodHeaderHeight + teacherIndex * cellHeight;

    doc.rect(tableStartX, rowY, teacherColumnWidth, cellHeight).fillColor('#ecf0f1').fill();
    doc.rect(tableStartX, rowY, teacherColumnWidth, cellHeight).strokeColor(gridStroke).lineWidth(gridLine).stroke();
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#2c3e50');
    const teacherName = formatTeacherTimetableHeaderLabel(
      teacher.firstName,
      teacher.lastName,
      teacher.gender,
      teacher.maritalStatus
    );
    doc.text(teacherName, tableStartX + 2, rowY + 2, {
      width: teacherColumnWidth - 4,
      align: 'left',
      lineGap: 1,
      lineBreak: true,
    });

    dayX = tableStartX + teacherColumnWidth;
    daysOfWeek.forEach((day) => {
      let periodX = dayX;

      for (let i = 0; i < allPeriods.length; i++) {
        const period = allPeriods[i];
        const breakBefore = breakPeriods.find((bp) => bp.period === period);
        if (breakBefore && i === 0) {
          const bw = breakColumnWidth;
          if (teacherIndex === 0) {
            doc.rect(periodX, bodyTopY, bw, bodyTotalH).fillColor('#f3f4f6').fill();
            doc.rect(periodX, bodyTopY, bw, bodyTotalH).strokeColor(gridStroke).lineWidth(gridLine).stroke();
          }
          periodX += bw;
          continue;
        }

        const cellSlots = slots.filter(
          (s) =>
            s.teacherId === teacher.id &&
            s.dayOfWeek === day &&
            s.periodNumber === period &&
            !s.isBreak
        );

        doc.rect(periodX, rowY, periodColumnWidth, cellHeight).strokeColor(gridStroke).lineWidth(gridLine).stroke();

        if (cellSlots.length > 0) {
          const parts = cellSlots
            .map((s) => (s.class?.name || '').trim())
            .filter(Boolean);
          const classCode = parts.length ? parts.join('\n') : 'N/A';
          const fs = periodColumnWidth < 22 ? 5 : periodColumnWidth < 30 ? 5.5 : 6.5;
          doc.fontSize(fs).font('Helvetica-Bold').fillColor('#2c3e50');
          doc.text(classCode, periodX + 2, rowY + 1, {
            width: periodColumnWidth - 4,
            align: 'center',
            lineGap: 0.35,
            lineBreak: true,
          });
        }

        periodX += periodColumnWidth;

        const breakAfter = breakPeriods.find((bp) => bp.period === period + 1);
        if (breakAfter && i < allPeriods.length - 1) {
          const bw = breakColumnWidth;
          if (teacherIndex === 0) {
            doc.rect(periodX, bodyTopY, bw, bodyTotalH).fillColor('#f3f4f6').fill();
            doc.rect(periodX, bodyTopY, bw, bodyTotalH).strokeColor(gridStroke).lineWidth(gridLine).stroke();
          }
          periodX += bw;
        }
      }

      dayX += dayWidth;
    });
  });

  const footerY = tableStartY + dayHeaderHeight + periodHeaderHeight + teachers.length * cellHeight + 20;
  doc.fontSize(8).font('Helvetica').fillColor('#666666');
  doc.text(
    `Timetable generated: ${new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    })}`,
    marginX,
    footerY
  );

  doc.end();
}
