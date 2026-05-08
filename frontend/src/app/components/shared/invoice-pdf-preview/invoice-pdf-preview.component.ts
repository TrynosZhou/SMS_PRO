import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FinanceService } from '../../../services/finance.service';

@Component({
  selector: 'app-invoice-pdf-preview',
  templateUrl: './invoice-pdf-preview.component.html',
  styleUrls: ['./invoice-pdf-preview.component.css'],
})
export class InvoicePdfPreviewComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Input() blob: Blob | null = null;
  @Input() filename = 'invoice.pdf';

  @Output() closed = new EventEmitter<void>();

  safeUrl: SafeResourceUrl | null = null;
  private objectUrl: string | null = null;

  constructor(
    private sanitizer: DomSanitizer,
    private financeService: FinanceService
  ) {}

  ngOnChanges(_ch: SimpleChanges): void {
    if (!this.open || !this.blob) {
      this.revokeObjectUrl();
      return;
    }
    this.bindBlob();
  }

  ngOnDestroy(): void {
    this.revokeObjectUrl();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) {
      this.requestClose();
    }
  }

  requestClose(): void {
    this.closed.emit();
  }

  download(): void {
    if (!this.blob) {
      return;
    }
    this.financeService.downloadInvoicePdfFile(this.blob, this.filename);
  }

  private bindBlob(): void {
    if (!this.blob) {
      return;
    }
    this.revokeObjectUrl();
    const pdfBlob =
      this.blob.type === 'application/pdf' ? this.blob : new Blob([this.blob], { type: 'application/pdf' });
    this.objectUrl = URL.createObjectURL(pdfBlob);
    this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl);
  }

  private revokeObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.safeUrl = null;
  }
}
