// db/seed.ts — Phase 2 v2.24 Canonical HSN Seed Script
// FIX-HSN-MASTER-1 (v1.46): Seed script for Phase 2 HSN Master table.

import { db } from '@/db/client';
import { hsnCodes } from '@/db/schema';
import * as Crypto from 'expo-crypto';
import { now } from '@/utils/now';

export const CANONICAL_HSN_CODES = [
  { code: '7113', description: 'Jewellery and parts of precious metal' },
  { code: '711311', description: 'Silver jewellery (incl. plated)' },
  { code: '711319', description: 'Gold / platinum jewellery' },
  { code: '7114', description: 'Goldsmiths and silversmiths wares' },
  { code: '7117', description: 'Imitation jewellery' },
  { code: '7118', description: 'Coin (gold/silver used in jewellery context)' },
] as const;

export async function seedHsnCodes(): Promise<void> {
  const timestamp = now();

  const records = CANONICAL_HSN_CODES.map((item) => ({
    id: Crypto.randomUUID(),
    code: item.code,
    description: item.description,
    chapter: '71',
    isActive: 1,
    createdAt: timestamp,
  }));

  // Batch insert with explicit conflict target on code
  await db
    .insert(hsnCodes)
    .values(records)
    .onConflictDoNothing({ target: hsnCodes.code });

  console.log(`[Seed] HSN Master Codes seeded successfully (${records.length} codes processed).`);
}

export async function seedDatabase(): Promise<void> {
  await seedHsnCodes();
}