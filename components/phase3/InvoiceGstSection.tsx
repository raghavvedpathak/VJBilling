// components/InvoiceGstSection.tsx — Phase 3 Step 5 GST Group Selection UI
// MANDATORY for TAX INVOICE (when firm.gstin is present). Hidden for BILL OF SUPPLY.
// Pre-populates: Metal Tax Group -> "GST 3%", Making Tax Group -> "GST 5%"
// Options formatted as: "{groupName} ({cgstRate}% + {sgstRate}%)"
// Validation error inline: "Select a GST group for Metal and Making to proceed." (never modal)
// CONSTITUTIONAL RULE: FORBIDDEN to perform inline GST arithmetic in UI. All calculations go through calculateInvoice().

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { ChevronDown, Check, Percent, AlertCircle } from 'lucide-react-native';
import { GlassCard } from '@/components/ui/Glass';
import { getThemeColors } from '@/constants/theme';
import { TaxGroupWithRates, InvoiceCalculation } from '@/types/phase3/phase3.types';
import { getGroupsWithTTL } from '@/store/phase3/taxGroupStore';
import { accountingTruthService } from '@/services/phase3/accountingTruthService';

export interface InvoiceGstSectionProps {
  firmId: string;
  hasGstin: boolean;
  metalTaxGroupId: string | null;
  makingTaxGroupId: string | null;
  onSelectMetalTaxGroup: (id: string) => void;
  onSelectMakingTaxGroup: (id: string) => void;
  metalError?: string | null;
  makingError?: string | null;
  metalValuePaise?: number;
  makingChargesPaise?: number;
  stoneAmtPaise?: number;
  oldMetalDeductionPaise?: number;
  onCalculationChange?: (calc: InvoiceCalculation) => void;
}

