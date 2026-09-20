// components/LooseStockEntrySection.tsx — Phase 3 Loose Stock Entry UI
// LOCKED UX CONTRACT: FEAT-LOOSE-STOCK-SALE-1 (v5.35)
// Manual entry mode for barcode-less loose designs: pick design, purity resolves lot, enter qtySold & weightSoldMg

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Layers, Plus, AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react-native';
import { designRepository } from '@/repositories/phase2/designRepository';
import { looseStockLotRepository } from '@/repositories/phase2/looseStockLotRepository';
import type { Design, LooseStockLot } from '@/types/phase2/phase2.types';
import { COLORS } from '@/constants/theme';

export interface LooseStockEntryPayload {
  designId: string;
  designName: string;
  purityPercent: number;
  qtySold: number;
  weightSoldMg: number;
  metal: string;
  hsnCode: string;
}

interface LooseStockEntrySectionProps {
  firmId: string;
  onAddLooseItem: (payload: LooseStockEntryPayload) => void;
  disabled?: boolean;
}

const COMMON_PURITIES = [
  { label: '22K (91.6%)', value: 91.6 },
  { label: '18K (75.0%)', value: 75.0 },
  { label: '24K (99.9%)', value: 99.9 },
  { label: '14K (58.5%)', value: 58.5 },
  { label: 'Silver 92.5%', value: 92.5 },
];

