// components/CustomerSearchPickerModal.tsx — Phase 3 Customer Search & Picker Modal
// Implements SEARCH-P3 (v5.5) and STEP 1 Customer Master

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
import { GlassCard, GlassButton } from '@/components/ui/Glass';
import { customerService } from '@/services/phase3/customerService';
import { Customer } from '@/types/phase3/phase3.types';
import { Search, UserPlus, X, User, Phone, MapPin, Building2, CheckCircle2 } from 'lucide-react-native';
import { getUserFriendlyErrorMessage } from '@/constants/errorMessageMap';

interface CustomerSearchPickerModalProps {
  visible: boolean;
  firmId: string;
  onClose: () => void;
  onSelectCustomer: (customer: Customer) => void;
}

export function CustomerSearchPickerModal({
  visible,
  firmId,
  onClose,
  onSelectCustomer,
}: CustomerSearchPickerModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  // Quick Add Form States
  const [newName, setNewName] = useState('');
  const [newMobile, setNewMobile] = useState('');
  const [newGstin, setNewGstin] = useState('');
  const [newAddress, setNewAddress] = useState('');
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
        const found = await customerService.searchCustomers(firmId, trimmed);
        setResults(found);
      } catch (err: any) {
        console.warn('[CustomerPicker] Search failed:', err);
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
    }
  }, [visible]);

  const handleSelect = (customer: Customer) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onSelectCustomer(customer);
    onClose();
  };

  const handleQuickAdd = async () => {
    if (!newName.trim()) {
      Alert.alert('Required Field', 'Customer name is required.');
      return;
    }
    setIsSubmitting(true);
    try {
      const created = await customerService.createCustomer({
        firmId,
        name: newName.trim(),
        mobile: newMobile.trim() || undefined,
        gstin: newGstin.trim() || undefined,
        address: newAddress.trim() || undefined,
      });
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      onSelectCustomer(created);
      onClose();
    } catch (err: any) {
      Alert.alert('Customer Error', getUserFriendlyErrorMessage(err));
    } finally {
      setIsSubmitting(false);
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
                <User size={20} color="#059669" />
              </View>
              <Text style={s.modalTitle}>
                {showQuickAdd ? 'Add New Customer' : 'Select Customer'}
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
                  placeholder="Search by name or mobile (min 2 chars)..."
                  placeholderTextColor="#64748B"
                  style={s.searchInput}
                  autoFocus
                  clearButtonMode="while-editing"
                />
                {isSearching && <ActivityIndicator size="small" color="#059669" />}
              </View>

              {/* Results List or Prompt */}
              {query.trim().length < 2 ? (
                <View style={s.emptyState}>
                  <Text style={s.emptyStateText}>
                    Type at least 2 characters to search existing customers.
                  </Text>
                  <TouchableOpacity
                    style={s.quickAddPromptButton}
                    onPress={() => setShowQuickAdd(true)}
                  >
                    <UserPlus size={16} color="#059669" />
                    <Text style={s.quickAddPromptText}>Or register a new customer</Text>
                  </TouchableOpacity>
                </View>
              ) : results.length === 0 && !isSearching ? (
                <View style={s.emptyState}>
                  <Text style={s.emptyStateText}>No customers found matching &quot;{query}&quot;</Text>
                  <TouchableOpacity
                    style={s.quickAddPromptButton}
                    onPress={() => {
                      setShowQuickAdd(true);
                      setNewName(query.trim());
                    }}
                  >
                    <UserPlus size={16} color="#059669" />
                    <Text style={s.quickAddPromptText}>Create customer &quot;{query}&quot;</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <FlatList
                  data={results}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingVertical: 8 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={s.customerCard}
                      activeOpacity={0.7}
                      onPress={() => handleSelect(item)}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={s.nameRow}>
                          <Text style={s.customerName}>{item.name}</Text>
                          {item.gstin ? (
                            <View style={s.gstinBadge}>
                              <Building2 size={10} color="#0284C7" />
                              <Text style={s.gstinText}>B2B · {item.gstin}</Text>
                            </View>
                          ) : null}
                        </View>
                        {item.mobile ? (
                          <View style={s.infoRow}>
                            <Phone size={12} color="#64748B" />
                            <Text style={s.infoText}>{item.mobile}</Text>
                          </View>
                        ) : null}
                        {item.address ? (
                          <View style={s.infoRow}>
                            <MapPin size={12} color="#64748B" />
                            <Text style={s.infoText} numberOfLines={1}>
                              {item.address}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <CheckCircle2 size={18} color="#059669" style={{ opacity: 0.6 }} />
                    </TouchableOpacity>
                  )}
                />
              )}
            </>
          ) : (
            /* Quick Add Form */
            <View style={{ flex: 1, paddingVertical: 8 }}>
              <Text style={s.fieldLabel}>Customer Name *</Text>
              <TextInput
                style={s.formInput}
                value={newName}
                onChangeText={setNewName}
                placeholder="Full Name / Store Name"
                placeholderTextColor="#64748B"
                autoFocus
              />

              <Text style={s.fieldLabel}>Mobile Number (Optional)</Text>
              <TextInput
                style={s.formInput}
                value={newMobile}
                onChangeText={setNewMobile}
                placeholder="10-digit mobile"
                placeholderTextColor="#64748B"
                keyboardType="phone-pad"
              />

              <Text style={s.fieldLabel}>GSTIN (Optional — for B2B buyers)</Text>
              <TextInput
                style={s.formInput}
                value={newGstin}
                onChangeText={(t) => setNewGstin(t.toUpperCase())}
                placeholder="15-character GSTIN"
                placeholderTextColor="#64748B"
                autoCapitalize="characters"
              />

              <Text style={s.fieldLabel}>Address (Optional)</Text>
              <TextInput
                style={[s.formInput, { height: 60 }]}
                value={newAddress}
                onChangeText={setNewAddress}
                placeholder="City, State, Street..."
                placeholderTextColor="#64748B"
                multiline
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
  customerCard: {
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
  customerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
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
