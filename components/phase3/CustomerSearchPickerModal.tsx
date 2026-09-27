// components/phase3/CustomerSearchPickerModal.tsx — Phase 3 Customer Search & Picker Modal
// Implements SEARCH-P3 (v5.5) and STEP 1 Customer Master
// Modernized with Dynamic Themes, 1-Tap Counter Walk-in, Monogram Avatars & Instant Search

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { GlassButton } from '@/components/ui/Glass';
import { customerService } from '@/services/phase3/customerService';
import { Customer } from '@/types/phase3/phase3.types';
import {
  Search,
  UserPlus,
  X,
  User,
  Phone,
  MapPin,
  Building2,
  CheckCircle2,
  Zap,
  Users,
  ChevronRight,
  Sparkles,
  ArrowLeft,
  Check,
} from 'lucide-react-native';
import { getUserFriendlyErrorMessage } from '@/constants/errorMessageMap';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { getThemeColors } from '@/constants/theme';

export interface CustomerSearchPickerModalProps {
  visible: boolean;
  firmId: string;
  onClose: () => void;
  onSelectCustomer: (customer: Customer) => void;
}

// Deterministic monogram palette generator
const AVATAR_PALETTES = [
  { bg: 'rgba(5, 150, 105, 0.15)', text: '#059669', border: 'rgba(5, 150, 105, 0.3)' },
  { bg: 'rgba(217, 119, 6, 0.15)', text: '#D97706', border: 'rgba(217, 119, 6, 0.3)' },
  { bg: 'rgba(37, 99, 235, 0.15)', text: '#2563EB', border: 'rgba(37, 99, 235, 0.3)' },
  { bg: 'rgba(124, 58, 237, 0.15)', text: '#7C3AED', border: 'rgba(124, 58, 237, 0.3)' },
  { bg: 'rgba(219, 39, 119, 0.15)', text: '#DB2777', border: 'rgba(219, 39, 119, 0.3)' },
  { bg: 'rgba(8, 145, 178, 0.15)', text: '#0891B2', border: 'rgba(8, 145, 178, 0.3)' },
];

