// services/dashboardService.ts — Live Executive Dashboard Aggregation Service
import { expoDb } from '@/db/client';
import { rateEngineService } from '@/services/phase3/rateEngineService';
import { rateEngineRepository } from '@/repositories/phase3/rateEngineRepository';

export interface DashboardLiveData {
  rates: {
    gold24kPer10gPaise: number | null;
    gold22kPer10gPaise: number | null;
    silverPerKgPaise: number | null;
    lastUpdatedAt: string | null;
  } | null;
  vaultStock: {
    totalItemsCount: number;
    goldNetWeightMg: number;
    silverNetWeightMg: number;
  };
  todaySales: {
    invoicesCount: number;
    totalSalesPaise: number;
  };
  allTimeInvoicesCount: number;
  todayUrd: {
    count: number;
    totalWeightMg: number;
    totalValuePaise: number;
  };
  mastersCount: {
    categories: number;
    designs: number;
  };
}

export async function getDashboardData(firmId: string): Promise<DashboardLiveData> {
  const todayIsoDate = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

  // 1. Live Metal Rates (Rate Engine)
  let rates: DashboardLiveData['rates'] = null;
  try {
    const rawRates = await rateEngineService.getCurrentRates(firmId);
    if (rawRates) {
      const configRow = rateEngineRepository.getByFirmId(firmId);
      rates = {
        gold24kPer10gPaise: rawRates.gold24BasePerGramPaise * 10,
        gold22kPer10gPaise: rawRates.gold22BasePerGramPaise * 10,
        silverPerKgPaise: rawRates.silverCashPerGramPaise * 1000,
        lastUpdatedAt: configRow?.lastUpdatedAt || null,
      };
    }
  } catch (e) {
    console.warn('[DashboardService] Rates fetch error:', e);
  }

  // 2. Vault Stock Weights & Active Items Count
  let vaultStock = {
    totalItemsCount: 0,
    goldNetWeightMg: 0,
    silverNetWeightMg: 0,
  };
  try {
    const stockRow = expoDb.getFirstSync<{
      itemCount: number;
      goldNetMg: number;
      silverNetMg: number;
    }>(
      `SELECT 
         COUNT(*) as itemCount,
         COALESCE(SUM(CASE WHEN metal = 'GOLD' THEN net_weight_mg ELSE 0 END), 0) as goldNetMg,
         COALESCE(SUM(CASE WHEN metal = 'SILVER' THEN net_weight_mg ELSE 0 END), 0) as silverNetMg
       FROM items 
       WHERE firm_id = ? AND status = 'AVAILABLE'`,
      [firmId]
    );
    if (stockRow) {
      vaultStock = {
        totalItemsCount: stockRow.itemCount || 0,
        goldNetWeightMg: stockRow.goldNetMg || 0,
        silverNetWeightMg: stockRow.silverNetMg || 0,
      };
    }
  } catch (e) {
    console.warn('[DashboardService] Stock fetch error:', e);
  }

  // 3. Today's Sales Invoices
  let todaySales = {
    invoicesCount: 0,
    totalSalesPaise: 0,
  };
  let allTimeInvoicesCount = 0;
  try {
    const todayRow = expoDb.getFirstSync<{
      invoicesCount: number;
      totalSalesPaise: number;
    }>(
      `SELECT 
         COUNT(*) as invoicesCount,
         COALESCE(SUM(net_payable_paise), 0) as totalSalesPaise
       FROM sale_invoices 
       WHERE firm_id = ? AND status = 'POSTED' AND invoice_date LIKE ?`,
      [firmId, `${todayIsoDate}%`]
    );
    if (todayRow) {
      todaySales = {
        invoicesCount: todayRow.invoicesCount || 0,
        totalSalesPaise: todayRow.totalSalesPaise || 0,
      };
    }

    const totalRow = expoDb.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM sale_invoices WHERE firm_id = ? AND status = 'POSTED'`,
      [firmId]
    );
    allTimeInvoicesCount = totalRow?.count || 0;
  } catch (e) {
    console.warn('[DashboardService] Sales fetch error:', e);
  }

  // 4. Today's URD Purchases (Old Gold Inflow)
  let todayUrd = {
    count: 0,
    totalWeightMg: 0,
    totalValuePaise: 0,
  };
  try {
    const urdRow = expoDb.getFirstSync<{
      count: number;
      totalWeightMg: number;
      totalValuePaise: number;
    }>(
      `SELECT 
         COUNT(*) as count,
         COALESCE(SUM(gross_weight_mg), 0) as totalWeightMg,
         COALESCE(SUM(total_value_paise), 0) as totalValuePaise
       FROM urd_purchases 
       WHERE firm_id = ? AND status = 'CONFIRMED' AND purchase_date = ?`,
      [firmId, todayIsoDate]
    );
    if (urdRow) {
      todayUrd = {
        count: urdRow.count || 0,
        totalWeightMg: urdRow.totalWeightMg || 0,
        totalValuePaise: urdRow.totalValuePaise || 0,
      };
    }
  } catch (e) {
    console.warn('[DashboardService] URD fetch error:', e);
  }

  // 5. Active Categories & Designs Count
  let mastersCount = {
    categories: 0,
    designs: 0,
  };
  try {
    const catRow = expoDb.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM categories WHERE firm_id = ? AND is_active = 1`,
      [firmId]
    );
    const desRow = expoDb.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM designs WHERE firm_id = ? AND is_active = 1`,
      [firmId]
    );
    mastersCount = {
      categories: catRow?.count || 0,
      designs: desRow?.count || 0,
    };
  } catch (e) {
    console.warn('[DashboardService] Masters fetch error:', e);
  }

  return {
    rates,
    vaultStock,
    todaySales,
    allTimeInvoicesCount,
    todayUrd,
    mastersCount,
  };
}

export const dashboardService = {
  getDashboardData,
};

export default dashboardService;
