// Static rates — AUD base (how many AUD per 1 unit of each currency)
// Update these periodically or replace with a live rate API in Phase 4
export const RATES_TO_AUD: Record<string, number> = {
  AUD: 1.00,
  USD: 1.55,
  GBP: 1.97,
  EUR: 1.68,
  NZD: 0.91,
  SGD: 1.16,
  CAD: 1.12,
};

export function convertToAUD(amount: number, fromCurrency: string): number {
  const rate = RATES_TO_AUD[fromCurrency];
  if (!rate) throw new Error(`Unsupported currency: ${fromCurrency}`);
  return Math.round(amount * rate * 100) / 100;
}

export function convertFromAUD(amountAUD: number, toCurrency: string): number {
  const rate = RATES_TO_AUD[toCurrency];
  if (!rate) throw new Error(`Unsupported currency: ${toCurrency}`);
  return Math.round((amountAUD / rate) * 100) / 100;
}

export function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}