export const LooseStockEntrySection: React.FC<LooseStockEntrySectionProps> = ({
  firmId,
  onAddLooseItem,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [looseDesigns, setLooseDesigns] = useState<Design[]>([]);
  const [selectedDesignId, setSelectedDesignId] = useState<string>('');
  const [selectedPurity, setSelectedPurity] = useState<number>(91.6);
  const [activeLot, setActiveLot] = useState<LooseStockLot | null>(null);
  const [loadingLot, setLoadingLot] = useState(false);

  const [qtySoldText, setQtySoldText] = useState('');
  const [weightGramsText, setWeightGramsText] = useState('');

  // Inline validation errors (never modal alerts)
  const [qtyError, setQtyError] = useState<string | null>(null);
  const [weightError, setWeightError] = useState<string | null>(null);
  const [lotError, setLotError] = useState<string | null>(null);

  // Load designs with stockType === 'LOOSE'
  useEffect(() => {
    async function loadDesigns() {
      try {
        const allDesigns = await designRepository.findByFirmId(firmId);
        const loose = allDesigns.filter((d) => (d as any).stockType === 'LOOSE' && (d as any).isActive !== 0);
        setLooseDesigns(loose);
        if (loose.length > 0 && !selectedDesignId) {
          setSelectedDesignId(loose[0].id);
        }
      } catch (err) {
        setLooseDesigns([]);
      }
    }
    if (firmId) {
      loadDesigns();
    }
  }, [firmId]);

  // Resolve lot via looseStockLotRepository.getByDesignAndPurity(designId, purityPercent, firmId)
  const resolveLot = useCallback(async () => {
    if (!selectedDesignId || !selectedPurity) {
      setActiveLot(null);
      return;
    }
    setLoadingLot(true);
    setLotError(null);
    try {
      const lot = await looseStockLotRepository.getByDesignAndPurity(
        selectedDesignId,
        selectedPurity,
        firmId
      );
      if (lot && lot.status === 'ACTIVE' && lot.pieceCount > 0) {
        setActiveLot(lot);
        setLotError(null);
      } else {
        setActiveLot(null);
        setLotError('No available loose stock lot for this design & purity.');
      }
    } catch (err) {
      setActiveLot(null);
      setLotError('Failed to resolve loose lot.');
    } finally {
      setLoadingLot(false);
    }
  }, [selectedDesignId, selectedPurity, firmId]);

  useEffect(() => {
    if (isOpen) {
      resolveLot();
    }
  }, [isOpen, selectedDesignId, selectedPurity, resolveLot]);

  const handleAdd = () => {
    setQtyError(null);
    setWeightError(null);

    const qty = parseInt(qtySoldText.trim(), 10);
    const weightGrams = parseFloat(weightGramsText.trim());

    let hasError = false;

    if (!activeLot) {
      setLotError('Please select a valid design and purity with available stock.');
      hasError = true;
    }

    if (isNaN(qty) || qty <= 0) {
      setQtyError('Quantity sold must be at least 1 piece.');
      hasError = true;
    } else if (activeLot && qty > activeLot.pieceCount) {
      setQtyError(`Cannot exceed available stock (${activeLot.pieceCount} pcs).`);
      hasError = true;
    }

    if (isNaN(weightGrams) || weightGrams <= 0) {
      setWeightError('Enter a valid weight in grams (> 0).');
      hasError = true;
    } else if (activeLot && Math.round(weightGrams * 1000) > activeLot.totalWeightMg) {
      setWeightError(`Cannot exceed available weight (${(activeLot.totalWeightMg / 1000).toFixed(3)} g).`);
      hasError = true;
    }

    if (hasError || !activeLot) return;

    const selectedDesign = looseDesigns.find((d) => d.id === selectedDesignId);

    onAddLooseItem({
      designId: activeLot.designId,
      designName: selectedDesign?.name || 'Loose Jewellery Item',
      purityPercent: activeLot.purityPercent,
      qtySold: qty,
      weightSoldMg: Math.round(weightGrams * 1000),
      metal: activeLot.metal,
      hsnCode: activeLot.hsnCode || selectedDesign?.defaultHsn || '7113',
    });

    // Reset inputs
    setQtySoldText('');
    setWeightGramsText('');
    setQtyError(null);
    setWeightError(null);
  };

  return (
    <View style={styles.cardContainer}>
      <TouchableOpacity
        style={styles.headerToggle}
        onPress={() => setIsOpen(!isOpen)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Layers size={18} color="#D97706" />
          <Text style={styles.headerTitle}>LOOSE STOCK ENTRY MODE (NO BARCODE)</Text>
        </View>
        <ChevronDown
          size={18}
          color="#64748B"
          style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}
        />
      </TouchableOpacity>

      {isOpen && (
        <View style={styles.content}>
          <Text style={styles.subtext}>
            For non-barcoded bulk stock (e.g. nose pins, beads, loose findings). Select design, purity, pieces, and scale-weighed weight.
          </Text>

          {/* Design Selection */}
          <Text style={styles.fieldLabel}>Select Loose Design</Text>
          {looseDesigns.length === 0 ? (
            <Text style={styles.inlineWarning}>No loose-stock designs configured.</Text>
          ) : (
            <View style={styles.chipsRow}>
              {looseDesigns.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={[
                    styles.chip,
                    selectedDesignId === d.id && styles.chipActive,
                  ]}
                  onPress={() => setSelectedDesignId(d.id)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedDesignId === d.id && styles.chipTextActive,
                    ]}
                  >
                    {d.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Purity Selection */}
          <Text style={styles.fieldLabel}>Purity</Text>
          <View style={styles.chipsRow}>
            {COMMON_PURITIES.map((p) => (
              <TouchableOpacity
                key={p.value}
                style={[
                  styles.chip,
                  selectedPurity === p.value && styles.chipActive,
                ]}
                onPress={() => setSelectedPurity(p.value)}
              >
                <Text
                  style={[
                    styles.chipText,
                    selectedPurity === p.value && styles.chipTextActive,
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Available Stock Indicator */}
          {loadingLot ? (
            <ActivityIndicator size="small" color="#D97706" style={{ marginVertical: 8 }} />
          ) : activeLot ? (
            <View style={styles.stockBanner}>
              <CheckCircle2 size={16} color="#16A34A" style={{ marginRight: 6 }} />
              <Text style={styles.stockBannerText}>
                In Stock: <Text style={{ fontWeight: '800' }}>{activeLot.pieceCount} pcs</Text> |{' '}
                <Text style={{ fontWeight: '800' }}>
                  {(activeLot.totalWeightMg / 1000).toFixed(3)} g
                </Text>
              </Text>
            </View>
          ) : lotError ? (
            <View style={styles.errorBanner}>
              <AlertCircle size={16} color="#DC2626" style={{ marginRight: 6 }} />
              <Text style={styles.errorBannerText}>{lotError}</Text>
            </View>
          ) : null}

          {/* Input: Qty Sold & Weighed Weight */}
          <View style={styles.inputsRow}>
            <View style={styles.inputCol}>
              <Text style={styles.fieldLabel}>Qty Sold (Pcs)</Text>
              <TextInput
                style={[styles.input, qtyError ? styles.inputError : null]}
                placeholder="e.g. 5"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={qtySoldText}
                onChangeText={(t) => {
                  setQtySoldText(t);
                  setQtyError(null);
                }}
                editable={!disabled && !!activeLot}
              />
              {qtyError && <Text style={styles.inlineWarning}>{qtyError}</Text>}
            </View>

            <View style={styles.inputCol}>
              <Text style={styles.fieldLabel}>Scale Weighed (Grams)</Text>
              <TextInput
                style={[styles.input, weightError ? styles.inputError : null]}
                placeholder="e.g. 1.250"
                placeholderTextColor="#94A3B8"
                keyboardType="decimal-pad"
                value={weightGramsText}
                onChangeText={(t) => {
                  setWeightGramsText(t);
                  setWeightError(null);
                }}
                editable={!disabled && !!activeLot}
              />
              {weightError && <Text style={styles.inlineWarning}>{weightError}</Text>}
            </View>
          </View>

          {/* Add Button */}
          <TouchableOpacity
            style={[
              styles.addButton,
              (!activeLot || disabled) && styles.addButtonDisabled,
            ]}
            onPress={handleAdd}
            disabled={!activeLot || disabled}
            activeOpacity={0.7}
          >
            <Plus size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.addButtonText}>Add Loose Stock Item</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    borderRadius: 12,
    marginVertical: 6,
    overflow: 'hidden',
  },
  headerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.6,
  },
  content: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: '#FEF3C7',
  },
  subtext: {
    fontSize: 12,
    color: '#92400E',
    marginTop: 8,
    marginBottom: 10,
    lineHeight: 16,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#78350F',
    marginBottom: 4,
    marginTop: 6,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  chip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: '#D97706',
    borderColor: '#B45309',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  stockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginVertical: 6,
  },
  stockBannerText: {
    fontSize: 12,
    color: '#15803D',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginVertical: 6,
  },
  errorBannerText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
  },
  inputsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  inputCol: {
    flex: 1,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 42,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
  },
  inputError: {
    borderColor: '#DC2626',
  },
  inlineWarning: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },
  addButton: {
    backgroundColor: '#D97706',
    borderRadius: 10,
    height: 42,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  addButtonDisabled: {
    backgroundColor: '#E2E8F0',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
