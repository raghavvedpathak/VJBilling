// repositories/phase2/inventoryAuditRepository.ts — Phase 2 Canonical Inventory Audit Repository
// Dedicated query and filtering layer for Phase 2 inventory-domain audit events.

import { eq, and, desc, inArray, or, like } from 'drizzle-orm';
import db, { db as dbNamed } from '@/db/client';
import { auditLogs } from '@/db/schema';
import type { DrizzleTransaction } from '@/types/phase2/phase2.types';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

export const INVENTORY_AUDIT_EVENT_PREFIXES = [
  'ITEM_%',
  'CATEGORY_%',
  'DESIGN_%',
  'STONE_%',
  'GEMSTONE_%',
  'URD_%',
  'OLD_METAL_%',
  'OLD_GOLD_%',
  'LOOSE_STOCK_%',
  'BARCODE_%',
  'WEIGHT_%',
  'HUID_%',
  'SKU_%',
  'PHANTOM_%',
  'DRAFT_ITEM_%',
  'FY_CLOSE_FINE_BALANCE',
] as const;

export const inventoryAuditRepository = {
  /**
   * Fetches audit records for a specific firm filtered strictly to inventory events.
   */
  getInventoryLogsByFirmId(firmId: string, limit: number = 100, tx?: DbOrTx) {
    if (!firmId) {
      throw new Error('ISOLATION_VIOLATION: firmId is strictly required to fetch inventory audit logs.');
    }

    const targetTx = getDb(tx);
    const prefixConditions = INVENTORY_AUDIT_EVENT_PREFIXES.map((prefix) =>
      like(auditLogs.eventType, prefix)
    );

    return targetTx
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.firmId, firmId), or(...prefixConditions)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .all();
  },

  /**
   * Fetches complete lifecycle audit trail for a specific inventory entity (item, lot, purchase, etc.).
   */
  getByEntityId(firmId: string, entityId: string, limit: number = 50, tx?: DbOrTx) {
    if (!firmId) {
      throw new Error('ISOLATION_VIOLATION: firmId is strictly required to fetch entity audit trail.');
    }
    if (!entityId) {
      throw new Error('PARAM_REQUIRED: entityId is required.');
    }

    const targetTx = getDb(tx);
    return targetTx
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.firmId, firmId), eq(auditLogs.entityId, entityId)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .all();
  },

  /**
   * Fetches audit records matching a specific set of inventory event types.
   */
  getByEventTypes(firmId: string, eventTypes: string[], limit: number = 100, tx?: DbOrTx) {
    if (!firmId) {
      throw new Error('ISOLATION_VIOLATION: firmId is strictly required.');
    }
    if (!eventTypes || eventTypes.length === 0) {
      return [];
    }

    const targetTx = getDb(tx);
    return targetTx
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.firmId, firmId), inArray(auditLogs.eventType, eventTypes as any)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .all();
  },
};

export default inventoryAuditRepository;
