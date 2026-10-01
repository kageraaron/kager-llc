/** 12345 → "$123.45"; whole dollars drop the cents. */
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
