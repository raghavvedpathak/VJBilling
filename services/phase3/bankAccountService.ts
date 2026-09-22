// services/phase3/bankAccountService.ts — Phase 3 Bank Account Master Service
// Strictly enforces STEP 16 Specification & "One default per firm" Governance.

import * as Crypto from 'expo-crypto';
import db, { db as dbNamed } from '@/db/client';
import { ERR } from '@/constants/errorCodes';
import { bankAccountRepository } from '@/repositories/phase3/bankAccountRepository';
import { auditRepository } from '@/repositories/phase1/auditRepository';
import { leaseService } from '@/services/phase1/leaseService';
import { safeModeService } from '@/services/phase1/safeModeService';
import { validateIFSC } from '@/utils/validateIFSC';
import { sanitizeText } from '@/utils/sanitize';
import { getDeviceId } from '@/utils/deviceId';
import {
  BankAccount,
  CreateBankAccountInput,
  UpdateBankAccountInput,
} from '@/types/phase3/phase3.types';

function getSafeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return 'DEV-DEVICE-ID';
  }
}

async function executeTransaction<T>(
  callback: (tx: any) => Promise<T> | T,
  customTx?: any
): Promise<T> {
  if (customTx) {
    return callback(customTx);
  }
  const targetDb = dbNamed || db;
  if (typeof (targetDb as any).transaction === 'function') {
    return (targetDb as any).transaction(callback);
  }
  return callback(targetDb);
}

function parseUpiIds(upiIdsInput?: string[] | string | null): string | null {
  if (!upiIdsInput) return null;

  if (Array.isArray(upiIdsInput)) {
    const cleaned = upiIdsInput
      .map((u) => (typeof u === 'string' ? u.trim() : ''))
      .filter(Boolean);
    return cleaned.length > 0 ? JSON.stringify(cleaned) : null;
  }

  if (typeof upiIdsInput === 'string') {
    const trimmed = upiIdsInput.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const cleaned = parsed
          .map((u) => (typeof u === 'string' ? u.trim() : ''))
          .filter(Boolean);
        return cleaned.length > 0 ? JSON.stringify(cleaned) : null;
      }
    } catch {
      // If plain single UPI string
      return JSON.stringify([trimmed]);
    }
  }

  return null;
}

function maskAccountNumber(acc: string): string {
  if (!acc) return '';
  if (acc.length <= 4) return acc;
  return 'X'.repeat(acc.length - 4) + acc.slice(-4);
}

