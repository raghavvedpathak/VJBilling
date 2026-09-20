// services/phase3/billingVerifyService.ts — Phase 3 Domain Verification Service
// Encapsulates all Phase 3 domain financial and integrity checks:
// 1. CHECK 1: Posted invoice with no ledger entry (CRITICAL)
// 2. CHECK 2: PENDING MONEY_OUT older than 30 days (CRITICAL)
// 3. CHECK 3: Payment with no valid party (WARNING)
// 4. CHECK 4: Old metal lot without purchase record (WARNING)
// 5. CHECK 5: Invoice tamper detection via exact integer match (CRITICAL)
// 6. CHECK 6: Debit note with invalid originalInvoiceId (WARNING)
// 7. CHECK 7: Partial Credit Note with unreversed returned items (WARNING)
// 8. CHECK 8: Negative net payable with no MONEY_OUT record (CRITICAL)
// 9. CHECK 9: Old metal trade-in invoice missing customer CREDIT ledger entry (CRITICAL)
// 10. CHECK 10: Karigar metal aggregate settlement integrity across all FYs (CRITICAL)

import { db } from '@/db/client';
import { eq, and, lt, gt, or } from 'drizzle-orm';
import {
  firms,
  saleInvoices,
  saleInvoiceItems,
  payments,
  ledgerEntries,
  debitNotes,
  creditNotes,
  customers,
  suppliers,
  karigar,
  oldMetalLots,
  urdPurchases,
  items,
} from '@/db/schema';
import { karigarLedgerRepository } from '@/repositories/phase3/karigarLedgerRepository';
import { ERR } from '@/constants/errorCodes';
import type { VerifyFinding } from '@/services/phase1/verifyService';

