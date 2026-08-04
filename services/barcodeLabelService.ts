import { db } from '../db/client';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { barcodeLabelRepository } from '../repositories/barcodeLabelRepository';
import { firmRepository } from '../repositories/firmRepository';
import { itemRepository } from '../repositories/itemRepository';
import { itemEventRepository } from '../repositories/itemEventRepository';
import { auditRepository } from '../repositories/auditRepository';
import { getDeviceId } from '../utils/deviceId';
import { getDisplayPurity, formatSKUDisplay, formatWeightMg } from '../utils/calculations';
import { now } from '../utils/now';
import * as Crypto from 'expo-crypto';
import type { BarcodeLabel } from '../types/phase2.types';
import { ERR } from '../constants';

export const barcodeLabelService = {
  // Read-only, safely async
  async generateBarcodeLabel(itemId: string, firmId: string): Promise<BarcodeLabel> {
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
  },

  async logBarcodeReprint(itemId: string, firmId: string): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    // Hoist async call
    const deviceId = await getDeviceId();

    // FIX-V718-1: Synchronous transaction block
    return db.transaction((tx) => {
      const item = itemRepository.getById(tx, firmId, itemId);
      if (!item || item.firmId !== firmId) throw new Error(ERR.ITEM_NOT_FOUND_OR_WRONG_FIRM);

      itemRepository.updateBarcodeReprintFlag(tx, firmId, itemId, false);

      itemEventRepository.insert(tx, {
        itemId,
        firmId,
        eventType: 'BARCODE_REPRINTED',
        severity: 'INFO',
        performedBy: deviceId,
        reason: null,
        oldValue: null,
        newValue: null,
        timestamp: now(),
      });

      auditRepository.log(tx, {
        firmId,
        entityId: itemId,
        eventType: 'BARCODE_REPRINTED',
        deviceId,
        payload: JSON.stringify({ itemId, sku: item.sku }),
      });
    });
  }
};