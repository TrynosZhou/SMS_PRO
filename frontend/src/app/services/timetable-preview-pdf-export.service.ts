import { Injectable } from '@angular/core';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Renders a DOM subtree (timetable preview sheet) to a landscape A4 PDF to match on-screen layout.
 */
@Injectable({ providedIn: 'root' })
export class TimetablePreviewPdfExportService {
  /**
   * Root is `.tt-teacher-sheet`; the grid is inside `.tt-teacher-table-scroll` and may be wider than the sheet
   * when `max-width: 100%` + `overflow-x: auto` — use inner scroll/table metrics so html2canvas does not clip columns.
   */
  private measureCaptureSize(root: HTMLElement): { width: number; height: number } {
    const scroll = root.querySelector('.tt-teacher-table-scroll') as HTMLElement | null;
    const table = scroll?.querySelector('table') as HTMLElement | null;
    const tableRectW = table ? Math.ceil(table.getBoundingClientRect().width) : 0;
    const width = Math.ceil(
      Math.max(
        1,
        root.scrollWidth,
        root.offsetWidth,
        scroll?.scrollWidth ?? 0,
        scroll?.offsetWidth ?? 0,
        table?.scrollWidth ?? 0,
        table?.offsetWidth ?? 0,
        tableRectW
      ) + 8
    );
    const height = Math.ceil(
      Math.max(
        1,
        root.scrollHeight,
        root.offsetHeight,
        scroll?.scrollHeight ?? 0,
        table?.scrollHeight ?? 0
      ) + 8
    );
    return { width, height };
  }

  private async buildLandscapePdfFromElement(element: HTMLElement): Promise<jsPDF> {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await new Promise<void>((resolve) => setTimeout(resolve, 60));

    const { width: w, height: h } = this.measureCaptureSize(element);

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: '#ffffff',
      width: w,
      height: h,
      windowWidth: w,
      windowHeight: h,
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      onclone: (clonedDoc) => {
        clonedDoc.querySelectorAll('.tt-teacher-sheet').forEach((node) => {
          const el = node as HTMLElement;
          el.style.setProperty('max-width', 'none', 'important');
          el.style.setProperty('width', 'max-content', 'important');
        });
        clonedDoc.querySelectorAll('.tt-teacher-table-scroll').forEach((node) => {
          const el = node as HTMLElement;
          el.style.setProperty('overflow', 'visible', 'important');
          el.style.setProperty('max-width', 'none', 'important');
        });
      },
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'pt',
      format: 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * pageWidth) / canvas.width;

    let heightLeft = imgHeight;
    let y = 0;

    pdf.addImage(imgData, 'PNG', 0, y, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 1) {
      y = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, y, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    return pdf;
  }

  /** One landscape PDF bytes (e.g. for bundling into a ZIP). */
  async exportElementToLandscapePdfBlob(element: HTMLElement): Promise<Blob> {
    const pdf = await this.buildLandscapePdfFromElement(element);
    return pdf.output('blob');
  }

  async exportElementToLandscapePdf(element: HTMLElement, fileName: string): Promise<void> {
    const pdf = await this.buildLandscapePdfFromElement(element);
    const safe = fileName.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'timetable.pdf';
    pdf.save(safe.endsWith('.pdf') ? safe : `${safe}.pdf`);
  }
}
