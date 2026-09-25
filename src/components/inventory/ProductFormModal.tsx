import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Sparkles,
  Barcode,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Package,
  ArrowRight,
  ArrowLeft,
  Scan,
  Tag,
  DollarSign,
  Check,
  Info,
  ShieldCheck,
  TrendingUp,
  Building2,
  Boxes,
  RefreshCw,
  Box,
} from 'lucide-react';
import { api } from '../../services/api.ts';
import { playAudioFeedback } from '../../utils/audio.ts';
import { SideEndBoxLabelModal } from './SideEndBoxLabelModal.tsx';
import { BarcodeStickerModal } from './BarcodeStickerModal.tsx';
import {
  generateEan13Barcode,
  validateBarcodePrefix,
  analyzeBarcode,
} from '../../utils/barcode.ts';
import {
  parseBrandPrefix,
  parseCategoryPrefix,
  generateSuggestedArticle,
  generateSku,
} from '../../utils/sku.ts';
import { BarcodeSvg } from '../common/BarcodeSvg.tsx';
import { AiProductSuggester } from './AiProductSuggester.tsx';
import { cleanStockPriceInput, formatStockPrice, getProductRetailPrice, getProductMinFloorPrice } from '../../utils/priceFormat.ts';
import {
  calculateAutomaticPricing,
  smartRoundUp,
  PricingResult,
} from '../../utils/pricing.ts';
import { AutomaticPricingCard } from '../pricing/AutomaticPricingCard.tsx';
import { BrandLogo } from '../common/BrandLogo.tsx';

interface ProductFormModalProps {
  product?: any | null; // If null, adding new product
  companySettings: any;
  onClose: () => void;
  onSuccess: () => void;
}

type WizardStep = 1 | 2 | 3;

