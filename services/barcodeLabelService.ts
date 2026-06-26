import { db } from '../db/client';
import { leaseService } from './leaseService';
import { safeModeService } from './safeModeService';
import { barcodeLabelRepository } from '../repositories/barcodeLabelRepository';
import { firmRepository } from '../repositories/firmRepository';
import { itemRepository } from '../repositories/itemRepository';
import { itemEventRepository } from '../repositories/itemEventRepository';
import { auditRepository } from '../repositories/auditRepository';
import { getDeviceId } from '../utils/deviceId';
import { getDisplayPurity } from '../db/schema';
import { formatSKUDisplay } from '../utils/skuDisplay';
import { now } from '../utils/now';
import type { BarcodeLabel } from '../types/phase2.types';

export const barcodeLabelService = {
  async generateBarcodeLabel(itemId: string, firmId: string): Promise<BarcodeLabel> {
    const row = await barcodeLabelRepository.getItemWithDesignName(itemId, firmId);
    if (!row) throw new Error('ITEM_NOT_FOUND_OR_WRONG_FIRM');

    const firm = await firmRepository.getById(firmId);
    if (!firm) throw new Error('FIRM_NOT_FOUND');

    return {
      frontSide: {
        designName: row.designName,
        purityDisplay: getDisplayPurity(row.metal, row.purityPercent, row.purityKarat),
        grossWeightDisplay: (row.grossWeightMg / 1000).toFixed(3) + ' g',
        netWeightDisplay: (row.netWeightMg / 1000).toFixed(3) + ' g',
      },
      backSide: {
        firmCode: firm.firmCode,
        barcodeValue: row.barcode,
        skuDisplay: formatSKUDisplay(row.sku),
      },
    };
  },

  async logBarcodeReprint(itemId: string, firmId: string): Promise<void> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    await db.transaction(async (tx) => {
      const item = await itemRepository.getById(tx, firmId, itemId);
      if (!item || item.firmId !== firmId) throw new Error('ITEM_NOT_FOUND_OR_WRONG_FIRM');

      await itemRepository.updateBarcodeReprintFlag(tx, firmId, itemId, false);

      await itemEventRepository.insert(tx, {
        itemId,
        firmId,
        eventType: 'BARCODE_REPRINTED',
        severity: 'INFO',
        performedBy: await getDeviceId(),
        reason: null,
        oldValue: null,
        newValue: null,
        timestamp: now(),
      });

      await auditRepository.log(tx, {
        firmId,
        entityId: itemId,
        eventType: 'BARCODE_REPRINTED',
        deviceId: await getDeviceId(),
        payload: JSON.stringify({ itemId, sku: item.sku }),
      });
    });
  }
};
