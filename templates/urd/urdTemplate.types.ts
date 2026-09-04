export interface URDTemplateParams {
  urd: any;
  firm: any;
  bisLogoUri?: string | null;
  firmLogoUri?: string | null;
  symbol: string;
  grossGrams: string;
  fineGrams: string;
  grossValueRupees: string;
  adjustmentRupees?: string;
  hasAdjustment?: boolean;
  adjustmentSign?: string;
  formattedAdjustment?: string;
  discountRupees: string;
  hasDiscount: boolean;
  totalRupees: string;
  rateRupees: string;
  words: string;
  formattedDate: string;
  idProofHtml: string;
  cashAmt: string;
  bankAmt: string;
  chequeAmt: string;
  upiAmt: string;
}

export interface URDCustomerDeclarationParams {
  urd: any;
  firm: any;
  firmLogoUri?: string | null;
  symbol: string;
  grossGrams: string;
  fineGrams: string;
  ratePerGram: string;
  grossValueRupees?: string;
  adjustmentRupees?: string;
  hasAdjustment?: boolean;
  adjustmentSign?: string;
  formattedAdjustment?: string;
  totalRupees: string;
  formattedDate: string;
  idProofType: string;
  idProofNumber: string;
}

// Template IDs & Extensible Registry
export type URDBillTemplateId = 'urdTemplate1';
export type URDDeclarationTemplateId = 'urdDeclaration1' | 'urdDeclaration2';

export interface URDTemplateMeta {
  id: string;
  name: string;
  category: 'BILL' | 'DECLARATION';
  language: 'en' | 'mr';
  description: string;
}

export const URD_BILL_TEMPLATES: readonly URDTemplateMeta[] = [
  {
    id: 'urdTemplate1',
    name: 'Standard URD Purchase Bill (A5)',
    category: 'BILL',
    language: 'en',
    description: 'Standard A5 Landscape URD Purchase Bill with payment mode split and signatures',
  },
] as const;

export const URD_DECLARATION_TEMPLATES: readonly URDTemplateMeta[] = [
  {
    id: 'urdDeclaration1',
    name: 'Marathi Customer Declaration (घोषणापत्र / शपथपत्र)',
    category: 'DECLARATION',
    language: 'mr',
    description: 'Official Marathi legal affidavit/undertaking format for seller verification',
  },
  {
    id: 'urdDeclaration2',
    name: 'English Customer Declaration (Affidavit)',
    category: 'DECLARATION',
    language: 'en',
    description: 'Official English 2-page legal affidavit/undertaking format with disclaimer',
  },
] as const;

import { storage } from '@/utils/storage';

/**
 * Resolves the firm's preferred default URD bill template (strictly scoped by firmId)
 */
export function getFirmURDBillTemplateId(firmId: string): URDBillTemplateId {
  if (!firmId) return 'urdTemplate1';
  const saved = storage.getString(`firm_${firmId}_urd_bill_template`);
  if (saved === 'urdTemplate1') return saved;
  return 'urdTemplate1';
}

/**
 * Persists the firm's preferred default URD bill template (strictly scoped by firmId)
 */
export function setFirmURDBillTemplateId(firmId: string, templateId: URDBillTemplateId): void {
  if (!firmId) return;
  storage.set(`firm_${firmId}_urd_bill_template`, templateId);
}

/**
 * Resolves the firm's preferred default URD customer declaration template (strictly scoped by firmId)
 */
export function getFirmURDDeclarationTemplateId(firmId: string): URDDeclarationTemplateId {
  if (!firmId) return 'urdDeclaration1';
  const saved = storage.getString(`firm_${firmId}_urd_declaration_template`);
  if (saved === 'urdDeclaration1' || saved === 'urdDeclaration2') return saved;
  return 'urdDeclaration1';
}

/**
 * Persists the firm's preferred default URD customer declaration template (strictly scoped by firmId)
 */
export function setFirmURDDeclarationTemplateId(firmId: string, templateId: URDDeclarationTemplateId): void {
  if (!firmId) return;
  storage.set(`firm_${firmId}_urd_declaration_template`, templateId);
}

/**
 * Standard Print & PDF Export Page Specifications (72 PPI PostScript Points)
 * - URD Purchase Bill: A5 Landscape (210mm x 148mm -> 595 x 420 pt)
 * - Customer Declaration / Affidavit: A4 Portrait (210mm x 297mm -> 595 x 842 pt)
 */
export const URD_PRINT_FORMATS = {
  BILL: {
    paperSize: 'A5',
    orientation: 'landscape' as const,
    width: 595,
    height: 420,
  },
  DECLARATION: {
    paperSize: 'A4',
    orientation: 'portrait' as const,
    width: 595,
    height: 842,
  },
} as const;

