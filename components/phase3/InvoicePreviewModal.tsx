// components/InvoicePreviewModal.tsx — Phase 3 Invoice Preview Gate
// LOCKED UX CONTRACT: UI MUST call previewInvoice() and display preview BEFORE postInvoice() is allowed

import React from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { FileCheck, X, AlertTriangle, ShieldCheck } from 'lucide-react-native';
import type { SaleInvoiceWithItems, InvoiceCalculation } from '@/types/phase3/phase3.types';
import { formatPaiseToRupees, getCurrencySymbol } from '@/utils/currency';

interface InvoicePreviewModalProps {
  visible: boolean;
  invoice: SaleInvoiceWithItems | null;
  customerName?: string | undefined;
  customerMobile?: string | undefined;
  calculation: InvoiceCalculation | null;
  onClose: () => void;
  onConfirmPost: () => void;
  isPosting?: boolean;
}

export const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  visible,
  invoice,
  customerName,
  customerMobile,
  calculation,
  onClose,
  onConfirmPost,
  isPosting = false,
}) => {
  if (!visible || !invoice) return null;

  const invoiceType = calculation?.invoiceType || 'TAX INVOICE';
  const isBillOfSupply = invoiceType === 'BILL_OF_SUPPLY';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <FileCheck size={20} color="#D97706" />
              <Text style={styles.headerTitle}>Invoice Preview Gate</Text>
              <View style={[styles.typeBadge, isBillOfSupply ? styles.typeBadgeSupply : styles.typeBadgeTax]}>
                <Text style={[styles.typeBadgeText, isBillOfSupply ? styles.typeBadgeSupplyText : styles.typeBadgeTaxText]}>
                  {invoiceType}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} disabled={isPosting} style={styles.closeBtn}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Customer Details */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionLabel}>CUSTOMER DETAILS</Text>
              <Text style={styles.customerName}>{customerName || 'Walk-in Customer'}</Text>
              {customerMobile && <Text style={styles.customerSub}>Mobile: {customerMobile}</Text>}
              <Text style={styles.customerSub}>Date: {invoice.invoiceDate}</Text>
              <Text style={styles.customerSub}>
                Bhav Rate: {getCurrencySymbol()}{((invoice.metalRatePaisePerGram || 0) / 100).toFixed(2)} /g
                {invoice.isManualRate ? ' (Manual Override)' : ' (Standard Daily Rate)'}
              </Text>
            </View>

            {/* Line Items */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionLabel}>ITEMS BREAKDOWN ({invoice.items.length})</Text>
              {invoice.items.map((item, idx) => {
                const isLoose = item.lineType === 'LOOSE_LOT';
                const weightDisplay = isLoose
                  ? `${item.qtySold || 1} pcs / ${((item.weightSoldMg || 0) / 1000).toFixed(3)} g`
                  : `${((item.netWeightMg || item.grossWeightMg || 0) / 1000).toFixed(3)} g (${item.sku || 'No SKU'})`;

                return (
                  <View key={item.id || idx} style={styles.itemRow}>
                    <View style={styles.itemColLeft}>
                      <Text style={styles.itemNameText}>{item.itemName}</Text>
                      <Text style={styles.itemMetaText}>{weightDisplay}</Text>
                    </View>
                    <View style={styles.itemColRight}>
                      <Text style={styles.itemTotalText}>
                        {formatPaiseToRupees(item.lineTotalPaise)}
                      </Text>
                      <Text style={styles.itemSubText}>
                        Metal: {formatPaiseToRupees(item.metalValuePaise)} + Making: {formatPaiseToRupees(item.makingChargesPaise)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Accounting Breakdown */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionLabel}>FINANCIAL SUMMARY</Text>

              <View style={styles.calcRow}>
                <Text style={styles.calcLabel}>Taxable Metal Value</Text>
                <Text style={styles.calcValue}>{formatPaiseToRupees(calculation?.metalValuePaise ?? invoice.taxableMetalAmtPaise)}</Text>
              </View>

              <View style={styles.calcRow}>
                <Text style={styles.calcLabel}>Taxable Making Charges</Text>
                <Text style={styles.calcValue}>{formatPaiseToRupees(calculation?.makingChargesPaise ?? invoice.taxableMakingAmtPaise)}</Text>
              </View>

              {(invoice.stoneAmtPaise || 0) > 0 && (
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>Stone Charges (0% GST Exempt)</Text>
                  <Text style={styles.calcValue}>{formatPaiseToRupees(invoice.stoneAmtPaise)}</Text>
                </View>
              )}

              {!isBillOfSupply && (
                <>
                  <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>
                      CGST ({((calculation?.metalCgstBps ?? 150) / 100).toFixed(2)}% Metal + {((calculation?.makingCgstBps ?? 250) / 100).toFixed(2)}% Making)
                    </Text>
                    <Text style={styles.calcValue}>{formatPaiseToRupees(calculation?.cgstPaise ?? invoice.cgstPaise)}</Text>
                  </View>

                  <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>
                      SGST ({((calculation?.metalSgstBps ?? 150) / 100).toFixed(2)}% Metal + {((calculation?.makingSgstBps ?? 250) / 100).toFixed(2)}% Making)
                    </Text>
                    <Text style={styles.calcValue}>{formatPaiseToRupees(calculation?.sgstPaise ?? invoice.sgstPaise)}</Text>
                  </View>

                  <View style={[styles.calcRow, styles.calcRowSub]}>
                    <Text style={styles.calcLabelBold}>Total GST (CGST + SGST)</Text>
                    <Text style={styles.calcValueBold}>{formatPaiseToRupees(calculation?.totalGstPaise ?? ((invoice.cgstPaise || 0) + (invoice.sgstPaise || 0)))}</Text>
                  </View>
                </>
              )}

              {(invoice.oldMetalDeductionPaise || 0) > 0 && (
                <View style={styles.calcRow}>
                  <Text style={[styles.calcLabel, { color: '#059669' }]}>
                    Old Metal Deduction (Post-GST)
                  </Text>
                  <Text style={[styles.calcValue, { color: '#059669' }]}>
                    - {formatPaiseToRupees(invoice.oldMetalDeductionPaise)}
                  </Text>
                </View>
              )}

              {(invoice.discountPaise || 0) > 0 && (
                <View style={styles.calcRow}>
                  <Text style={[styles.calcLabel, { color: '#059669' }]}>Discount</Text>
                  <Text style={[styles.calcValue, { color: '#059669' }]}>
                    - {formatPaiseToRupees(invoice.discountPaise)}
                  </Text>
                </View>
              )}

              <View style={[styles.calcRow, styles.netRow]}>
                <Text style={styles.netLabel}>NET PAYABLE</Text>
                <Text style={styles.netValue}>
                  {formatPaiseToRupees(calculation?.grandTotalPaise ?? invoice.netPayablePaise)}
                </Text>
              </View>
            </View>

            {/* Immutability Notice */}
            <View style={styles.warningBox}>
              <ShieldCheck size={16} color="#B45309" style={{ marginRight: 8, marginTop: 2 }} />
              <Text style={styles.warningText}>
                Review all quantities, purities, weights, and GST rates carefully. After confirmation, items will transition to SOLD atomically and the invoice will become strictly immutable.
              </Text>
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              disabled={isPosting}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Back to Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.confirmButton, isPosting && styles.confirmButtonDisabled]}
              onPress={onConfirmPost}
              disabled={isPosting}
              activeOpacity={0.7}
            >
              {isPosting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmButtonText}>Confirm & Post Invoice</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    maxHeight: '90%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeTax: {
    backgroundColor: '#EFF6FF',
  },
  typeBadgeTaxText: {
    color: '#2563EB',
    fontSize: 10,
    fontWeight: '800',
  },
  typeBadgeSupply: {
    backgroundColor: '#F3F4F6',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  typeBadgeSupplyText: {
    color: '#4B5563',
    fontSize: 10,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 6,
  },
  scrollContent: {
    padding: 16,
  },
  sectionCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  customerSub: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
    fontWeight: '500',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  itemColLeft: {
    flex: 1,
    paddingRight: 8,
  },
  itemColRight: {
    alignItems: 'flex-end',
  },
  itemNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  itemMetaText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  itemTotalText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  itemSubText: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  calcRowSub: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    marginTop: 4,
    paddingTop: 6,
  },
  calcLabel: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  calcValue: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '700',
  },
  calcLabelBold: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '700',
  },
  calcValueBold: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '800',
  },
  netRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 2,
    borderTopColor: '#CBD5E1',
    alignItems: 'center',
  },
  netLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.6,
  },
  netValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#D97706',
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 11,
    color: '#92400E',
    lineHeight: 16,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  cancelButton: {
    flex: 1,
    height: 48,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  confirmButton: {
    flex: 2,
    height: 48,
    backgroundColor: '#D97706',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#D97706',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
  },
  confirmButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
});
