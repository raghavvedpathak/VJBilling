// templates/invoice/invoiceTemplate.types.ts — Phase 3 STEP 18A Invoice Template Types
import type {
  SaleInvoice,
  SaleInvoiceItem,
  GenerateInvoicePDFOptions,
  InvoicePrintSettings,
  BankAccount,
  Customer,
  Payment,
} from '@/types/phase3/phase3.types';
import type { OldMetalLot } from '@/types/phase2/phase2.types';

export interface InvoiceTemplateParams {
  invoice: SaleInvoice | any;
  items: SaleInvoiceItem[] | any[];
  firm: any;
  customer: Customer | any | null;
  amountWords?: string | undefined;
  payments?: any[] | undefined;
  oldMetalLot?: OldMetalLot | null | undefined;
  oldMetalItems?: Array<{
    description?: string;
    grossWeightMg?: number;
    purityPercent?: number;
    purchaseRatePaise?: number;
    netAmountPaise?: number;
  }> | undefined;
  defaultBank?: BankAccount | null | undefined;
  printSettings?: InvoicePrintSettings | undefined;
  options?: GenerateInvoicePDFOptions | undefined;
  customAmountWords?: string | undefined;
  isReprint?: boolean | undefined;
}
