// services/phase2/karigarService.ts — Phase 2 v2.30 Canonical Service
// Step 10.7 / FIX-SERVICE-BODY-1 (v1.35) / FIX-LOOP-1 (v1.33) / FIX-KARIGAR-FWDCOMPAT-1 (v2.18) / FIX-P2-SYNC-CONTRACT-1 (v1.81)

import { db } from '@/db/client';
import { itemRepository } from '@/repositories/phase2/itemRepository';
import { itemEventRepository } from '@/repositories/phase2/itemEventRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { karigarRepository } from '@/repositories/phase2/karigarRepository';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { getDeviceId } from '@/utils/deviceId';
import { now } from '@/utils/now';
import { sanitizeText } from '@/utils/sanitize';
import * as Crypto from 'expo-crypto';
import { ERR } from '@/constants/errorCodes';
import type { KarigarIssuedItem, StockStatus, Metal } from '@/types/phase2/phase2.types';
import { ALLOWED_TRANSITIONS } from '@/types/phase2/phase2.types';

export type KarigarOutcome = 'REPAIRED' | 'UNREPAIRABLE' | 'DEFECTIVE' | 'PARTIALLY_REPAIRED';

// --- sendToKarigar (Step 10.7 / FIX-SERVICE-BODY-1 v1.35 / FIX-AVAILABLE-KARIGAR-1 v1.46) ---
export async function sendToKarigar(
  itemId: string,
  firmId: string,
  karigarName: string,
  reason: string,
  karigarId?: string
): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2

  if (!reason || reason.trim().length === 0) throw new Error(ERR.ITEM_ACTION_REASON_REQUIRED);
  if (!karigarName || karigarName.trim().length === 0) throw new Error(ERR.KARIGAR_NAME_REQUIRED);

  const sanitizedKarigarName = sanitizeText(karigarName);
  const sanitizedReason = sanitizeText(reason);

  // FIX-P2-SYNC-CONTRACT-1: await deviceId cleanly outside tx
  const deviceId = await getDeviceId();

  return db.transaction((tx) => {
    const item = itemRepository.getById(tx, firmId, itemId);
    if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);

    // FIX-AVAILABLE-KARIGAR-1: SENT_TO_KARIGAR is ONLY reachable from DAMAGED
    if (item.status !== 'DAMAGED') {
      throw new Error(`${ERR.INVALID_TRANSITION}: must be DAMAGED to send to karigar`);
    }

    // FIX-LOOP-1 (v1.33): Loop guard — count prior ITEM_SENT_TO_KARIGAR events
    const priorKarigarCount = itemEventRepository.countByItemIdAndEventType(
      tx,
      firmId,
      itemId,
      'ITEM_SENT_TO_KARIGAR'
    );
    
    if (priorKarigarCount >= 3) throw new Error(ERR.KARIGAR_LOOP_LIMIT_EXCEEDED);

    itemRepository.updateStatus(tx, firmId, itemId, 'SENT_TO_KARIGAR');

    // FIX-KARIGAR-FWDCOMPAT-1 (v2.18): supports optional karigarId
    itemEventRepository.insert(tx, {
      id: Crypto.randomUUID(),
      itemId,
      firmId,
      karigarId: karigarId ?? null,
      eventType: 'ITEM_SENT_TO_KARIGAR',
      severity: 'WARNING',
      performedBy: deviceId,
      reason: sanitizedReason,
      oldValue: 'DAMAGED',
      newValue: 'SENT_TO_KARIGAR',
      timestamp: now(),
    });

    auditRepository.log(tx, {
      eventType: 'ITEM_SENT_TO_KARIGAR',
      firmId,
      entityId: itemId,
      deviceId,
      payload: {
        itemId,
        sku: item.sku,
        karigarName: sanitizedKarigarName,
        karigarId: karigarId ?? null,
        reason: sanitizedReason,
        priorKarigarCount,
      },
    });
  });
}

