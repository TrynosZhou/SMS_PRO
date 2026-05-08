/**
 * Loose match for term labels (e.g. "Term 2 2025" vs settings formatting).
 */
export function termsLooselyMatch(invoiceTerm: string, targetTerm: string): boolean {
  const a = (invoiceTerm || '').trim().toLowerCase();
  const b = (targetTerm || '').trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  const numA = a.match(/term\s*(\d+)/i);
  const numB = b.match(/term\s*(\d+)/i);
  if (!numA || !numB || numA[1] !== numB[1]) return false;

  const yearA = a.match(/(\d{4})/);
  const yearB = b.match(/(\d{4})/);
  if (yearA && yearB) return yearA[1] === yearB[1];
  return true;
}

export function invoicesIncludeTerm(
  invoices: { term?: string | null }[],
  targetTerm: string
): boolean {
  const t = (targetTerm || '').trim();
  if (!t) return false;
  return invoices.some((inv) => termsLooselyMatch(inv.term || '', t));
}
