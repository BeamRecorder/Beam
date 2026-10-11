/** Decimal file sizes, formatted in the user's language. */
export function formatExportSize(bytes: number | null, locale: string): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return '—';
  const unit = bytes >= 1_000_000_000 ? 'gigabyte' : bytes >= 1_000_000 ? 'megabyte' : 'kilobyte';
  const divisor = unit === 'gigabyte' ? 1_000_000_000 : unit === 'megabyte' ? 1_000_000 : 1_000;
  return new Intl.NumberFormat(locale, { style: 'unit', unit, maximumFractionDigits: 1 }).format(bytes / divisor);
}
