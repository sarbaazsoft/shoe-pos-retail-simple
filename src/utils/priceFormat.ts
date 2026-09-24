/**
 * Price Formatting Rule & Decimal Removal Utilities
 *
 * Rule:
 * Remove decimal price rule totally. Never show prices with decimals (e.g. convert 1250.00 or 1250.50 to 1250).
 * All retail shoe prices, subtotals, tender amounts, and inventory costs are displayed as whole integers.
 */

/**
 * Cleans decimal representation for price input fields.
 * Strips all decimals and returns a clean whole integer string.
 */
export function cleanStockPriceInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const s = String(value).replace(/,/g, '').replace(/^[^\d-]+/, '').trim();
  if (!s) return '';
  const n = parseFloat(s);
  if (isNaN(n)) return '';
  return Math.round(n).toString();
}

/**
 * Formats a price or monetary amount for display without any decimals.
 * - Always returns whole number (e.g. "1250", "45", "0").
 * - Decimals like .00, .50, etc. are completely removed.
 */
export function formatStockPrice(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '0';
  if (typeof value === 'number') {
    if (isNaN(value)) return '0';
    return Math.round(value).toString();
  }
  const cleanStr = String(value).replace(/,/g, '').replace(/^[^\d-]+/, '').trim();
  const n = parseFloat(cleanStr);
  if (isNaN(n)) return '0';
  return Math.round(n).toString();
}

/**
 * Helper to display price with currency symbol without decimals.
 */
export function formatStockPriceWithCurrency(
  value: number | string | null | undefined,
  currencySymbol: string = 'Rs.'
): string {
  return `${currencySymbol} ${formatStockPrice(value)}`;
}

/**
 * Standard formatCurrency alias complying with zero-decimal integer rule.
 */
export function formatCurrency(
  value: number | string | null | undefined,
  currencySymbol: string = 'Rs.'
): string {
  return `${currencySymbol} ${formatStockPrice(value)}`;
}

/**
 * Returns the effective retail selling price (M.R.P. / Maximum Sale Price) for a product.
 * This is the exact price that appears on the shoe box barcode sticker and must be the
 * starting price in the POS cart when scanned or typed during checkout.
 *
 * Precedence:
 * 1. maxSalePrice (or max_sale_price) if > 0
 * 2. minSalePrice (or min_sale_price) if > 0
 * 3. basePrice or salePrice if > 0
 * 4. 0 fallback
 */
export function getProductRetailPrice(product: any): number {
  if (!product) return 0;
  const rawMax = product.maxSalePrice ?? product.max_sale_price;
  const max = Number(rawMax);
  if (!isNaN(max) && max > 0) return Math.round(max);

  const rawMin = product.minSalePrice ?? product.min_sale_price;
  const min = Number(rawMin);
  if (!isNaN(min) && min > 0) return Math.round(min);

  const rawBase = product.basePrice ?? product.salePrice ?? product.sale_price;
  const base = Number(rawBase);
  if (!isNaN(base) && base > 0) return Math.round(base);

  return 0;
}

