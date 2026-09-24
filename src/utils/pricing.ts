/**
 * Automatic Pricing Calculation & Adaptive Smart-Rounding Engine
 *
 * Core Rules:
 * 1. Raw Calculation:
 *    - Percentage:
 *      MinimumProfitPrice = CostPrice * (1 + MinimumProfitMargin / 100)
 *      MaximumProfitPrice = CostPrice * (1 + MaximumProfitMargin / 100)
 *    - Fixed Amount:
 *      MinimumProfitPrice = CostPrice + MinimumProfitMargin
 *      MaximumProfitPrice = CostPrice + MaximumProfitMargin
 *
 * 2. Adaptive Upward Rounding:
 *    - < 1,000       -> nearest 10 or 50, always upward
 *    - 1,000–4,999   -> nearest 50, always upward
 *    - 5,000–9,999   -> nearest 100 or 250, always upward
 *    - 10,000–49,999 -> nearest 500, always upward
 *    - 50,000+       -> nearest 1,000, always upward
 *
 * 3. Invariant Boundaries:
 *    - CostPrice <= MinimumProfitPrice <= MaximumProfitPrice
 *    - Never round downward; always round upward.
 *    - Minimum Profit Price never falls below the configured minimum margin requirement.
 *    - If rounding causes an issue, automatically adjust to the next valid price point.
 */

export interface PricingCalculationOptions {
  lowRangeStep?: 10 | 50;
  midRangeStep?: 100 | 250;
  marginType?: 'percent' | 'fixed';
  roundCost?: boolean;
}

export interface PricingCalculationParams {
  costPrice: number;
  minProfitMargin: number;
  maxProfitMargin: number;
  options?: PricingCalculationOptions;
}

export interface PricingResult {
  // Cost prices
  costPrice: number;
  roundedCostPrice: number;

  // Raw calculated prices before rounding
  rawMinPrice: number;
  rawMaxPrice: number;

  // Final smart-rounded prices (always rounded upward)
  minProfitPrice: number;
  maxProfitPrice: number;

  // Actual realized profit amounts
  actualMinProfit: number;
  actualMaxProfit: number;

  // Actual realized margin percentages
  actualMinMarginPercent: number;
  actualMaxMarginPercent: number;

  // Adaptive rounding steps applied
  costStep: number;
  minPriceStep: number;
  maxPriceStep: number;

  // Margin type used
  marginType: 'percent' | 'fixed';
}

/**
 * Returns the adaptive rounding step for a given price point.
 * Adaptive Scale:
 * - < 1,000:
 *     < 250 -> 10 (or options.lowRangeStep)
 *     250–999 -> 50 (or options.lowRangeStep)
 * - 1,000–4,999 -> 50
 * - 5,000–9,999 -> 100 (or options.midRangeStep)
 * - 10,000–49,999 -> 500
 * - 50,000+ -> 1,000
 */
export function getSmartRoundingStep(
  price: number,
  options?: PricingCalculationOptions
): number {
  const p = Math.max(0, price);
  if (p < 250) {
    return options?.lowRangeStep ?? 10;
  }
  if (p < 1000) {
    return options?.lowRangeStep === 10 ? 10 : 50;
  }
  if (p < 5000) {
    return 50;
  }
  if (p < 10000) {
    return options?.midRangeStep ?? 100;
  }
  if (p < 50000) {
    return 500;
  }
  return 1000;
}

/**
 * Automatically rounds a price UPWARD to the nearest clean price point according to adaptive scale.
 * Never rounds downward.
 */
export function smartRoundUp(
  price: number,
  options?: PricingCalculationOptions
): number {
  if (typeof price !== 'number' || isNaN(price) || price <= 0) {
    return 0;
  }
  const step = getSmartRoundingStep(price, options);
  return Math.ceil(price / step) * step;
}

/**
 * Returns the next valid clean price point strictly greater than the input price.
 * Used when rounding or margin collisions occur to preserve Cost <= Min <= Max.
 */
export function getNextCleanPrice(
  price: number,
  options?: PricingCalculationOptions
): number {
  const current = smartRoundUp(price, options);
  const step = getSmartRoundingStep(current + 1, options);
  return current + step;
}