interface BarcodeValidationState {
  status: 'idle' | 'checking' | 'valid' | 'invalid';
  standard?: string;
  standardLabel?: string;
  expectedCheckDigit?: number;
  actualCheckDigit?: number;
  suggestedFix?: string;
  isDuplicate?: boolean;
  existingProduct?: any;
  message?: string;
  error?: string;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  product,
  companySettings,
  onClose,
  onSuccess,
}) => {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [brands, setBrands] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  // 7-digit prefix directly from Settings
  const rawPrefix = companySettings?.barcode_prefix || companySettings?.barcodePrefix || '0108923';
  const prefixValidation = validateBarcodePrefix(rawPrefix);
  const prefix = String(rawPrefix).replace(/\D/g, '');

  // Step 1: Product Classification State
  const [brandId, setBrandId] = useState<number | ''>(product?.brandId || '');
  const [categoryId, setCategoryId] = useState<number | ''>(product?.categoryId || '');
  const [nextProductId, setNextProductId] = useState<number>(product?.id || 1);
  const effectiveProductId = product?.id || nextProductId;

  // Step 2: Article & SKU (Strictly read-only / non-editable store standard)
  const [article, setArticle] = useState<string>(product?.article || '');
  const [sku, setSku] = useState<string>(product?.sku || '');
  const [isSideEndLabelOpen, setIsSideEndLabelOpen] = useState(false);
  const [isBarcodeStickerOpen, setIsBarcodeStickerOpen] = useState(false);

  // Inventory & Product info
  const [productName, setProductName] = useState<string>(product?.name || '');
  const [lotSize, setLotSize] = useState<6 | 8>(6);
  const [totalStock, setTotalStock] = useState<number | ''>(
    product?.totalStock !== undefined ? product.totalStock : 0
  );
  const [primaryImageUrl, setPrimaryImageUrl] = useState<string>(product?.primaryImageUrl || '');
  const description = product?.description || '';

  const handleLotSizeChange = (newSize: 6 | 8) => {
    setLotSize(newSize);
    setTotalStock(newSize);
  };

  // Step 3: Pricing Specifications State (Decimal cleanup: .00 automatically stripped)
  const [purchasePrice, setPurchasePrice] = useState<number | ''>(
    product?.costPrice !== undefined && product?.costPrice !== null && product?.costPrice !== ''
      ? parseFloat(cleanStockPriceInput(product.costPrice))
      : product?.cost_price !== undefined && product?.cost_price !== null && product?.cost_price !== ''
      ? parseFloat(cleanStockPriceInput(product.cost_price))
      : product?.purchasePrice !== undefined && product?.purchasePrice !== null && product?.purchasePrice !== ''
      ? parseFloat(cleanStockPriceInput(product.purchasePrice))
      : ''
  );
  const [minSalePrice, setMinSalePrice] = useState<number | ''>(
    product?.minSalePrice !== undefined && product?.minSalePrice !== null && product?.minSalePrice !== ''
      ? parseFloat(cleanStockPriceInput(product.minSalePrice))
      : ''
  );
  const [maxSalePrice, setMaxSalePrice] = useState<number | ''>(
    product?.maxSalePrice !== undefined && product?.maxSalePrice !== null && product?.maxSalePrice !== ''
      ? parseFloat(cleanStockPriceInput(product.maxSalePrice))
      : product?.minSalePrice !== undefined && product?.minSalePrice !== null && product?.minSalePrice !== ''
      ? parseFloat(cleanStockPriceInput(product.minSalePrice))
      : ''
  );

  // Step 4: Barcode (Fully editable for imported / external manufacturer box barcodes or store EAN-13)
  const [barcode, setBarcode] = useState<string>(product?.barcode || '');
  const [barcodeValidation, setBarcodeValidation] = useState<BarcodeValidationState>({ status: 'idle' });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currencySymbol = companySettings?.currency_symbol || companySettings?.currencySymbol || 'Rs.';
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);

  // Maximum Profit Margin Threshold from Company Settings (default 30%)
  const maxProfitMarginThreshold =
    typeof companySettings?.max_profit_margin_percent === 'string'
      ? parseFloat(companySettings.max_profit_margin_percent)
      : typeof companySettings?.max_profit_margin_percent === 'number'
      ? companySettings.max_profit_margin_percent
      : typeof companySettings?.max_profit_margin === 'number'
      ? companySettings.max_profit_margin
      : typeof companySettings?.maxProfitMarginPercent === 'string'
      ? parseFloat(companySettings.maxProfitMarginPercent)
      : typeof companySettings?.maxProfitMarginPercent === 'number'
      ? companySettings.maxProfitMarginPercent
      : typeof companySettings?.maxProfitMargin === 'number'
      ? companySettings.maxProfitMargin
      : 30;

  // Minimum Profit Margin Threshold from Company Settings (default 10%)
  const minProfitMarginThreshold =
    typeof companySettings?.min_profit_margin === 'string'
      ? parseFloat(companySettings.min_profit_margin)
      : typeof companySettings?.min_profit_margin === 'number'
      ? companySettings.min_profit_margin
      : typeof companySettings?.minProfitMargin === 'number'
      ? companySettings.minProfitMargin
      : typeof companySettings?.min_profit_margin_percent === 'number'
      ? companySettings.min_profit_margin_percent
      : 10;

  const [priceFloorNotice, setPriceFloorNotice] = useState<string | null>(null);

  // Active Pricing Formula State
  const [marginType, setMarginType] = useState<'percent' | 'fixed'>('percent');
  const [percentMinMargin, setPercentMinMargin] = useState<number>(minProfitMarginThreshold);
  const [percentMaxMargin, setPercentMaxMargin] = useState<number>(maxProfitMarginThreshold);
  const [fixedMinMargin, setFixedMinMargin] = useState<number>(() => {
    const c = typeof purchasePrice === 'number' ? purchasePrice : 0;
    return c > 0 ? smartRoundUp(c * (minProfitMarginThreshold / 100)) || 250 : 250;
  });
  const [fixedMaxMargin, setFixedMaxMargin] = useState<number>(() => {
    const c = typeof purchasePrice === 'number' ? purchasePrice : 0;
    return c > 0 ? smartRoundUp(c * (maxProfitMarginThreshold / 100)) || 500 : 500;
  });

  const activeMinMargin = marginType === 'percent' ? percentMinMargin : fixedMinMargin;
  const activeMaxMargin = marginType === 'percent' ? percentMaxMargin : fixedMaxMargin;

  // Master pricing computation helper
  const computePricing = (
    c: number,
    mType: 'percent' | 'fixed' = marginType,
    minM: number = mType === 'percent' ? percentMinMargin : fixedMinMargin,
    maxM: number = mType === 'percent' ? percentMaxMargin : fixedMaxMargin
  ): PricingResult => {
    return calculateAutomaticPricing({
      costPrice: c,
      minProfitMargin: minM,
      maxProfitMargin: maxM,
      options: {
        marginType: mType,
      },
    });
  };

  // Derived cost and smart-rounded pricing calculations
  const cost = typeof purchasePrice === 'number' ? purchasePrice : 0;
  const currentPricing = computePricing(cost, marginType, activeMinMargin, activeMaxMargin);

  const minProfitFloor = currentPricing.minProfitPrice;
  const autoMaxPrice = currentPricing.maxProfitPrice;
  const isBelowFloor = cost > 0 && typeof maxSalePrice === 'number' && maxSalePrice < minProfitFloor;

  // Recalculate whenever formula mode toggles (% vs fixed amount)
  const handleMarginTypeChange = (newType: 'percent' | 'fixed') => {
    setMarginType(newType);
    let nextMin = newType === 'percent' ? percentMinMargin : fixedMinMargin;
    let nextMax = newType === 'percent' ? percentMaxMargin : fixedMaxMargin;

    // If switching to fixed and default fixed margins haven't been customized, initialize nicely from cost
    if (newType === 'fixed' && cost > 0 && fixedMinMargin === 250 && fixedMaxMargin === 500) {
      const derivedMin = smartRoundUp(cost * (percentMinMargin / 100));
      const derivedMax = smartRoundUp(cost * (percentMaxMargin / 100));
      if (derivedMin > 0) {
        nextMin = derivedMin;
        setFixedMinMargin(derivedMin);
      }
      if (derivedMax > 0) {
        nextMax = derivedMax;
        setFixedMaxMargin(derivedMax);
      }
    }

    if (cost > 0) {
      const pricing = computePricing(cost, newType, nextMin, nextMax);
      setMinSalePrice(pricing.minProfitPrice);
      setMaxSalePrice(pricing.maxProfitPrice);
    }
  };

  // Recalculate whenever minimum profit margin changes
  const handleMinMarginChange = (val: number) => {
    const safeVal = Math.max(0, val);
    if (marginType === 'percent') {
      setPercentMinMargin(safeVal);
    } else {
      setFixedMinMargin(safeVal);
    }
    if (cost > 0) {
      const pricing = computePricing(cost, marginType, safeVal, activeMaxMargin);
      setMinSalePrice(pricing.minProfitPrice);
      if (maxSalePrice === '' || maxSalePrice < pricing.minProfitPrice) {
        setMaxSalePrice(pricing.maxProfitPrice);
      }
    }
  };

  // Recalculate whenever maximum profit margin changes
  const handleMaxMarginChange = (val: number) => {
    const safeVal = Math.max(0, val);
    if (marginType === 'percent') {
      setPercentMaxMargin(safeVal);
    } else {
      setFixedMaxMargin(safeVal);
    }
    if (cost > 0) {
      const pricing = computePricing(cost, marginType, activeMinMargin, safeVal);
      setMaxSalePrice(pricing.maxProfitPrice);
    }
  };

  // Auto-calculate Minimum & Maximum Sale Price with upward smart rounding
  const handlePurchasePriceChange = (val: string) => {
    if (val === '') {
      setPurchasePrice('');
      if (!product) {
        setMinSalePrice('');
        setMaxSalePrice('');
      }
      return;
    }
    const num = parseInt(val, 10);
    if (!isNaN(num)) {
      setPurchasePrice(num);
      if (num > 0) {
        const pricing = computePricing(num, marginType, activeMinMargin, activeMaxMargin);
        setMinSalePrice(pricing.minProfitPrice);
        setMaxSalePrice(pricing.maxProfitPrice);
      }
    } else {
      setPurchasePrice('');
    }
  };

  const handlePurchasePriceBlur = (val: string) => {
    const cleaned = cleanStockPriceInput(val);
    if (cleaned === '') {
      setPurchasePrice('');
      if (!product) {
        setMinSalePrice('');
        setMaxSalePrice('');
      }
    } else {
      const parsed = parseInt(cleaned, 10);
      if (!isNaN(parsed)) {
        setPurchasePrice(parsed);
        if (parsed > 0) {
          const pricing = computePricing(parsed, marginType, activeMinMargin, activeMaxMargin);
          setMinSalePrice(pricing.minProfitPrice);
          setMaxSalePrice(pricing.maxProfitPrice);
        }
      }
    }
  };

  // Maximum Sale Price (MRP) field change & blur with smart upward rounding and floor protection enforcement
  const handleMaxSalePriceChange = (val: string) => {
    if (val === '') {
      setMaxSalePrice('');
    } else {
      const num = parseInt(val, 10);
      setMaxSalePrice(isNaN(num) ? '' : num);
    }
  };

  const handleMaxSalePriceBlur = (val: string) => {
    const cleaned = cleanStockPriceInput(val);
    if (cleaned === '') {
      setMaxSalePrice('');
    } else {
      const parsed = parseInt(cleaned, 10);
      if (!isNaN(parsed)) {
        // Smart round upward
        const rounded = smartRoundUp(parsed);
        if (cost > 0 && rounded < minProfitFloor) {
          // Safely clamp to floor
          setMaxSalePrice(minProfitFloor);
          playAudioFeedback.warning();
          setPriceFloorNotice(
            `Price safely clamped to minimum profit floor of ${currencySymbol} ${formatStockPrice(minProfitFloor)} (Cost + ${
              marginType === 'percent' ? `${activeMinMargin}%` : `${currencySymbol} ${activeMinMargin}`
            } margin, smart rounded upward).`
          );
          setTimeout(() => setPriceFloorNotice(null), 4500);
        } else {
          setMaxSalePrice(rounded);
        }
      } else {
        setMaxSalePrice('');
      }
    }
  };

  // Derived current brand and category details
  const localBrand = brands.find((b) => b.name?.trim().toLowerCase() === 'local');
  const selectedBrand = brands.find((b) => b.id === brandId) || localBrand;
  const currentBrandName = selectedBrand?.name || product?.brandName || 'Local';
  const currentBrandPrefix = parseBrandPrefix(currentBrandName);

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const currentCategoryName = selectedCategory?.name || product?.categoryName || '';
  const currentCategoryPrefix = currentCategoryName ? parseCategoryPrefix(currentCategoryName) : '';

  // Helper to recompute strictly non-editable article and SKU based on classification
  const updateClassificationCodes = (
    bId: number | '',
    cId: number | '',
    pId: number,
    bList = brands,
    cList = categories
  ) => {
    const chosenBrand = bList.find((b) => b.id === bId) || bList.find((b) => b.name?.trim().toLowerCase() === 'local');
    const chosenCat = cList.find((c: any) => c.id === cId);
    const brandPfx = parseBrandPrefix(chosenBrand?.name || 'Local');

    if (chosenCat) {
      const catPfx = parseCategoryPrefix(chosenCat.name);
      const designedArticle = generateSuggestedArticle(catPfx, pId);
      const designedSku = generateSku(brandPfx, designedArticle, pId);

      setArticle(designedArticle);
      setSku(designedSku);
      if (!productName || productName === article) {
        setProductName(designedArticle);
      }
    } else {
      setArticle('');
      setSku('');
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function initializeModal() {
      try {
        let currentId = product?.id || 1;

        // Fetch next product sequence ID if adding new product
        if (!product) {
          try {
            const nextIdRes = await api.products.getNextId();
            if (nextIdRes?.nextProductId) {
              currentId = nextIdRes.nextProductId;
              if (isMounted) setNextProductId(currentId);
            }
          } catch (e) {
            console.error('Failed to fetch next product ID:', e);
          }
        }

        // Fetch brands and categories
        const [bRes, cRes] = await Promise.all([
          api.brandCategory.getBrands(),
          api.brandCategory.getCategories(),
        ]);
        let brandList = bRes.brands || [];
        const catList = cRes.categories || [];

        // Ensure 'Local' brand exists in the list
        let foundLocalBrand = brandList.find((b: any) => b.name?.trim().toLowerCase() === 'local');
        if (!foundLocalBrand) {
          try {
            const createRes = await api.brandCategory.createBrand('Local');
            if (createRes?.brand) {
              brandList = [createRes.brand, ...brandList];
              foundLocalBrand = createRes.brand;
            }
          } catch (e) {
            console.warn('Could not auto-create Local brand:', e);
          }
        }

        if (isMounted) {
          setBrands(brandList);
          setCategories(catList);
        }

        let activeBrandId = brandId;
        if (!activeBrandId && brandList.length > 0) {
          // Default to 'Local' brand per requirement
          const localBrand = foundLocalBrand || brandList.find((b: any) => b.name?.trim().toLowerCase() === 'local');
          activeBrandId = localBrand ? localBrand.id : brandList[0].id;
          if (isMounted) setBrandId(activeBrandId);
        }

        // Category is required and should NOT default to 'Local'!
        // Keep categoryId as set by product or empty if creating new product
        let activeCategoryId = categoryId;
        if (product?.categoryId) {
          activeCategoryId = product.categoryId;
          if (isMounted) setCategoryId(activeCategoryId);
        }

        if (!product && isMounted) {
          updateClassificationCodes(activeBrandId, activeCategoryId, currentId, brandList, catList);

          // Pre-fill the barcode input with the designed store standard EAN-13 barcode
          try {
            const barcodeRes = await api.products.generateBarcode(currentId);
            if (barcodeRes?.barcode && isMounted) {
              setBarcode(barcodeRes.barcode);
            }
          } catch (err) {
            if (prefixValidation.isValid && currentId <= 99999 && isMounted) {
              try {
                const gen = generateEan13Barcode(prefix, currentId);
                setBarcode(gen.barcode);
              } catch (_) {}
            }
          }
        }
      } catch (err) {
        console.error('Failed to initialize product modal:', err);
      }
    }

    initializeModal();

    return () => {
      isMounted = false;
    };
  }, []);

  // Autofocus barcode input when navigating to step 3
  useEffect(() => {
    if (currentStep === 3) {
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 120);
    }
  }, [currentStep]);

  // Real-time Barcode Validation effect (Format, Checksum, and DB Duplicate Check)
  useEffect(() => {
    const clean = barcode.trim();
    if (!clean) {
      setBarcodeValidation({ status: 'idle' });
      return;
    }

    // Step 1: Instant local format & checksum validation
    const local = analyzeBarcode(clean, prefix);
    if (!local.isValid) {
      setBarcodeValidation({
        status: 'invalid',
        standard: local.standard,
        standardLabel: local.standardLabel,
        expectedCheckDigit: local.expectedCheckDigit,
        actualCheckDigit: local.actualCheckDigit,
        suggestedFix: local.suggestedFix,
        error: local.error,
      });
      return;
    }

    // Step 2: Debounced server verification (checks duplicate in catalog)
    setBarcodeValidation({
      status: 'checking',
      standard: local.standard,
      standardLabel: local.standardLabel,
      suggestedFix: local.suggestedFix,
      message: 'Validating format & checking catalog uniqueness...',
    });

    const timer = setTimeout(async () => {
      try {
        const res = await api.products.validateBarcode(clean, product?.id);
        if (!res.valid) {
          setBarcodeValidation({
            status: 'invalid',
            isDuplicate: res.isDuplicate,
            standard: res.standard,
            standardLabel: res.standardLabel,
            expectedCheckDigit: res.expectedCheckDigit,
            actualCheckDigit: res.actualCheckDigit,
            existingProduct: res.existingProduct,
            suggestedFix: res.suggestedFix,
            error: res.error || 'Barcode validation failed.',
          });
        } else {
          setBarcodeValidation({
            status: 'valid',
            standard: res.standard,
            standardLabel: res.standardLabel,
            suggestedFix: res.suggestedFix,
            message: res.message || `${res.standardLabel || 'Barcode'} is valid and ready.`,
          });
        }
      } catch (err: any) {
        // If network issue, accept local validation if format is valid
        setBarcodeValidation({
          status: 'valid',
          standard: local.standard,
          standardLabel: local.standardLabel,
          message: `${local.standardLabel} format verified.`,
        });
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [barcode, prefix, product?.id]);

  const handleBrandSelect = (newBrandId: number | '') => {
    setBrandId(newBrandId);
    if (!product) {
      updateClassificationCodes(newBrandId, categoryId, effectiveProductId);
    } else {
      const chosenBrand = brands.find((b) => b.id === newBrandId);
      const brandPfx = parseBrandPrefix(chosenBrand?.name || '');
      setSku(generateSku(brandPfx, article, effectiveProductId));
    }
  };

  const handleCategorySelect = (newCategoryId: number | '') => {
    setCategoryId(newCategoryId);
    if (!product) {
      updateClassificationCodes(brandId, newCategoryId, effectiveProductId);
    } else {
      const chosenCat = categories.find((c) => c.id === newCategoryId);
      const catPfx = parseCategoryPrefix(chosenCat?.name || '');
      const designedArticle = generateSuggestedArticle(catPfx, effectiveProductId);
      setArticle(designedArticle);
      setSku(generateSku(currentBrandPrefix, designedArticle, effectiveProductId));
    }
  };

  const handleGenerateStoreBarcode = async () => {
    try {
      setErrorMessage(null);
      const res = await api.products.generateBarcode(effectiveProductId);
      if (res?.barcode) {
        setBarcode(res.barcode);
      } else {
        const gen = generateEan13Barcode(prefix, effectiveProductId);
        setBarcode(gen.barcode);
      }
    } catch (err: any) {
      try {
        const fallback = await api.products.generateBarcode();
        if (fallback?.barcode) {
          setBarcode(fallback.barcode);
          return;
        }
      } catch (_) {}
      try {
        const gen = generateEan13Barcode(prefix, effectiveProductId);
        setBarcode(gen.barcode);
      } catch (e: any) {
        setErrorMessage('Could not generate store EAN-13 barcode: ' + (err.message || 'Please check barcode settings.'));
      }
    }
  };

  // STEP VALIDATION
  const validateStep1 = (): boolean => {
    setErrorMessage(null);
    let effectiveBrandId = brandId;
    if (!effectiveBrandId) {
      const localBrand = brands.find((b) => b.name?.trim().toLowerCase() === 'local');
      effectiveBrandId = localBrand ? localBrand.id : (brands[0]?.id || '');
      if (effectiveBrandId) {
        setBrandId(effectiveBrandId);
      }
    }
    if (!effectiveBrandId) {
      setErrorMessage('Please select a Brand / Manufacturer to classify the product.');
      return false;
    }

    if (!categoryId) {
      setErrorMessage('Please select a Shoe Category to classify the product.');
      return false;
    }
    if (totalStock === '' || Number(totalStock) < 0) {
      setErrorMessage('Total initial stock quantity must be 0 or greater.');
      return false;
    }
    return true;
  };

  const validateStep2 = (): boolean => {
    setErrorMessage(null);
    if (purchasePrice === '' || Number(purchasePrice) < 0) {
      setErrorMessage('Please enter a valid Cost Price (0 or greater).');
      return false;
    }
    return true;
  };

  const validateStep3 = (): boolean => {
    setErrorMessage(null);
    const clean = barcode.trim();
    if (!clean) {
      setErrorMessage('Please enter or scan a barcode, or click "Reset to Store EAN-13".');
      return false;
    }
    const local = analyzeBarcode(clean, prefix);
    if (!local.isValid) {
      setErrorMessage(local.error || 'Barcode validation failed.');
      return false;
    }
    if (barcodeValidation.status === 'invalid') {
      setErrorMessage(barcodeValidation.error || 'Barcode is invalid or already in use.');
      return false;
    }
    return true;
  };

  const goToNextStep = () => {
    setErrorMessage(null);
    if (currentStep === 1) {
      if (validateStep1()) setCurrentStep(2);
    } else if (currentStep === 2) {
      if (validateStep2()) setCurrentStep(3);
    }
  };

  const goToPrevStep = () => {
    setErrorMessage(null);
    if (currentStep === 2) setCurrentStep(1);
    if (currentStep === 3) setCurrentStep(2);
  };

  // Explicit confirmation submit handler — forced stop, no auto-submission!
  const handleConfirmAndSave = async () => {
    if (!validateStep1()) {
      setCurrentStep(1);
      return;
    }
    if (!validateStep2()) {
      setCurrentStep(2);
      return;
    }
    if (!validateStep3()) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      let cleanArticle = article.trim().toUpperCase();
      let cleanSku = sku.trim().toUpperCase();

      // Ensure category is resolved (defaults to Local)
      let finalCategoryId = categoryId;
      if (!finalCategoryId) {
        const localCat = categories.find((c) => c.name?.trim().toLowerCase() === 'local');
        finalCategoryId = localCat ? localCat.id : (categories[0]?.id || null);
      }

      // Ensure brand is resolved (defaults to Local)
      let finalBrandId = brandId;
      if (!finalBrandId) {
        const localBrand = brands.find((b) => b.name?.trim().toLowerCase() === 'local');
        finalBrandId = localBrand ? localBrand.id : (brands[0]?.id || null);
      }

      // Ensure article is generated if not yet set
      if (!cleanArticle) {
        const chosenCat = categories.find((c) => c.id === finalCategoryId);
        const catPfx = parseCategoryPrefix(chosenCat?.name || '');
        cleanArticle = generateSuggestedArticle(catPfx, effectiveProductId).toUpperCase();
      }

      // Ensure SKU is generated if not yet set
      if (!cleanSku) {
        const chosenBrand = brands.find((b) => b.id === finalBrandId);
        const brandPfx = parseBrandPrefix(chosenBrand?.name || '');
        cleanSku = generateSku(brandPfx, cleanArticle, effectiveProductId).toUpperCase();
      }

      const finalBarcodeToSave = barcode.trim();

      const costNum = Math.round(Number(purchasePrice));
      const autoTagPrice = getProductRetailPrice({ costPrice: costNum, purchasePrice: costNum }, companySettings);
      const autoMinFloor = getProductMinFloorPrice({ costPrice: costNum, purchasePrice: costNum }, companySettings);

      const payload = {
        name: productName.trim() || cleanArticle,
        brandId: finalBrandId || null,
        categoryId: finalCategoryId || null,
        article: cleanArticle,
        sku: cleanSku,
        barcode: finalBarcodeToSave,
        primaryImageUrl: primaryImageUrl.trim(),
        description: description.trim(),
        costPrice: costNum,
        purchasePrice: costNum,
        maxSalePrice: autoTagPrice || costNum,
        minSalePrice: autoMinFloor || costNum,
        totalStock: totalStock === '' ? 0 : Math.round(Number(totalStock)),
        lowStockLimit: product?.lowStockLimit !== undefined ? product.lowStockLimit : 5,
      };

      if (product) {
        await api.products.update(product.id, payload);
      } else {
        await api.products.create(payload);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save product.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Pricing Margin Calculations (Without decimals)
  const effectiveMaxSale = typeof maxSalePrice === 'number' ? maxSalePrice : autoMaxPrice;
  const effectiveMinSale = typeof minSalePrice === 'number' ? minSalePrice : minProfitFloor;

  const grossProfit = effectiveMaxSale - cost;
  const markupPercent = cost > 0 ? String(Math.round((grossProfit / cost) * 100)) : '0';
  const marginPercent = effectiveMaxSale > 0 ? String(Math.round((grossProfit / effectiveMaxSale) * 100)) : '0';
  const isLoss = effectiveMaxSale > 0 && cost > 0 && effectiveMaxSale < cost;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-2xl bg-white dark:bg-[#131B2E] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] border border-slate-200 dark:border-purple-800/80"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER & 3-STEP WIZARD STEPPER */}
        <div className="bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 border-b border-slate-200 dark:border-purple-800/80 text-slate-800 dark:text-white px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:bg-purple-500/20 dark:text-purple-300 border border-blue-500/20 dark:border-purple-400/30 flex items-center justify-center font-bold shadow-2xs">
                <Boxes className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
                  {product ? `Edit Product: ${product.article || product.sku}` : 'Add Product Wizard'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-purple-200/80">
                  Step {currentStep} of 3 • 1 Product = 1 SKU = 1 Barcode = Inventory Count
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {product && (
                <button
                  type="button"
                  title="Print high-visibility 3x4 inch shoe box side-end label for rack storage"
                  onClick={() => setIsSideEndLabelOpen(true)}
                  className="px-2.5 py-1.5 rounded-lg border border-purple-200 dark:border-purple-400/40 bg-purple-50 dark:bg-purple-500/30 text-purple-700 dark:text-purple-200 hover:bg-purple-600 hover:text-white transition-all shadow-2xs cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                >
                  <Box className="w-3.5 h-3.5" />
                  <span>Side-End Label</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-purple-300 dark:hover:text-white rounded-lg hover:bg-slate-200/60 dark:hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 3-Step Stepper Navigation */}
          <div className="grid grid-cols-3 gap-2">
            {/* Step 1 Tab */}
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className={`flex items-center gap-1.5 p-2 rounded-xl text-left transition cursor-pointer border ${
                currentStep === 1
                  ? 'btn-primary text-white shadow-xs font-semibold border-transparent'
                  : currentStep > 1
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                  : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800/50'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  currentStep === 1
                    ? 'bg-white text-blue-600'
                    : currentStep > 1
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-600 dark:bg-purple-900/60 dark:text-purple-200'
                }`}
              >
                {currentStep > 1 ? <Check className="w-3 h-3 stroke-[3]" /> : '1'}
              </div>
              <div className="truncate">
                <span className="block text-[9px] uppercase font-bold tracking-wider opacity-75">Step 1</span>
                <span className="block text-xs font-semibold truncate">Classification</span>
              </div>
            </button>

            {/* Step 2 Tab: Pricing Specs */}
            <button
              type="button"
              onClick={() => {
                if (validateStep1()) setCurrentStep(2);
              }}
              className={`flex items-center gap-1.5 p-2 rounded-xl text-left transition cursor-pointer border ${
                currentStep === 2
                  ? 'btn-primary text-white shadow-xs font-semibold border-transparent'
                  : currentStep > 2
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                  : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800/50'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  currentStep === 2
                    ? 'bg-white text-blue-600'
                    : currentStep > 2
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-600 dark:bg-purple-900/60 dark:text-purple-200'
                }`}
              >
                {currentStep > 2 ? <Check className="w-3 h-3 stroke-[3]" /> : '2'}
              </div>
              <div className="truncate">
                <span className="block text-[9px] uppercase font-bold tracking-wider opacity-75">Step 2</span>
                <span className="block text-xs font-semibold truncate">Pricing</span>
              </div>
            </button>

            {/* Step 3 Tab: Barcode & Review */}
            <button
              type="button"
              onClick={() => {
                if (validateStep1() && validateStep2()) setCurrentStep(3);
              }}
              className={`flex items-center gap-1.5 p-2 rounded-xl text-left transition cursor-pointer border ${
                currentStep === 3
                  ? 'btn-primary text-white shadow-xs font-semibold border-transparent'
                  : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800/50'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  currentStep === 3
                    ? 'bg-white text-blue-600'
                    : 'bg-slate-200 text-slate-600 dark:bg-purple-900/60 dark:text-purple-200'
                }`}
              >
                3
              </div>
              <div className="truncate">
                <span className="block text-[9px] uppercase font-bold tracking-wider opacity-75">Step 3</span>
                <span className="block text-xs font-semibold truncate">Barcode &amp; Review</span>
              </div>
            </button>
          </div>
        </div>

        {/* WIZARD FORM CONTENT */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // Force stop at last step: do not auto-submit from form submit events
            if (currentStep < 3) {
              goToNextStep();
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const target = e.target as HTMLElement;
              if (target && target.tagName === 'INPUT') {
                if (currentStep < 3) {
                  goToNextStep();
                } else if (target === barcodeInputRef.current) {
                  barcodeInputRef.current?.blur();
                }
              }
            }
          }}
          className="flex-1 overflow-y-auto p-6 space-y-6 text-xs bg-slate-50/50 dark:bg-[#070B14]"
        >
          {errorMessage && (
            <div className="alert-danger flex items-center gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
              <span className="text-xs">{errorMessage}</span>
            </div>
          )}

          {/* ========================================================= */}
          {/* STEP 1: PRODUCT CLASSIFICATION & VISUAL AI                */}
          {/* ========================================================= */}
          {currentStep === 1 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* AI Visual Suggester & Product Image */}
              <AiProductSuggester
                imageUrl={primaryImageUrl}
                onImageUrlChange={(url) => setPrimaryImageUrl(url)}
                brands={brands}
                categories={categories}
                onSelectBrand={(id) => handleBrandSelect(id)}
                onSelectCategory={(id) => handleCategorySelect(id)}
                onSetTitle={(title) => setProductName(title)}
                onBrandsUpdated={(newBrands) => setBrands(newBrands)}
                onCategoriesUpdated={(newCats) => setCategories(newCats)}
              />

              <div className="bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 p-5 rounded-2xl border border-gray-200 dark:border-[#1A263D] shadow-xs dark:shadow-[0_0_20px_rgba(59,130,246,0.05)] space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                  <h5 className="font-bold text-gray-800 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                    <span>1. Product Classification</span>
                  </h5>
                  <span className="text-[11px] text-gray-400 dark:text-slate-500 font-medium">Step 1 of 3</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Brand Selector */}
                  <div>
                    <label className="block font-bold text-gray-800 dark:text-slate-200 text-xs mb-1.5">
                      Brand / Manufacturer <span className="text-red-500 dark:text-pink-400">*</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        value={brandId || localBrand?.id || ''}
                        onChange={(e) => handleBrandSelect(e.target.value ? Number(e.target.value) : (localBrand?.id || ''))}
                        className="flex-1 px-3 py-2 bg-white dark:bg-purple-500/20 border border-gray-300 dark:border-purple-400/40 rounded-xl text-xs font-medium text-gray-900 dark:text-purple-200 hover:bg-slate-50 dark:hover:bg-purple-500/30 dark:hover:text-white dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] outline-none focus:border-indigo-600 dark:focus:border-purple-400 cursor-pointer transition"
                      >
                        {!brands.some((b) => b.name?.trim().toLowerCase() === 'local') && (
                          <option value="" className="dark:bg-[#120726] dark:text-purple-100">Local (Default)</option>
                        )}
                        {brands.map((b) => {
                          const isLocal = b.name?.trim().toLowerCase() === 'local';
                          return (
                            <option key={b.id} value={b.id} className="dark:bg-[#120726] dark:text-purple-100">
                              {b.name} {isLocal ? '(Default)' : ''}
                            </option>
                          );
                        })}
                      </select>
                      {(() => {
                        const curBrand = brands.find((b) => b.id === (brandId || localBrand?.id));
                        return (
                          <div title={`Selected Brand: ${curBrand?.name || 'Local'}`} className="shrink-0">
                            <BrandLogo logo={curBrand?.logo} name={curBrand?.name || 'Local'} size="md" />
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-[10px] text-gray-500 dark:text-slate-400 font-medium">Brand Prefix (3-char):</span>
                      <span className="font-mono font-bold text-[11px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800/60">
                        {currentBrandPrefix || 'LOC'}
                      </span>
                    </div>
                  </div>

                  {/* Category Selector */}
                  <div>
                    <label className="block font-bold text-gray-800 dark:text-slate-200 text-xs mb-1.5">
                      Shoe Category <span className="text-red-500 dark:text-pink-400">*</span>
                    </label>
                    <select
                      value={categoryId}
                      onChange={(e) => handleCategorySelect(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 bg-white dark:bg-purple-500/20 border border-gray-300 dark:border-purple-400/40 rounded-xl text-xs font-medium text-gray-900 dark:text-purple-200 hover:bg-slate-50 dark:hover:bg-purple-500/30 dark:hover:text-white dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] outline-none focus:border-indigo-600 dark:focus:border-purple-400 cursor-pointer transition"
                    >
                      <option value="" className="dark:bg-[#120726] dark:text-purple-100">Select Shoe Category...</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id} className="dark:bg-[#120726] dark:text-purple-100">
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-[10px] text-gray-500 dark:text-slate-400 font-medium">Article Prefix (2-char):</span>
                      <span className="font-mono font-bold text-[11px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800/60">
                        {currentCategoryPrefix || '--'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* PHYSICAL INVENTORY & DETAILS */}
              <div className="bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 p-5 rounded-2xl border border-gray-200 dark:border-[#1A263D] shadow-xs dark:shadow-[0_0_20px_rgba(59,130,246,0.05)] space-y-4">
                <h5 className="font-bold text-gray-800 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-slate-800">
                  <Package className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                  <span>Physical Inventory &amp; Basic Specs</span>
                </h5>

                {/* Stock Quantity */}
                <div className="p-3.5 bg-indigo-50/70 dark:bg-gradient-to-br dark:from-slate-900 dark:via-indigo-950 dark:to-purple-950 border border-indigo-200/80 dark:border-indigo-600/40 rounded-xl space-y-2.5 shadow-sm">
                  <label className="block font-bold text-indigo-950 dark:text-white text-xs">
                    Total Available Stock Quantity (Pairs) <span className="text-red-500 dark:text-pink-400">*</span>
                  </label>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => setTotalStock((prev) => Math.max(0, (typeof prev === 'number' ? prev : 0) - lotSize))}
                      className="w-8 h-8 rounded-lg border border-indigo-200 dark:border-indigo-400/40 bg-white dark:bg-white/10 hover:bg-indigo-100 dark:hover:bg-white/20 flex items-center justify-center font-bold text-indigo-950 dark:text-white text-sm transition active:scale-95 shadow-2xs cursor-pointer"
                      title={`Decrease ${lotSize} pairs (1 Lot)`}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="0"
                      required
                      value={totalStock}
                      onChange={(e) => setTotalStock(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                      placeholder="0"
                      className="flex-1 py-1.5 px-3 bg-white dark:bg-slate-950/80 border border-indigo-200 dark:border-indigo-400/40 rounded-lg font-mono font-bold text-center text-sm text-indigo-950 dark:text-white placeholder-indigo-300 dark:placeholder-white/40 outline-none focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-400/30 shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={() => setTotalStock((prev) => (typeof prev === 'number' ? prev : 0) + lotSize)}
                      className="w-8 h-8 rounded-lg border border-indigo-200 dark:border-indigo-400/40 bg-white dark:bg-white/10 hover:bg-indigo-100 dark:hover:bg-white/20 flex items-center justify-center font-bold text-indigo-950 dark:text-white text-sm transition active:scale-95 shadow-2xs cursor-pointer"
                      title={`Increase ${lotSize} pairs (1 Lot)`}
                    >
                      +
                    </button>
                  </div>

                  {/* Lot Size Selector & Dynamic Quick Chips */}
                  <div className="pt-2 border-t border-indigo-200/60 dark:border-white/10">
                    {/* Lot Option Toggle / Radio Group */}
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold text-indigo-900/80 dark:text-white uppercase tracking-wider">
                        Lot Size
                      </span>
                      <div
                        className="inline-flex p-0.5 bg-white/90 dark:bg-slate-950/70 border border-indigo-200 dark:border-indigo-400/30 rounded-lg"
                        role="radiogroup"
                        aria-label="Lot Size Selector"
                      >
                        <button
                          type="button"
                          role="radio"
                          aria-checked={lotSize === 6}
                          onClick={() => handleLotSizeChange(6)}
                          className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                            lotSize === 6
                              ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white shadow-md shadow-indigo-500/30 font-extrabold border border-white/20'
                              : 'text-slate-600 dark:text-white/80 hover:text-indigo-600 dark:hover:text-white border border-transparent'
                          }`}
                        >
                          Lot 6
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={lotSize === 8}
                          onClick={() => handleLotSizeChange(8)}
                          className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                            lotSize === 8
                              ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white shadow-md shadow-indigo-500/30 font-extrabold border border-white/20'
                              : 'text-slate-600 dark:text-white/80 hover:text-indigo-600 dark:hover:text-white border border-transparent'
                          }`}
                        >
                          Lot 8
                        </button>
                      </div>
                    </div>

                    {/* Dynamic Quantity Chips */}
                    <div className="flex flex-wrap items-center gap-1">
                      {(lotSize === 6
                        ? [
                            { value: 6, label: '6', note: '1 Lot (6 pairs / ½ Dozen)' },
                            { value: 12, label: '12', note: '2 Lots (12 pairs / 1 Dozen)' },
                            { value: 24, label: '24', note: '4 Lots (24 pairs / 2 Dozens)' },
                            { value: 60, label: '60', note: '10 Lots (60 pairs / 5 Dozens)' },
                            { value: 120, label: '120', note: '20 Lots (120 pairs / 10 Dozens)' },
                          ]
                        : [
                            { value: 8, label: '8', note: '1 Lot (8 pairs)' },
                            { value: 16, label: '16', note: '2 Lots (16 pairs)' },
                            { value: 32, label: '32', note: '4 Lots (32 pairs)' },
                            { value: 40, label: '40', note: '5 Lots (40 pairs)' },
                            { value: 80, label: '80', note: '10 Lots (80 pairs)' },
                          ]
                      ).map((chip) => (
                        <button
                          key={chip.value}
                          type="button"
                          title={chip.note}
                          onClick={() => setTotalStock(chip.value)}
                          className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border transition active:scale-95 cursor-pointer ${
                            totalStock === chip.value
                              ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white border-transparent shadow-md shadow-indigo-500/40 font-extrabold ring-2 ring-indigo-400 dark:ring-white/80'
                              : 'bg-gradient-to-r from-purple-600/90 via-indigo-600/90 to-purple-700/90 hover:from-purple-600 hover:via-indigo-600 hover:to-purple-700 text-white border-purple-300/40 dark:border-indigo-400/40 shadow-xs font-bold'
                          }`}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-indigo-200/60 dark:border-white/10">
                    <p className="text-[10px] text-indigo-900/70 dark:text-white/80 font-medium">
                      Direct physical shoe pair count for this product.
                    </p>
                  </div>
                </div>

                {/* Product Title / Display Name */}
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-slate-300 mb-1">
                    Product Title / Display Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder={`e.g. ${currentBrandName ? currentBrandName + ' ' : ''}${article || 'Air Runner Shoes'}`}
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-xl text-xs outline-none focus:border-indigo-600 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-950 bg-white dark:bg-[#070B14] text-gray-900 dark:text-white"
                  />
                </div>

                {/* Auto-Assigned Standard Codes Summary */}
                {(article || sku) && (
                  <div className="p-3 bg-slate-100/80 dark:bg-[#070B14] border border-slate-200 dark:border-[#1A263D] rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Tag className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                      <span className="text-gray-600 dark:text-slate-400 font-medium">Standard Codes:</span>
                      <span className="font-mono font-bold text-gray-900 dark:text-white bg-white dark:bg-[#131B2E] px-2 py-0.5 rounded border border-gray-200 dark:border-[#1A263D]">
                        Article: {article || '---'}
                      </span>
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800/60">
                        SKU: {sku || '---'}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-500 dark:text-slate-400">Auto-generated from classification</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* STEP 2: COST PRICE (REAL-TIME PRICING POLICY APPLIED)     */}
          {/* ========================================================= */}
          {currentStep === 2 && (() => {
            const rawPricingMode = String(companySettings?.pricing_mode || companySettings?.pricingMode || 'NEGOTIABLE').toUpperCase();
            const isFixedPolicy = rawPricingMode === 'FIXED';
            const fixedMargin =
              typeof companySettings?.fixed_profit_margin === 'number'
                ? companySettings.fixed_profit_margin
                : typeof companySettings?.fixedProfitMargin === 'number'
                ? companySettings.fixedProfitMargin
                : 30;
            const minMargin =
              typeof companySettings?.min_profit_margin === 'number'
                ? companySettings.min_profit_margin
                : typeof companySettings?.minProfitMargin === 'number'
                ? companySettings.minProfitMargin
                : 15;
            const maxMargin =
              typeof companySettings?.max_profit_margin === 'number'
                ? companySettings.max_profit_margin
                : typeof companySettings?.maxProfitMargin === 'number'
                ? companySettings.maxProfitMargin
                : 30;

            const costVal = typeof purchasePrice === 'number' ? purchasePrice : 0;
            const realTimeTagPrice = getProductRetailPrice({ costPrice: costVal, purchasePrice: costVal }, companySettings);
            const realTimeMinFloor = getProductMinFloorPrice({ costPrice: costVal, purchasePrice: costVal }, companySettings);

            return (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* Single Cost Price Input Card */}
                <div className="bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 p-5 rounded-2xl border border-gray-200 dark:border-[#1A263D] shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-indigo-600 dark:text-blue-400" />
                      <h4 className="font-bold text-gray-900 dark:text-white text-sm">Product Cost Price</h4>
                    </div>
                    <span className="text-[11px] text-gray-400 dark:text-slate-500 font-medium">Step 2 of 3</span>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-[#070B14] border border-gray-200 dark:border-slate-800 rounded-2xl space-y-2">
                    <label className="block font-bold text-gray-900 dark:text-slate-200 text-xs">
                      Cost Price (costPrice) <span className="text-red-500">*</span>
                    </label>
                    <p className="text-[11px] text-gray-500 dark:text-slate-400">
                      Procurement cost per shoe pair paid to supplier or factory. All selling prices, sticker labels, and POS limits are calculated automatically from this cost price in real time.
                    </p>
                    <div className="relative max-w-md">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400 font-mono font-bold text-base">
                        {currencySymbol}
                      </span>
                      <input
                        id="product-cost-price-input"
                        type="number"
                        min="0"
                        step="1"
                        required
                        autoFocus
                        placeholder="0"
                        value={purchasePrice}
                        onChange={(e) => handlePurchasePriceChange(e.target.value)}
                        onBlur={(e) => handlePurchasePriceBlur(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-white dark:bg-[#0B101D] border-2 border-indigo-200 dark:border-indigo-800/80 rounded-xl font-mono font-black text-lg text-gray-950 dark:text-white outline-none focus:border-indigo-600 dark:focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-950/50 shadow-xs"
                      />
                    </div>
                    {costVal > 0 && (
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        Base Cost: {currencySymbol} {formatStockPrice(costVal)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Real-time Dynamic Calculated Prices Breakdown Card */}
                <div className="bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 p-5 rounded-2xl border border-gray-200 dark:border-[#1A263D] shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <h4 className="font-bold text-gray-900 dark:text-white text-sm">
                        Real-Time Selling Prices (Store Pricing Policy)
                      </h4>
                    </div>
                    <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 uppercase">
                      {isFixedPolicy ? '1. Fixed Price Policy' : '2. Negotiable Price Policy'}
                    </span>
                  </div>

                  {isFixedPolicy ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 space-y-1">
                        <span className="text-[11px] font-bold text-purple-900 dark:text-purple-300 uppercase tracking-wider block">
                          Tag &amp; POS Selling Price (Fixed)
                        </span>
                        <div className="text-2xl font-black font-mono text-purple-950 dark:text-white">
                          {currencySymbol} {formatStockPrice(realTimeTagPrice)}
                        </div>
                        <p className="text-[11px] text-purple-800/80 dark:text-purple-300/80 mt-1">
                          Cost Price + {fixedMargin}% Profit Margin. Calculated in real-time, printed on barcode stickers and shoe box labels, locked at POS.
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#070B14] border border-gray-200 dark:border-slate-800 flex flex-col justify-center space-y-1">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                          Gross Margin Realized
                        </span>
                        <div className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                          +{currencySymbol} {formatStockPrice(Math.max(0, realTimeTagPrice - costVal))} ({fixedMargin}%)
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                          Guaranteed gross profit return per pair in Fixed Price mode.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-wider">
                            Sticker Tag Price (M.R.P.)
                          </span>
                          <span className="text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 px-1.5 py-0.5 rounded">
                            +{maxMargin}% Max
                          </span>
                        </div>
                        <div className="text-2xl font-black font-mono text-indigo-950 dark:text-white">
                          {currencySymbol} {formatStockPrice(realTimeTagPrice)}
                        </div>
                        <p className="text-[11px] text-indigo-800/80 dark:text-indigo-300/80 mt-1">
                          Printed on barcode stickers &amp; shoe box labels. Initial retail price in POS cart.
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider">
                            Minimum POS Floor Price
                          </span>
                          <span className="text-[10px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 rounded">
                            +{minMargin}% Min
                          </span>
                        </div>
                        <div className="text-2xl font-black font-mono text-amber-950 dark:text-amber-200">
                          {currencySymbol} {formatStockPrice(realTimeMinFloor)}
                        </div>
                        <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-1">
                          Lowest negotiable price allowed at checkout. Cashiers cannot sell below this floor.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Real-time Dynamic Info Notice */}
                  <div className="p-3 bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-xl text-blue-900 dark:text-blue-300 text-xs flex items-center gap-2.5">
                    <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>
                      <strong>Real-Time Dynamic Pricing:</strong> If you change the profit margins (maximum or minimum) in Settings &rarr; Pricing Policy, all products immediately calculate new prices in real time. You do not need to update individual products.
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ========================================================= */}
          {/* STEP 3: BARCODE & IDENTIFICATION (VALIDATED & EDITABLE)   */}
          {/* ========================================================= */}
          {currentStep === 3 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 p-5 rounded-2xl border border-gray-200 dark:border-[#1A263D] shadow-xs dark:shadow-[0_0_20px_rgba(59,130,246,0.05)] space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Barcode className="w-4 h-4 text-indigo-600 dark:text-blue-400" />
                    <h4 className="font-bold text-gray-900 dark:text-white text-sm">3. Barcode &amp; Product Identification</h4>
                  </div>
                  <span className="text-[11px] text-gray-400 dark:text-slate-500">Step 3 of 3</span>
                </div>

                {/* EDITABLE BARCODE SECTION WITH REAL-TIME VALIDATION */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <label className="font-bold text-gray-900 dark:text-slate-200 text-xs flex items-center gap-1.5">
                        <span>Barcode Input (Validated &amp; Scannable)</span>
                        <span className="text-red-500">*</span>
                      </label>
                      <p className="text-[11px] text-gray-500 dark:text-slate-400">
                        Pre-filled with designed store standard EAN-13. You can keep it, or scan/type an external manufacturer box barcode.
                      </p>
                    </div>

                    {/* Fast Action Buttons */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleGenerateStoreBarcode}
                        className="px-2.5 py-1.5 bg-indigo-50 dark:bg-blue-950/50 hover:bg-indigo-100 dark:hover:bg-blue-900/60 text-indigo-600 dark:text-blue-400 rounded-lg font-semibold text-[11px] transition flex items-center gap-1 cursor-pointer border border-indigo-200 dark:border-blue-800/60"
                        title="Auto-generate standard 13-digit EAN-13 using your store prefix"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-blue-400" />
                        <span>Reset to Store EAN-13</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setBarcode('');
                          setTimeout(() => barcodeInputRef.current?.focus(), 50);
                        }}
                        className="px-2.5 py-1.5 bg-slate-100 dark:bg-[#070B14] hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-semibold text-[11px] transition flex items-center gap-1 cursor-pointer border border-slate-300 dark:border-slate-700"
                        title="Clear and focus to scan box barcode with gun or type manual barcode"
                      >
                        <Scan className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                        <span>Scan / Enter Box Barcode</span>
                      </button>
                    </div>
                  </div>

                  {/* Editable Barcode Input with Dynamic Border & Validation State */}
                  <div className="relative">
                    <input
                      ref={barcodeInputRef}
                      type="text"
                      required
                      placeholder="Scan box barcode with gun or type (e.g. 045242500123 or 0108923000018)..."
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value.trim())}
                      className={`w-full pl-10 pr-28 py-3 bg-white dark:bg-[#070B14] border-2 rounded-xl font-mono font-bold text-base text-gray-900 dark:text-white outline-none transition shadow-xs ${
                        barcodeValidation.status === 'valid'
                          ? 'border-emerald-400 dark:border-emerald-500 focus:border-emerald-600 dark:focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-950'
                          : barcodeValidation.status === 'invalid'
                          ? 'border-red-400 dark:border-red-500 focus:border-red-600 dark:focus:border-red-400 focus:ring-2 focus:ring-red-100 dark:focus:ring-red-950'
                          : barcodeValidation.status === 'checking'
                          ? 'border-amber-400 dark:border-amber-500 focus:border-amber-600 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-950'
                          : 'border-indigo-300 dark:border-blue-700/60 focus:border-indigo-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-blue-950'
                      }`}
                    />
                    <Barcode className="w-5 h-5 text-indigo-600 dark:text-blue-400 absolute left-3 top-1/2 -translate-y-1/2" />

                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {barcode && (
                        <button
                          type="button"
                          onClick={() => setBarcode('')}
                          className="px-2 py-1 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 rounded text-[10px] font-semibold cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                      <span className="font-mono text-[10px] font-bold text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-gray-200 dark:border-slate-700">
                        {barcode.length} chars
                      </span>
                    </div>
                  </div>

                  {/* REAL-TIME VALIDATION STATUS FEEDBACK */}
                  {barcodeValidation.status === 'checking' && (
                    <div className="alert-warning flex items-center gap-2.5 text-xs animate-in fade-in">
                      <RefreshCw className="w-4 h-4 animate-spin text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>{barcodeValidation.message || 'Validating barcode format & checking catalog uniqueness...'}</span>
                    </div>
                  )}

                  {barcodeValidation.status === 'valid' && (
                    <div className="alert-success flex flex-wrap items-center justify-between gap-2 text-xs animate-in fade-in">
                      <div className="flex items-center gap-2 text-emerald-950 dark:text-emerald-300 font-medium">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <div>
                          <span className="font-bold text-emerald-900 dark:text-emerald-300">{barcodeValidation.standardLabel || 'Barcode'}</span>
                          <span className="mx-1.5 opacity-40">|</span>
                          <span className="text-emerald-700 dark:text-emerald-400">Checksum verified &amp; available in catalog</span>
                        </div>
                      </div>
                      <span className="badge-success uppercase text-[10px]">
                        <Check className="w-3 h-3 stroke-[3]" />
                        <span>Validated</span>
                      </span>
                    </div>
                  )}

                  {barcodeValidation.status === 'invalid' && (
                    <div className="alert-danger space-y-2.5 text-xs animate-in fade-in">
                      <div className="flex items-start gap-2.5 text-red-800 dark:text-red-300">
                        <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <span className="font-bold block text-red-950 dark:text-red-200 text-xs">
                            {barcodeValidation.isDuplicate
                              ? 'Duplicate Barcode Conflict'
                              : 'Barcode Validation Failed'}
                          </span>
                          <p className="text-red-700 dark:text-red-300 text-[11px] mt-0.5 leading-relaxed">
                            {barcodeValidation.error}
                          </p>
                        </div>
                      </div>

                      {/* Auto-fix suggested check digit button */}
                      {barcodeValidation.suggestedFix && (
                        <div className="pt-2 border-t border-red-200 dark:border-red-800/60 flex flex-wrap items-center justify-between gap-2">
                          <div className="text-[11px] text-red-900 dark:text-red-300 font-mono">
                            Correct checksum code:{' '}
                            <span className="font-bold underline">{barcodeValidation.suggestedFix}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setBarcode(barcodeValidation.suggestedFix!)}
                            className="btn-danger px-3 py-1 text-[11px] flex items-center gap-1.5 shadow-2xs"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Auto-Fix Check Digit</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Standard Guidelines Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-gray-500 dark:text-slate-400">
                    <span>
                      Supported: Store EAN-13, International EAN-13, UPC-A (12D), EAN-8, and Code-128 box codes.
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-slate-500">
                      Auto-validated on type/scan
                    </span>
                  </div>
                </div>

                {/* LIVE VISUAL BARCODE PREVIEW */}
                {barcode && (
                  <div className="p-4 bg-slate-50 dark:bg-[#070B14] border border-gray-200 dark:border-slate-800 rounded-xl flex flex-col items-center justify-center space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                      Live Scannable Barcode Preview
                    </span>
                    <div className="bg-white p-3 rounded-lg border border-gray-200 dark:border-slate-700 shadow-2xs">
                      <BarcodeSvg
                        value={barcode}
                        width={1.7}
                        height={46}
                        fontSize={12}
                        className="max-w-full h-auto"
                      />
                    </div>
                    <p className="text-[10px] text-gray-500 dark:text-slate-400 text-center">
                      Cashier barcode guns will read this code at checkout to look up: <span className="font-semibold text-gray-800 dark:text-slate-200">{productName || article || 'Product'}</span>
                    </p>

                    {/* Quick Label & Sticker Actions */}
                    <div className="pt-2 border-t border-gray-200 dark:border-slate-800 w-full flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        title="Print retail barcode sticker (50x30mm)"
                        onClick={() => setIsBarcodeStickerOpen(true)}
                        className="px-3 py-1.5 rounded-lg border border-purple-200 dark:border-purple-800/60 bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 hover:bg-gradient-to-r hover:from-purple-600 hover:to-indigo-600 hover:text-white dark:hover:from-purple-600 dark:hover:to-indigo-600 transition-all shadow-2xs cursor-pointer flex items-center gap-1.5 text-xs font-bold active:scale-95"
                      >
                        <Barcode className="w-3.5 h-3.5" />
                        <span>Print Barcode Sticker (50x30mm)</span>
                      </button>

                      <button
                        type="button"
                        title="Print high-visibility 3x4 inch shoe box side-end label for rack storage"
                        onClick={() => setIsSideEndLabelOpen(true)}
                        className="px-3 py-1.5 rounded-lg border border-purple-200 dark:border-purple-800/60 bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 hover:bg-purple-600 hover:text-white dark:hover:bg-purple-600 transition-all shadow-2xs cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                      >
                        <Box className="w-3.5 h-3.5" />
                        <span>Print Side-End Box Label (3&quot; x 4&quot;)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* FINAL REVIEW SUMMARY CARD */}
              <div className="bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 p-5 rounded-2xl border border-gray-200 dark:border-[#1A263D] shadow-xs dark:shadow-[0_0_20px_rgba(59,130,246,0.05)] space-y-3">
                <h5 className="font-bold text-gray-800 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-slate-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Product Review Summary Before Saving</span>
                </h5>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#070B14] border border-gray-100 dark:border-slate-800">
                    <span className="text-[10px] text-gray-400 dark:text-slate-500 block">Brand &amp; Category</span>
                    <span className="font-bold text-gray-900 dark:text-white truncate block">
                      {currentBrandName || '---'} / {currentCategoryName || '---'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#070B14] border border-gray-100 dark:border-slate-800">
                    <span className="text-[10px] text-gray-400 dark:text-slate-500 block">Designed SKU</span>
                    <span className="font-mono font-bold text-indigo-600 dark:text-blue-400 truncate block">{sku || '---'}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#070B14] border border-gray-100 dark:border-slate-800">
                    <span className="text-[10px] text-gray-400 dark:text-slate-500 block">Cost / Max Sale Price</span>
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 truncate block">
                      {currencySymbol} {formatStockPrice(purchasePrice)} / {currencySymbol} {formatStockPrice(effectiveMaxSale)}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#070B14] border border-gray-100 dark:border-slate-800">
                    <span className="text-[10px] text-gray-400 dark:text-slate-500 block">Total Stock</span>
                    <span className="font-mono font-bold text-gray-900 dark:text-white truncate block">
                      {totalStock === '' ? 0 : totalStock} Pairs
                    </span>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* FOOTER NAVIGATION & ACTION BUTTONS                        */}
          {/* ========================================================= */}
          <div className="pt-4 -mx-6 -mb-6 p-6 bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900 border-t border-gray-200 dark:border-purple-800/80 flex items-center justify-between">
            <div>
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={goToPrevStep}
                  className="btn-secondary px-4 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs font-bold"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary px-4 py-2.5 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {currentStep < 3 ? (
                <button
                  type="button"
                  onClick={goToNextStep}
                  className="btn-primary px-5 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-sm font-bold"
                >
                  <span>
                    {currentStep === 1
                      ? 'Next: Pricing Specifications'
                      : 'Next: Barcode & Identification'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmAndSave}
                  disabled={isSubmitting || barcodeValidation.status === 'invalid'}
                  className="btn-primary px-6 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-md font-bold disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmitting ? 'Saving Product...' : product ? 'Confirm & Update Product' : 'Confirm & Create Product'}</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </motion.div>

      <AnimatePresence>
        {isSideEndLabelOpen && (
          <SideEndBoxLabelModal
            product={
              product || {
                id: effectiveProductId,
                article: article || productName || 'Shoe Article',
                name: productName || article,
                sku: sku,
                barcode: barcode || sku,
                minSalePrice: minSalePrice || 0,
                maxSalePrice: maxSalePrice || 0,
                brandName: currentBrandName,
                categoryName: currentCategoryName,
              }
            }
            companySettings={companySettings}
            onClose={() => setIsSideEndLabelOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isBarcodeStickerOpen && (
          <BarcodeStickerModal
            product={
              product || {
                id: effectiveProductId,
                article: article || productName || 'Shoe Article',
                name: productName || article,
                sku: sku,
                barcode: barcode || sku,
                minSalePrice: minSalePrice || 0,
                maxSalePrice: maxSalePrice || 0,
                brandName: currentBrandName,
                categoryName: currentCategoryName,
              }
            }
            companySettings={companySettings}
            onClose={() => setIsBarcodeStickerOpen(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};
