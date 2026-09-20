// components/SupplierSearchPickerModal.tsx — Phase 3 Supplier Search & Picker Modal
// Implements SEARCH-P3 (v5.5) and STEP 2 Supplier Master

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { GlassButton } from '@/components/ui/Glass';
import { supplierService } from '@/services/phase3/supplierService';
import { Supplier, SupplierType } from '@/types/phase3/phase3.types';
import { Search, UserPlus, X, Truck, Phone, Building2, CheckCircle2, Landmark } from 'lucide-react-native';
import { getUserFriendlyErrorMessage } from '@/constants/errorMessageMap';

interface SupplierSearchPickerModalProps {
  visible: boolean;
  firmId: string;
  onClose: () => void;
  onSelectSupplier: (supplier: Supplier) => void;
}

export function SupplierSearchPickerModal({
  visible,
  firmId,
  onClose,
  onSelectSupplier,
}: SupplierSearchPickerModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Supplier[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  // Quick Add Form States
  const [newName, setNewName] = useState('');
  const [newMobile, setNewMobile] = useState('');
  const [newGstin, setNewGstin] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newType, setNewType] = useState<SupplierType>('SUPPLIER');
  const [newBankName, setNewBankName] = useState('');
  const [newBankAccount, setNewBankAccount] = useState('');
  const [newIfsc, setNewIfsc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSearch = useCallback(
    async (text: string) => {
      setQuery(text);
      const trimmed = text.trim();
      if (trimmed.length < 2) {
        setResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const found = await supplierService.searchSuppliers(firmId, trimmed);
        setResults(found);
      } catch (err: any) {
        console.warn('[SupplierPicker] Search failed:', err);
      } finally {
        setIsSearching(false);
      }
    },
    [firmId]
  );

  useEffect(() => {
    if (visible) {
      setQuery('');
      setResults([]);
      setShowQuickAdd(false);
      setNewName('');
      setNewMobile('');
      setNewGstin('');
      setNewAddress('');
      setNewType('SUPPLIER');
      setNewBankName('');
      setNewBankAccount('');
      setNewIfsc('');
    }
  }, [visible]);

  const handleSelect = (supplier: Supplier) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onSelectSupplier(supplier);
    onClose();
  };

  const handleQuickAdd = async () => {
    if (!newName.trim()) {
      Alert.alert('Required Field', 'Supplier name is required.');
      return;
    }
    setIsSubmitting(true);
    try {
      const created = await supplierService.createSupplier({
        firmId,
        name: newName.trim(),
        mobile: newMobile.trim() || undefined,
        gstin: newGstin.trim() || undefined,
        address: newAddress.trim() || undefined,
        type: newType,
        bankName: newBankName.trim() || undefined,
        bankAccount: newBankAccount.trim() || undefined,
        ifsc: newIfsc.trim() || undefined,
      });
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      onSelectSupplier(created);
      onClose();
    } catch (err: any) {
      Alert.alert('Supplier Error', getUserFriendlyErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTypeBadgeColor = (type: SupplierType) => {
    switch (type) {
      case 'REFINERY':
        return { bg: 'rgba(217, 119, 6, 0.15)', text: '#F59E0B' };
      case 'VENDOR':
        return { bg: 'rgba(124, 58, 237, 0.15)', text: '#A78BFA' };
      default:
        return { bg: 'rgba(5, 150, 105, 0.15)', text: '#34D399' };
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.modalContent}>
          {/* Header */}
          <View style={s.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={s.iconBadge}>
                <Truck size={20} color="#059669" />
              </View>
              <Text style={s.modalTitle}>
                {showQuickAdd ? 'Add New Supplier' : 'Select Supplier'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeButton}>
              <X size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {!showQuickAdd ? (
            <>
              {/* Search Bar */}
              <View style={s.searchContainer}>
                <Search size={18} color="#94A3B8" style={{ marginRight: 8 }} />
                <TextInput
                  value={query}
                  onChangeText={handleSearch}
                  placeholder="Search by supplier name or mobile (min 2 chars)..."
                  placeholderTextColor="#64748B"
                  style={s.searchInput}
                  autoFocus
                  clearButtonMode="while-editing"
                />
                {isSearching && <ActivityIndicator size="small" color="#059669" />}
              </View>

              {/* Results List or Empty State */}
              {query.trim().length < 2 ? (
                <View style={s.emptyState}>
                  <Text style={s.emptyStateText}>
                    Type at least 2 characters to search purchase suppliers.
                  </Text>
                  <TouchableOpacity
                    style={s.quickAddPromptButton}
                    onPress={() => setShowQuickAdd(true)}
                  >
                    <UserPlus size={16} color="#059669" />
                    <Text style={s.quickAddPromptText}>Or register a new supplier</Text>
                  </TouchableOpacity>
                </View>
              ) : results.length === 0 && !isSearching ? (
                <View style={s.emptyState}>
                  <Text style={s.emptyStateText}>No suppliers found matching &quot;{query}&quot;</Text>
                  <TouchableOpacity
                    style={s.quickAddPromptButton}
                    onPress={() => {
                      setShowQuickAdd(true);
                      setNewName(query.trim());
                    }}
                  >
                    <UserPlus size={16} color="#059669" />
                    <Text style={s.quickAddPromptText}>Create supplier &quot;{query}&quot;</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <FlatList
                  data={results}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingVertical: 8 }}
                  renderItem={({ item }) => {
                    const badge = getTypeBadgeColor(item.type);
                    return (
                      <TouchableOpacity
                        style={s.supplierCard}
                        activeOpacity={0.7}
                        onPress={() => handleSelect(item)}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={s.nameRow}>
                            <Text style={s.supplierName}>{item.name}</Text>
                            <View style={[s.typeBadge, { backgroundColor: badge.bg }]}>
                              <Text style={[s.typeBadgeText, { color: badge.text }]}>
                                {item.type}
                              </Text>
                            </View>
                            {item.gstin ? (
                              <View style={s.gstinBadge}>
                                <Building2 size={10} color="#0284C7" />
                                <Text style={s.gstinText}>{item.gstin}</Text>
                              </View>
                            ) : null}
                          </View>

                          {item.mobile ? (
                            <View style={s.infoRow}>
                              <Phone size={12} color="#64748B" />
                              <Text style={s.infoText}>{item.mobile}</Text>
                            </View>
                          ) : null}

                          {item.bankName ? (
                            <View style={s.infoRow}>
                              <Landmark size={12} color="#64748B" />
                              <Text style={s.infoText}>
                                {item.bankName} {item.bankAccount ? `· A/C: ${item.bankAccount}` : ''}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <CheckCircle2 size={18} color="#059669" style={{ opacity: 0.6 }} />
                      </TouchableOpacity>
                    );
                  }}
                />
              )}
            </>
          ) : (
            /* Quick Add Form */
            <View style={{ flex: 1, paddingVertical: 8 }}>
              <Text style={s.fieldLabel}>Supplier Name *</Text>
              <TextInput
                style={s.formInput}
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. MMTC-PAMP / National Bullion"
                placeholderTextColor="#64748B"
                autoFocus
              />

              <Text style={s.fieldLabel}>Supplier Category *</Text>
              <View style={s.typeSelector}>
                {(['SUPPLIER', 'REFINERY', 'VENDOR'] as SupplierType[]).map((t) => {
                  const selected = newType === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[s.typeOption, selected && s.typeOptionSelected]}
                      onPress={() => setNewType(t)}
                    >
                      <Text style={[s.typeOptionText, selected && s.typeOptionTextSelected]}>
                        {t}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={s.fieldLabel}>Mobile Number (Optional)</Text>
              <TextInput
                style={s.formInput}
                value={newMobile}
                onChangeText={setNewMobile}
                placeholder="10-digit phone"
                placeholderTextColor="#64748B"
                keyboardType="phone-pad"
              />

              <Text style={s.fieldLabel}>GSTIN (Optional)</Text>
              <TextInput
                style={s.formInput}
                value={newGstin}
                onChangeText={(t) => setNewGstin(t.toUpperCase())}
                placeholder="15-character GSTIN"
                placeholderTextColor="#64748B"
                autoCapitalize="characters"
              />

              <View style={s.formActions}>
                <GlassButton
                  title="Back to Search"
                  onPress={() => setShowQuickAdd(false)}
                  style={{ flex: 1, marginRight: 8 }}
                />
                <GlassButton
                  title={isSubmitting ? 'Saving...' : 'Save & Select'}
                  variant="primary"
                  onPress={handleQuickAdd}
                  disabled={isSubmitting}
                  style={{ flex: 1.2 }}
                />
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    maxHeight: '85%',
    minHeight: 450,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(5, 150, 105, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  closeButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#F8FAFC',
  },
  emptyState: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 16,
  },
  quickAddPromptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(5, 150, 105, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(5, 150, 105, 0.3)',
  },
  quickAddPromptText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#34D399',
  },
  supplierCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  supplierName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  typeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  gstinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  gstinText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#38BDF8',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  infoText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 6,
    marginTop: 8,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  typeOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  typeOptionSelected: {
    backgroundColor: 'rgba(5, 150, 105, 0.2)',
    borderColor: '#059669',
  },
  typeOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  typeOptionTextSelected: {
    color: '#34D399',
  },
  formInput: {
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#F8FAFC',
  },
  formActions: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 8,
  },
});