function getMonogram(name: string): string {
  if (!name) return 'C';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

function getAvatarPalette(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[idx];
}

export function CustomerSearchPickerModal({
  visible,
  firmId,
  onClose,
  onSelectCustomer,
}: CustomerSearchPickerModalProps) {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768 || Math.min(width, height) >= 600;

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const isDark = activeTheme === 'dark';
  const rawColors = getThemeColors(activeTheme);
  const colors = {
    ...rawColors,
    primary: rawColors.vjAccent,
    surface: isDark ? '#0F172A' : '#FFFFFF',
    surfaceCard: isDark ? 'rgba(30, 41, 59, 0.65)' : '#F8FAFC',
    border: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
    text: rawColors.vjText,
    textSecondary: isDark ? 'rgba(255, 255, 255, 0.65)' : '#64748B',
    inputBg: isDark ? 'rgba(30, 41, 59, 0.8)' : '#F1F5F9',
  };

  const [query, setQuery] = useState('');
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  // Quick Add Form States
  const [newName, setNewName] = useState('');
  const [newMobile, setNewMobile] = useState('');
  const [newGstin, setNewGstin] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load all firm customers on modal open
  const loadCustomers = useCallback(async () => {
    if (!firmId) return;
    setIsLoadingCustomers(true);
    try {
      const data = await customerService.listCustomers(firmId);
      setAllCustomers(data);
    } catch (err: any) {
      console.warn('[CustomerSearchPicker] Failed to load customers:', err);
    } finally {
      setIsLoadingCustomers(false);
    }
  }, [firmId]);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setShowQuickAdd(false);
      setNewName('');
      setNewMobile('');
      setNewGstin('');
      setNewAddress('');
      loadCustomers();
    }
  }, [visible, loadCustomers]);

  // Real-time filtered customers
  const filteredCustomers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allCustomers;
    return allCustomers.filter((c) => {
      const nameMatch = c.name?.toLowerCase().includes(q);
      const mobileMatch = c.mobile?.toLowerCase().includes(q);
      const gstinMatch = c.gstin?.toLowerCase().includes(q);
      const addressMatch = c.address?.toLowerCase().includes(q);
      return nameMatch || mobileMatch || gstinMatch || addressMatch;
    });
  }, [allCustomers, query]);

  // Live remote search if query entered
  const handleSearchChange = (text: string) => {
    setQuery(text);
  };

  const handleSelect = (customer: Customer) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onSelectCustomer(customer);
    onClose();
  };

  // 1-Tap Counter Walk-in / Cash Customer Fast Select
  const handleSelectWalkIn = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    const walkIn = allCustomers.find(
      (c) =>
        c.name.toLowerCase() === 'walk-in customer' ||
        c.name.toLowerCase() === 'counter cash' ||
        c.name.toLowerCase() === 'cash customer'
    );

    if (walkIn) {
      handleSelect(walkIn);
      return;
    }

    // Auto-provision standard walk-in customer for this firm
    setIsLoadingCustomers(true);
    try {
      const created = await customerService.createCustomer({
        firmId,
        name: 'Walk-in Customer',
      });
      handleSelect(created);
    } catch (err: any) {
      Alert.alert('Error', getUserFriendlyErrorMessage(err));
    } finally {
      setIsLoadingCustomers(false);
    }
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

  const modalHeight = isTablet ? Math.min(height * 0.82, 700) : Math.min(height * 0.86, 680);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[s.modalOverlay, { justifyContent: isTablet ? 'center' : 'flex-end' }]}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            s.modalCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              width: isTablet ? 620 : '100%',
              height: modalHeight,
              maxHeight: '90%',
              alignSelf: 'center',
              borderBottomLeftRadius: isTablet ? 24 : 0,
              borderBottomRightRadius: isTablet ? 24 : 0,
            },
          ]}
        >
          {/* Top Sheet Drag Indicator (Phone Only) */}
          {!isTablet && <View style={[s.sheetHandle, { backgroundColor: isDark ? '#334155' : '#CBD5E1' }]} />}

          {/* Modal Header */}
          <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
            <View style={s.modalHeaderLeft}>
              <View
                style={[
                  s.headerIconBadge,
                  {
                    backgroundColor: showQuickAdd
                      ? 'rgba(124, 58, 237, 0.12)'
                      : 'rgba(5, 150, 105, 0.12)',
                    borderColor: showQuickAdd
                      ? 'rgba(124, 58, 237, 0.3)'
                      : 'rgba(5, 150, 105, 0.3)',
                  },
                ]}
              >
                {showQuickAdd ? (
                  <UserPlus size={20} color="#7C3AED" />
                ) : (
                  <User size={20} color="#059669" />
                )}
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[s.modalTitle, { color: colors.text }]} numberOfLines={1}>
                    {showQuickAdd ? 'Register New Customer' : 'Select Customer'}
                  </Text>
                  {!showQuickAdd && (
                    <View style={[s.countBadge, { backgroundColor: colors.primary + '18' }]}>
                      <Text style={[s.countBadgeText, { color: colors.primary }]}>
                        {allCustomers.length} Parties
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[s.modalSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                  {showQuickAdd
                    ? 'Enter name, phone and optional GST details'
                    : 'Search existing accounts or select counter walk-in'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={[
                s.closeButton,
                { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9' },
              ]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {!showQuickAdd ? (
            <View style={s.bodyContainer}>
              {/* Search Bar & Add Customer Button Row */}
              <View style={s.searchBarRow}>
                <View
                  style={[
                    s.searchInputContainer,
                    { backgroundColor: colors.inputBg, borderColor: colors.border },
                  ]}
                >
                  <Search size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
                  <TextInput
                    value={query}
                    onChangeText={handleSearchChange}
                    placeholder="Search by name, mobile, GSTIN..."
                    placeholderTextColor={colors.textSecondary}
                    style={[s.searchInput, { color: colors.text }]}
                    autoFocus={false}
                    clearButtonMode="while-editing"
                  />
                  {query.length > 0 && (
                    <TouchableOpacity onPress={() => setQuery('')} style={{ padding: 4 }}>
                      <X size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  )}
                  {isSearching && <ActivityIndicator size="small" color="#059669" />}
                </View>

                <TouchableOpacity
                  style={[s.addNewBtn, { backgroundColor: '#059669' }]}
                  onPress={() => {
                    try {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    } catch {}
                    setShowQuickAdd(true);
                    if (query.trim().length > 0) {
                      setNewName(query.trim());
                    }
                  }}
                >
                  <UserPlus size={16} color="#FFFFFF" />
                  <Text style={s.addNewBtnText}>+ New</Text>
                </TouchableOpacity>
              </View>

              {/* Top Action Tile: 1-Tap Counter Walk-in (Only shown when not deeply filtering) */}
              {query.trim().length === 0 && (
                <TouchableOpacity
                  style={[
                    s.walkInCard,
                    {
                      backgroundColor: isDark ? 'rgba(6, 78, 59, 0.25)' : 'rgba(236, 253, 245, 0.95)',
                      borderColor: isDark ? 'rgba(16, 185, 129, 0.35)' : 'rgba(5, 150, 105, 0.35)',
                    },
                  ]}
                  activeOpacity={0.8}
                  onPress={handleSelectWalkIn}
                >
                  <View style={s.walkInIconBox}>
                    <Zap size={18} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[s.walkInTitle, { color: colors.text }]}>
                        Counter Walk-in / Cash Customer
                      </Text>
                      <View style={s.walkInTag}>
                        <Text style={s.walkInTagText}>FAST BILL</Text>
                      </View>
                    </View>
                    <Text style={[s.walkInSubtitle, { color: colors.textSecondary }]}>
                      Standard retail sale without registering a permanent party
                    </Text>
                  </View>
                  <ChevronRight size={18} color="#059669" />
                </TouchableOpacity>
              )}

              {/* List Header Label */}
              <View style={s.listHeaderRow}>
                <Text style={[s.listSectionLabel, { color: colors.textSecondary }]}>
                  {query.trim().length > 0
                    ? `Matching Results (${filteredCustomers.length})`
                    : `Registered Customer Directory (${allCustomers.length})`}
                </Text>
              </View>

              {/* Customer FlatList */}
              {isLoadingCustomers ? (
                <View style={s.centerContainer}>
                  <ActivityIndicator size="large" color="#059669" />
                  <Text style={[s.loadingText, { color: colors.textSecondary }]}>
                    Loading customer directory...
                  </Text>
                </View>
              ) : filteredCustomers.length === 0 ? (
                <View style={s.emptyState}>
                  <View
                    style={[
                      s.emptyIconCircle,
                      { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F1F5F9' },
                    ]}
                  >
                    <Users size={28} color={colors.textSecondary} />
                  </View>
                  <Text style={[s.emptyStateTitle, { color: colors.text }]}>
                    No customers found matching &quot;{query}&quot;
                  </Text>
                  <Text style={[s.emptyStateText, { color: colors.textSecondary }]}>
                    Would you like to register this customer now?
                  </Text>
                  <TouchableOpacity
                    style={[s.quickRegisterBtn, { backgroundColor: '#059669' }]}
                    onPress={() => {
                      setShowQuickAdd(true);
                      setNewName(query.trim());
                    }}
                  >
                    <UserPlus size={16} color="#FFFFFF" />
                    <Text style={s.quickRegisterBtnText}>Register &quot;{query.trim()}&quot;</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <FlatList
                  data={filteredCustomers}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 48 }}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => {
                    const palette = getAvatarPalette(item.name || 'Customer');
                    const monogram = getMonogram(item.name || 'CU');
                    const isWalkIn =
                      item.name.toLowerCase().includes('walk-in') ||
                      item.name.toLowerCase().includes('counter cash');

                    return (
                      <TouchableOpacity
                        style={[
                          s.customerItemCard,
                          {
                            backgroundColor: colors.surfaceCard,
                            borderColor: colors.border,
                          },
                        ]}
                        activeOpacity={0.7}
                        onPress={() => handleSelect(item)}
                      >
                        {/* Monogram Avatar */}
                        <View
                          style={[
                            s.avatarBadge,
                            {
                              backgroundColor: palette.bg,
                              borderColor: palette.border,
                            },
                          ]}
                        >
                          <Text style={[s.avatarText, { color: palette.text }]}>{monogram}</Text>
                        </View>

                        {/* Customer Information */}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={s.customerNameRow}>
                            <Text
                              style={[s.customerItemName, { color: colors.text }]}
                              numberOfLines={1}
                            >
                              {item.name}
                            </Text>

                            {item.gstin ? (
                              <View style={s.gstinBadge}>
                                <Building2 size={10} color="#0284C7" />
                                <Text style={s.gstinBadgeText}>B2B</Text>
                              </View>
                            ) : isWalkIn ? (
                              <View style={s.walkInPill}>
                                <Text style={s.walkInPillText}>WALK-IN</Text>
                              </View>
                            ) : (
                              <View style={s.retailPill}>
                                <Text style={s.retailPillText}>RETAIL</Text>
                              </View>
                            )}
                          </View>

                          {/* Contact Details */}
                          <View style={s.customerDetailsRow}>
                            {item.mobile ? (
                              <View style={s.detailPill}>
                                <Phone size={11} color={colors.textSecondary} />
                                <Text
                                  style={[s.detailPillText, { color: colors.textSecondary }]}
                                  numberOfLines={1}
                                >
                                  {item.mobile}
                                </Text>
                              </View>
                            ) : null}

                            {item.address ? (
                              <View style={s.detailPill}>
                                <MapPin size={11} color={colors.textSecondary} />
                                <Text
                                  style={[s.detailPillText, { color: colors.textSecondary }]}
                                  numberOfLines={1}
                                >
                                  {item.address}
                                </Text>
                              </View>
                            ) : null}

                            {item.gstin ? (
                              <View style={s.detailPill}>
                                <Text
                                  style={[s.detailPillText, { color: '#0284C7' }]}
                                  numberOfLines={1}
                                >
                                  {item.gstin}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>

                        {/* Select Action Arrow */}
                        <View
                          style={[
                            s.selectArrowBox,
                            {
                              backgroundColor: isDark
                                ? 'rgba(255, 255, 255, 0.06)'
                                : 'rgba(0, 0, 0, 0.04)',
                            },
                          ]}
                        >
                          <ChevronRight size={16} color={colors.textSecondary} />
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />
              )}
            </View>
          ) : (
            /* Quick Add Registration Form */
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 18, paddingBottom: 50 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Back to search link */}
              <TouchableOpacity
                style={s.backToSearchRow}
                onPress={() => setShowQuickAdd(false)}
              >
                <ArrowLeft size={16} color={colors.primary} />
                <Text style={[s.backToSearchText, { color: colors.primary }]}>
                  Back to Customer Search
                </Text>
              </TouchableOpacity>

              {/* Form Input: Name */}
              <View style={s.fieldGroup}>
                <Text style={[s.fieldLabel, { color: colors.text }]}>Customer / Firm Name *</Text>
                <View
                  style={[
                    s.formInputBox,
                    { backgroundColor: colors.inputBg, borderColor: colors.border },
                  ]}
                >
                  <User size={18} color={colors.textSecondary} style={{ marginRight: 10 }} />
                  <TextInput
                    style={[s.formInputText, { color: colors.text }]}
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="e.g. Ramesh Patil or Shubh Jewellers"
                    placeholderTextColor={colors.textSecondary}
                    autoFocus
                  />
                </View>
              </View>

              {/* Form Input: Mobile */}
              <View style={s.fieldGroup}>
                <Text style={[s.fieldLabel, { color: colors.text }]}>Mobile Number (Optional)</Text>
                <View
                  style={[
                    s.formInputBox,
                    { backgroundColor: colors.inputBg, borderColor: colors.border },
                  ]}
                >
                  <Phone size={18} color={colors.textSecondary} style={{ marginRight: 10 }} />
                  <TextInput
                    style={[s.formInputText, { color: colors.text }]}
                    value={newMobile}
                    onChangeText={setNewMobile}
                    placeholder="10-digit mobile number"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="phone-pad"
                    maxLength={10}
                  />
                </View>
              </View>

              {/* Form Input: GSTIN */}
              <View style={s.fieldGroup}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[s.fieldLabel, { color: colors.text }]}>GSTIN (Optional — for B2B buyers)</Text>
                  <Text style={[s.fieldHint, { color: colors.textSecondary }]}>15-char alphanumeric</Text>
                </View>
                <View
                  style={[
                    s.formInputBox,
                    { backgroundColor: colors.inputBg, borderColor: colors.border },
                  ]}
                >
                  <Building2 size={18} color={colors.textSecondary} style={{ marginRight: 10 }} />
                  <TextInput
                    style={[s.formInputText, { color: colors.text }]}
                    value={newGstin}
                    onChangeText={(t) => setNewGstin(t.toUpperCase())}
                    placeholder="e.g. 27AAAAA0000A1Z5"
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="characters"
                    maxLength={15}
                  />
                </View>
              </View>

              {/* Form Input: Address */}
              <View style={s.fieldGroup}>
                <Text style={[s.fieldLabel, { color: colors.text }]}>Billing Address / City (Optional)</Text>
                <View
                  style={[
                    s.formInputBox,
                    {
                      backgroundColor: colors.inputBg,
                      borderColor: colors.border,
                      alignItems: 'flex-start',
                      paddingVertical: 10,
                    },
                  ]}
                >
                  <MapPin size={18} color={colors.textSecondary} style={{ marginRight: 10, marginTop: 2 }} />
                  <TextInput
                    style={[s.formInputText, { color: colors.text, height: 50, textAlignVertical: 'top' }]}
                    value={newAddress}
                    onChangeText={setNewAddress}
                    placeholder="Street, City, Pincode"
                    placeholderTextColor={colors.textSecondary}
                    multiline
                  />
                </View>
              </View>

              {/* Form Actions */}
              <View style={s.formActionsRow}>
                <TouchableOpacity
                  style={[
                    s.cancelBtn,
                    { borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9' },
                  ]}
                  onPress={() => setShowQuickAdd(false)}
                >
                  <Text style={[s.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    s.saveAndSelectBtn,
                    { backgroundColor: '#059669', opacity: isSubmitting ? 0.7 : 1 },
                  ]}
                  onPress={handleQuickAdd}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Check size={16} color="#FFFFFF" />
                      <Text style={s.saveAndSelectBtnText}>Save & Select Customer</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 20,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  headerIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 2,
  },
  countBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '500',
  },
  addNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  addNewBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  walkInCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  walkInIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  walkInTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  walkInSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  walkInTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(5, 150, 105, 0.15)',
  },
  walkInTagText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#059669',
    letterSpacing: 0.5,
  },
  listHeaderRow: {
    marginBottom: 8,
    marginLeft: 2,
  },
  listSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  centerContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
  },
  emptyState: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 12.5,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  quickRegisterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  quickRegisterBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  customerItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  avatarBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  customerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  customerItemName: {
    fontSize: 15,
    fontWeight: '800',
  },
  gstinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    backgroundColor: 'rgba(2, 132, 199, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(2, 132, 199, 0.25)',
  },
  gstinBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#0284C7',
    letterSpacing: 0.5,
  },
  walkInPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  walkInPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.5,
  },
  retailPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    backgroundColor: 'rgba(100, 116, 139, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(100, 116, 139, 0.2)',
  },
  retailPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  customerDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  detailPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailPillText: {
    fontSize: 12,
    fontWeight: '500',
  },
  selectArrowBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backToSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  backToSearchText: {
    fontSize: 13,
    fontWeight: '700',
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 6,
  },
  fieldHint: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  formInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    minHeight: 46,
  },
  formInputText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  formActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
    marginBottom: 30,
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  saveAndSelectBtn: {
    flex: 1.5,
    height: 46,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  saveAndSelectBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
