// types/firm.ts
// v5.0 G46 + v7.0 G70 CreateFirmInput definition
import type { firms } from '../db/schema';

export type Firm = typeof firms.$inferSelect;

export type CreateFirmInput = {
  name: string;
  firmCode: string;
  proprietor: string;
  gstin?: string | null;
  bisLicence?: string | null;
  bisLogoRef?: string | null;
  firmLogoRef?: string | null; // v5.0 G45: firm brand logo URI
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  stateCode: string; // v7.0 G70: 2-digit GST state code (from INDIAN_STATES)
  stateName: string; // v7.0 G70: display name e.g. 'Maharashtra'
  pincode: string;
  phone1: string; // Required
  phone2?: string | null; // Optional
  phone3?: string | null; // v5.0 G46: Optional third contact number
  bisLogoUri?: string | null; // Optional temporary file URI for upload
};

export type UpdateFirmInput = {
  name?: string;
  proprietor?: string;
  addressLine1?: string;
  addressLine2?: string | null;
  city?: string;
  stateCode?: string; // v7.0 G70: 2-digit GST state code (from INDIAN_STATES)
  stateName?: string; // v7.0 G70: display name e.g. 'Maharashtra'
  pincode?: string;
  phone1?: string;
  phone2?: string | null;
  phone3?: string | null; // v5.0 G46: Optional third contact number
  bisLicence?: string | null;
  bisLogoRef?: string | null;
  firmLogoRef?: string | null; // v5.0 G45: firm brand logo URI
  bisLogoUri?: string | null;
};
