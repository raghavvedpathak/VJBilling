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
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { GlassCard, GlassButton, HeaderPill } from '@/components/ui/Glass';
import { FixedGlassBar, fixedBarStyles } from '@/components/ui/FixedGlassBar';
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
  Wallet,
} from 'lucide-react-native';
import { getUserFriendlyErrorMessage } from '@/constants/errorMessageMap';

export default function SuppliersMasterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768 || Math.min(width, height) >= 600;
  const { activeFirmId } = useFirmStore();
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const rawColors = getThemeColors(activeTheme);
  const colors = {
    ...rawColors,
    surface: '#FFFFFF',
    text: rawColors.vjText,
    textSecondary: '#64748B',
    background: rawColors.vjBg,
    primary: rawColors.vjAccent,
  };

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
      <View style={[s.container, { paddingBottom: insets.bottom }]}>
        {/* Top Header */}
        <View style={s.topBar}>
          <Text style={[s.screenSubtitle, { color: colors.textSecondary }]}>
            Purchase vendors & refinery houses
          </Text>
        </View>

        {/* Search Bar */}
        <View style={[s.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Search size={18} color={colors.textSecondary} />
          <TextInput
            style={[s.searchInput, { color: colors.text }]}
            placeholder="Search supplier by name, mobile, or GSTIN..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
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
                style={[
                  s.tabItem,
                  {
                    backgroundColor: active ? `${colors.primary}18` : colors.surface,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setSelectedTypeTab(tab)}
              >
                <Text
                  style={[
                    s.tabText,
                    {
                      color: active ? colors.primary : colors.textSecondary,
                      fontWeight: active ? '700' : '600',
                    },
                  ]}
                >
                  {label}
                </Text>
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
                : 'Tap "+ Add Supplier" below to manage your procurements.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredSuppliers}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 96 }}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#059669" />
            }
            renderItem={({ item }) => {
              const badge = getTypeBadgeStyle(item.type);
              const bal = balances[item.id] || 0;
              const isPayable = bal > 0;
              const isAdvance = bal < 0;
              const initial = item.name ? item.name.trim().charAt(0).toUpperCase() : 'S';

              return (
                <GlassCard style={s.supplierCard}>
                  {/* Top Header with Avatar, Name & Contact Inline */}
                  <View style={s.cardHeader}>
                    <View style={[s.avatarContainer, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '30' }]}>
                      <Text style={[s.avatarText, { color: colors.primary }]}>{initial}</Text>
                    </View>

                    <View style={s.headerDetails}>
                      <View style={s.nameBadgeRow}>
                        <Text style={[s.cardSupplierName, { color: colors.vjText }]}>
                          {item.name}
                        </Text>
                        {item.mobile ? (
                          <View style={s.inlineContact}>
                            <Phone size={11} color={colors.textSecondary} />
                            <Text style={[s.metaText, { color: colors.textSecondary }]}>{item.mobile}</Text>
                          </View>
                        ) : null}
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

                      {item.address ? (
                        <View style={s.addressRow}>
                          <MapPin size={11} color={colors.textSecondary} />
                          <Text style={[s.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
                            {item.address}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  {/* Bank Details Banner if present */}
                  {item.bankAccount ? (
                    <View style={[s.bankBox, { backgroundColor: colors.background + '80', borderColor: colors.border }]}>
                      <Landmark size={12} color="#0284C7" style={{ marginRight: 6 }} />
                      <Text style={[s.bankText, { color: colors.textSecondary }]}>
                        {item.bankName ? `${item.bankName} • ` : ''}A/C: {item.bankAccount}
                        {item.ifsc ? ` (${item.ifsc})` : ''}
                      </Text>
                    </View>
                  ) : null}

                  {/* Dedicated Balance Banner */}
                  <View style={[s.balanceBanner, { backgroundColor: colors.background + '80', borderColor: colors.border }]}>
                    <View style={s.balanceColLeft}>
                      <View style={s.balanceTitleRow}>
                        <Wallet size={13} color={colors.textSecondary} />
                        <Text style={[s.balanceLabel, { color: colors.textSecondary }]}>Account Balance</Text>
                      </View>
                      <Text
                        style={[
                          s.balanceValue,
                          {
                            color: isPayable ? '#EF4444' : isAdvance ? '#10B981' : colors.text,
                          },
                        ]}
                      >
                        {formatRupees(Math.abs(bal))}
                      </Text>
                    </View>

                    <View
                      style={[
                        s.balanceStatusPill,
                        {
                          backgroundColor: isPayable
                            ? 'rgba(239, 68, 68, 0.12)'
                            : isAdvance
                            ? 'rgba(16, 185, 129, 0.12)'
                            : colors.border + '50',
                          borderColor: isPayable
                            ? 'rgba(239, 68, 68, 0.25)'
                            : isAdvance
                            ? 'rgba(16, 185, 129, 0.25)'
                            : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          s.balanceStatusText,
                          {
                            color: isPayable ? '#EF4444' : isAdvance ? '#10B981' : colors.textSecondary,
                          },
                        ]}
                      >
                        {isPayable ? 'Payable (Debt)' : isAdvance ? 'Advance Given' : 'All Settled'}
                      </Text>
                    </View>
                  </View>

                  {/* Actions Row */}
                  <View style={[s.cardActions, { borderTopColor: colors.border }]}>
                    <TouchableOpacity
                      style={s.actionBtnPayment}
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
                      activeOpacity={0.8}
                    >
                      <CreditCard size={14} color="#D97706" />
                      <Text style={s.actionBtnPaymentText}>Pay Supplier</Text>
                    </TouchableOpacity>

                    <View style={s.rightActions}>
                      <TouchableOpacity
                        style={[s.iconBtn, { backgroundColor: colors.border + '60' }]}
                        onPress={() => {
                          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                          handleOpenEditModal(item);
                        }}
                        activeOpacity={0.8}
                      >
                        <Edit2 size={15} color={colors.text} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[s.iconBtn, { backgroundColor: '#EF444415' }]}
                        onPress={() => {
                          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                          handleArchive(item);
                        }}
                        activeOpacity={0.8}
                      >
                        <Archive size={15} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </GlassCard>
              );
            }}
          />
        )}

        {/* Floating Bottom Action Bar */}
        <FixedGlassBar>
          <TouchableOpacity
            style={fixedBarStyles.pillPrimaryBtn}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              handleOpenAddModal();
            }}
            activeOpacity={0.85}
          >
            <UserPlus size={18} color="#FFFFFF" />
            <Text style={fixedBarStyles.pillPrimaryText}>Add Supplier</Text>
          </TouchableOpacity>
        </FixedGlassBar>

        {/* Add / Edit Supplier Modal */}
        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[
              s.modalOverlay,
              isTablet && { justifyContent: 'center', alignItems: 'center', padding: 24 },
            ]}
          >
            <View
              style={[
                s.modalCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  width: '100%',
                  maxWidth: isTablet ? 600 : undefined,
                  borderRadius: isTablet ? 24 : 0,
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  borderBottomLeftRadius: isTablet ? 24 : 0,
                  borderBottomRightRadius: isTablet ? 24 : 0,
                  maxHeight: isTablet ? '85%' : '90%',
                },
              ]}
            >
              <View style={s.modalHeader}>
                <View>
                  <Text style={[s.modalTitle, { color: colors.text }]}>
                    {editingSupplier ? 'Edit Supplier' : 'New Supplier'}
                  </Text>
                  <Text style={[s.modalSubtitle, { color: colors.textSecondary }]}>
                    Purchase vendor & refinery details
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  style={[s.closeBtn, { backgroundColor: colors.border }]}
                >
                  <X size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
                {duplicateWarning && (
                  <View style={[s.warningBox, { backgroundColor: 'rgba(245, 158, 11, 0.12)', borderColor: 'rgba(245, 158, 11, 0.3)' }]}>
                    <AlertCircle size={16} color="#F59E0B" style={{ marginRight: 8 }} />
                    <Text style={[s.warningText, { color: '#F59E0B' }]}>{duplicateWarning}</Text>
                  </View>
                )}

                <View style={s.inputGroup}>
                  <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Party Name *</Text>
                  <TextInput
                    style={[s.inputBox, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g. MMTC-PAMP India Pvt Ltd"
                    placeholderTextColor={colors.textSecondary}
                    autoFocus
                  />
                </View>

                <View style={s.inputGroup}>
                  <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Party Category *</Text>
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
                          style={[
                            s.typeOption,
                            {
                              backgroundColor: selected ? `${colors.primary}20` : colors.background,
                              borderColor: selected ? colors.primary : colors.border,
                            },
                          ]}
                          onPress={() => setType(t.id as SupplierType)}
                        >
                          <Text
                            style={[
                              s.typeOptionText,
                              { color: selected ? colors.primary : colors.textSecondary },
                            ]}
                          >
                            {t.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={s.inputGroup}>
                  <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Mobile Number (Soft-unique)</Text>
                  <TextInput
                    style={[s.inputBox, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                    value={mobile}
                    onChangeText={handleMobileChange}
                    placeholder="10-digit mobile"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="phone-pad"
                    maxLength={10}
                  />
                </View>

                <View style={s.inputGroup}>
                  <Text style={[s.inputLabel, { color: colors.textSecondary }]}>GSTIN (Optional)</Text>
                  <TextInput
                    style={[s.inputBox, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                    value={gstin}
                    onChangeText={(t) => setGstin(t.toUpperCase())}
                    placeholder="e.g. 27AAPFU0939F1ZV"
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="characters"
                  />
                </View>

                <View style={s.inputGroup}>
                  <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Address (Optional)</Text>
                  <TextInput
                    style={[s.inputBox, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, height: 60 }]}
                    value={address}
                    onChangeText={setAddress}
                    placeholder="Street, City, State..."
                    placeholderTextColor={colors.textSecondary}
                    multiline
                  />
                </View>

                {/* Bank Details Section */}
                <Text style={[s.sectionHeading, { color: colors.primary }]}>Bank Details for Payments (Optional)</Text>

                <View style={s.inputGroup}>
                  <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Bank Name</Text>
                  <TextInput
                    style={[s.inputBox, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                    value={bankName}
                    onChangeText={setBankName}
                    placeholder="e.g. HDFC Bank"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>

                <View style={s.inputGroup}>
                  <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Account Number</Text>
                  <TextInput
                    style={[s.inputBox, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                    value={bankAccount}
                    onChangeText={setBankAccount}
                    placeholder="Account Number"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="numeric"
                  />
                </View>

                <View style={s.inputGroup}>
                  <Text style={[s.inputLabel, { color: colors.textSecondary }]}>IFSC Code</Text>
                  <TextInput
                    style={[s.inputBox, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                    value={ifsc}
                    onChangeText={(t) => setIfsc(t.toUpperCase())}
                    placeholder="e.g. HDFC0001234"
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="characters"
                  />
                </View>
              </ScrollView>

              <View
                style={[
                  s.modalFooter,
                  {
                    borderTopColor: colors.border,
                    paddingBottom: isTablet ? 16 : Math.max(insets.bottom, 16),
                  },
                ]}
              >
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  style={[s.cancelBtn, { borderColor: colors.border }]}
                  disabled={isSubmitting}
                >
                  <Text style={[s.cancelBtnText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSaveSupplier}
                  style={[s.saveBtn, { backgroundColor: colors.primary }]}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={s.saveBtnText}>{editingSupplier ? 'Update' : 'Save Supplier'}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
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
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  topBar: {
    marginBottom: 10,
    marginTop: 8,
  },
  screenSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
  },
  tabBar: {
    flexDirection: 'row',
    marginBottom: 10,
    gap: 8,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  tabText: {
    fontSize: 12,
    textAlign: 'center',
  },
  countRow: {
    paddingVertical: 6,
    marginBottom: 8,
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
  supplierCard: {
    padding: 13,
    borderRadius: 16,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  avatarContainer: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
  },
  headerDetails: {
    flex: 1,
  },
  nameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  cardSupplierName: {
    fontSize: 15,
    fontWeight: '700',
  },
  inlineContact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(100, 116, 139, 0.08)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
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
    color: '#0284C7',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  metaText: {
    fontSize: 12,
    fontWeight: '500',
  },
  bankBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  bankText: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  balanceBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 11,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  balanceColLeft: {
    flex: 1,
  },
  balanceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  balanceLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  balanceValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  balanceStatusPill: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 7,
    borderWidth: 1,
  },
  balanceStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
  },
  actionBtnPayment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
    borderColor: 'rgba(217, 119, 6, 0.28)',
  },
  actionBtnPaymentText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D97706',
  },
  rightActions: {
    flexDirection: 'row',
    gap: 7,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  typeOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  typeOptionText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  inputBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
    fontSize: 14,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
  },
});