// --- returnFromKarigar (Step 10.7 / FIX-SERVICE-BODY-1 v1.35) ---
export async function returnFromKarigar(
  itemId: string,
  firmId: string,
  outcome: KarigarOutcome,
  karigarName: string,
  reason?: string
): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();     // GUARD 2

  const nextStatusMap: Record<string, StockStatus> = {
    REPAIRED: 'AVAILABLE',
    UNREPAIRABLE: 'SENT_TO_REFINERY',
    DEFECTIVE: 'DAMAGED',
    PARTIALLY_REPAIRED: 'DAMAGED',
  };

  const nextStatus = nextStatusMap[outcome];
  if (!nextStatus) throw new Error(`${ERR.INVALID_TRANSITION}: Unknown karigar outcome ${outcome}`);

  const sanitizedKarigarName = sanitizeText(karigarName);
  const sanitizedReason = reason ? sanitizeText(reason) : null;

  // FIX-P2-SYNC-CONTRACT-1: await deviceId cleanly outside tx
  const deviceId = await getDeviceId();

  return db.transaction((tx) => {
    const item = itemRepository.getById(tx, firmId, itemId);
    if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);

    if (item.status !== 'SENT_TO_KARIGAR') {
      throw new Error(`${ERR.INVALID_TRANSITION}: item must be SENT_TO_KARIGAR to return from karigar`);
    }

    const allowed = ALLOWED_TRANSITIONS['SENT_TO_KARIGAR'];
    if (!allowed || !allowed.includes(nextStatus)) {
      throw new Error(`${ERR.INVALID_TRANSITION}: SENT_TO_KARIGAR -> ${nextStatus}`);
    }

    itemRepository.updateStatus(tx, firmId, itemId, nextStatus);

    itemEventRepository.insert(tx, {
      id: Crypto.randomUUID(),
      itemId,
      firmId,
      karigarId: null,
      eventType: 'ITEM_RETURNED_FROM_KARIGAR',
      severity: 'INFO',
      performedBy: deviceId,
      reason: sanitizedReason,
      oldValue: 'SENT_TO_KARIGAR',
      newValue: nextStatus,
      timestamp: now(),
    });

    auditRepository.log(tx, {
      eventType: 'ITEM_RETURNED_FROM_KARIGAR',
      firmId,
      entityId: itemId,
      deviceId,
      payload: {
        itemId,
        sku: item.sku,
        outcome,
        nextStatus,
        karigarName: sanitizedKarigarName,
        reason: sanitizedReason,
      },
    });
  });
}

// --- getKarigarIssuedItems (Step 10.8 / FEAT-GAP6-KARIGAR-SUMMARY-1 v1.66) ---
export async function getKarigarIssuedItems(firmId: string): Promise<KarigarIssuedItem[]> {
  if (!firmId) throw new Error(ERR.FIRM_ID_REQUIRED); // RED-9 firm guard
  const rawRows = await karigarRepository.getKarigarIssuedItemsRaw(firmId);

  return rawRows.map((row: any) => {
    let karigarName: string | null = null;
    if (row.auditPayload) {
      try {
        const parsed = typeof row.auditPayload === 'string' ? JSON.parse(row.auditPayload) : row.auditPayload;
        karigarName = parsed.karigarName ?? null;
      } catch (e) {
        console.error('[karigarService] Failed to parse audit payload', e);
      }
    }

    return {
      id: row.id,
      sku: row.sku,
      barcode: row.barcode,
      designName: row.designName,
      metal: row.metal as Metal,
      purityPercent: row.purityPercent,
      purityKarat: row.purityKarat,
      grossWeightMg: row.grossWeightMg,
      netWeightMg: row.netWeightMg,
      karigarName,
      karigarId: null,
      updatedAt: row.updatedAt,
    };
  });
}

export const karigarService = {
  sendToKarigar,
  returnFromKarigar,
  getKarigarIssuedItems,
};