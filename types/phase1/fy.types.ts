// types/phase1/fy.types.ts — Phase 1 Financial Year & Transaction Types
// Pure Phase 1 Core definitions with zero Phase 2 dependencies

import type { financialYears } from '@/db/schema/phase1_core';
import type { db } from '@/db/client';

export type FinancialYear = typeof financialYears.$inferSelect;
export type NewFinancialYear = typeof financialYears.$inferInsert;
export type FYStatus = 'ACTIVE' | 'CLOSED';

export type DrizzleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