/**
 * Comprehensive Pricing Calculation:
 * Raw Calculation -> Smart Upward Rounding -> Margin Validation -> Final Price
 */
export function calculateAutomaticPricing(
  params: PricingCalculationParams
): PricingResult {
  const { costPrice, minProfitMargin, maxProfitMargin, options = {} } = params;
  const marginType = options.marginType ?? 'percent';

  const rawCost = Math.max(0, Number(costPrice) || 0);
  const rawMinMargin = Math.max(0, Number(minProfitMargin) || 0);
  // Ensure maxProfitMargin is at least minProfitMargin
  const rawMaxMargin = Math.max(rawMinMargin, Number(maxProfitMargin) || 0);

  // 1. Raw Calculations
  let rawMinPrice = 0;
  let rawMaxPrice = 0;

  if (rawCost > 0) {
    if (marginType === 'fixed') {
      rawMinPrice = rawCost + rawMinMargin;
      rawMaxPrice = rawCost + rawMaxMargin;
    } else {
      rawMinPrice = rawCost * (1 + rawMinMargin / 100);
      rawMaxPrice = rawCost * (1 + rawMaxMargin / 100);
    }
  }

  // 2. Smart Upward Rounding
  const roundedCostPrice = rawCost > 0 ? smartRoundUp(rawCost, options) : 0;
  let finalMinPrice = rawMinPrice > 0 ? smartRoundUp(rawMinPrice, options) : 0;
  let finalMaxPrice = rawMaxPrice > 0 ? smartRoundUp(rawMaxPrice, options) : 0;

  // 3. Margin & Relationship Validation
  // Rule A: Never round downward - final prices must be >= raw prices
  if (finalMinPrice < rawMinPrice) {
    finalMinPrice = smartRoundUp(rawMinPrice, options);
  }
  if (finalMaxPrice < rawMaxPrice) {
    finalMaxPrice = smartRoundUp(rawMaxPrice, options);
  }

  // Rule B: Never allow Minimum Profit Price to fall below CostPrice
  if (rawCost > 0) {
    if (finalMinPrice < rawCost) {
      finalMinPrice = smartRoundUp(rawCost, options);
    }
  }

  // Rule C: Ensure CostPrice <= MinimumProfitPrice <= MaximumProfitPrice
  if (finalMaxPrice < finalMinPrice) {
    finalMaxPrice = finalMinPrice;
  }

  // Rule D: If max margin was configured strictly higher than min margin,
  // ensure finalMaxPrice is at least the next clean price point if rounding collided
  if (rawMaxMargin > rawMinMargin && finalMaxPrice === finalMinPrice && finalMinPrice > 0) {
    finalMaxPrice = getNextCleanPrice(finalMinPrice, options);
  }

  // 4. Recalculate Actual Profit and Margin Percentages after rounding
  const actualMinProfit = rawCost > 0 ? Math.max(0, finalMinPrice - rawCost) : 0;
  const actualMaxProfit = rawCost > 0 ? Math.max(0, finalMaxPrice - rawCost) : 0;

  const actualMinMarginPercent =
    rawCost > 0 ? (actualMinProfit / rawCost) * 100 : 0;
  const actualMaxMarginPercent =
    rawCost > 0 ? (actualMaxProfit / rawCost) * 100 : 0;

  return {
    costPrice: rawCost,
    roundedCostPrice,
    rawMinPrice: Math.round(rawMinPrice * 100) / 100,
    rawMaxPrice: Math.round(rawMaxPrice * 100) / 100,
    minProfitPrice: finalMinPrice,
    maxProfitPrice: finalMaxPrice,
    actualMinProfit: Math.round(actualMinProfit * 100) / 100,
    actualMaxProfit: Math.round(actualMaxProfit * 100) / 100,
    actualMinMarginPercent: Math.round(actualMinMarginPercent * 100) / 100,
    actualMaxMarginPercent: Math.round(actualMaxMarginPercent * 100) / 100,
    costStep: getSmartRoundingStep(rawCost, options),
    minPriceStep: getSmartRoundingStep(rawMinPrice, options),
    maxPriceStep: getSmartRoundingStep(rawMaxPrice, options),
    marginType,
  };
}
