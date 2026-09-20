// app/billing/suppliers.tsx — Phase 3 Supplier Master Screen
// Implements STEP 2 (External purchase parties only, Bank details, No Karigar here)
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
import { supplierService } from '@/services/phase3/supplierService';
import { supplierRepository } from '@/repositories/phase3/supplierRepository';
import { Supplier, SupplierType } from '@/types/phase3/phase3.types';
import { getThemeColors } from '@/constants/theme';
import { formatRupees } from '@/utils/currency';
import {
  Truck,
  Search,
  UserPlus,
  Phone,
  MapPin,
  Building2,
  Edit2,
  Archive,
  X,
  ShieldCheck,
  Landmark,
  CreditCard,
  AlertCircle,
  Factory,
} from 'lucide-react-native';
import { getUserFriendlyErrorMessage } from '@/constants/errorMessageMap';

export default function SuppliersMasterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeFirmId } = useFirmStore();
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const [suppliersList, setSuppliersList] = useState<Supplier[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeTab, setSelectedTypeTab] = useState<'ALL' | SupplierType>('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [balances, setBalances] = useState<Record<string, number>>({});

  // Add / Edit Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState<SupplierType>('SUPPLIER');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  const loadSuppliers = useCallback(async () => {
    if (!activeFirmId) return;
    setIsLoading(true);
    try {
      const data = await supplierService.listSuppliers(activeFirmId);
      setSuppliersList(data);

      // Async load balances for suppliers
      const balMap: Record<string, number> = {};
      for (const s of data) {
        try {
          const bal = await supplierService.getSupplierBalance(activeFirmId, s.id);
          balMap[s.id] = bal;
        } catch {
          balMap[s.id] = 0;
        }
      }
      setBalances(balMap);
    } catch (e) {
      console.warn('[SuppliersMasterScreen] Failed to load suppliers:', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeFirmId]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadSuppliers();
  };

  const handleOpenAddModal = () => {
    setEditingSupplier(null);
    setName('');
    setMobile('');
    setGstin('');
    setAddress('');
    setType('SUPPLIER');
    setBankName('');
    setBankAccount('');
    setIfsc('');
    setDuplicateWarning(null);
    setModalVisible(true);
  };

  const handleOpenEditModal = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setName(supplier.name);
    setMobile(supplier.mobile || '');
    setGstin(supplier.gstin || '');
    setAddress(supplier.address || '');
    setType(supplier.type);
    setBankName(supplier.bankName || '');
    setBankAccount(supplier.bankAccount || '');
    setIfsc(supplier.ifsc || '');
    setDuplicateWarning(null);
    setModalVisible(true);
  };

  const handleMobileChange = (val: string) => {
    setMobile(val);
    if (val.trim().length === 10 && activeFirmId) {
      try {
        const existing = supplierRepository.findByMobile(activeFirmId, val.trim());
        if (existing && (!editingSupplier || existing.id !== editingSupplier.id)) {
          setDuplicateWarning(`Supplier "${existing.name}" already uses this phone number.`);
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

  const handleSaveSupplier = async () => {
    if (!activeFirmId) return;
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Party name is strictly required.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingSupplier) {
        await supplierService.updateSupplier(activeFirmId, editingSupplier.id, {
          name: name.trim(),
          mobile: mobile.trim() || null,
          gstin: gstin.trim() || null,
          address: address.trim() || null,
          type,
          bankName: bankName.trim() || null,
          bankAccount: bankAccount.trim() || null,
          ifsc: ifsc.trim() || null,
        });
      } else {
        await supplierService.createSupplier({
          firmId: activeFirmId,
          name: name.trim(),
          mobile: mobile.trim() || null,
          gstin: gstin.trim() || null,
          address: address.trim() || null,
          type,
          bankName: bankName.trim() || null,
          bankAccount: bankAccount.trim() || null,
          ifsc: ifsc.trim() || null,
        });
      }

      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      setModalVisible(false);
      loadSuppliers();
    } catch (err: any) {
      Alert.alert('Error Saving Supplier', getUserFriendlyErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchive = (supplier: Supplier) => {
    Alert.alert(
      'Archive Supplier',
      `Are you sure you want to archive "${supplier.name}"? Past purchases and ledger entries remain preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            if (!activeFirmId) return;
            try {
              await supplierService.archiveSupplier(activeFirmId, supplier.id);
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch {}
              loadSuppliers();
            } catch (err: any) {
              Alert.alert('Archive Failed', getUserFriendlyErrorMessage(err));
            }
          },
        },
      ]
    );
  };

  const filteredSuppliers = suppliersList.filter((s) => {
    // Tab filter
    if (selectedTypeTab !== 'ALL' && s.type !== selectedTypeTab) return false;

    // Search filter
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.mobile && s.mobile.includes(q)) ||
      (s.gstin && s.gstin.toLowerCase().includes(q))
    );
  });

  const getTypeBadgeStyle = (t: SupplierType) => {
    switch (t) {
      case 'SUPPLIER':
        return { bg: 'rgba(5, 150, 105, 0.15)', text: '#34D399', label: 'DEALER' };
      case 'REFINERY':
        return { bg: 'rgba(217, 119, 6, 0.15)', text: '#FBBF24', label: 'REFINERY' };
      case 'VENDOR':
        return { bg: 'rgba(124, 58, 237, 0.15)', text: '#A78BFA', label: 'VENDOR' };
      default:
        return { bg: 'rgba(100, 116, 139, 0.15)', text: '#94A3B8', label: t };
    }
  };

  const headerPills = (
    <View style={s.headerPillsContainer}>
      <HeaderPill icon={<Truck size={12} color={colors.vjBg} />} label="Supplier Master" />
      <HeaderPill icon={<ShieldCheck size={12} color="#4ADE80" />} label="Firm Scoped" variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Suppliers" showBack headerContent={headerPills}>
      <View style={{ flex: 1, paddingBottom: insets.bottom }}>
        {/* Search & Add Action Row */}
        <View style={s.topBar}>
          <View style={s.searchBox}>
            <Search size={18} color="#94A3B8" style={{ marginRight: 8 }} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search suppliers..."
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

        {/* Type Category Tabs */}
        <View style={s.tabBar}>
          {(['ALL', 'SUPPLIER', 'REFINERY', 'VENDOR'] as const).map((tab) => {
            const active = selectedTypeTab === tab;
            const label =
              tab === 'ALL'
                ? 'All Parties'
                : tab === 'SUPPLIER'
                ? 'Dealers'
                : tab === 'REFINERY'
                ? 'Refineries'
                : 'Vendors';
            return (
              <TouchableOpacity
                key={tab}
                style={[s.tabItem, active && s.tabItemActive]}
                onPress={() => setSelectedTypeTab(tab)}
              >
                <Text style={[s.tabText, active && s.tabTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Live Count Bar */}
        <View style={s.countRow}>
          <Text style={[s.countText, { color: colors.vjText, opacity: 0.6 }]}>
            {filteredSuppliers.length} {filteredSuppliers.length === 1 ? 'Supplier' : 'Suppliers'} Listed
          </Text>
        </View>

        {/* Supplier List */}
        {isLoading && !isRefreshing ? (
          <View style={s.centerContainer}>
            <ActivityIndicator size="large" color="#059669" />
          </View>
        ) : filteredSuppliers.length === 0 ? (
          <View style={s.centerContainer}>
            <Text style={s.emptyTitle}>
              {searchQuery ? 'No Matching Suppliers' : 'No Suppliers Registered Yet'}
            </Text>
            <Text style={s.emptySubtitle}>
              {searchQuery
                ? 'Try searching with a different name, mobile, or GSTIN.'
                : 'Add purchase dealers or refineries to manage procurements.'}
            </Text>
            {!searchQuery && (
              <TouchableOpacity
                style={[s.addButton, { marginTop: 16 }]}
                onPress={handleOpenAddModal}
              >
                <UserPlus size={18} color="#FFFFFF" />
                <Text style={s.addButtonText}>Add Supplier</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <FlatList
            data={filteredSuppliers}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#059669" />
            }
            renderItem={({ item }) => {
              const badge = getTypeBadgeStyle(item.type);
              const bal = balances[item.id] || 0;
              return (
                <GlassCard style={{ marginBottom: 12, padding: 16 }}>
                  <View style={s.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <View style={s.nameBadgeRow}>
                        <Text style={[s.cardSupplierName, { color: colors.vjText }]}>
                          {item.name}
                        </Text>
                        <View style={[s.typeBadge, { backgroundColor: badge.bg }]}>
                          <Text style={[s.typeBadgeText, { color: badge.text }]}>
                            {badge.label}
                          </Text>
                        </View>
                        {item.gstin ? (
                          <View style={s.gstinBadge}>
                            <Building2 size={10} color="#0284C7" />
                            <Text style={s.gstinText}>GST</Text>
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

                      {item.bankAccount ? (
                        <View style={s.bankBox}>
                          <Landmark size={12} color="#38BDF8" style={{ marginRight: 6 }} />
                          <Text style={s.bankText}>
                            {item.bankName ? `${item.bankName} • ` : ''}A/C: {item.bankAccount}
                            {item.ifsc ? ` (${item.ifsc})` : ''}
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
                        {bal > 0 ? 'Payable' : bal < 0 ? 'Advance Given' : 'Settled'}
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
                            partyType: 'SUPPLIER',
                            partyId: item.id,
                          },
                        });
                      }}
                    >
                      <CreditCard size={14} color="#D97706" />
                      <Text style={[s.actionBtnText, { color: '#D97706' }]}>Pay Supplier</Text>
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
                      onPress={() => handleArchive(item)}
                    >
                      <Archive size={14} color="#F87171" />
                      <Text style={[s.actionBtnText, { color: '#F87171' }]}>Archive</Text>
                    </TouchableOpacity>
                  </View>
                </GlassCard>
              );
            }}
          />
        )}

        {/* Add / Edit Supplier Modal */}
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
                    <Truck size={20} color="#059669" />
                  </View>
                  <Text style={s.modalTitle}>
                    {editingSupplier ? 'Edit Supplier' : 'Add Purchase Supplier'}
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

                <Text style={s.fieldLabel}>Party Name *</Text>
                <TextInput
                  style={s.formInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. MMTC-PAMP India Pvt Ltd"
                  placeholderTextColor="#64748B"
                  autoFocus
                />

                <Text style={s.fieldLabel}>Party Category *</Text>
                <View style={s.typeSelector}>
                  {[
                    { id: 'SUPPLIER', label: 'Wholesale Dealer' },
                    { id: 'REFINERY', label: 'Refinery House' },
                    { id: 'VENDOR', label: 'Service Vendor' },
                  ].map((t) => {
                    const selected = type === t.id;
                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={[s.typeOption, selected && s.typeOptionSelected]}
                        onPress={() => setType(t.id as SupplierType)}
                      >
                        <Text style={[s.typeOptionText, selected && s.typeOptionTextSelected]}>
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={s.fieldLabel}>Mobile Number (Soft-unique)</Text>
                <TextInput
                  style={s.formInput}
                  value={mobile}
                  onChangeText={handleMobileChange}
                  placeholder="10-digit mobile"
                  placeholderTextColor="#64748B"
                  keyboardType="phone-pad"
                />

                <Text style={s.fieldLabel}>GSTIN (Optional)</Text>
                <TextInput
                  style={s.formInput}
                  value={gstin}
                  onChangeText={(t) => setGstin(t.toUpperCase())}
                  placeholder="e.g. 27AAPFU0939F1ZV"
                  placeholderTextColor="#64748B"
                  autoCapitalize="characters"
                />

                <Text style={s.fieldLabel}>Address (Optional)</Text>
                <TextInput
                  style={[s.formInput, { height: 60 }]}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Street, City, State..."
                  placeholderTextColor="#64748B"
                  multiline
                />

                <Text style={[s.fieldLabel, { marginTop: 12, color: '#38BDF8' }]}>
                  Bank Details for Payments (Optional)
                </Text>

                <TextInput
                  style={s.formInput}
                  value={bankName}
                  onChangeText={setBankName}
                  placeholder="Bank Name (e.g. HDFC Bank)"
                  placeholderTextColor="#64748B"
                />

                <TextInput
                  style={[s.formInput, { marginTop: 8 }]}
                  value={bankAccount}
                  onChangeText={setBankAccount}
                  placeholder="Account Number"
                  placeholderTextColor="#64748B"
                  keyboardType="number-pad"
                />

                <TextInput
                  style={[s.formInput, { marginTop: 8 }]}
                  value={ifsc}
                  onChangeText={(t) => setIfsc(t.toUpperCase())}
                  placeholder="IFSC Code (e.g. HDFC0001234)"
                  placeholderTextColor="#64748B"
                  autoCapitalize="characters"
                />

                <View style={s.formActions}>
                  <GlassButton
                    title="Cancel"
                    onPress={() => setModalVisible(false)}
                    style={{ flex: 1, marginRight: 8 }}
                  />
                  <GlassButton
                    title={isSubmitting ? 'Saving...' : editingSupplier ? 'Update' : 'Save'}
                    variant="primary"
                    onPress={handleSaveSupplier}
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
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  tabItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  tabItemActive: {
    backgroundColor: 'rgba(5, 150, 105, 0.2)',
    borderColor: '#059669',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  tabTextActive: {
    color: '#34D399',
  },
  countRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
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
  cardSupplierName: {
    fontSize: 16,
    fontWeight: '700',
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
  bankBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  bankText: {
    fontSize: 12,
    color: '#7DD3FC',
    fontWeight: '500',
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
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.25)',
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
  typeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
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
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
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
    marginTop: 24,
    marginBottom: 20,
    gap: 8,
  },
});
