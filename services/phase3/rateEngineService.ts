// services/phase3/rateEngineService.ts — Phase 3 Rate Engine Service
// Strictly adheres to STEP RE specification & 3 Blockers (v5.6 / v5.41)

import db from '@/db/client';
import { ERR } from '@/constants/errorCodes';
import { rateEngineRepository } from '@/repositories/phase3/rateEngineRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { getDeviceId } from '@/utils/deviceId';
import { RateEngineInput, RateEngineOutput, RateEngineConfig } from '@/types/phase3/phase3.types';

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}

export const rateEngineService = {
  /**
   * Saves daily metal rates for a firm.
   * Dual Guard Pattern: assertNoActiveLease() + assertNotInSafeMode().
   * Inputs must be positive integers in rupees (Rule 2).
   * Stored in integer paise (Rule 2 & GAP 2).
   * Logs RATE_UPDATED audit event.
   * Supports both (firmId, input, tx?) and (tx, firmId, input) call signatures.
   */
  async saveRates(arg1: any, arg2: any, arg3?: any): Promise<void> {
    let firmId: string;
    let input: RateEngineInput;
    let customTx: any = undefined;

    if (typeof arg1 === 'string') {
      firmId = arg1;
      input = arg2;
      customTx = arg3;
    } else {
      customTx = arg1;
      firmId = arg2;
      input = arg3;
    }

    if (!firmId) throw new Error('FIRM_ID_REQUIRED');

    // Dual Guard Pattern for write operations
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    // Validation: All 4 inputs must be positive integers in rupees (GAP 2)
    const {
      gold24BasePer10g_rupees,
      gold22BasePer10g_rupees,
      goldCashPer10g_rupees,
      silverCashPerKg_rupees,
    } = input;

    if (
      typeof gold24BasePer10g_rupees !== 'number' ||
      typeof gold22BasePer10g_rupees !== 'number' ||
      typeof goldCashPer10g_rupees !== 'number' ||
      typeof silverCashPerKg_rupees !== 'number' ||
      !Number.isInteger(gold24BasePer10g_rupees) ||
      !Number.isInteger(gold22BasePer10g_rupees) ||
      !Number.isInteger(goldCashPer10g_rupees) ||
      !Number.isInteger(silverCashPerKg_rupees) ||
      gold24BasePer10g_rupees <= 0 ||
      gold22BasePer10g_rupees <= 0 ||
      goldCashPer10g_rupees <= 0 ||
      silverCashPerKg_rupees <= 0
    ) {
      throw new Error(ERR.RATE_ENGINE_INVALID_INPUT);
    }

    // Convert Rupees -> Paise (× 100) — integer paise only
    const gold24BasePer10gPaise = gold24BasePer10g_rupees * 100;
    const gold22BasePer10gPaise = gold22BasePer10g_rupees * 100;
    const goldCashPer10gPaise = goldCashPer10g_rupees * 100;
    const silverCashPerKgPaise = silverCashPerKg_rupees * 100;
    const lastUpdatedAt = new Date().toISOString();

    const configRow: RateEngineConfig = {
      id: `${firmId}_rate_config`,
      firmId,
      gold24BasePer10gPaise,
      gold22BasePer10gPaise,
      goldCashPer10gPaise,
      silverCashPerKgPaise,
      lastUpdatedAt,
    };

    const deviceId = getSafeDeviceId();

    const executeSave = (tx: any) => {
      rateEngineRepository.upsert(configRow, tx);
      auditRepository.log(tx, {
        firmId,
        eventType: 'RATE_UPDATED',
        entityId: firmId,
        deviceId,
        payload: {
          gold24BasePer10gPaise,
          gold22BasePer10gPaise,
          goldCashPer10gPaise,
          silverCashPerKgPaise,
          updatedAt: lastUpdatedAt,
        },
      });
    };

    if (customTx) {
      executeSave(customTx);
    } else {
      const target: any = db;
      if (typeof target.transaction === 'function') {
        await target.transaction((tx: any) => executeSave(tx));
      } else {
        executeSave(target);
      }
    }
  },

  /**
   * Retrieves current rates and derives per-gram and GST preview values.
   * READ-ONLY: no transaction, no dual guards, no audit write.
   * Returns null if no rates configured for this firm (FIX-V522-9).
   * All arithmetic in integer paise (GAP 3).
   * RateEngineOutput is strictly in-memory and NEVER persisted (FIX-V520-14).
   */
  async getCurrentRates(firmId: string): Promise<RateEngineOutput | null> {
    if (!firmId) return null;

    const row = rateEngineRepository.getByFirmId(firmId);
    if (!row) {
      return null;
    }

    // DENOMINATOR TABLE (GAP 1)
    // Gold fields use ÷10 denominator (input was per 10g)
    const gold24BasePerGramPaise = Math.round(row.gold24BasePer10gPaise / 10);
    const gold24GstPerGramPaise = Math.round((gold24BasePerGramPaise * 3) / 100);
    const gold24WithGstPerGramPaise = gold24BasePerGramPaise + gold24GstPerGramPaise;

    const gold22BasePerGramPaise = Math.round(row.gold22BasePer10gPaise / 10);
    const gold22GstPerGramPaise = Math.round((gold22BasePerGramPaise * 3) / 100);
    const gold22WithGstPerGramPaise = gold22BasePerGramPaise + gold22GstPerGramPaise;

    const goldCashPerGramPaise = Math.round(row.goldCashPer10gPaise / 10);

    // Silver uses ÷1000 denominator for per-gram (input was per KG)
    const silverCashPerGramPaise = Math.round(row.silverCashPerKgPaise / 1000);
    // Silver per-10g display shortcut: ÷100 (v5.6 NEW — display only)
    const silverCashPer10gPaise = Math.round(row.silverCashPerKgPaise / 100);

    return {
      gold24BasePerGramPaise,
      gold24GstPerGramPaise,
      gold24WithGstPerGramPaise,
      gold22BasePerGramPaise,
      gold22GstPerGramPaise,
      gold22WithGstPerGramPaise,
      goldCashPerGramPaise,
      silverCashPerGramPaise,
      silverCashPer10gPaise,
    };
  },

  /**
   * Retrieves current rates or throws RATE_NOT_CONFIGURED.
   * Used by billing and invoicing services.
   */
  async getOrThrowCurrentRates(firmId: string): Promise<RateEngineOutput> {
    const rates = await this.getCurrentRates(firmId);
    if (!rates) {
      throw new Error(ERR.RATE_NOT_CONFIGURED);
    }
    return rates;
  },
};
