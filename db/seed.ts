// db/seed.ts — Phase 2 v2.11 Canonical HSN Seed Script

import { db } from './client';
import { hsnCodes } from './schema';
import * as Crypto from 'expo-crypto';
import { now } from '../utils/now';

// FIX-HSN-MASTER-1 (v1.46): Seed script for Phase 2 HSN Master table.
// Minimum Seed Data — Chapter 71 codes for Bhartiya jewellery.
export async function seedHsnCodes(): Promise<void> {
  const codes = [
    { code: '7113', description: 'Jewellery and parts of precious metal' },
    { code: '711311', description: 'Silver jewellery (incl. plated)' },
    { code: '711319', description: 'Gold / platinum jewellery' },
    { code: '7114', description: 'Goldsmiths and silversmiths wares' },
    { code: '7117', description: 'Imitation jewellery' },
    { code: '7118', description: 'Coin (gold/silver used in jewellery context)' }
  ];

  for (const c of codes) {
    await db.insert(hsnCodes).values({
      id: Crypto.randomUUID(),
      code: c.code,
      description: c.description,
      chapter: '71',
      isActive: 1,
      createdAt: now(),
    }).onConflictDoNothing(); // Prevent duplicate-key errors on re-install or app launch
  }

  console.log('[Seed] HSN Master Codes seeded successfully.');
}