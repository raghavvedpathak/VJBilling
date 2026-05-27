import { firmService } from '../services/firmService';
import { leaseService } from '../services/leaseService';
import { safeModeService } from '../services/safeModeService';
import { db } from '../db/client';
import { firms, writerLeases, auditLogs } from '../db/schema';
import { eq } from 'drizzle-orm';

describe('Phase 1: Master Fortress Integration', () => {
  
  beforeEach(async () => {
    // Reset DB state before each test
    await db.delete(firms);
    await db.delete(writerLeases);
    await db.delete(auditLogs);
    await safeModeService.clear();
  });

  // ============================================================================
  // 1. LEASE GUARD TESTS
  // ============================================================================
  describe('Lease Guard Logic', () => {
    it('blocks firm creation when a system lease is active', async () => {
      // 1. Acquire a manual backup lease
      await leaseService.acquire('BACKUP');

      // 2. Attempt to create a firm
      const input = { name: 'Test Firm', firmCode: 'T1', proprietor: 'Owner' };
      
      await expect(firmService.createFirm(input as any))
        .rejects.toThrow(/LEASE_HELD/);
    });

    it('blocks firm archiving when a lease is active', async () => {
      // 1. Setup a firm
      const firm = await firmService.createFirm({ name: 'F1', firmCode: 'F1', proprietor: 'P' } as any);
      
      // 2. Hold a lock
      await leaseService.acquire('SETTINGS_CHANGE');

      // 3. Attempt archive
      await expect(firmService.archiveFirm(firm.id))
        .rejects.toThrow(/LEASE_HELD/);
    });
  });

  // ============================================================================
  // 2. CONCURRENCY & LIMITS
  // ============================================================================
  describe('Firm Limits & Concurrency', () => {
    it('strictly enforces the 3-firm limit under atomic transactions', async () => {
      // Create 3 firms
      await firmService.createFirm({ name: 'F1', firmCode: 'F1', proprietor: 'P' } as any);
      await firmService.createFirm({ name: 'F2', firmCode: 'F2', proprietor: 'P' } as any);
      await firmService.createFirm({ name: 'F3', firmCode: 'F3', proprietor: 'P' } as any);

      // Attempt 4th
      await expect(firmService.createFirm({ name: 'F4', firmCode: 'F4', proprietor: 'P' } as any))
        .rejects.toThrow('MAX_FIRMS_REACHED: You cannot create more than 3 firms.');
    });

    it('correctly ignores archived firms in the 3-firm count', async () => {
        const f1 = await firmService.createFirm({ name: 'F1', firmCode: 'F1', proprietor: 'P' } as any);
        await firmService.createFirm({ name: 'F2', firmCode: 'F2', proprietor: 'P' } as any);
        await firmService.createFirm({ name: 'F3', firmCode: 'F3', proprietor: 'P' } as any);

        // Archive one
        await firmService.archiveFirm(f1.id);

        // Should now allow creating a new 3rd (active) firm
        const f4 = await firmService.createFirm({ name: 'F4', firmCode: 'F4', proprietor: 'P' } as any);
        expect(f4.name).toBe('F4');
    });
  });

  // ============================================================================
  // 3. SAFE MODE & CORRUPTION PROTECTION
  // ============================================================================
  describe('Safe Mode Enforcement', () => {
    it('blocks firm updates when Safe Mode is activated', async () => {
      const firm = await firmService.createFirm({ name: 'Healthy', firmCode: 'H1', proprietor: 'P' } as any);
      
      // Activate Safe Mode
      await safeModeService.activate('VERIFY_CRITICAL_ISSUE');

      // Attempt update
      await expect(firmService.updateFirm(firm.id, { name: 'Changed' }))
        .rejects.toThrow(/SAFE_MODE_ACTIVE/);
    });
  });

  // ============================================================================
  // 4. IMMUTABILITY (REVIEW ITEM 11)
  // ============================================================================
  describe('firmCode Immutability', () => {
    it('throws when trying to update firmCode via the service layer', async () => {
      const firm = await firmService.createFirm({ name: 'F1', firmCode: 'ORIGINAL', proprietor: 'P' } as any);
      
      await expect(firmService.updateFirm(firm.id, { firmCode: 'CHANGED' } as any))
        .rejects.toThrow(/Firm Code is immutable/);
    });

    it('emits FIRM_CODE_SET audit log during creation', async () => {
        const firm = await firmService.createFirm({ name: 'AuditTest', firmCode: 'AT1', proprietor: 'P' } as any);
        
        const logs = await db.select().from(auditLogs).where(eq(auditLogs.eventType, 'FIRM_CODE_SET' as any));
        
        expect(logs.length).toBe(1);
        // FIX: Added '|| "{}"' so TS knows JSON.parse will always receive a valid string
        expect(JSON.parse(logs[0].payload || '{}').code).toBe('AT1');
    });
  });
});