// app/billing/karigars.tsx — Phase 3 Karigar Master Screen
// Implements STEP 3 (Job work party, Dual Ledger: Metal fine mg + Money labour paise)
// Metal-to-money settlement (v4.7), Cross-FY lifetime carryforward (v5.17 FIX-KARIGAR-CROSSFY-1)

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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { GlassCard, GlassButton, HeaderPill } from '@/components/ui/Glass';
import { FixedGlassBar, fixedBarStyles } from '@/components/ui/FixedGlassBar';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { karigarMasterService } from '@/services/phase3/karigarMasterService';
import { Karigar, KarigarBalanceSummary } from '@/types/phase3/phase3.types';
import { getThemeColors } from '@/constants/theme';
import { SettleMetalModal } from '@/components/phase3/SettleMetalModal';
import { getUserFriendlyErrorMessage } from '@/constants/errorMessageMap';
import { getCurrencySymbol } from '@/utils/currency';
import {
  Hammer,
  Search,
  UserPlus,
  Phone,
  MapPin,
  Landmark,
  CreditCard,
  Edit2,
  Archive,
  X,
  Scale,
  Coins,
  Sparkles,
  ArrowRightLeft,
  ShieldCheck,
} from 'lucide-react-native';

export default function KarigarsMasterScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768 || Math.min(width, height) >= 600;
  const currencySymbol = getCurrencySymbol();
  const { activeFirmId } = useFirmStore();
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const rawColors = getThemeColors(activeTheme);
  const colors = {
    surface: '#FFFFFF',
    text: rawColors.vjText,
    textSecondary: '#64748B',
    background: rawColors.vjBg,
    primary: rawColors.vjAccent,
    border: rawColors.border,
    vjText: rawColors.vjText,
    vjBg: rawColors.vjBg,
    vjAccent: rawColors.vjAccent,
  };

  const [karigarsList, setKarigarsList] = useState<Karigar[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [balances, setBalances] = useState<Record<string, KarigarBalanceSummary>>({});

  // Add / Edit Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [editingKarigar, setEditingKarigar] = useState<Karigar | null>(null);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [address, setAddress] = useState('');
  const [speciality, setSpeciality] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Settlement Modal States
  const [settleModalVisible, setSettleModalVisible] = useState(false);
  const [settlingKarigar, setSettlingKarigar] = useState<Karigar | null>(null);

  const loadKarigars = useCallback(async () => {
    if (!activeFirmId) return;
    setIsLoading(true);
    try {
      const data = await karigarMasterService.listKarigars(activeFirmId);
      setKarigarsList(data);

      // Async load dual balances for all karigars
      const balMap: Record<string, KarigarBalanceSummary> = {};
      for (const k of data) {
        try {
          const bal = await karigarMasterService.getKarigarBalances(activeFirmId, k.id);
          balMap[k.id] = bal;
        } catch {
          balMap[k.id] = { metalBalanceMg: 0, moneyBalancePaise: 0 };
        }
      }
      setBalances(balMap);
    } catch (err: any) {
      Alert.alert('Load Failed', getUserFriendlyErrorMessage(err?.message));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeFirmId]);

  useEffect(() => {
    loadKarigars();
  }, [loadKarigars]);

  // SEARCH-P3 (v5.5): Typeahead search
  useEffect(() => {
    if (!activeFirmId) return;
    const trimmed = searchQuery.trim();
    if (trimmed.length >= 2) {
      karigarMasterService.searchKarigars(activeFirmId, trimmed).then((res) => {
        setKarigarsList(res);
      });
    } else if (trimmed.length === 0) {
      loadKarigars();
    }
  }, [searchQuery, activeFirmId, loadKarigars]);

  const openAddModal = () => {
    setEditingKarigar(null);
    setName('');
    setMobile('');
    setAddress('');
    setSpeciality('');
    setBankName('');
    setBankAccount('');
    setIfsc('');
    setModalVisible(true);
  };

  const openEditModal = (k: Karigar) => {
    setEditingKarigar(k);
    setName(k.name);
    setMobile(k.mobile || '');
    setAddress(k.address || '');
    setSpeciality(k.speciality || '');
    setBankName(k.bankName || '');
    setBankAccount(k.bankAccount || '');
    setIfsc(k.ifsc || '');
    setModalVisible(true);
  };

  const openSettleModal = (k: Karigar) => {
    setSettlingKarigar(k);
    setSettleModalVisible(true);
  };

  const handleSave = async () => {
    if (!activeFirmId) return;
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Karigar name is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingKarigar) {
        await karigarMasterService.updateKarigar(activeFirmId, editingKarigar.id, {
          name: name.trim(),
          mobile: mobile.trim() || null,
          address: address.trim() || null,
          speciality: speciality.trim() || null,
          bankName: bankName.trim() || null,
          bankAccount: bankAccount.trim() || null,
          ifsc: ifsc.trim().toUpperCase() || null,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Updated', 'Karigar details updated successfully.');
      } else {
        await karigarMasterService.createKarigar({
          firmId: activeFirmId,
          name: name.trim(),
          mobile: mobile.trim() || undefined,
          address: address.trim() || undefined,
          speciality: speciality.trim() || undefined,
          bankName: bankName.trim() || undefined,
          bankAccount: bankAccount.trim() || undefined,
          ifsc: ifsc.trim().toUpperCase() || undefined,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Created', 'New Karigar added successfully.');
      }
      setModalVisible(false);
      loadKarigars();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Save Failed', getUserFriendlyErrorMessage(err?.message));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchive = (k: Karigar) => {
    if (!activeFirmId) return;
    Alert.alert(
      'Archive Karigar',
      `Are you sure you want to archive "${k.name}"? This party will be hidden from new job-work orders.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await karigarMasterService.archiveKarigar(activeFirmId, k.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              loadKarigars();
            } catch (err: any) {
              Alert.alert('Archive Failed', getUserFriendlyErrorMessage(err?.message));
            }
          },
        },
      ]
    );
  };

  const renderKarigarItem = ({ item }: { item: Karigar }) => {
    const bal = balances[item.id] || { metalBalanceMg: 0, moneyBalancePaise: 0 };
    const fineGrams = (bal.metalBalanceMg / 1000).toFixed(3);
    const moneyRupees = (bal.moneyBalancePaise / 100).toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
    const hasMetalOutstanding = bal.metalBalanceMg > 0;

    return (
      <GlassCard style={styles.karigarCard}>
        {/* Top Info */}
        <View style={styles.cardHeader}>
          <View style={[styles.avatarContainer, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '30' }]}>
            <Hammer size={18} color={colors.primary} />
          </View>
          <View style={styles.headerDetails}>
            <View style={styles.titleRow}>
              <Text style={[styles.karigarName, { color: colors.text }]}>{item.name}</Text>
              {item.mobile && (
                <View style={styles.inlineContact}>
                  <Phone size={11} color={colors.textSecondary} />
                  <Text style={[styles.metaText, { color: colors.textSecondary }]}>{item.mobile}</Text>
                </View>
              )}
              {item.speciality && (
                <View style={[styles.badge, { backgroundColor: colors.primary + '20' }]}>
                  <Sparkles size={11} color={colors.primary} style={{ marginRight: 3 }} />
                  <Text style={[styles.badgeText, { color: colors.primary }]}>{item.speciality}</Text>
                </View>
              )}
            </View>

            {item.address && (
              <View style={styles.addressRow}>
                <MapPin size={11} color={colors.textSecondary} />
                <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item.address}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Dual Ledger Balance Display */}
        <View style={[styles.balanceContainer, { backgroundColor: colors.background + '80', borderColor: colors.border }]}>
          {/* Metal Balance */}
          <View style={styles.balanceCol}>
            <View style={styles.balanceTitleRow}>
              <Scale size={14} color="#F59E0B" />
              <Text style={styles.balanceLabel}>Metal Outstanding</Text>
            </View>
            <Text style={[styles.metalValue, { color: hasMetalOutstanding ? '#D97706' : colors.text }]}>
              {fineGrams} g Fine
            </Text>
          </View>

          <View style={[styles.balanceDivider, { backgroundColor: colors.border }]} />

          {/* Money Balance */}
          <View style={styles.balanceCol}>
            <View style={styles.balanceTitleRow}>
              <Coins size={14} color="#10B981" />
              <Text style={styles.balanceLabel}>Labour Payable</Text>
            </View>
            <Text style={[styles.moneyValue, { color: bal.moneyBalancePaise > 0 ? '#059669' : colors.text }]}>
              {currencySymbol} {moneyRupees}
            </Text>
          </View>
        </View>

        {/* Bank info footer if present */}
        {item.bankName && (
          <View style={styles.bankFooter}>
            <Landmark size={12} color={colors.textSecondary} />
            <Text style={[styles.bankText, { color: colors.textSecondary }]}>
              {item.bankName} {item.bankAccount ? `• A/C: ${item.bankAccount}` : ''} {item.ifsc ? `• IFSC: ${item.ifsc}` : ''}
            </Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
          {/* Settle Metal Button (v4.7) */}
          <TouchableOpacity
            style={[
              styles.settleBtn,
              {
                backgroundColor: hasMetalOutstanding ? 'rgba(245, 158, 11, 0.14)' : colors.border + '25',
                borderColor: hasMetalOutstanding ? 'rgba(245, 158, 11, 0.35)' : colors.border + '50',
              },
            ]}
            disabled={!hasMetalOutstanding}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              openSettleModal(item);
            }}
            activeOpacity={0.8}
          >
            <ArrowRightLeft size={13} color={hasMetalOutstanding ? '#D97706' : colors.textSecondary} />
            <Text
              style={[
                styles.settleBtnText,
                { color: hasMetalOutstanding ? '#D97706' : colors.textSecondary },
              ]}
            >
              Settle Metal
            </Text>
          </TouchableOpacity>

          <View style={styles.rightActions}>
            <TouchableOpacity
              onPress={() => openEditModal(item)}
              style={[styles.iconBtn, { backgroundColor: colors.border + '60' }]}
            >
              <Edit2 size={15} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleArchive(item)}
              style={[styles.iconBtn, { backgroundColor: '#EF444415' }]}
            >
              <Archive size={15} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>
      </GlassCard>
    );
  };

  const headerPills = (
    <View style={styles.headerPillsContainer}>
      <HeaderPill label="Karigar Master" icon={<Hammer size={12} color={colors.vjBg} />} />
      <HeaderPill label="Firm Scoped" icon={<ShieldCheck size={12} color="#4ADE80" />} variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Karigars" showBack headerContent={headerPills}>
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        {/* Top Header */}
        <View style={styles.topBar}>
          <Text style={[styles.screenSubtitle, { color: colors.textSecondary }]}>
            Job work parties • Metal & Labour Dual Ledger
          </Text>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Search size={18} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search karigar by name or mobile..."
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

        {/* Karigars List */}
        {isLoading && !isRefreshing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Loading karigars & balances...
            </Text>
          </View>
        ) : (
          <FlatList
            data={karigarsList}
            keyExtractor={(item) => item.id}
            renderItem={renderKarigarItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => {
                  setIsRefreshing(true);
                  loadKarigars();
                }}
                tintColor={colors.primary}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Hammer size={48} color={colors.textSecondary} style={{ opacity: 0.5, marginBottom: 12 }} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No Karigars Found</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  {searchQuery ? 'No party matches your search query.' : 'Tap "+ Add Karigar" below to add your first artisan.'}
                </Text>
              </View>
            }
          />
        )}

        {/* Floating Bottom Action Bar */}
        <FixedGlassBar>
          <TouchableOpacity
            style={fixedBarStyles.pillPrimaryBtn}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              openAddModal();
            }}
            activeOpacity={0.85}
          >
            <UserPlus size={18} color="#FFFFFF" />
            <Text style={fixedBarStyles.pillPrimaryText}>Add Karigar</Text>
          </TouchableOpacity>
        </FixedGlassBar>

        {/* Settle Metal Modal */}
        <SettleMetalModal
          visible={settleModalVisible}
          onClose={() => setSettleModalVisible(false)}
          karigar={settlingKarigar}
          currentMetalBalanceMg={settlingKarigar ? balances[settlingKarigar.id]?.metalBalanceMg || 0 : 0}
          onSuccess={loadKarigars}
        />

        {/* Create / Edit Modal */}
        <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[
              styles.modalOverlay,
              isTablet && { justifyContent: 'center', alignItems: 'center', padding: 24 },
            ]}
          >
            <View
              style={[
                styles.modalCard,
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
              <View style={styles.modalHeader}>
                <View>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>
                    {editingKarigar ? 'Edit Karigar' : 'New Karigar'}
                  </Text>
                  <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                    Independent job work party details
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  style={[styles.closeBtn, { backgroundColor: colors.border }]}
                >
                  <X size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Party Name *</Text>
                  <TextInput
                    style={[styles.inputBox, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                    placeholder="e.g. Ramesh Soni"
                    placeholderTextColor={colors.textSecondary}
                    value={name}
                    onChangeText={setName}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Mobile Number</Text>
                  <TextInput
                    style={[styles.inputBox, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                    placeholder="10-digit mobile number"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="phone-pad"
                    maxLength={10}
                    value={mobile}
                    onChangeText={setMobile}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Speciality</Text>
                  <TextInput
                    style={[styles.inputBox, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                    placeholder="e.g. Gold Chains, Rings, Bangles, Stone Setting"
                    placeholderTextColor={colors.textSecondary}
                    value={speciality}
                    onChangeText={setSpeciality}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Workshop / Address</Text>
                  <TextInput
                    style={[styles.inputBox, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, height: 60 }]}
                    placeholder="Workshop address or location..."
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    value={address}
                    onChangeText={setAddress}
                  />
                </View>

                {/* Bank Details Section */}
                <Text style={[styles.sectionHeading, { color: colors.primary }]}>Bank Account (For Labour Payments)</Text>

                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Bank Name</Text>
                  <TextInput
                    style={[styles.inputBox, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                    placeholder="e.g. State Bank of India"
                    placeholderTextColor={colors.textSecondary}
                    value={bankName}
                    onChangeText={setBankName}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Account Number</Text>
                  <TextInput
                    style={[styles.inputBox, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                    placeholder="Account number"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="numeric"
                    value={bankAccount}
                    onChangeText={setBankAccount}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>IFSC Code</Text>
                  <TextInput
                    style={[styles.inputBox, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                    placeholder="e.g. SBIN0001234"
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="characters"
                    value={ifsc}
                    onChangeText={setIfsc}
                  />
                </View>
              </ScrollView>

              <View
                style={[
                  styles.modalFooter,
                  {
                    borderTopColor: colors.border,
                    paddingBottom: isTablet ? 16 : Math.max(insets.bottom, 16),
                  },
                ]}
              >
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  style={[styles.cancelBtn, { borderColor: colors.border }]}
                  disabled={isSubmitting}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSave}
                  style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.saveBtnText}>{editingKarigar ? 'Update' : 'Save Karigar'}</Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  headerPillsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
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
  listContent: {
    paddingBottom: 96,
  },
  karigarCard: {
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
  headerDetails: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  karigarName: {
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
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: '600',
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
  balanceContainer: {
    flexDirection: 'row',
    borderRadius: 11,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  balanceCol: {
    flex: 1,
  },
  balanceDivider: {
    width: 1,
    marginHorizontal: 10,
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
    color: '#6B7280',
  },
  metalValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  moneyValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  bankFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  bankText: {
    fontSize: 11,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
  },
  settleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  settleBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  rightActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 40,
  },
  loadingText: {
    fontSize: 13,
    marginTop: 10,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 13,
    marginTop: 4,
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
    paddingVertical: 16,
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
});
