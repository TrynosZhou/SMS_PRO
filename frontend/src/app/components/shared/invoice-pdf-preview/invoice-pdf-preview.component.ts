import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { getDocument, GlobalWorkerOptions, PDFDocumentProxy } from 'pdfjs-dist';
import { FinanceService } from '../../../services/finance.service';

type ZoomMode = 'auto' | 'page-actual' | 'custom';

@Component({
  selector: 'app-invoice-pdf-preview',
  templateUrl: './invoice-pdf-preview.component.html',
  styleUrls: ['./invoice-pdf-preview.component.css'],
})
export class InvoicePdfPreviewComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Input() blob: Blob | null = null;
  @Input() filename = 'invoice.pdf';
  @Input() documentTitle = 'Invoice statement';

  @Output() closed = new EventEmitter<void>();

  @ViewChild('pageHost') pageHost?: ElementRef<HTMLDivElement>;
  @ViewChild('canvasWrap') canvasWrap?: ElementRef<HTMLDivElement>;

  loading = false;
  loadError = '';
  pageNum = 1;
  numPages = 0;
  rotation = 0;
  zoomMode: ZoomMode = 'auto';
  zoomPercent = 100;

  private pdfDoc: PDFDocumentProxy | null = null;
  private renderTask: { cancel?: () => void } | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private static workerConfigured = false;

  constructor(
    private financeService: FinanceService,
    private cdr: ChangeDetectorRef
  ) {
    this.ensureWorker();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] || changes['blob']) {
      if (this.open && this.blob) {
        void this.loadPdf();
      } else if (!this.open) {
        this.cleanupPdf();
      }
    }
  }

  ngOnDestroy(): void {
    this.cleanupPdf();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) {
      this.requestClose();
    }
  }

  get zoomSelectValue(): string {
    if (this.zoomMode === 'auto') return 'auto';
    if (this.zoomMode === 'page-actual') return 'page-actual';
    return String(this.zoomPercent);
  }

  get pageLabel(): string {
    if (!this.numPages) return '0 of 0';
    return `${this.pageNum} of ${this.numPages}`;
  }

  requestClose(): void {
    this.closed.emit();
  }

  download(): void {
    if (!this.blob) return;
    this.financeService.downloadInvoicePdfFile(this.blob, this.filename);
  }

  print(): void {
    if (!this.blob) return;
    const url = URL.createObjectURL(this.blob);
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (win) {
      win.addEventListener('load', () => {
        win.focus();
        win.print();
      });
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  rotate(): void {
    this.rotation = (this.rotation + 90) % 360;
    void this.renderCurrentPage();
  }

  zoomIn(): void {
    this.applyCustomZoom(this.getEffectiveZoomPercent() + 10);
    void this.renderCurrentPage();
  }

  zoomOut(): void {
    this.applyCustomZoom(Math.max(25, this.getEffectiveZoomPercent() - 10));
    void this.renderCurrentPage();
  }

  onZoomSelect(value: string): void {
    if (value === 'auto') {
      this.zoomMode = 'auto';
    } else if (value === 'page-actual') {
      this.zoomMode = 'page-actual';
    } else {
      this.zoomMode = 'custom';
      this.zoomPercent = Number(value) || 100;
    }
    void this.renderCurrentPage();
  }

  prevPage(): void {
    if (this.pageNum <= 1) return;
    this.pageNum -= 1;
    void this.renderCurrentPage();
  }

  nextPage(): void {
    if (this.pageNum >= this.numPages) return;
    this.pageNum += 1;
    void this.renderCurrentPage();
  }

  private ensureWorker(): void {
    if (InvoicePdfPreviewComponent.workerConfigured) return;
    GlobalWorkerOptions.workerSrc = '/assets/pdfjs/pdf.worker.min.mjs';
    InvoicePdfPreviewComponent.workerConfigured = true;
  }

  private async loadPdf(): Promise<void> {
    this.cleanupPdf(false);
    if (!this.blob) return;

    this.loading = true;
    this.loadError = '';
    this.pageNum = 1;
    this.numPages = 0;

    try {
      const buffer = await this.blob.arrayBuffer();
      this.pdfDoc = await getDocument({ data: buffer }).promise;
      this.numPages = this.pdfDoc.numPages;
      this.loading = false;
      this.cdr.detectChanges();
      this.bindResizeObserver();
      await this.renderCurrentPage();
    } catch (err) {
      console.error('Invoice PDF preview:', err);
      this.loading = false;
      this.loadError = 'Could not display this PDF. Try downloading the file instead.';
    }
  }

  private bindResizeObserver(): void {
    this.resizeObserver?.disconnect();
    const el = this.canvasWrap?.nativeElement;
    if (!el || typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => {
      if (this.zoomMode === 'auto') {
        void this.renderCurrentPage();
      }
    });
    this.resizeObserver.observe(el);
  }

  private async renderCurrentPage(): Promise<void> {
    if (!this.pdfDoc || !this.pageHost?.nativeElement) return;

    this.renderTask?.cancel?.();
    this.renderTask = null;

    try {
      const page = await this.pdfDoc.getPage(this.pageNum);
      const scale = this.computeScale(page.getViewport({ scale: 1, rotation: this.rotation }));
      const viewport = page.getViewport({ scale, rotation: this.rotation });

      const canvas = document.createElement('canvas');
      canvas.className = 'inv-preview-canvas';
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      const host = this.pageHost.nativeElement;
      host.innerHTML = '';
      host.appendChild(canvas);

      const task = page.render({ canvasContext: ctx, viewport });
      this.renderTask = task;
      await task.promise;
    } catch (err: unknown) {
      if (String(err).includes('Rendering cancelled')) return;
      console.error('Invoice PDF render:', err);
      this.loadError = 'Could not render this page.';
    }
  }

  private computeScale(baseViewport: { width: number }): number {
    const wrap = this.canvasWrap?.nativeElement;
    const available = wrap ? Math.max(280, wrap.clientWidth - 48) : 720;

    if (this.zoomMode === 'page-actual') {
      return 1;
    }
    if (this.zoomMode === 'auto') {
      return available / baseViewport.width;
    }
    const fitScale = available / baseViewport.width;
    return fitScale * (this.zoomPercent / 100);
  }

  private getEffectiveZoomPercent(): number {
    if (this.zoomMode === 'custom') return this.zoomPercent;
    return 100;
  }

  private applyCustomZoom(percent: number): void {
    this.zoomMode = 'custom';
    this.zoomPercent = percent;
  }

  private cleanupPdf(clearHost = true): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.renderTask?.cancel?.();
    this.renderTask = null;
    void this.pdfDoc?.destroy();
    this.pdfDoc = null;
    this.numPages = 0;
    this.pageNum = 1;
    this.loading = false;
    if (clearHost && this.pageHost?.nativeElement) {
      this.pageHost.nativeElement.innerHTML = '';
    }
  }
}
