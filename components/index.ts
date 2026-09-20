// components/index.ts — Canonical Components Barrel Re-export
// Cross-Phase UI & Domain Components

// Common Layout Primitives
export * from './common/TwoToneWrapper';
export * from './common/ScreenWrapper';

// Phase 1: Fortress, Security & System Settings
export * from './phase1/DateFormatModal';
export * from './phase1/FYEndBanner';
export * from './phase1/LeaseStatusBanner';
export * from './phase1/PinGate';
export * from './phase1/RestorePreviewModal';
export * from './phase1/SafeModeBanner';
export * from './phase1/ThemeSelectorModal';
export * from './phase1/UnsavedChangesModal';

// Phase 2: Inventory Management
export * from './phase2/InventoryStockSummary';

// Phase 3: Money Truth, Billing & Masters
export * from './phase3/CustomerSearchPickerModal';
export * from './phase3/InvoiceGstSection';
export * from './phase3/InvoicePreviewModal';
export * from './phase3/ItemSearchSection';
export * from './phase3/LooseStockEntrySection';
export * from './phase3/RateConfigModal';
export * from './phase3/SettleMetalModal';
export * from './phase3/SupplierSearchPickerModal';