export function InvoiceGstSection({
  firmId,
  hasGstin,
  metalTaxGroupId,
  makingTaxGroupId,
  onSelectMetalTaxGroup,
  onSelectMakingTaxGroup,
  metalError,
  makingError,
  metalValuePaise = 0,
  makingChargesPaise = 0,
  stoneAmtPaise = 0,
  oldMetalDeductionPaise = 0,
  onCalculationChange,
}: InvoiceGstSectionProps) {
  const theme = getThemeColors();
  const colors = {
    primary: theme.vjAccent,
    text: theme.vjText,
    textSecondary: 'rgba(0,0,0,0.6)',
    border: theme.border,
    background: theme.vjBg,
    cardBackground: 'rgba(255,255,255,0.7)',
    error: '#DC2626',
  };
  const [groups, setGroups] = useState<TaxGroupWithRates[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<'METAL' | 'MAKING' | null>(null);

  // Load active tax groups using TTL cache
  useEffect(() => {
    let isMounted = true;
    async function loadGroups() {
      try {
        setLoading(true);
        const data = await getGroupsWithTTL(firmId);
        if (isMounted) {
          setGroups(data);

          // Pre-populate "GST 3%" for Metal if unset
          if (!metalTaxGroupId) {
            const default3 = data.find((g) => g.groupName === 'GST 3%');
            if (default3) {
              onSelectMetalTaxGroup(default3.id);
            } else if (data.length > 0) {
              onSelectMetalTaxGroup(data[0].id);
            }
          }

          // Pre-populate "GST 5%" for Making if unset
          if (!makingTaxGroupId) {
            const default5 = data.find((g) => g.groupName === 'GST 5%');
            if (default5) {
              onSelectMakingTaxGroup(default5.id);
            } else if (data.length > 1) {
              onSelectMakingTaxGroup(data[1].id);
            } else if (data.length > 0) {
              onSelectMakingTaxGroup(data[0].id);
            }
          }
        }
      } catch (err) {
        console.error('[InvoiceGstSection] Failed to load tax groups:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (firmId && hasGstin) {
      loadGroups();
    }
    return () => {
      isMounted = false;
    };
  }, [firmId, hasGstin]);

  // Live recalculation whenever rates or monetary inputs change
  // STRICT RULE: All computation goes through calculateInvoice in AccountingTruthService
  useEffect(() => {
    let isCancelled = false;
    async function recompute() {
      if (!hasGstin || !metalTaxGroupId || !makingTaxGroupId) return;
      try {
        const result = await accountingTruthService.calculateInvoice({
          firmId,
          metalValuePaise,
          makingChargesPaise,
          stoneAmtPaise,
          metalTaxGroupId,
          makingTaxGroupId,
          oldMetalDeductionPaise,
          hasGstin: true,
        });
        if (!isCancelled && onCalculationChange) {
          onCalculationChange(result);
        }
      } catch (err) {
        // Validation errors (e.g. inactive group) handled by parent or service
      }
    }

    recompute();
    return () => {
      isCancelled = true;
    };
  }, [
    firmId,
    hasGstin,
    metalTaxGroupId,
    makingTaxGroupId,
    metalValuePaise,
    makingChargesPaise,
    stoneAmtPaise,
    oldMetalDeductionPaise,
  ]);

  // If firm has no GSTIN -> BILL_OF_SUPPLY. GST section is completely hidden.
  if (!hasGstin) {
    return null;
  }

  const selectedMetalGroup = groups.find((g) => g.id === metalTaxGroupId);
  const selectedMakingGroup = groups.find((g) => g.id === makingTaxGroupId);

  const formatOptionLabel = (g: TaxGroupWithRates) => {
    const cgstPct = (g.cgstRate.rateBps / 100).toFixed(2).replace(/\.00$/, '');
    const sgstPct = (g.sgstRate.rateBps / 100).toFixed(2).replace(/\.00$/, '');
    return `${g.groupName} (${cgstPct}% + ${sgstPct}%)`;
  };

  return (
    <GlassCard style={styles.container}>
      <View style={styles.header}>
        <Percent size={18} color={colors.primary} style={{ marginRight: 8 }} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>GST Rates & Tax Groups</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
      ) : (
        <View style={styles.pickersRow}>
          {/* Metal GST Picker */}
          <View style={styles.pickerCol}>
            <Text style={[styles.pickerLabel, { color: colors.textSecondary }]}>Metal Tax Group</Text>
            <TouchableOpacity
              style={[
                styles.selectButton,
                {
                  borderColor: metalError ? colors.error : colors.border,
                  backgroundColor: colors.cardBackground || 'rgba(255,255,255,0.05)',
                },
              ]}
              onPress={() => setActiveModal('METAL')}
            >
              <Text
                style={[
                  styles.selectValue,
                  { color: selectedMetalGroup ? colors.text : colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {selectedMetalGroup ? formatOptionLabel(selectedMetalGroup) : 'Select Group'}
              </Text>
              <ChevronDown size={16} color={colors.textSecondary} />
            </TouchableOpacity>

            {/* Inline validation error (never modal) */}
            {metalError ? (
              <View style={styles.inlineErrorRow}>
                <AlertCircle size={12} color={colors.error} style={{ marginRight: 4 }} />
                <Text style={[styles.inlineErrorText, { color: colors.error }]}>
                  {metalError}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Making GST Picker */}
          <View style={styles.pickerCol}>
            <Text style={[styles.pickerLabel, { color: colors.textSecondary }]}>Making Tax Group</Text>
            <TouchableOpacity
              style={[
                styles.selectButton,
                {
                  borderColor: makingError ? colors.error : colors.border,
                  backgroundColor: colors.cardBackground || 'rgba(255,255,255,0.05)',
                },
              ]}
              onPress={() => setActiveModal('MAKING')}
            >
              <Text
                style={[
                  styles.selectValue,
                  { color: selectedMakingGroup ? colors.text : colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {selectedMakingGroup ? formatOptionLabel(selectedMakingGroup) : 'Select Group'}
              </Text>
              <ChevronDown size={16} color={colors.textSecondary} />
            </TouchableOpacity>

            {/* Inline validation error (never modal) */}
            {makingError ? (
              <View style={styles.inlineErrorRow}>
                <AlertCircle size={12} color={colors.error} style={{ marginRight: 4 }} />
                <Text style={[styles.inlineErrorText, { color: colors.error }]}>
                  {makingError}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      )}

      {/* Tax Group Selector Modal */}
      <Modal
        visible={activeModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveModal(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setActiveModal(null)}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Select {activeModal === 'METAL' ? 'Metal' : 'Making'} Tax Group
            </Text>

            <FlatList
              data={groups}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isSelected =
                  activeModal === 'METAL'
                    ? item.id === metalTaxGroupId
                    : item.id === makingTaxGroupId;

                return (
                  <TouchableOpacity
                    style={[
                      styles.optionRow,
                      {
                        backgroundColor: isSelected ? 'rgba(212,175,55,0.1)' : 'transparent',
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() => {
                      if (activeModal === 'METAL') {
                        onSelectMetalTaxGroup(item.id);
                      } else {
                        onSelectMakingTaxGroup(item.id);
                      }
                      setActiveModal(null);
                    }}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        { color: isSelected ? colors.primary : colors.text, fontWeight: isSelected ? '700' : '500' },
                      ]}
                    >
                      {formatOptionLabel(item)}
                    </Text>
                    {isSelected && <Check size={18} color={colors.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 16,
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  pickersRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pickerCol: {
    flex: 1,
  },
  pickerLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  selectValue: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    marginRight: 6,
  },
  inlineErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  inlineErrorText: {
    fontSize: 11,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxHeight: 380,
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 3,
    borderWidth: 0.5,
  },
  optionText: {
    fontSize: 14,
  },
});