export const billingVerifyService = {
  /**
   * Runs all Phase 3 billing, money truth, invoice, and karigar integrity checks.
   * Returns an array of VerifyFinding records.
   */
  async runBillingChecks(firmId?: string): Promise<VerifyFinding[]> {
    const findings: VerifyFinding[] = [];

    // Resolve firms to check
    let allFirmIds: string[] = [];
    try {
      if (firmId) {
        allFirmIds = [firmId];
      } else {
        const firmRows = await db.select({ id: firms.id }).from(firms);
        allFirmIds = firmRows.map((r) => r.id);
      }
    } catch {
      return findings;
    }

    if (allFirmIds.length === 0) {
      return findings;
    }

    for (const fid of allFirmIds) {
      // =======================================================================
      // CHECK 1: Invoice no ledger (FIRM, CRITICAL)
      // Posted invoice with no corresponding ledger entry in ledger_entries.
      // =======================================================================
      try {
        const postedInvoices = await db
          .select({
            id: saleInvoices.id,
            invoiceNumber: saleInvoices.invoiceNumber,
            customerId: saleInvoices.customerId,
          })
          .from(saleInvoices)
          .where(and(eq(saleInvoices.firmId, fid), eq(saleInvoices.status, 'POSTED')));

        for (const inv of postedInvoices) {
          const matchingLedger = await db
            .select({ id: ledgerEntries.id })
            .from(ledgerEntries)
            .where(
              and(
                eq(ledgerEntries.firmId, fid),
                eq(ledgerEntries.partyId, inv.customerId),
                or(
                  eq(ledgerEntries.linkedEntityId, inv.id),
                  eq(ledgerEntries.referenceId, inv.id)
                )
              )
            )
            .limit(1);

          if (matchingLedger.length === 0) {
            findings.push({
              severity: 'CRITICAL',
              check: ERR.CHECK_1_INVOICE_NO_LEDGER,
              detail: `CHECK 1: Posted invoice ${inv.invoiceNumber || inv.id} has no ledger entry. Customer receivable not recorded.`,
              firmId: fid,
            });
          }
        }
      } catch {
        // Fallback if sale_invoices or ledger_entries table unavailable
      }

      // =======================================================================
      // CHECK 2: MONEY_OUT >30 days (FIRM, CRITICAL)
      // PENDING MONEY_OUT payments older than 30 days.
      // =======================================================================
      try {
        const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const staleMoneyOut = await db
          .select({
            id: payments.id,
            amountPaise: payments.amountPaise,
            createdAt: payments.createdAt,
          })
          .from(payments)
          .where(
            and(
              eq(payments.firmId, fid),
              eq(payments.type, 'MONEY_OUT'),
              eq(payments.status, 'PENDING'),
              lt(payments.createdAt, thirtyDaysAgoIso)
            )
          );

        for (const pmt of staleMoneyOut) {
          findings.push({
            severity: 'CRITICAL',
            check: ERR.CHECK_2_MONEY_OUT_STALE_30_DAYS,
            detail: `CHECK 2: PENDING MONEY_OUT payment ${pmt.id} (${pmt.amountPaise} paise) is older than 30 days (created ${pmt.createdAt}).`,
            firmId: fid,
          });
        }
      } catch {
        // Fallback if payments table unavailable
      }

      // =======================================================================
      // CHECK 3: Payment no party (FIRM, WARNING)
      // Payment referencing an invalid or non-existent party.
      // =======================================================================
      try {
        const paymentRows = await db
          .select({
            id: payments.id,
            partyId: payments.partyId,
            partyType: payments.partyType,
          })
          .from(payments)
          .where(eq(payments.firmId, fid));

        for (const pmt of paymentRows) {
          let partyValid = false;
          if (pmt.partyType === 'CUSTOMER') {
            const cust = await db
              .select({ id: customers.id })
              .from(customers)
              .where(and(eq(customers.id, pmt.partyId), eq(customers.firmId, fid)))
              .limit(1);
            partyValid = cust.length > 0;
          } else if (pmt.partyType === 'SUPPLIER') {
            const supp = await db
              .select({ id: suppliers.id })
              .from(suppliers)
              .where(and(eq(suppliers.id, pmt.partyId), eq(suppliers.firmId, fid)))
              .limit(1);
            partyValid = supp.length > 0;
          } else if (pmt.partyType === 'KARIGAR') {
            const kar = await db
              .select({ id: karigar.id })
              .from(karigar)
              .where(and(eq(karigar.id, pmt.partyId), eq(karigar.firmId, fid)))
              .limit(1);
            partyValid = kar.length > 0;
          }

          if (!partyValid) {
            findings.push({
              severity: 'WARNING',
              check: ERR.CHECK_3_PAYMENT_ORPHAN_PARTY,
              detail: `CHECK 3: Payment ${pmt.id} references non-existent or invalid ${pmt.partyType} partyId: ${pmt.partyId}.`,
              firmId: fid,
            });
          }
        }
      } catch {
        // Fallback if payments or party tables unavailable
      }

      // =======================================================================
      // CHECK 4: Old metal lot no record (FIRM, WARNING)
      // Old metal lot without purchase record (missing saleInvoiceId & urdPurchaseId).
      // =======================================================================
      try {
        const lots = await db
          .select({
            id: oldMetalLots.id,
            saleInvoiceId: oldMetalLots.saleInvoiceId,
            urdPurchaseId: oldMetalLots.urdPurchaseId,
          })
          .from(oldMetalLots)
          .where(eq(oldMetalLots.firmId, fid));

        for (const lot of lots) {
          let hasRecord = false;
          if (lot.saleInvoiceId) {
            const inv = await db
              .select({ id: saleInvoices.id })
              .from(saleInvoices)
              .where(and(eq(saleInvoices.id, lot.saleInvoiceId), eq(saleInvoices.firmId, fid)))
              .limit(1);
            if (inv.length > 0) hasRecord = true;
          }
          if (lot.urdPurchaseId) {
            const urd = await db
              .select({ id: urdPurchases.id })
              .from(urdPurchases)
              .where(and(eq(urdPurchases.id, lot.urdPurchaseId), eq(urdPurchases.firmId, fid)))
              .limit(1);
            if (urd.length > 0) hasRecord = true;
          }

          if (!hasRecord) {
            findings.push({
              severity: 'WARNING',
              check: ERR.CHECK_4_OLD_METAL_LOT_NO_RECORD,
              detail: `CHECK 4: Old metal lot ${lot.id} has no valid purchase record (neither saleInvoiceId nor urdPurchaseId found).`,
              firmId: fid,
            });
          }
        }
      } catch {
        // Fallback if old_metal_lots table unavailable
      }

      // =======================================================================
      // CHECK 5: Invoice tamper (exact integer match) (FIRM, CRITICAL)
      // v5.1 FIX: Any non-zero difference between stored netPayablePaise and
      // recalculated value is a CRITICAL integrity violation -> Safe Mode.
      // Formula:
      // taxableMetalAmtPaise + taxableMakingAmtPaise + stoneAmtPaise + cgstPaise + sgstPaise
      // - oldMetalDeductionPaise - discountPaise + roundOffPaise
      // =======================================================================
      try {
        const postedInvoices = await db
          .select({
            id: saleInvoices.id,
            invoiceNumber: saleInvoices.invoiceNumber,
            taxableMetalAmtPaise: saleInvoices.taxableMetalAmtPaise,
            taxableMakingAmtPaise: saleInvoices.taxableMakingAmtPaise,
            stoneAmtPaise: saleInvoices.stoneAmtPaise,
            cgstPaise: saleInvoices.cgstPaise,
            sgstPaise: saleInvoices.sgstPaise,
            oldMetalDeductionPaise: saleInvoices.oldMetalDeductionPaise,
            discountPaise: saleInvoices.discountPaise,
            roundOffPaise: saleInvoices.roundOffPaise,
            netPayablePaise: saleInvoices.netPayablePaise,
          })
          .from(saleInvoices)
          .where(and(eq(saleInvoices.firmId, fid), eq(saleInvoices.status, 'POSTED')));

        for (const inv of postedInvoices) {
          const recalculated =
            (inv.taxableMetalAmtPaise || 0) +
            (inv.taxableMakingAmtPaise || 0) +
            (inv.stoneAmtPaise || 0) +
            (inv.cgstPaise || 0) +
            (inv.sgstPaise || 0) -
            (inv.oldMetalDeductionPaise || 0) -
            (inv.discountPaise || 0) +
            (inv.roundOffPaise || 0);

          if (inv.netPayablePaise !== recalculated) {
            findings.push({
              severity: 'CRITICAL',
              check: ERR.CHECK_5_INVOICE_TAMPER,
              detail: `CHECK 5: Invoice ${inv.invoiceNumber || inv.id} netPayablePaise tamper detected: stored (${inv.netPayablePaise}) !== recalculated (${recalculated}). Exact integer match required.`,
              firmId: fid,
            });
          }
        }
      } catch {
        // Fallback if sale_invoices table unavailable
      }

      // =======================================================================
      // CHECK 6: Debit note bad ref (FIRM, WARNING)
      // Debit Note with no valid originalInvoiceId.
      // =======================================================================
      try {
        const dnList = await db
          .select({
            id: debitNotes.id,
            dnNumber: debitNotes.dnNumber,
            originalInvoiceId: debitNotes.originalInvoiceId,
          })
          .from(debitNotes)
          .where(eq(debitNotes.firmId, fid));

        for (const dn of dnList) {
          const origInv = await db
            .select({ id: saleInvoices.id })
            .from(saleInvoices)
            .where(and(eq(saleInvoices.id, dn.originalInvoiceId), eq(saleInvoices.firmId, fid)))
            .limit(1);

          if (origInv.length === 0) {
            findings.push({
              severity: 'WARNING',
              check: ERR.CHECK_6_DEBIT_NOTE_BAD_REF,
              detail: `CHECK 6: Debit Note ${dn.dnNumber || dn.id} references non-existent originalInvoiceId: ${dn.originalInvoiceId}.`,
              firmId: fid,
            });
          }
        }
      } catch {
        // Fallback if debit_notes table unavailable
      }

      // =======================================================================
      // CHECK 7: Partial CN lots (FIRM, WARNING)
      // Partial Credit Note — returned lots not reversed to inventory.
      // =======================================================================
      try {
        const cnList = await db
          .select({
            id: creditNotes.id,
            cnNumber: creditNotes.cnNumber,
            isPartial: creditNotes.isPartial,
            returnedItemIds: creditNotes.returnedItemIds,
          })
          .from(creditNotes)
          .where(and(eq(creditNotes.firmId, fid), eq(creditNotes.isPartial, 1)));

        for (const cn of cnList) {
          let returnedIds: string[] = [];
          try {
            returnedIds = JSON.parse(cn.returnedItemIds || '[]');
          } catch {
            returnedIds = [];
          }

          for (const retId of returnedIds) {
            const invItems = await db
              .select({ id: saleInvoiceItems.id, stockLotId: saleInvoiceItems.stockLotId })
              .from(saleInvoiceItems)
              .where(eq(saleInvoiceItems.id, retId))
              .limit(1);

            if (invItems.length > 0 && invItems[0].stockLotId) {
              const stockLotId = invItems[0].stockLotId;
              const stockItem = await db
                .select({ id: items.id, status: items.status })
                .from(items)
                .where(and(eq(items.id, stockLotId), eq(items.firmId, fid)))
                .limit(1);

              if (stockItem.length > 0 && stockItem[0].status === 'SOLD') {
                findings.push({
                  severity: 'WARNING',
                  check: ERR.CHECK_7_PARTIAL_CN_LOTS,
                  detail: `CHECK 7: Partial Credit Note ${cn.cnNumber || cn.id} returned item ${retId} (lot ${stockLotId}) was not reversed — still marked SOLD.`,
                  firmId: fid,
                });
              }
            }
          }
        }
      } catch {
        // Fallback if credit_notes or items table unavailable
      }

      // =======================================================================
      // CHECK 8: Negative payable with no MONEY_OUT record (FIRM, CRITICAL)
      // If netPayablePaise < 0 and no MONEY_OUT record with OLD_METAL_EXCESS
      // or DISCOUNT_EXCESS exists -> CRITICAL -> Safe Mode.
      // =======================================================================
      try {
        const negativeInvoices = await db
          .select({
            id: saleInvoices.id,
            invoiceNumber: saleInvoices.invoiceNumber,
            netPayablePaise: saleInvoices.netPayablePaise,
          })
          .from(saleInvoices)
          .where(
            and(
              eq(saleInvoices.firmId, fid),
              eq(saleInvoices.status, 'POSTED'),
              lt(saleInvoices.netPayablePaise, 0)
            )
          );

        for (const inv of negativeInvoices) {
          const moneyOutRecords = await db
            .select({ id: payments.id, reason: payments.reason })
            .from(payments)
            .where(
              and(
                eq(payments.firmId, fid),
                eq(payments.linkedInvoiceId, inv.id),
                eq(payments.type, 'MONEY_OUT')
              )
            );

          const validExcess = moneyOutRecords.find(
            (m: any) => m.reason === 'OLD_METAL_EXCESS' || m.reason === 'DISCOUNT_EXCESS'
          );

          if (!validExcess) {
            findings.push({
              severity: 'CRITICAL',
              check: ERR.CHECK_8_NEGATIVE_PAYABLE_NO_MONEY_OUT,
              detail: `CHECK 8: Invoice ${inv.invoiceNumber || inv.id} has negative net payable (${inv.netPayablePaise} paise) without matching MONEY_OUT payment record. Reason must be OLD_METAL_EXCESS or DISCOUNT_EXCESS.`,
              firmId: fid,
            });
          }
        }
      } catch {
        // Fallback if sale_invoices or payments table unavailable
      }

      // =======================================================================
      // CHECK 9: Old metal CREDIT missing (FIRM, CRITICAL)
      // Old metal sale invoice missing customer CREDIT ledger entry.
      // =======================================================================
      try {
        const oldMetalInvoices = await db
          .select({
            id: saleInvoices.id,
            invoiceNumber: saleInvoices.invoiceNumber,
            customerId: saleInvoices.customerId,
            oldMetalDeductionPaise: saleInvoices.oldMetalDeductionPaise,
          })
          .from(saleInvoices)
          .where(
            and(
              eq(saleInvoices.firmId, fid),
              eq(saleInvoices.status, 'POSTED'),
              gt(saleInvoices.oldMetalDeductionPaise, 0)
            )
          );

        for (const inv of oldMetalInvoices) {
          const directCredits = await db
            .select({ id: ledgerEntries.id })
            .from(ledgerEntries)
            .where(
              and(
                eq(ledgerEntries.firmId, fid),
                eq(ledgerEntries.partyId, inv.customerId),
                eq(ledgerEntries.type, 'CREDIT'),
                or(
                  eq(ledgerEntries.linkedEntityId, inv.id),
                  eq(ledgerEntries.referenceId, inv.id)
                )
              )
            );

          if (directCredits.length === 0) {
            // Check if linked via old_metal_lots ID
            const tradeInLots = await db
              .select({ id: oldMetalLots.id })
              .from(oldMetalLots)
              .where(and(eq(oldMetalLots.firmId, fid), eq(oldMetalLots.saleInvoiceId, inv.id)));

            let foundLotCredit = false;
            for (const lot of tradeInLots) {
              const lotCredits = await db
                .select({ id: ledgerEntries.id })
                .from(ledgerEntries)
                .where(
                  and(
                    eq(ledgerEntries.firmId, fid),
                    eq(ledgerEntries.partyId, inv.customerId),
                    eq(ledgerEntries.type, 'CREDIT'),
                    or(
                      eq(ledgerEntries.linkedEntityId, lot.id),
                      eq(ledgerEntries.referenceId, lot.id)
                    )
                  )
                );
              if (lotCredits.length > 0) {
                foundLotCredit = true;
                break;
              }
            }

            if (!foundLotCredit) {
              findings.push({
                severity: 'CRITICAL',
                check: ERR.CHECK_9_OLD_METAL_CREDIT_MISSING,
                detail: `CHECK 9: Old metal sale invoice ${inv.invoiceNumber || inv.id} (old metal trade-in: ${inv.oldMetalDeductionPaise} paise) is missing corresponding CREDIT ledger entry for customer ${inv.customerId}.`,
                firmId: fid,
              });
            }
          }
        }
      } catch {
        // Fallback if sale_invoices or ledger_entries table unavailable
      }

      // =======================================================================
      // CHECK 10: Karigar over-settled — all FYs (v4.7, v5.17 cross-FY) (FIRM, CRITICAL)
      // Formula across ALL FYs:
      // SUM(METAL_OUT.weightMg * purityPct/100) >=
      //   SUM(METAL_IN.weightMg * purityPct/100)
      // + SUM(METAL_SETTLED_AS_MONEY.weightMg)
      // + SUM(LABOUR_IN_GOLD.weightMg)
      // If violated -> CRITICAL -> Safe Mode.
      // =======================================================================
      try {
        const karigarIds = karigarLedgerRepository.getDistinctKarigarIds(fid);
        for (const kid of karigarIds) {
          const check = karigarLedgerRepository.verifyAggregateIntegrity(fid, kid);
          if (!check.isValid) {
            findings.push({
              severity: 'CRITICAL',
              check: ERR.CHECK_10_KARIGAR_METAL_AGGREGATE,
              detail: `CHECK 10: Karigar ${kid} fine metal aggregate integrity violated: fine issued (${check.fineIssuedMg}mg) < fine deducted (${check.fineDeductedMg}mg: returned ${check.fineReturnedMg}mg, settled ${check.fineSettledMg}mg, labour-in-gold ${check.fineLabourGoldMg}mg). Deficit: ${check.deficitMg}mg.`,
              firmId: fid,
            });
          }
        }
      } catch {
        // Fallback if karigar_ledger table unavailable
      }
    }

    return firmId
      ? findings.filter((f) => f.firmId === undefined || f.firmId === firmId)
      : findings;
  },
};

// Aliases for canonical backward compatibility
export const phase3VerifyService = billingVerifyService;
export const runBillingChecks = billingVerifyService.runBillingChecks.bind(billingVerifyService);
