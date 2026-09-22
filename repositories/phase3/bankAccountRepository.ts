// repositories/phase3/bankAccountRepository.ts — Phase 3 Bank Account Master Repository
// Firm bank accounts data access layer. Exactly one default per firm governance.

import * as Crypto from 'expo-crypto';
import { eq, and } from 'drizzle-orm';
import db, { db as dbNamed } from '@/db/client';
import { bankAccounts } from '@/db/schema';
import { BankAccount, NewBankAccount } from '@/types/phase3/phase3.types';
import { now } from '@/utils/now';

type DbOrTx = any;

function getDb(customTx?: any): DbOrTx {
  if (customTx && typeof customTx === 'object' && typeof customTx.select === 'function') {
    return customTx;
  }
  const fallback = dbNamed || db;
  return (fallback as any)?.db ? (fallback as any).db : fallback;
}

export const bankAccountRepository = {
  /**
   * Inserts a new bank account record.
   * Supports both (tx, account) and (account, tx?) signatures.
   */
  insert(arg1: any, arg2?: any): BankAccount {
    let data: NewBankAccount;
    let customTx: any = undefined;

    if (arg1 && typeof arg1 === 'object' && 'bankName' in arg1 && 'firmId' in arg1) {
      data = arg1;
      customTx = arg2;
    } else {
      customTx = arg1;
      data = arg2;
    }

    const conn = getDb(customTx);
    const timestamp = now();

    const toInsert = {
      id: data.id || Crypto.randomUUID(),
      firmId: data.firmId,
      bankName: data.bankName,
      accountHolder: data.accountHolder,
      accountNumber: data.accountNumber,
      ifsc: data.ifsc,
      branch: data.branch ?? null,
      upiIds: data.upiIds ?? null,
      isDefault: data.isDefault !== undefined ? (Number(data.isDefault) ? 1 : 0) : 0,
      isArchived: data.isArchived !== undefined ? (Number(data.isArchived) ? 1 : 0) : 0,
      createdAt: data.createdAt || timestamp,
    };

    conn.insert(bankAccounts).values(toInsert).run();
    return toInsert as BankAccount;
  },

  /**
   * Updates an existing bank account.
   * Supports (tx, firmId, id, updates) and (firmId, id, updates, tx?).
   */
  update(arg1: any, arg2: any, arg3: any, arg4?: any): BankAccount | null {
    let firmId: string;
    let id: string;
    let updates: Partial<BankAccount>;
    let customTx: any = undefined;

    if (typeof arg1 === 'string' && typeof arg2 === 'string') {
      firmId = arg1;
      id = arg2;
      updates = arg3;
      customTx = arg4;
    } else {
      customTx = arg1;
      firmId = arg2;
      id = arg3;
      updates = arg4;
    }

    const conn = getDb(customTx);

    const valuesToUpdate: Record<string, any> = {};
    if (updates.bankName !== undefined) valuesToUpdate.bankName = updates.bankName;
    if (updates.accountHolder !== undefined) valuesToUpdate.accountHolder = updates.accountHolder;
    if (updates.accountNumber !== undefined) valuesToUpdate.accountNumber = updates.accountNumber;
    if (updates.ifsc !== undefined) valuesToUpdate.ifsc = updates.ifsc;
    if (updates.branch !== undefined) valuesToUpdate.branch = updates.branch;
    if (updates.upiIds !== undefined) valuesToUpdate.upiIds = updates.upiIds;
    if (updates.isDefault !== undefined) valuesToUpdate.isDefault = Number(updates.isDefault) ? 1 : 0;
    if (updates.isArchived !== undefined) valuesToUpdate.isArchived = Number(updates.isArchived) ? 1 : 0;

    conn
      .update(bankAccounts)
      .set(valuesToUpdate)
      .where(and(eq(bankAccounts.firmId, firmId), eq(bankAccounts.id, id)))
      .run();

    return this.getById(firmId, id, customTx);
  },

  /**
   * Clears the isDefault flag for all accounts belonging to a firm.
   * Supports (tx, firmId) and (firmId, tx?).
   */
  clearDefaultForFirm(arg1: any, arg2?: any): void {
    let firmId: string;
    let customTx: any = undefined;

    if (typeof arg1 === 'string') {
      firmId = arg1;
      customTx = arg2;
    } else {
      customTx = arg1;
      firmId = arg2;
    }

    const conn = getDb(customTx);
    conn
      .update(bankAccounts)
      .set({ isDefault: 0 })
      .where(eq(bankAccounts.firmId, firmId))
      .run();
  },

  /**
   * Sets a specific bank account as the default for a firm.
   * Atomically clears other defaults for that firm.
   */
  setDefault(firmId: string, id: string, customTx?: any): BankAccount | null {
    const conn = getDb(customTx);

    // 1. Clear all defaults for firm
    conn
      .update(bankAccounts)
      .set({ isDefault: 0 })
      .where(eq(bankAccounts.firmId, firmId))
      .run();

    // 2. Set this account as default
    conn
      .update(bankAccounts)
      .set({ isDefault: 1 })
      .where(and(eq(bankAccounts.firmId, firmId), eq(bankAccounts.id, id)))
      .run();

    return this.getById(firmId, id, customTx);
  },

  /**
   * Gets a bank account by ID within a firm.
   * Supports (firmId, id, tx?) and (tx, firmId, id).
   */
  getById(arg1: any, arg2: any, arg3?: any): BankAccount | null {
    let firmId: string;
    let id: string;
    let customTx: any = undefined;

    if (typeof arg1 === 'string' && typeof arg2 === 'string') {
      firmId = arg1;
      id = arg2;
      customTx = arg3;
    } else {
      customTx = arg1;
      firmId = arg2;
      id = arg3;
    }

    const conn = getDb(customTx);
    const rows = conn
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.firmId, firmId), eq(bankAccounts.id, id)))
      .all();

    return (rows[0] as BankAccount) || null;
  },

  /**
   * Alias for getById for consistency with other masters.
   */
  findById(arg1: any, arg2: any, arg3?: any): BankAccount | null {
    return this.getById(arg1, arg2, arg3);
  },

  /**
   * Gets the current active default bank account for a firm.
   * Supports (firmId, tx?) and (tx, firmId).
   */
  getDefault(arg1: any, arg2?: any): BankAccount | null {
    let firmId: string;
    let customTx: any = undefined;

    if (typeof arg1 === 'string') {
      firmId = arg1;
      customTx = arg2;
    } else {
      customTx = arg1;
      firmId = arg2;
    }

    const conn = getDb(customTx);
    const rows = conn
      .select()
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.firmId, firmId),
          eq(bankAccounts.isDefault, 1),
          eq(bankAccounts.isArchived, 0)
        )
      )
      .all();

    return (rows[0] as BankAccount) || null;
  },

  /**
   * Lists bank accounts for a firm.
   * By default filters out archived accounts.
   */
  listByFirm(firmId: string, includeArchived: boolean = false, customTx?: any): BankAccount[] {
    const conn = getDb(customTx);
    if (includeArchived) {
      return conn
        .select()
        .from(bankAccounts)
        .where(eq(bankAccounts.firmId, firmId))
        .all() as BankAccount[];
    }
    return conn
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.firmId, firmId), eq(bankAccounts.isArchived, 0)))
      .all() as BankAccount[];
  },

  /**
   * Counts active (non-archived) bank accounts for a firm.
   */
  countActiveByFirm(firmId: string, customTx?: any): number {
    const conn = getDb(customTx);
    const rows = conn
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.firmId, firmId), eq(bankAccounts.isArchived, 0)))
      .all();
    return rows.length;
  },

  /**
   * Finds account by account number for duplicate check.
   */
  findByAccountNumber(firmId: string, accountNumber: string, customTx?: any): BankAccount | null {
    const conn = getDb(customTx);
    const rows = conn
      .select()
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.firmId, firmId),
          eq(bankAccounts.accountNumber, accountNumber),
          eq(bankAccounts.isArchived, 0)
        )
      )
      .all();

    return (rows[0] as BankAccount) || null;
  },
};
