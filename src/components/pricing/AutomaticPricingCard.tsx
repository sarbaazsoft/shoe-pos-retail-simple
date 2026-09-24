import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  ShieldCheck,
  Sliders,
  DollarSign,
  Percent,
} from 'lucide-react';
import {
  calculateAutomaticPricing,
  getSmartRoundingStep,
  PricingResult,
} from '../../utils/pricing.ts';

interface AutomaticPricingCardProps {
  costPrice: number | string;
  defaultMinMargin?: number;
  defaultMaxMargin?: number;
  currencySymbol?: string;
  onPricesCalculated?: (result: PricingResult) => void;
  allowMarginCustomization?: boolean;
  compact?: boolean;
  marginType?: 'percent' | 'fixed';
  minMargin?: number;
  maxMargin?: number;
  onMarginTypeChange?: (type: 'percent' | 'fixed') => void;
  onMinMarginChange?: (val: number) => void;
  onMaxMarginChange?: (val: number) => void;
}

export const AutomaticPricingCard: React.FC<AutomaticPricingCardProps> = ({
  costPrice,
  defaultMinMargin = 15,
  defaultMaxMargin = 30,
  currencySymbol = 'Rs.',
  onPricesCalculated,
  allowMarginCustomization = true,
  compact: _compact = false,
  marginType: controlledMarginType,
  minMargin: controlledMinMargin,
  maxMargin: controlledMaxMargin,
  onMarginTypeChange,
  onMinMarginChange,
  onMaxMarginChange,
}) => {
  const [localMinMargin, setLocalMinMargin] = useState<number>(defaultMinMargin);
  const [localMaxMargin, setLocalMaxMargin] = useState<number>(defaultMaxMargin);
  const [localMarginType, setLocalMarginType] = useState<'percent' | 'fixed'>('percent');
  const [isCustomizing, setIsCustomizing] = useState(false);

  const marginType = controlledMarginType !== undefined ? controlledMarginType : localMarginType;
  const minMargin = controlledMinMargin !== undefined ? controlledMinMargin : localMinMargin;
  const maxMargin = controlledMaxMargin !== undefined ? controlledMaxMargin : localMaxMargin;

  // Sync when default margins change from settings
  useEffect(() => {
    if (!isCustomizing && controlledMinMargin === undefined && controlledMaxMargin === undefined) {
      setLocalMinMargin(defaultMinMargin);
      setLocalMaxMargin(defaultMaxMargin);
    }
  }, [defaultMinMargin, defaultMaxMargin, isCustomizing, controlledMinMargin, controlledMaxMargin]);

  const numericCost = typeof costPrice === 'number' ? costPrice : parseFloat(String(costPrice)) || 0;

  const pricingResult: PricingResult = calculateAutomaticPricing({
    costPrice: numericCost,
    minProfitMargin: minMargin,
    maxProfitMargin: maxMargin,
    options: {
      marginType,
    },
  });

  // Notify parent component whenever pricing results are recalculated
  useEffect(() => {
    if (onPricesCalculated) {
      onPricesCalculated(pricingResult);
    }
  }, [
    numericCost,
    minMargin,
    maxMargin,
    marginType,
    pricingResult.minProfitPrice,
    pricingResult.maxProfitPrice,
  ]);

  const activeStep = getSmartRoundingStep(numericCost > 0 ? numericCost : 1000);

  const handleToggleMarginType = (type: 'percent' | 'fixed') => {
    if (onMarginTypeChange) {
      onMarginTypeChange(type);
    } else {
      setLocalMarginType(type);
    }
  };

  const handleMinChange = (val: number) => {
    if (onMinMarginChange) {
      onMinMarginChange(val);
    } else {
      setLocalMinMargin(val);
    }
  };

  const handleMaxChange = (val: number) => {
    if (onMaxMarginChange) {
      onMaxMarginChange(val);
    } else {
      setLocalMaxMargin(val);
    }
  };

  return (
    <div
      id="automatic-pricing-calculation-system"
      className="bg-slate-50/90 dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 border border-slate-200 dark:border-[#1A263D] rounded-xl p-3 sm:p-3.5 shadow-xs dark:shadow-[0_0_20px_rgba(59,130,246,0.05)] space-y-3 text-slate-800 dark:text-slate-200"
    >
      {/* HEADER WITH ADAPTIVE STEP BADGE */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2.5 ${
          isCustomizing && allowMarginCustomization ? 'pb-2.5 border-b border-slate-200/80 dark:border-slate-800/80' : ''
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg shadow-2xs shrink-0">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 truncate">
              Automatic Pricing & Smart-Rounding Engine
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Raw Calculation → Smart Upward Rounding → Margin Validation → Final Price
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/80 dark:border-indigo-800/60 rounded-lg text-[11px] font-semibold text-indigo-700 dark:text-indigo-300"
            title="Adaptive upward rounding step based on current price range"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            Adaptive Step: +{currencySymbol} {activeStep} (Always Upward)
          </span>

          {allowMarginCustomization && (
            <button
              type="button"
              onClick={() => setIsCustomizing(!isCustomizing)}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition cursor-pointer flex items-center gap-1.5 ${
                isCustomizing
                  ? 'bg-indigo-600 dark:bg-indigo-500 text-white border-indigo-600 dark:border-indigo-500 shadow-2xs'
                  : 'bg-white dark:bg-[#0B101D] text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Sliders className="w-3 h-3" />
              {isCustomizing ? 'Hide Margin Controls' : 'Adjust Margins'}
            </button>
          )}
        </div>
      </div>

      {/* MARGIN CUSTOMIZATION CONTROLS */}
      {isCustomizing && allowMarginCustomization && (
        <div className="p-3 bg-white dark:bg-[#0B101D] rounded-xl border border-indigo-100 dark:border-slate-800 shadow-2xs space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Profit Margin Mode & Thresholds
            </span>

            {/* Percentage vs Fixed Toggle */}
            <div className="inline-flex p-0.5 bg-slate-100 dark:bg-[#070B14] rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => handleToggleMarginType('percent')}
                className={`px-2.5 py-1 rounded-md font-bold transition flex items-center gap-1 cursor-pointer ${
                  marginType === 'percent'
                    ? 'bg-white dark:bg-[#131B2E] text-indigo-700 dark:text-indigo-300 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Percent className="w-3 h-3" /> Percentage (%)
              </button>
              <button
                type="button"
                onClick={() => handleToggleMarginType('fixed')}
                className={`px-2.5 py-1 rounded-md font-bold transition flex items-center gap-1 cursor-pointer ${
                  marginType === 'fixed'
                    ? 'bg-white dark:bg-[#131B2E] text-indigo-700 dark:text-indigo-300 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <DollarSign className="w-3 h-3" /> Fixed Amount ({currencySymbol})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* Minimum Profit Margin Input */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Minimum Profit Margin ({marginType === 'percent' ? '%' : currencySymbol})
              </label>
              <input
                id="pricing-min-margin-input"
                type="number"
                min="0"
                step="1"
                value={minMargin}
                onChange={(e) => {
                  const val = Math.round(parseFloat(e.target.value) || 0);
                  handleMinChange(val);
                }}
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-700 rounded-lg font-mono font-bold text-xs text-slate-900 dark:text-white focus:bg-white dark:focus:bg-[#070B14] focus:border-indigo-600 focus:ring-1 focus:ring-indigo-200 dark:focus:ring-indigo-900 outline-none"
              />
              <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 block">
                Defines Minimum Profit Price floor
              </span>
            </div>

            {/* Maximum Profit Margin Input */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Maximum Profit Margin ({marginType === 'percent' ? '%' : currencySymbol})
              </label>
              <input
                id="pricing-max-margin-input"
                type="number"
                min={minMargin}
                step="1"
                value={maxMargin}
                onChange={(e) => {
                  const val = Math.round(parseFloat(e.target.value) || 0);
                  handleMaxChange(val);
                }}
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-700 rounded-lg font-mono font-bold text-xs text-slate-900 dark:text-white focus:bg-white dark:focus:bg-[#070B14] focus:border-indigo-600 focus:ring-1 focus:ring-indigo-200 dark:focus:ring-indigo-900 outline-none"
              />
              <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 block">
                Defines Maximum Profit Price (Tag / MRP)
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

