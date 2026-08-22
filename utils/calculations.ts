// utils/calculations.ts — CANONICAL CENTRAL CALCULATION HUB FOR VJ BILLING
// All domain formulas, unit conversions, weight displays, purity math, wholesale costing, 
// and currency formatting are centralized here to guarantee 100% mathematical consistency.

export {
  // Purity Map & Standards
  PURITY_MAP,
  PURITY_ROUND_TO_100,
  PURITY_PERCENT_EXTENDED,
  GOLD_PURITY_GRADES,
  SILVER_PURITY_GRADES,
  isStandardPurityGrade,
  PurityPreset,
  GOLD_PURITY_PRESETS,
  SILVER_PURITY_PRESETS,
  PURITY_PRESETS,
  getPurityPresets,
  getPurityPresetById,

  // Fine Weight & Purity Formulas
  resolveEffectivePurityPercent, // FIX-EFFPRICE-PURITYROUND-1 (v2.14)
  resolveFineWeightMg,
  karatToPercent,
  percentToKarat,
  getDisplayPurity,

  // Costing & Wholesale Formulas
  computeFineGoldChargedMg,
  computeEffectivePricePerGram,
  computeEffectivePricePaisePerGram,
  computeEstTotalCostPaise,
  computeVaultTruthGrams,
  computeCostTruthGrams,
  computeWastageGoldGrams,
  computeAbsoluteTotalCostRupees,

  // Weight Formulas & Conversions (RULE-1A-WEIGHT-DISPLAY)
  formatWeightMg,
  formatWeightGrams,
  mgToGrams,
  gramsToMg,
  computeNetWeightMg,
  caratX100ToCarats,
  caratsToCaratX100,
  formatCarats,
  computeGemstoneTotalPaise,

  // Central URD Purchase & Live Cost Breakdown Formulas
  parseCleanFloat,
  computeURDFineWeightMg,
  computeURDTotalValuePaise,
  computeURDCostBreakdown,
  type URDCostBreakdown,
} from './purity.constants';

export {
  // Currency & Money Formulas
  getCurrencySymbol,
  amountToWords,
  rupeesToPaise,
  paiseToRupees,
  formatRupees,
} from './currency';

export {
  // SKU & Barcode Display Formatting
  formatSKUDisplay,
} from './skuDisplay';

export {
  // Financial Year Helpers
  getCurrentFYBounds,
} from './fyUtils';
