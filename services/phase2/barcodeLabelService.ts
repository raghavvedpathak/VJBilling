// services/phase2/barcodeLabelService.ts — Phase 2 v2.24 Canonical Service
// Step 5.1 / FEAT-BARCODE-LABEL-1 (v1.66)

import { db } from '@/db/client';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { barcodeLabelRepository } from '@/repositories/phase2/barcodeLabelRepository';
import { firmRepository } from '@/repositories/phase1/firmRepository';
import { itemRepository } from '@/repositories/phase2/itemRepository';
import { itemEventRepository } from '@/repositories/phase2/itemEventRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { getDeviceId } from '@/utils/deviceId';
import { getDisplayPurity, formatWeightMg } from '@/utils/calculations';
import { formatSKUDisplay } from '@/services/phase2/skuEngine';
import { now } from '@/utils/now';
import * as Crypto from 'expo-crypto';
import type { BarcodeLabel } from '@/types/phase2/phase2.types';
import { ERR } from '@/constants/errorCodes';

// --- generateBarcodeLabel (Step 5.1 / FEAT-BARCODE-LABEL-1 v1.66) ---
// Read-only, safely async. No transaction, no lease, no audit write, no state change.
export async function generateBarcodeLabel(itemId: string, firmId: string): Promise<BarcodeLabel> {
  const row = await barcodeLabelRepository.getItemWithDesignName(itemId, firmId);
  if (!row) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);

  const firm = await firmRepository.getById(firmId);
  if (!firm) throw new Error(ERR.FIRM_NOT_FOUND);

  return {
    frontSide: {
      designName: row.designName,
      purityDisplay: getDisplayPurity(row.purityPercent, row.purityKarat, row.metal),
      grossWeightDisplay: formatWeightMg(row.grossWeightMg),
      netWeightDisplay: formatWeightMg(row.netWeightMg),
    },
    backSide: {
      firmCode: firm.firmCode,
      barcodeValue: row.barcode,
      skuDisplay: formatSKUDisplay(row.sku), // GAP-I6/FEAT-BARCODE-LABEL-1 (v1.66)
    },
  };
}

// --- logBarcodeReprint (Step 5.1 / FEAT-BARCODE-LABEL-1 v1.66) ---
export async function logBarcodeReprint(itemId: string, firmId: string): Promise<void> {
  await leaseService.assertNoActiveLease(); // GUARD 1
  safeModeService.assertNotInSafeMode();    // GUARD 2

  const deviceId = await getDeviceId();

  return db.transaction((tx) => {
    const item = itemRepository.getById(tx, firmId, itemId);
    if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);

    itemRepository.updateBarcodeReprintFlag(tx, firmId, itemId, false);

    itemEventRepository.insert(tx, {
      id: Crypto.randomUUID(),
      itemId,
      firmId,
      karigarId: null,
      eventType: 'BARCODE_REPRINTED',
      severity: 'INFO',
      performedBy: deviceId,
      reason: null,
      oldValue: null,
      newValue: null,
      timestamp: now(),
    });

    auditRepository.log(tx, {
      eventType: 'BARCODE_REPRINTED',
      firmId,
      entityId: itemId,
      deviceId,
      payload: { itemId, sku: item.sku },
    });
  });
}

export const barcodeLabelService = {
  generateBarcodeLabel,
  logBarcodeReprint,
};