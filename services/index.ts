// services/index.ts — Phase 1 & Phase 2 Barrel Exports

export * from './phase1/auditRetentionService';
export * from './phase1/auditService';
export * from './phase1/backupService';
export * from './phase1/bootstrapService';
export * from './phase1/firmService';
export {
  fyCoreService,
  fyService,
  closeCoreFY,
  resolveTransactionFyId,
  getActiveFY,
  createInitialFY,
  registerFYCloseHook,
} from './phase1/fyService';
export * from './phase1/leaseService';
export * from './phase1/pinService';
export * from './phase1/restoreService';
export * from './phase1/safeModeService';
export * from './phase1/settingsService';
export {
  verifyService,
  type VerifyStatus,
  type VerifyFinding,
  type VerifyResult,
} from './phase1/verifyService';

export * from './phase2/barcodeLabelService';
export * from './phase2/categoryService';
export * from './phase2/designService';
export {
  fyInventoryService,
  preCloseChecks,
  computeFYInventoryBalances,
  closeFY,
} from './phase2/fyInventoryService';
export * from './phase2/gemstoneLotService';
export * from './phase2/inventoryDrillDownService';
export * from './phase2/inventorySearchService';
export * from './phase2/inventoryVerifyService';
export * from './phase2/itemService';
export {
  karigarService,
  type KarigarOutcome,
} from './phase2/karigarService';
export * from './phase2/looseStockService';
export {
  oldMetalLotService,
  oldGoldLotService,
  findAvailableForIssuance,
  createOldMetalLot,
  createOldGoldLot,
  updateOldMetalLotStatus,
  updateOldGoldLotStatus,
  getOldMetalLotById,
  getOldGoldLotById,
  getOldMetalLotsByFirm,
  getOldGoldLotsByFirm,
} from './phase2/oldGoldLotService';
export * from './phase2/skuEngine';
export * from './phase2/stoneService';
export * from './phase2/urdPrintService';
export * from './phase2/urdPurchaseService';
export * from './phase2/inventoryAuditService';
export * from './phase2/inventoryBackupService';
export * from './phase2/inventoryRestoreService';