export const bankAccountService = {
  /**
   * Creates a new firm bank account.
   * Dual Guard: assertNoActiveLease() + assertNotInSafeMode()
   * "One default per firm" Governance:
   * - If first active account for firm, automatically becomes default (isDefault = 1).
   * - If created with isDefault = 1, clears default on all other accounts for that firm.
   */
  async createBankAccount(
    input: CreateBankAccountInput,
    customTx?: any
  ): Promise<BankAccount> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!input.firmId || !input.firmId.trim()) {
      throw new Error('FIRM_ID_REQUIRED');
    }
    if (!input.bankName || !input.bankName.trim()) {
      throw new Error(ERR.BANK_NAME_REQUIRED);
    }
    if (!input.accountHolder || !input.accountHolder.trim()) {
      throw new Error(ERR.ACCOUNT_HOLDER_REQUIRED);
    }
    if (!input.accountNumber || !input.accountNumber.trim()) {
      throw new Error(ERR.ACCOUNT_NUMBER_REQUIRED);
    }

    const validIfsc = validateIFSC(input.ifsc);
    const sanitizedBankName = sanitizeText(input.bankName.trim());
    const sanitizedHolder = sanitizeText(input.accountHolder.trim());
    const sanitizedAccNum = sanitizeText(input.accountNumber.trim());
    const sanitizedBranch = input.branch ? sanitizeText(input.branch.trim()) : null;
    const serializedUpiIds = parseUpiIds(input.upiIds);

    const deviceId = input.deviceId || getSafeDeviceId();

    return executeTransaction(async (tx) => {
      const activeCount = bankAccountRepository.countActiveByFirm(input.firmId, tx);
      const isExplicitDefault = Boolean(input.isDefault);
      // Auto-default if first active account, or if explicitly requested
      const shouldBeDefault = activeCount === 0 || isExplicitDefault;

      if (shouldBeDefault && activeCount > 0) {
        bankAccountRepository.clearDefaultForFirm(tx, input.firmId);
      }

      const account = bankAccountRepository.insert(tx, {
        id: Crypto.randomUUID(),
        firmId: input.firmId,
        bankName: sanitizedBankName,
        accountHolder: sanitizedHolder,
        accountNumber: sanitizedAccNum,
        ifsc: validIfsc,
        branch: sanitizedBranch,
        upiIds: serializedUpiIds,
        isDefault: shouldBeDefault ? 1 : 0,
        isArchived: 0,
      });

      auditRepository.create(
        {
          firmId: input.firmId,
          eventType: 'BANK_ACCOUNT_CREATED',
          entityId: account.id,
          deviceId,
          payload: JSON.stringify({
            bankName: account.bankName,
            accountHolder: account.accountHolder,
            accountNumberMasked: maskAccountNumber(account.accountNumber),
            ifsc: account.ifsc,
            isDefault: account.isDefault,
          }),
        },
        tx
      );

      return account;
    }, customTx);
  },

  /**
   * Updates an existing bank account.
   * Dual Guard: assertNoActiveLease() + assertNotInSafeMode()
   */
  async updateBankAccount(
    firmId: string,
    id: string,
    updates: UpdateBankAccountInput,
    customTx?: any
  ): Promise<BankAccount> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!firmId || !id) {
      throw new Error(ERR.BANK_ACCOUNT_NOT_FOUND);
    }

    const deviceId = updates.deviceId || getSafeDeviceId();

    return executeTransaction(async (tx) => {
      const existing = bankAccountRepository.getById(tx, firmId, id);
      if (!existing) {
        throw new Error(ERR.BANK_ACCOUNT_NOT_FOUND);
      }
      if (existing.isArchived === 1) {
        throw new Error(ERR.BANK_ACCOUNT_ALREADY_ARCHIVED);
      }

      const toUpdate: Partial<BankAccount> = {};

      if (updates.bankName !== undefined) {
        if (!updates.bankName || !updates.bankName.trim()) {
          throw new Error(ERR.BANK_NAME_REQUIRED);
        }
        toUpdate.bankName = sanitizeText(updates.bankName.trim());
      }

      if (updates.accountHolder !== undefined) {
        if (!updates.accountHolder || !updates.accountHolder.trim()) {
          throw new Error(ERR.ACCOUNT_HOLDER_REQUIRED);
        }
        toUpdate.accountHolder = sanitizeText(updates.accountHolder.trim());
      }

      if (updates.accountNumber !== undefined) {
        if (!updates.accountNumber || !updates.accountNumber.trim()) {
          throw new Error(ERR.ACCOUNT_NUMBER_REQUIRED);
        }
        toUpdate.accountNumber = sanitizeText(updates.accountNumber.trim());
      }

      if (updates.ifsc !== undefined) {
        toUpdate.ifsc = validateIFSC(updates.ifsc);
      }

      if (updates.branch !== undefined) {
        toUpdate.branch = updates.branch ? sanitizeText(updates.branch.trim()) : null;
      }

      if (updates.upiIds !== undefined) {
        toUpdate.upiIds = parseUpiIds(updates.upiIds);
      }

      if (updates.isDefault !== undefined) {
        const wantsDefault = Boolean(updates.isDefault);
        if (wantsDefault) {
          bankAccountRepository.clearDefaultForFirm(tx, firmId);
          toUpdate.isDefault = 1;
        } else if (existing.isDefault === 1) {
          // Unsetting default directly is discouraged if active accounts exist;
          // keeping as 0 if requested
          toUpdate.isDefault = 0;
        }
      }

      const updated = bankAccountRepository.update(tx, firmId, id, toUpdate);
      if (!updated) {
        throw new Error(ERR.BANK_ACCOUNT_NOT_FOUND);
      }

      auditRepository.create(
        {
          firmId,
          eventType: 'BANK_ACCOUNT_UPDATED',
          entityId: id,
          deviceId,
          payload: JSON.stringify({
            bankName: updated.bankName,
            accountHolder: updated.accountHolder,
            accountNumberMasked: maskAccountNumber(updated.accountNumber),
            ifsc: updated.ifsc,
            isDefault: updated.isDefault,
          }),
        },
        tx
      );

      return updated;
    }, customTx);
  },

  /**
   * Sets a specific bank account as the active default for a firm.
   * Atomically resets any prior default for that firm.
   */
  async setDefaultBankAccount(
    firmId: string,
    id: string,
    customTx?: any
  ): Promise<BankAccount> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!firmId || !id) {
      throw new Error(ERR.BANK_ACCOUNT_NOT_FOUND);
    }

    const deviceId = getSafeDeviceId();

    return executeTransaction(async (tx) => {
      const existing = bankAccountRepository.getById(tx, firmId, id);
      if (!existing) {
        throw new Error(ERR.BANK_ACCOUNT_NOT_FOUND);
      }
      if (existing.isArchived === 1) {
        throw new Error(ERR.BANK_ACCOUNT_ALREADY_ARCHIVED);
      }

      const updated = bankAccountRepository.setDefault(firmId, id, tx);
      if (!updated) {
        throw new Error(ERR.BANK_ACCOUNT_NOT_FOUND);
      }

      auditRepository.create(
        {
          firmId,
          eventType: 'BANK_ACCOUNT_SET_DEFAULT',
          entityId: id,
          deviceId,
          payload: JSON.stringify({
            bankAccountId: id,
            bankName: updated.bankName,
            accountNumberMasked: maskAccountNumber(updated.accountNumber),
          }),
        },
        tx
      );

      return updated;
    }, customTx);
  },

  /**
   * Archives a bank account (soft delete).
   * Dual Guard: assertNoActiveLease() + assertNotInSafeMode()
   * If archiving the default account:
   * - If other active accounts exist: sets newDefaultId or auto-promotes the oldest active account.
   * - If no other accounts exist: clears default.
   */
  async archiveBankAccount(
    firmId: string,
    id: string,
    newDefaultId?: string,
    customTx?: any
  ): Promise<BankAccount> {
    await leaseService.assertNoActiveLease();
    safeModeService.assertNotInSafeMode();

    if (!firmId || !id) {
      throw new Error(ERR.BANK_ACCOUNT_NOT_FOUND);
    }

    const deviceId = getSafeDeviceId();

    return executeTransaction(async (tx) => {
      const existing = bankAccountRepository.getById(tx, firmId, id);
      if (!existing) {
        throw new Error(ERR.BANK_ACCOUNT_NOT_FOUND);
      }
      if (existing.isArchived === 1) {
        throw new Error(ERR.BANK_ACCOUNT_ALREADY_ARCHIVED);
      }

      const otherActive = bankAccountRepository
        .listByFirm(firmId, false, tx)
        .filter((a) => a.id !== id);

      // Handle default transition if target is currently the default
      if (existing.isDefault === 1) {
        if (otherActive.length > 0) {
          const replacementId =
            newDefaultId && otherActive.some((a) => a.id === newDefaultId)
              ? newDefaultId
              : otherActive[0].id;

          bankAccountRepository.setDefault(firmId, replacementId, tx);
        }
      }

      const archived = bankAccountRepository.update(tx, firmId, id, {
        isArchived: 1,
        isDefault: 0,
      });

      if (!archived) {
        throw new Error(ERR.BANK_ACCOUNT_NOT_FOUND);
      }

      auditRepository.create(
        {
          firmId,
          eventType: 'BANK_ACCOUNT_ARCHIVED',
          entityId: id,
          deviceId,
          payload: JSON.stringify({
            bankAccountId: id,
            bankName: archived.bankName,
            accountNumberMasked: maskAccountNumber(archived.accountNumber),
          }),
        },
        tx
      );

      return archived;
    }, customTx);
  },

  /**
   * Gets a bank account by ID within a firm.
   * READ-ONLY lookup.
   */
  async getBankAccountById(firmId: string, id: string): Promise<BankAccount | null> {
    if (!firmId || !id) return null;
    return bankAccountRepository.getById(firmId, id);
  },

  /**
   * Lists bank accounts for a firm.
   * READ-ONLY lookup. By default excludes archived accounts.
   */
  async listBankAccounts(
    firmId: string,
    includeArchived: boolean = false
  ): Promise<BankAccount[]> {
    if (!firmId) return [];
    return bankAccountRepository.listByFirm(firmId, includeArchived);
  },

  /**
   * Gets the active default bank account for a firm.
   * READ-ONLY lookup.
   */
  async getDefaultBankAccount(firmId: string): Promise<BankAccount | null> {
    if (!firmId) return null;
    return bankAccountRepository.getDefault(firmId);
  },
};
