export interface URDTemplateParams {
  urd: any;
  firm: any;
  bisLogoUri?: string | null;
  firmLogoUri?: string | null;
  symbol: string;
  grossGrams: string;
  fineGrams: string;
  grossValueRupees: string;
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
  totalRupees: string;
  formattedDate: string;
  idProofType: string;
  idProofNumber: string;
}
