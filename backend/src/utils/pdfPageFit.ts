/** A4 single-page layout helpers (points). */
export const PDF_PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 40,
} as const;

export function usablePageHeight(): number {
  return PDF_PAGE.height - PDF_PAGE.margin * 2;
}

export function fitScale(contentHeight: number, minScale = 0.52): number {
  const available = usablePageHeight();
  if (contentHeight <= available) return 1;
  return Math.max(minScale, available / contentHeight);
}

export function s(value: number, scale: number): number {
  return Math.max(1, value * scale);
}

export interface CompactLayout {
  scale: number;
  margin: number;
  logoSize: number;
  rowHeight: number;
  gap: number;
  titleSize: number;
  sectionTitleSize: number;
  bodySize: number;
  tableHeaderSize: number;
  tableRowSize: number;
}

export function invoiceLayout(rowCount: number, opts: { hasPaymentBox: boolean; hasBanking: boolean }): CompactLayout {
  const footerReserve = 28;
  const bankingReserve = opts.hasBanking ? 98 : 0;
  const headerBlock = 100;
  const detailsBlock = 118;
  const tableHeader = 20;
  const totalRow = 28;
  const afterTable = opts.hasPaymentBox ? 72 : 34;
  const gaps = 7 * 6;

  const fixedNoRows =
    headerBlock + detailsBlock + tableHeader + totalRow + afterTable + footerReserve + bankingReserve + gaps;
  const availableForRows = usablePageHeight() - fixedNoRows;
  const rowHeight = Math.min(22, Math.max(10, Math.floor(availableForRows / Math.max(1, rowCount))));

  const contentHeight = fixedNoRows + rowCount * rowHeight;
  const scale = fitScale(contentHeight, 0.48);

  return {
    scale,
    margin: PDF_PAGE.margin,
    logoSize: s(58, scale),
    rowHeight: Math.max(11, rowHeight * scale),
    gap: s(8, scale),
    titleSize: s(16, scale),
    sectionTitleSize: s(11, scale),
    bodySize: s(8.5, scale),
    tableHeaderSize: s(9, scale),
    tableRowSize: s(8.5, scale),
  };
}

export function receiptLayout(opts: { hasNotes: boolean; isPrepayment: boolean }): CompactLayout {
  let fixed = 100 + 118 + 20 + 24 + 108 + 34 + 26 + 28;
  if (opts.isPrepayment) fixed += 20;
  if (opts.hasNotes) fixed += 38;
  fixed += 7 * 5;

  const scale = fitScale(fixed, 0.55);

  return {
    scale,
    margin: PDF_PAGE.margin,
    logoSize: s(58, scale),
    rowHeight: s(20, scale),
    gap: s(8, scale),
    titleSize: s(16, scale),
    sectionTitleSize: s(11, scale),
    bodySize: s(8.5, scale),
    tableHeaderSize: s(9, scale),
    tableRowSize: s(8.5, scale),
  };
}
