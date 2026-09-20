// app/billing/customers.tsx — Phase 3 Customer Master Screen
// Implements STEP 1 (Firm-scoped identity, soft delete only, balance always derived, v4.8 Cross-FY rule, v5.9 FIX-CUSTOMER-URD-1)
// Enhanced with direct Payments & Receipts linkage

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { GlassCard, GlassButton, HeaderPill } from '@/components/ui/Glass';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { customerService } from '@/services/phase3/customerService';
import { customerRepository } from '@/repositories/phase3/customerRepository';
import { Customer } from '@/types/phase3/phase3.types';
import { getThemeColors } from '@/constants/theme';
import { formatRupees } from '@/utils/currency';
import {
  Users,
  Search,
  UserPlus,
  Phone,
  MapPin,
  Building2,
  Edit2,
  Trash2,
  X,
  ShieldCheck,
  CreditCard,
  FileText,
  AlertCircle,
} from 'lucide-react-native';
import { getUserFriendlyErrorMessage } from '@/constants/errorMessageMap';

export default function CustomersMasterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeFirmId } = useFirmStore();
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [balances, setBalances] = useState<Record<string, number>>({});

  // Add / Edit Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  const loadCustomers = useCallback(async () => {
    if (!activeFirmId) return;
    setIsLoading(true);
    try {
      const data = await customerService.listCustomers(activeFirmId);
      setCustomersList(data);

      // Async load balances for active customers
      const balMap: Record<string, number> = {};
      for (const c of data) {
        try {
          const bal = await customerService.getCustomerBalance(activeFirmId, c.id);
          balMap[c.id] = bal;
        } catch {
          balMap[c.id] = 0;
        }
      }
      setBalances(balMap);
    } catch (e) {
      console.warn('[CustomersMasterScreen] Failed to load customers:', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeFirmId]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadCustomers();
  };

  const handleOpenAddModal = () => {
    setEditingCustomer(null);
    setName('');
    setMobile('');
    setGstin('');
    setAddress('');
    setAadhaarNumber('');
    setPanNumber('');
    setDuplicateWarning(null);
    setModalVisible(true);
  };

  const handleOpenEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setName(customer.name);
    setMobile(customer.mobile || '');
    setGstin(customer.gstin || '');
    setAddress(customer.address || '');
    setAadhaarNumber(customer.aadhaarNumber || '');
    setPanNumber(customer.panNumber || '');
    setDuplicateWarning(null);
    setModalVisible(true);
  };

  const handleMobileChange = (val: string) => {
    setMobile(val);
    if (val.trim().length === 10 && activeFirmId) {
      try {
        const existing = customerRepository.findByMobile(activeFirmId, val.trim());
        if (existing && (!editingCustomer || existing.id !== editingCustomer.id)) {
          setDuplicateWarning(`Customer "${existing.name}" already uses this mobile number.`);
        } else {
          setDuplicateWarning(null);
        }
      } catch {
        setDuplicateWarning(null);
      }
    } else {
      setDuplicateWarning(null);
    }
  };

  const handleSaveCustomer = async () => {
    if (!activeFirmId) return;
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Customer name is strictly required.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingCustomer) {
        await customerService.updateCustomer(activeFirmId, editingCustomer.id, {
          name: name.trim(),
          mobile: mobile.trim() || null,
          gstin: gstin.trim() || null,
          address: address.trim() || null,
          aadhaarNumber: aadhaarNumber.trim() || null,
          panNumber: panNumber.trim() || null,
        });
      } else {
        await customerService.createCustomer({
          firmId: activeFirmId,
          name: name.trim(),
          mobile: mobile.trim() || null,
          gstin: gstin.trim() || null,
          address: address.trim() || null,
          aadhaarNumber: aadhaarNumber.trim() || null,
          panNumber: panNumber.trim() || null,
        });
      }

      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      setModalVisible(false);
      loadCustomers();
    } catch (err: any) {
      Alert.alert('Error Saving Customer', getUserFriendlyErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSoftDelete = (customer: Customer) => {
    Alert.alert(
      'Remove Customer',
      `Are you sure you want to deactivate customer "${customer.name}"? Past transactions and audit trails remain preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            if (!activeFirmId) return;
            try {
              await customerService.softDeleteCustomer(activeFirmId, customer.id);
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch {}
              loadCustomers();
            } catch (err: any) {
              Alert.alert('Deactivation Failed', getUserFriendlyErrorMessage(err));
            }
          },
        },
      ]
    );
  };

  const filteredCustomers = customersList.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.mobile && c.mobile.includes(q)) ||
      (c.gstin && c.gstin.toLowerCase().includes(q))
    );
  });

  const headerPills = (
    <View style={s.headerPillsContainer}>
      <HeaderPill icon={<Users size={12} color={colors.vjBg} />} label="Customer Master" />
      <HeaderPill icon={<ShieldCheck size={12} color="#4ADE80" />} label="Firm Scoped" variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Customers" showBack headerContent={headerPills}>
      <View style={{ flex: 1, paddingBottom: insets.bottom }}>
        {/* Search & Add Action Row */}
        <View style={s.topBar}>
          <View style={s.searchBox}>
            <Search size={18} color="#94A3B8" style={{ marginRight: 8 }} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search customers..."
              placeholderTextColor="#64748B"
              style={s.searchInput}
              clearButtonMode="while-editing"
            />
          </View>
          <TouchableOpacity
            style={s.addButton}
            activeOpacity={0.8}
            onPress={handleOpenAddModal}
          >
            <UserPlus size={18} color="#FFFFFF" />
            <Text style={s.addButtonText}>Add</Text>
          </TouchableOpacity>
        </View>

        {/* Live Count & Summary Bar */}
        <View style={s.countRow}>
          <Text style={[s.countText, { color: colors.vjText, opacity: 0.6 }]}>
            {filteredCustomers.length} {filteredCustomers.length === 1 ? 'Customer' : 'Customers'} Registered
          </Text>
        </View>

        {/* Customer List */}
        {isLoading && !isRefreshing ? (
          <View style={s.centerContainer}>
            <ActivityIndicator size="large" color="#059669" />
          </View>
        ) : filteredCustomers.length === 0 ? (
          <View style={s.centerContainer}>
            <Text style={s.emptyTitle}>
              {searchQuery ? 'No Matching Customers' : 'No Customers Registered Yet'}
            </Text>
            <Text style={s.emptySubtitle}>
              {searchQuery
                ? 'Try searching with a different name, mobile, or GSTIN.'
                : 'Add your first customer to start generating invoices.'}
            </Text>
            {!searchQuery && (
              <TouchableOpacity
                style={[s.addButton, { marginTop: 16 }]}
                onPress={handleOpenAddModal}
              >
                <UserPlus size={18} color="#FFFFFF" />
                <Text style={s.addButtonText}>Add Customer</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <FlatList
            data={filteredCustomers}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#059669" />
            }
            renderItem={({ item }) => {
              const bal = balances[item.id] || 0;
              return (
                <GlassCard style={{ marginBottom: 12, padding: 16 }}>
                  <View style={s.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <View style={s.nameBadgeRow}>
                        <Text style={[s.cardCustomerName, { color: colors.vjText }]}>
                          {item.name}
                        </Text>
                        {item.gstin ? (
                          <View style={s.b2bTag}>
                            <Building2 size={10} color="#0284C7" />
                            <Text style={s.b2bText}>B2B</Text>
                          </View>
                        ) : null}
                      </View>

                      {item.mobile ? (
                        <View style={s.metaRow}>
                          <Phone size={13} color="#94A3B8" />
                          <Text style={s.metaText}>{item.mobile}</Text>
                        </View>
                      ) : null}

                      {item.address ? (
                        <View style={s.metaRow}>
                          <MapPin size={13} color="#94A3B8" />
                          <Text style={s.metaText} numberOfLines={1}>
                            {item.address}
                          </Text>
                        </View>
                      ) : null}

                      {item.gstin ? (
                        <View style={s.metaRow}>
                          <Building2 size={13} color="#94A3B8" />
                          <Text style={s.metaText}>GSTIN: {item.gstin}</Text>
                        </View>
                      ) : null}

                      {(item.aadhaarNumber || item.panNumber) ? (
                        <View style={s.metaRow}>
                          <FileText size={13} color="#94A3B8" />
                          <Text style={s.metaText}>
                            {item.panNumber ? `PAN: ${item.panNumber}  ` : ''}
                            {item.aadhaarNumber ? `Aadhaar: ${item.aadhaarNumber}` : ''}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Derived Balance Badge */}
                    <View style={s.balanceCol}>
                      <Text style={s.balanceLabel}>Derived Balance</Text>
                      <Text
                        style={[
                          s.balanceValue,
                          { color: bal > 0 ? '#F87171' : bal < 0 ? '#34D399' : '#94A3B8' },
                        ]}
                      >
                        {formatRupees(Math.abs(bal))}
                      </Text>
                      <Text style={s.balanceSub}>
                        {bal > 0 ? 'Receivable' : bal < 0 ? 'Advance' : 'Settled'}
                      </Text>
                    </View>
                  </View>

                  {/* Actions Row */}
                  <View style={s.cardActions}>
                    <TouchableOpacity
                      style={[s.actionBtn, s.actionBtnPayment]}
                      onPress={() => {
                        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                        router.push({
                          pathname: '/billing/payments',
                          params: {
                            partyType: 'CUSTOMER',
                            partyId: item.id,
                          },
                        });
                      }}
                    >
                      <CreditCard size={14} color="#10B981" />
                      <Text style={[s.actionBtnText, { color: '#10B981' }]}>Record Payment</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={s.actionBtn}
                      onPress={() => handleOpenEditModal(item)}
                    >
                      <Edit2 size={14} color="#38BDF8" />
                      <Text style={[s.actionBtnText, { color: '#38BDF8' }]}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={s.actionBtn}
                      onPress={() => handleSoftDelete(item)}
                    >
                      <Trash2 size={14} color="#F87171" />
                      <Text style={[s.actionBtnText, { color: '#F87171' }]}>Deactivate</Text>
                    </TouchableOpacity>
                  </View>
                </GlassCard>
              );
            }}
          />
        )}

        {/* Add / Edit Customer Modal */}
        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              <View style={s.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={s.iconBadge}>
                    <Users size={20} color="#059669" />
                  </View>
                  <Text style={s.modalTitle}>
                    {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  style={s.closeButton}
                >
                  <X size={20} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {duplicateWarning && (
                  <View style={s.warningBox}>
                    <AlertCircle size={16} color="#FBBF24" style={{ marginRight: 6 }} />
                    <Text style={s.warningText}>{duplicateWarning}</Text>
                  </View>
                )}

                <Text style={s.fieldLabel}>Customer Name *</Text>
                <TextInput
                  style={s.formInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Ramesh Jewellers / Suresh Patil"
                  placeholderTextColor="#64748B"
                  autoFocus
                />

                <Text style={s.fieldLabel}>Mobile Number (Soft-unique)</Text>
                <TextInput
                  style={s.formInput}
                  value={mobile}
                  onChangeText={handleMobileChange}
                  placeholder="10-digit mobile"
                  placeholderTextColor="#64748B"
                  keyboardType="phone-pad"
                />

                <Text style={s.fieldLabel}>GSTIN (Optional — for B2B buyers)</Text>
                <TextInput
                  style={s.formInput}
                  value={gstin}
                  onChangeText={(t) => setGstin(t.toUpperCase())}
                  placeholder="e.g. 27AAPFU0939F1ZV"
                  placeholderTextColor="#64748B"
                  autoCapitalize="characters"
                />

                <Text style={s.fieldLabel}>Billing Address (Optional)</Text>
                <TextInput
                  style={[s.formInput, { height: 60 }]}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Shop No., Street, City, State, PIN"
                  placeholderTextColor="#64748B"
                  multiline
                />

                <Text style={s.fieldLabel}>PAN Number (Optional — for URD pre-fill)</Text>
                <TextInput
                  style={s.formInput}
                  value={panNumber}
                  onChangeText={(t) => setPanNumber(t.toUpperCase())}
                  placeholder="e.g. ABCDE1234F"
                  placeholderTextColor="#64748B"
                  autoCapitalize="characters"
                />

                <Text style={s.fieldLabel}>Aadhaar Number (Optional — for URD pre-fill)</Text>
                <TextInput
                  style={s.formInput}
                  value={aadhaarNumber}
                  onChangeText={setAadhaarNumber}
                  placeholder="12-digit Aadhaar number"
                  placeholderTextColor="#64748B"
                  keyboardType="number-pad"
                />

                <View style={s.formActions}>
                  <GlassButton
                    title="Cancel"
                    onPress={() => setModalVisible(false)}
                    style={{ flex: 1, marginRight: 8 }}
                  />
                  <GlassButton
                    title={isSubmitting ? 'Saving...' : editingCustomer ? 'Update' : 'Save'}
                    variant="primary"
                    onPress={handleSaveCustomer}
                    disabled={isSubmitting}
                    style={{ flex: 1.2 }}
                  />
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  headerPillsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#F8FAFC',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  countRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  countText: {
    fontSize: 13,
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  nameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  cardCustomerName: {
    fontSize: 16,
    fontWeight: '700',
  },
  b2bTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  b2bText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#38BDF8',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  metaText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  balanceCol: {
    alignItems: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  balanceValue: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  balanceSub: {
    fontSize: 10,
    color: '#94A3B8',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  actionBtnPayment: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
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
    maxHeight: '90%',
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
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    marginBottom: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: '#FBBF24',
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
    marginTop: 24,
    marginBottom: 20,
    gap: 8,
  },
});
