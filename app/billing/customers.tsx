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
  User,
  Wallet,
} from 'lucide-react-native';
import { getUserFriendlyErrorMessage } from '@/constants/errorMessageMap';

export default function CustomersMasterScreen() {
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
      <View style={[s.container, { paddingBottom: insets.bottom }]}>
        {/* Top Header */}
        <View style={s.topBar}>
          <Text style={[s.screenSubtitle, { color: colors.textSecondary }]}>
            Customer identity & billing details
          </Text>
        </View>

        {/* Search Bar */}
        <View style={[s.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Search size={18} color={colors.textSecondary} />
          <TextInput
            style={[s.searchInput, { color: colors.text }]}
            placeholder="Search customer by name, mobile, or GSTIN..."
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
                : 'Tap "+ Add Customer" below to register your first customer.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredCustomers}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 96 }}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#059669" />
            }
            renderItem={({ item }) => {
              const bal = balances[item.id] || 0;
              const isReceivable = bal > 0;
              const isAdvance = bal < 0;
              const initial = item.name ? item.name.trim().charAt(0).toUpperCase() : 'C';

              return (
                <GlassCard style={s.customerCard}>
                  {/* Top Header with Avatar, Name & Contact Inline */}
                  <View style={s.cardHeader}>
                    <View style={[s.avatarContainer, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '30' }]}>
                      <Text style={[s.avatarText, { color: colors.primary }]}>{initial}</Text>
                    </View>

                    <View style={s.headerDetails}>
                      <View style={s.nameBadgeRow}>
                        <Text style={[s.cardCustomerName, { color: colors.vjText }]}>
                          {item.name}
                        </Text>
                        {item.mobile ? (
                          <View style={s.inlineContact}>
                            <Phone size={11} color={colors.textSecondary} />
                            <Text style={[s.metaText, { color: colors.textSecondary }]}>{item.mobile}</Text>
                          </View>
                        ) : null}
                        {item.gstin ? (
                          <View style={s.b2bTag}>
                            <Building2 size={10} color="#0284C7" />
                            <Text style={s.b2bText}>B2B</Text>
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

                  {/* Tax & Verification Badges */}
                  {(item.gstin || item.panNumber || item.aadhaarNumber) ? (
                    <View style={s.taxTagsRow}>
                      {item.gstin ? (
                        <View style={[s.taxTag, { backgroundColor: '#0284C712', borderColor: '#0284C728' }]}>
                          <Building2 size={11} color="#0284C7" />
                          <Text style={[s.taxTagText, { color: '#0284C7' }]}>GST: {item.gstin}</Text>
                        </View>
                      ) : null}
                      {item.panNumber ? (
                        <View style={[s.taxTag, { backgroundColor: colors.border + '35', borderColor: colors.border }]}>
                          <FileText size={11} color={colors.textSecondary} />
                          <Text style={[s.taxTagText, { color: colors.textSecondary }]}>PAN: {item.panNumber}</Text>
                        </View>
                      ) : null}
                      {item.aadhaarNumber ? (
                        <View style={[s.taxTag, { backgroundColor: colors.border + '35', borderColor: colors.border }]}>
                          <ShieldCheck size={11} color={colors.textSecondary} />
                          <Text style={[s.taxTagText, { color: colors.textSecondary }]}>Aadhaar: {item.aadhaarNumber}</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  {/* Dedicated Balance Banner */}
                  <View style={[s.balanceBanner, { backgroundColor: colors.background + '80', borderColor: colors.border }]}>
                    <View style={s.balanceColLeft}>
                      <View style={s.balanceTitleRow}>
                        <Wallet size={13} color={colors.textSecondary} />
                        <Text style={[s.balanceLabel, { color: colors.textSecondary }]}>Ledger Balance</Text>
                      </View>
                      <Text
                        style={[
                          s.balanceValue,
                          {
                            color: isReceivable ? '#EF4444' : isAdvance ? '#10B981' : colors.text,
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
                          backgroundColor: isReceivable
                            ? 'rgba(239, 68, 68, 0.12)'
                            : isAdvance
                            ? 'rgba(16, 185, 129, 0.12)'
                            : colors.border + '50',
                          borderColor: isReceivable
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
                            color: isReceivable ? '#EF4444' : isAdvance ? '#10B981' : colors.textSecondary,
                          },
                        ]}
                      >
                        {isReceivable ? 'Receivable (Due)' : isAdvance ? 'Advance Credit' : 'All Settled'}
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
                            partyType: 'CUSTOMER',
                            partyId: item.id,
                          },
                        });
                      }}
                      activeOpacity={0.8}
                    >
                      <CreditCard size={14} color="#10B981" />
                      <Text style={s.actionBtnPaymentText}>Record Payment</Text>
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
                          handleSoftDelete(item);
                        }}
                        activeOpacity={0.8}
                      >
                        <Trash2 size={15} color="#EF4444" />
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
            <Text style={fixedBarStyles.pillPrimaryText}>Add Customer</Text>
          </TouchableOpacity>
        </FixedGlassBar>

        {/* Add / Edit Customer Modal */}
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
                    {editingCustomer ? 'Edit Customer' : 'New Customer'}
                  </Text>
                  <Text style={[s.modalSubtitle, { color: colors.textSecondary }]}>
                    Customer identity & billing details
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
                  <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Customer Name *</Text>
                  <TextInput
                    style={[s.inputBox, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g. Ramesh Jewellers / Suresh Patil"
                    placeholderTextColor={colors.textSecondary}
                    autoFocus
                  />
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
                  <Text style={[s.inputLabel, { color: colors.textSecondary }]}>GSTIN (Optional — for B2B buyers)</Text>
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
                  <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Billing Address (Optional)</Text>
                  <TextInput
                    style={[s.inputBox, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, height: 60 }]}
                    value={address}
                    onChangeText={setAddress}
                    placeholder="Shop No., Street, City, State, PIN"
                    placeholderTextColor={colors.textSecondary}
                    multiline
                  />
                </View>

                {/* Identity & URD Documents */}
                <Text style={[s.sectionHeading, { color: colors.primary }]}>Identity & URD Documents (Optional)</Text>

                <View style={s.inputGroup}>
                  <Text style={[s.inputLabel, { color: colors.textSecondary }]}>PAN Number (Optional — for URD pre-fill)</Text>
                  <TextInput
                    style={[s.inputBox, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                    value={panNumber}
                    onChangeText={(t) => setPanNumber(t.toUpperCase())}
                    placeholder="e.g. ABCDE1234F"
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="characters"
                  />
                </View>

                <View style={s.inputGroup}>
                  <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Aadhaar Number (Optional — for URD pre-fill)</Text>
                  <TextInput
                    style={[s.inputBox, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                    value={aadhaarNumber}
                    onChangeText={setAadhaarNumber}
                    placeholder="12-digit Aadhaar number"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="number-pad"
                    maxLength={12}
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
                  onPress={handleSaveCustomer}
                  style={[s.saveBtn, { backgroundColor: colors.primary }]}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={s.saveBtnText}>{editingCustomer ? 'Update' : 'Save Customer'}</Text>
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
  customerCard: {
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
  cardCustomerName: {
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
  taxTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
    marginTop: 2,
  },
  taxTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  taxTagText: {
    fontSize: 10.5,
    fontWeight: '600',
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
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.28)',
  },
  actionBtnPaymentText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
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
