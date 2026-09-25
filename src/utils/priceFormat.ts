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
 * Calculated in real-time dynamically from costPrice and company pricing policy.
 * This is the exact price that appears on shoe box stickers and barcode stickers,
 * and is the initial starting unit price in the POS cart when scanned or added.
 *
 * Precedence:
 * 1. Real-time Calculation from Cost Price + Company Settings:
 *    - FIXED Mode: Tag Price = Cost Price + Fixed Profit Margin
 *    - NEGOTIABLE Mode: Tag Price = Cost Price + Maximum Profit Margin
 * 2. Fallbacks if cost is 0 or settings absent:
 *    - maxSalePrice / minSalePrice / basePrice
 */
export function getProductRetailPrice(product: any, companySettings?: any): number {
  if (!product) return 0;

  const cost = Number(
    product.costPrice !== undefined && product.costPrice !== null
      ? product.costPrice
      : product.cost_price !== undefined && product.cost_price !== null
      ? product.cost_price
      : product.purchasePrice !== undefined && product.purchasePrice !== null
      ? product.purchasePrice
      : product.purchase_price !== undefined && product.purchase_price !== null
      ? product.purchase_price
      : 0
  );

  if (cost > 0) {
    const rawMode = String(companySettings?.pricing_mode || companySettings?.pricingMode || 'NEGOTIABLE').toUpperCase();
    if (rawMode === 'FIXED') {
      const fixedMargin =
        typeof companySettings?.fixed_profit_margin === 'number'
          ? companySettings.fixed_profit_margin
          : typeof companySettings?.fixedProfitMargin === 'number'
          ? companySettings.fixedProfitMargin
          : parseFloat(companySettings?.fixed_profit_margin || companySettings?.fixedProfitMargin || '30') || 30;
      return Math.round(cost * (1 + fixedMargin / 100));
    } else {
      // NEGOTIABLE: Tag price = Cost + Maximum Profit Margin
      const maxMargin =
        typeof companySettings?.max_profit_margin === 'number'
          ? companySettings.max_profit_margin
          : typeof companySettings?.maxProfitMargin === 'number'
          ? companySettings.maxProfitMargin
          : parseFloat(companySettings?.max_profit_margin || companySettings?.maxProfitMargin || '30') || 30;
      return Math.round(cost * (1 + maxMargin / 100));
    }
  }

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

/**
 * Returns the minimum floor selling price for a product.
 * In Fixed mode: equal to the fixed tag price.
 * In Negotiable mode: Cost Price + Minimum Profit Margin (lowest price allowed at POS).
 */
export function getProductMinFloorPrice(product: any, companySettings?: any): number {
  if (!product) return 0;

  const cost = Number(
    product.costPrice !== undefined && product.costPrice !== null
      ? product.costPrice
      : product.cost_price !== undefined && product.cost_price !== null
      ? product.cost_price
      : product.purchasePrice !== undefined && product.purchasePrice !== null
      ? product.purchasePrice
      : product.purchase_price !== undefined && product.purchase_price !== null
      ? product.purchase_price
      : 0
  );

  if (cost > 0) {
    const rawMode = String(companySettings?.pricing_mode || companySettings?.pricingMode || 'NEGOTIABLE').toUpperCase();
    if (rawMode === 'FIXED') {
      const fixedMargin =
        typeof companySettings?.fixed_profit_margin === 'number'
          ? companySettings.fixed_profit_margin
          : typeof companySettings?.fixedProfitMargin === 'number'
          ? companySettings.fixedProfitMargin
          : parseFloat(companySettings?.fixed_profit_margin || companySettings?.fixedProfitMargin || '30') || 30;
      return Math.round(cost * (1 + fixedMargin / 100));
    } else {
      // NEGOTIABLE: Minimum Floor = Cost + Minimum Profit Margin
      const minMargin =
        typeof companySettings?.min_profit_margin === 'number'
          ? companySettings.min_profit_margin
          : typeof companySettings?.minProfitMargin === 'number'
          ? companySettings.minProfitMargin
          : parseFloat(companySettings?.min_profit_margin || companySettings?.minProfitMargin || '15') || 15;
      return Math.round(cost * (1 + minMargin / 100));
    }
  }

  const rawMin = product.minSalePrice ?? product.min_sale_price;
  const min = Number(rawMin);
  if (!isNaN(min) && min > 0) return Math.round(min);

  return 0;
}

/**
 * Returns a comprehensive real-time pricing breakdown for a product.
 */
export function getProductRealtimePricing(product: any, companySettings?: any) {
  const cost = Number(
    product?.costPrice !== undefined && product?.costPrice !== null
      ? product.costPrice
      : product?.cost_price !== undefined && product?.cost_price !== null
      ? product.cost_price
      : product?.purchasePrice !== undefined && product?.purchasePrice !== null
      ? product.purchasePrice
      : product?.purchase_price !== undefined && product?.purchase_price !== null
      ? product.purchase_price
      : 0
  );
  const retailPrice = getProductRetailPrice(product, companySettings);
  const minFloorPrice = getProductMinFloorPrice(product, companySettings);
  const rawMode = String(companySettings?.pricing_mode || companySettings?.pricingMode || 'NEGOTIABLE').toUpperCase();
  const isFixed = rawMode === 'FIXED';

  return {
    costPrice: cost,
    retailPrice,
    minFloorPrice,
    sellingPrice: retailPrice,
    isFixed,
  };
}

