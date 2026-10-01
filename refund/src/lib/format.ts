/** 12345 → "$123.45"; whole dollars drop the cents. */
/**
 * What a purchase cost, as the person would say it. A ticket bought with
 * miles shows the miles: "$5.60" alone reads as a five-dollar flight, when it
 * is only the tax on an award.
 */
export function formatPaid(cents: number | null | undefined, details?: { miles?: number; award?: boolean } | null): string {
  if (details?.miles) {
    const miles = `${new Intl.NumberFormat('en-US').format(details.miles)} miles`;
    return cents ? `${miles} + ${formatMoney(cents)}` : miles;
  }
  if (details?.award && cents != null) return `${formatMoney(cents)} in taxes (award ticket)`;
  return formatMoney(cents);
}

export function formatMoney(cents: number | null | undefined, currency = 'USD'): string {
  if (cents == null) return '—';
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
}

/** Whole days until a date; negative once it has passed. */
export function daysUntil(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000);
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
