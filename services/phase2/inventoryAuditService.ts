// services/phase2/inventoryAuditService.ts — Phase 2 Canonical Inventory Audit Service
// Dedicated audit service for jewelry inventory domain events.
// Adheres strictly to G41: delegates writes to Phase 1 auditRepository inside active transaction boundary.

import { auditRepository } from '@/repositories/phase1/auditRepository';
import { inventoryAuditRepository } from '@/repositories/phase2/inventoryAuditRepository';
import { getDeviceId } from '@/utils/deviceId';
import type { DrizzleTransaction, Phase2AuditPayload } from '@/types/phase2/phase2.types';

export type Phase2AuditEventType =
  | 'URD_PURCHASE_CREATED'
  | 'URD_PURCHASE_CONFIRMED'
  | 'CATEGORY_CREATED'
  | 'CATEGORY_UPDATED'
  | 'CATEGORY_SOFT_DELETED'
  | 'DESIGN_CREATED'
  | 'DESIGN_UPDATED'
  | 'DESIGN_SOFT_DELETED'
  | 'STONE_CREATED'
  | 'ITEM_CREATED'
  | 'HUID_ADDED'
  | 'ITEM_STATUS_CHANGED'
  | 'WEIGHT_ADJUSTED'
  | 'BARCODE_REPRINTED'
  | 'OLD_GOLD_LOT_CREATED'
  | 'OLD_GOLD_LOT_STATUS_CHANGED'
  | 'OLD_METAL_LOT_CREATED'
  | 'OLD_METAL_LOT_STATUS_CHANGED'
  | 'FY_CLOSE_FINE_BALANCE'
  | 'FY_ARCHIVE_INDEXED'
  | 'ITEM_DELETED'
  | 'METAL_SOURCE_CORRECTED'
  | 'HUID_CORRECTED'
  | 'GEMSTONE_LOT_CREATED'
  | 'GEMSTONE_LOT_STATUS_CHANGED'
  | 'ITEM_EDITED'
  | 'ITEM_SENT_TO_KARIGAR'
  | 'ITEM_RETURNED_FROM_KARIGAR'
  | 'PHANTOM_ITEM_CREATED'
  | 'PHANTOM_RECONCILED'
  | 'DRAFT_ITEM_DISCARDED'
  | 'SKU_CHANGED'
  | 'ITEM_ENTRY_DATE_CORRECTED'
  | 'LOOSE_STOCK_ADDED'
  | 'LOOSE_STOCK_SOLD';

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}

export const inventoryAuditService = {
  /**
   * Logs a Phase 2 inventory audit event.
   * Strictly G41-compliant: requires active DrizzleTransaction context.
   */
  log(
    tx: DrizzleTransaction,
    firmId: string,
    eventType: Phase2AuditEventType,
    payload: object,
    entityId?: string,
    deviceIdOverride?: string
  ): void {
    const deviceId = deviceIdOverride || getSafeDeviceId();
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);

    auditRepository.log(tx, {
      firmId,
      entityId: entityId ?? null,
      eventType,
      payload: payloadStr,
      deviceId,
    });
  },

  /**
   * Fetches audit records for a firm filtered to inventory domain events.
   */
  async getInventoryEvents(firmId: string, limit: number = 100) {
    return inventoryAuditRepository.getInventoryLogsByFirmId(firmId, limit);
  },

  /**
   * Fetches complete audit history for a specific inventory entity (item, lot, purchase).
   */
  async getEntityTimeline(firmId: string, entityId: string, limit: number = 50) {
    return inventoryAuditRepository.getByEntityId(firmId, entityId, limit);
  },

  /**
   * Fetches audit records for specific event types.
   */
  async getEventsByType(firmId: string, eventTypes: Phase2AuditEventType[], limit: number = 100) {
    return inventoryAuditRepository.getByEventTypes(firmId, eventTypes, limit);
  },
};

export default inventoryAuditService;
