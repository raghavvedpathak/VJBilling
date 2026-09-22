// app/settings/gst.tsx — Phase 3 GST Tax Master Management Screen
// Implements STEP 0 (FIX-TAXMASTER-IMPL-1 v5.16, FIX-V520-3)

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { useSession } from '@/hooks/useSession';
import { taxMasterService } from '@/services/phase3/taxMasterService';
import { TaxRate, TaxGroupWithRates, TaxComponent } from '@/types/phase3/phase3.types';
import { GlassCard, GlassButton, HeaderPill, FixedGlassBar, fixedBarStyles } from '@/components/ui/Glass';
import {
  Percent,
  Plus,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Pencil,
  Ban,
  Layers,
  Sparkles,
  ShieldCheck,
  Building2,
  Landmark,
  Scale,
  Info,
  Check,
  AlertCircle,
  X,
  RotateCcw,
} from 'lucide-react-native';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { getThemeColors } from '@/constants/theme';
import { ERR } from '@/constants/errorCodes';

export default function GSTSettingsScreen() {
  const router = useRouter();
  const { firm } = useSession();
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const rawColors = getThemeColors(activeTheme);
  const isDark = activeTheme === 'dark';
  const colors = {
    ...rawColors,
    surface: isDark ? '#1C1917' : '#FFFFFF',
    textSecondary: isDark ? 'rgba(255, 255, 255, 0.65)' : '#64748B',
  };

  const [activeTab, setActiveTab] = useState<'RATES' | 'GROUPS'>('RATES');
  const [isLoading, setIsLoading] = useState(true);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [taxGroups, setTaxGroups] = useState<TaxGroupWithRates[]>([]);
  const [rateFilter, setRateFilter] = useState<'ACTIVE' | 'INACTIVE' | 'ALL'>('ACTIVE');
  const [groupFilter, setGroupFilter] = useState<'ACTIVE' | 'INACTIVE' | 'ALL'>('ACTIVE');

  // Add Tax Rate Modal State
  const [showAddRateModal, setShowAddRateModal] = useState(false);
  const [rateName, setRateName] = useState('');
  const [ratePercent, setRatePercent] = useState('');
  const [rateComponent, setRateComponent] = useState<TaxComponent>('CGST');

  // Edit Rate Modal State
  const [editingRate, setEditingRate] = useState<TaxRate | null>(null);
  const [editRateName, setEditRateName] = useState('');

  // Create Tax Group Modal State
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedCgstRateId, setSelectedCgstRateId] = useState<string>('');
  const [selectedSgstRateId, setSelectedSgstRateId] = useState<string>('');

  const loadData = useCallback(async () => {
    if (!firm?.id) return;
    setIsLoading(true);
    try {
      // Ensure defaults are seeded on first view
      await taxMasterService.seedDefaults(firm.id);
      const rates = await taxMasterService.getAllTaxRates(firm.id);
      const groups = await taxMasterService.getAllTaxGroups(firm.id);
      setTaxRates(rates);
      setTaxGroups(groups);
    } catch (e) {
      console.error('[GSTSettings] Error loading tax data:', e);
    } finally {
      setIsLoading(false);
    }
  }, [firm?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handler: Add Tax Rate
  const handleSaveRate = async () => {
    if (!firm?.id) return;
    if (!rateName.trim()) {
      Alert.alert('Validation Error', 'Please enter a name for the tax rate.');
      return;
    }
    const parsedPercent = parseFloat(ratePercent);
    if (isNaN(parsedPercent) || parsedPercent <= 0) {
      Alert.alert('Validation Error', 'Rate percentage must be a positive number.');
      return;
    }

    try {
      const rateBps = Math.round(parsedPercent * 100);
      await taxMasterService.createTaxRate(
        {
          name: rateName.trim(),
          rateBps,
          taxComponent: rateComponent,
        },
        firm.id
      );

      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      setShowAddRateModal(false);
      setRateName('');
      setRatePercent('');
      await loadData();
    } catch (e: any) {
      if (e.message === ERR.DUPLICATE_TAX_RATE_NAME) {
        Alert.alert('Duplicate Name', 'A tax rate with this name already exists for your firm.');
      } else {
        Alert.alert('Error', e.message || 'Failed to save tax rate.');
      }
    }
  };

  // Handler: Update Rate Name
  const handleUpdateRateName = async () => {
    if (!firm?.id || !editingRate) return;
    if (!editRateName.trim()) {
      Alert.alert('Validation Error', 'Rate name cannot be empty.');
      return;
    }

    try {
      await taxMasterService.updateTaxRateName(editingRate.id, editRateName.trim(), firm.id);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      setEditingRate(null);
      await loadData();
    } catch (e: any) {
      if (e.message === ERR.DUPLICATE_TAX_RATE_NAME) {
        Alert.alert('Duplicate Name', 'A tax rate with this name already exists.');
      } else {
        Alert.alert('Error', e.message || 'Failed to update rate name.');
      }
    }
  };

  // Handler: Deactivate Rate
  const handleDeactivateRate = (rate: TaxRate) => {
    Alert.alert(
      'Deactivate Tax Rate',
      `Are you sure you want to deactivate "${rate.taxName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            if (!firm?.id) return;
            try {
              await taxMasterService.deactivateTaxRate(rate.id, firm.id);
              try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
              await loadData();
            } catch (e: any) {
              if (e.message === ERR.TAX_RATE_IN_USE) {
                Alert.alert(
                  'Rate In Use',
                  'This tax rate is currently used by an active Tax Group and cannot be deactivated.'
                );
              } else {
                Alert.alert('Error', e.message || 'Failed to deactivate tax rate.');
              }
            }
          },
        },
      ]
    );
  };

  // Handler: Create Tax Group
  const handleSaveGroup = async () => {
    if (!firm?.id) return;
    if (!groupName.trim()) {
      Alert.alert('Validation Error', 'Please enter a name for the tax group.');
      return;
    }
    if (!selectedCgstRateId || !selectedSgstRateId) {
      Alert.alert('Validation Error', 'Please select both a CGST rate and an SGST rate.');
      return;
    }

    try {
      await taxMasterService.createTaxGroup(
        {
          name: groupName.trim(),
          cgstRateId: selectedCgstRateId,
          sgstRateId: selectedSgstRateId,
        },
        firm.id
      );

      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      setShowCreateGroupModal(false);
      setGroupName('');
      setSelectedCgstRateId('');
      setSelectedSgstRateId('');
      await loadData();
    } catch (e: any) {
      if (e.message === ERR.TAX_GROUP_ASYMMETRIC_RATES) {
        Alert.alert(
          'Rate Mismatch',
          'Intra-state GST requires CGST rate to match SGST rate exactly. Please select symmetric rates.'
        );
      } else if (e.message === ERR.TAX_GROUP_INVALID_COMPONENTS) {
        Alert.alert(
          'Invalid Components',
          'A Tax Group must contain exactly one CGST and one SGST component.'
        );
      } else {
        Alert.alert('Error', e.message || 'Failed to create tax group.');
      }
    }
  };

  // Handler: Deactivate Group
  const handleDeactivateGroup = (group: TaxGroupWithRates) => {
    Alert.alert(
      'Deactivate Tax Group',
      `Are you sure you want to deactivate "${group.groupName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            if (!firm?.id) return;
            try {
              await taxMasterService.deactivateTaxGroup(group.id, firm.id);
              try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
              await loadData();
            } catch (e: any) {
              if (e.message === ERR.TAX_GROUP_IN_USE) {
                Alert.alert(
                  'Group In Use',
                  'This tax group is referenced by past invoices and cannot be modified.'
                );
              } else {
                Alert.alert('Error', e.message || 'Failed to deactivate tax group.');
              }
            }
          },
        },
      ]
    );
  };

  // Handler: Activate Rate
  const handleActivateRate = async (rate: TaxRate) => {
    if (!firm?.id) return;
    try {
      await taxMasterService.activateTaxRate(rate.id, firm.id);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to activate tax rate.');
    }
  };

  // Handler: Activate Group
  const handleActivateGroup = async (group: TaxGroupWithRates) => {
    if (!firm?.id) return;
    try {
      await taxMasterService.activateTaxGroup(group.id, firm.id);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to activate tax group.');
    }
  };

  const activeCgstRates = taxRates.filter((r) => r.isActive === 1 && r.taxType === 'CGST');
  const activeSgstRates = taxRates.filter((r) => r.isActive === 1 && r.taxType === 'SGST');

  const filteredRates = taxRates.filter((r) => {
    if (rateFilter === 'ACTIVE') return r.isActive === 1;
    if (rateFilter === 'INACTIVE') return r.isActive === 0;
    return true;
  });

  const filteredGroups = taxGroups.filter((g) => {
    if (groupFilter === 'ACTIVE') return g.isActive === 1;
    if (groupFilter === 'INACTIVE') return g.isActive === 0;
    return true;
  });

  // Find currently selected rates for the create group modal preview
  const selectedCgst = activeCgstRates.find((r) => r.id === selectedCgstRateId);
  const selectedSgst = activeSgstRates.find((r) => r.id === selectedSgstRateId);
  const isGroupSymmetric = selectedCgst && selectedSgst && selectedCgst.rateBps === selectedSgst.rateBps;
  const combinedModalPercent = (selectedCgst && selectedSgst)
    ? ((selectedCgst.rateBps + selectedSgst.rateBps) / 100).toFixed(2)
    : '0.00';

  const gstHeaderPills = (
    <View style={s.headerPillsRow}>
      <HeaderPill icon={<Percent size={12} color={colors.vjBg} />} label="Statutory GST" />
      <HeaderPill icon={<ShieldCheck size={12} color="#4ADE80" />} label="BPS Immutable" variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="GST Tax Master" showBack headerContent={gstHeaderPills}>
      {/* Top Segmented Tab Switcher */}
      <View style={s.tabContainer}>
        <View
          style={[
            s.tabBar,
            {
              backgroundColor: isDark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(212, 175, 55, 0.12)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(212, 175, 55, 0.25)',
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              setActiveTab('RATES');
            }}
            style={[
              s.tabButton,
              activeTab === 'RATES' && [
                s.tabButtonActive,
                { backgroundColor: isDark ? colors.surface : '#FFFFFF' },
              ],
            ]}
          >
            <Percent
              size={15}
              color={activeTab === 'RATES' ? (isDark ? '#FCD34D' : '#B45309') : colors.textSecondary}
            />
            <Text
              style={[
                s.tabText,
                { color: activeTab === 'RATES' ? colors.vjText : colors.textSecondary },
                activeTab === 'RATES' && s.tabTextActive,
              ]}
            >
              Tax Rates
            </Text>
            <View
              style={[
                s.tabCountBadge,
                {
                  backgroundColor:
                    activeTab === 'RATES'
                      ? isDark
                        ? 'rgba(245, 158, 11, 0.25)'
                        : 'rgba(217, 119, 6, 0.15)'
                      : isDark
                      ? 'rgba(255, 255, 255, 0.08)'
                      : 'rgba(0, 0, 0, 0.06)',
                },
              ]}
            >
              <Text
                style={[
                  s.tabCountText,
                  {
                    color:
                      activeTab === 'RATES'
                        ? isDark
                          ? '#FCD34D'
                          : '#B45309'
                        : colors.textSecondary,
                  },
                ]}
              >
                {taxRates.length}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              setActiveTab('GROUPS');
            }}
            style={[
              s.tabButton,
              activeTab === 'GROUPS' && [
                s.tabButtonActive,
                { backgroundColor: isDark ? colors.surface : '#FFFFFF' },
              ],
            ]}
          >
            <Layers
              size={15}
              color={activeTab === 'GROUPS' ? (isDark ? '#FCD34D' : '#B45309') : colors.textSecondary}
            />
            <Text
              style={[
                s.tabText,
                { color: activeTab === 'GROUPS' ? colors.vjText : colors.textSecondary },
                activeTab === 'GROUPS' && s.tabTextActive,
              ]}
            >
              Tax Groups
            </Text>
            <View
              style={[
                s.tabCountBadge,
                {
                  backgroundColor:
                    activeTab === 'GROUPS'
                      ? isDark
                        ? 'rgba(245, 158, 11, 0.25)'
                        : 'rgba(217, 119, 6, 0.15)'
                      : isDark
                      ? 'rgba(255, 255, 255, 0.08)'
                      : 'rgba(0, 0, 0, 0.06)',
                },
              ]}
            >
              <Text
                style={[
                  s.tabCountText,
                  {
                    color:
                      activeTab === 'GROUPS'
                        ? isDark
                          ? '#FCD34D'
                          : '#B45309'
                        : colors.textSecondary,
                  },
                ]}
              >
                {taxGroups.length}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Educational Statutory Guidance Banner */}
        <View
          style={[
            s.guidanceBanner,
            {
              backgroundColor: isDark ? 'rgba(30, 58, 138, 0.18)' : 'rgba(239, 246, 255, 0.9)',
              borderColor: isDark ? 'rgba(96, 165, 250, 0.3)' : 'rgba(191, 219, 254, 0.8)',
            },
          ]}
        >
          <View style={s.guidanceIconWrap}>
            {activeTab === 'RATES' ? (
              <Scale size={18} color={isDark ? '#93C5FD' : '#2563EB'} />
            ) : (
              <Layers size={18} color={isDark ? '#93C5FD' : '#2563EB'} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.guidanceTitle, { color: isDark ? '#BFDBFE' : '#1E40AF' }]}>
              {activeTab === 'RATES'
                ? 'Intra-State Split (CGST + SGST)'
                : 'Unified Invoice Tax Groups'}
            </Text>
            <Text style={[s.guidanceSubtitle, { color: isDark ? '#93C5FD' : '#3B82F6' }]}>
              {activeTab === 'RATES'
                ? 'Jewelry sales in India incur statutory GST split symmetrically between Central (CGST) and State (SGST). Basis points (BPS) are immutable once saved.'
                : 'Tax Groups bundle symmetric CGST & SGST components for 1-tap checkout. For intra-state billing, CGST and SGST rates must match.'}
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color="#D4AF37" />
            <Text style={[s.loadingText, { color: colors.textSecondary }]}>
              Loading Tax Master...
            </Text>
          </View>
        ) : activeTab === 'RATES' ? (
          /* ========================================================== */
          /* TAB 1: TAX RATES                                          */
          /* ========================================================== */
          <View>
            <View style={s.sectionHeaderRow}>
              <Text style={[s.sectionHeaderLabel, { color: colors.textSecondary }]}>
                Configured Tax Rates ({taxRates.length})
              </Text>
              <Text style={[s.sectionHeaderSub, { color: isDark ? '#A3E635' : '#4D7C0F' }]}>
                100 BPS = 1.00%
              </Text>
            </View>

            {/* Sub-Filter Chips for Tax Rates */}
            <View style={s.subFilterRow}>
              <TouchableOpacity
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                  setRateFilter('ACTIVE');
                }}
                style={[
                  s.subFilterChip,
                  rateFilter === 'ACTIVE' && s.subFilterChipActive,
                  {
                    backgroundColor: rateFilter === 'ACTIVE'
                      ? (isDark ? 'rgba(16, 185, 129, 0.22)' : 'rgba(16, 185, 129, 0.12)')
                      : (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)'),
                    borderColor: rateFilter === 'ACTIVE'
                      ? '#10B981'
                      : (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'),
                  },
                ]}
              >
                <Text
                  style={[
                    s.subFilterText,
                    { color: rateFilter === 'ACTIVE' ? (isDark ? '#34D399' : '#059669') : colors.textSecondary },
                    rateFilter === 'ACTIVE' && { fontWeight: '900' },
                  ]}
                >
                  Active ({taxRates.filter((r) => r.isActive === 1).length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                  setRateFilter('INACTIVE');
                }}
                style={[
                  s.subFilterChip,
                  rateFilter === 'INACTIVE' && s.subFilterChipActive,
                  {
                    backgroundColor: rateFilter === 'INACTIVE'
                      ? (isDark ? 'rgba(239, 68, 68, 0.22)' : 'rgba(239, 68, 68, 0.12)')
                      : (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)'),
                    borderColor: rateFilter === 'INACTIVE'
                      ? '#EF4444'
                      : (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'),
                  },
                ]}
              >
                <Text
                  style={[
                    s.subFilterText,
                    { color: rateFilter === 'INACTIVE' ? (isDark ? '#F87171' : '#DC2626') : colors.textSecondary },
                    rateFilter === 'INACTIVE' && { fontWeight: '900' },
                  ]}
                >
                  Inactive ({taxRates.filter((r) => r.isActive === 0).length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                  setRateFilter('ALL');
                }}
                style={[
                  s.subFilterChip,
                  rateFilter === 'ALL' && s.subFilterChipActive,
                  {
                    backgroundColor: rateFilter === 'ALL'
                      ? (isDark ? 'rgba(217, 119, 6, 0.22)' : 'rgba(217, 119, 6, 0.12)')
                      : (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)'),
                    borderColor: rateFilter === 'ALL'
                      ? '#D97706'
                      : (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'),
                  },
                ]}
              >
                <Text
                  style={[
                    s.subFilterText,
                    { color: rateFilter === 'ALL' ? (isDark ? '#FBBF24' : '#B45309') : colors.textSecondary },
                    rateFilter === 'ALL' && { fontWeight: '900' },
                  ]}
                >
                  All ({taxRates.length})
                </Text>
              </TouchableOpacity>
            </View>

            {filteredRates.length === 0 ? (
              <GlassCard style={s.emptyCard}>
                <Percent size={36} color={colors.textSecondary} />
                <Text style={[s.emptyTitle, { color: colors.vjText }]}>
                  {rateFilter === 'ACTIVE'
                    ? 'No active tax rates'
                    : rateFilter === 'INACTIVE'
                    ? 'No inactive tax rates'
                    : 'No tax rates found'}
                </Text>
                <Text style={[s.emptySubtitle, { color: colors.textSecondary }]}>
                  {rateFilter === 'ACTIVE'
                    ? 'All rates are currently inactive or none configured.'
                    : rateFilter === 'INACTIVE'
                    ? 'Deactivated rates will appear here.'
                    : 'Tap the button below to add your first CGST or SGST component.'}
                </Text>
              </GlassCard>
            ) : (
              filteredRates.map((rate) => {
                const isActive = rate.isActive === 1;
                const isCgst = rate.taxType === 'CGST';

                return (
                  <GlassCard key={rate.id} style={s.rateCard}>
                    <View style={s.rateCardInner}>
                      {/* Left: Component & Name */}
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <View style={s.rateTagRow}>
                          {/* Component Pill */}
                          <View
                            style={[
                              s.componentPill,
                              {
                                backgroundColor: isCgst
                                  ? isDark ? 'rgba(14, 165, 233, 0.2)' : 'rgba(14, 165, 233, 0.12)'
                                  : isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.12)',
                                borderColor: isCgst
                                  ? 'rgba(14, 165, 233, 0.4)'
                                  : 'rgba(16, 185, 129, 0.4)',
                              },
                            ]}
                          >
                            {isCgst ? (
                              <Building2 size={11} color={isDark ? '#38BDF8' : '#0284C7'} />
                            ) : (
                              <Landmark size={11} color={isDark ? '#34D399' : '#059669'} />
                            )}
                            <Text
                              style={[
                                s.componentPillText,
                                { color: isCgst ? (isDark ? '#38BDF8' : '#0284C7') : (isDark ? '#34D399' : '#059669') },
                              ]}
                            >
                              {rate.taxType} • {isCgst ? 'Central' : 'State'}
                            </Text>
                          </View>

                          {/* Active / Inactive Status */}
                          <View
                            style={[
                              s.statusPill,
                              {
                                backgroundColor: isActive
                                  ? isDark ? 'rgba(16, 185, 129, 0.18)' : 'rgba(16, 185, 129, 0.12)'
                                  : isDark ? 'rgba(156, 163, 175, 0.18)' : 'rgba(156, 163, 175, 0.12)',
                                borderColor: isActive
                                  ? 'rgba(16, 185, 129, 0.35)'
                                  : 'rgba(156, 163, 175, 0.35)',
                              },
                            ]}
                          >
                            <View
                              style={[
                                s.statusDotSmall,
                                { backgroundColor: isActive ? '#10B981' : '#9CA3AF' },
                              ]}
                            />
                            <Text
                              style={[
                                s.statusPillText,
                                { color: isActive ? (isDark ? '#34D399' : '#059669') : colors.textSecondary },
                              ]}
                            >
                              {isActive ? 'Active' : 'Inactive'}
                            </Text>
                          </View>
                        </View>

                        {/* Tax Rate Title */}
                        <Text style={[s.rateCardTitle, { color: colors.vjText }]}>
                          {rate.taxName}
                        </Text>

                        {/* Rate Metric Strip */}
                        <View style={s.rateMetricRow}>
                          <Text style={[s.ratePercentText, { color: isDark ? '#FBBF24' : '#D97706' }]}>
                            {(rate.rateBps / 100).toFixed(2)}%
                          </Text>
                          <View style={s.rateBpsChip}>
                            <Text style={s.rateBpsText}>{rate.rateBps} BPS</Text>
                          </View>
                        </View>
                      </View>

                      {/* Right: Actions */}
                      <View style={s.rateActionCol}>
                        <TouchableOpacity
                          onPress={() => {
                            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                            setEditingRate(rate);
                            setEditRateName(rate.taxName);
                          }}
                          style={[
                            s.actionIconBtn,
                            {
                              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                              borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
                            },
                          ]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Pencil size={15} color={colors.vjText} />
                        </TouchableOpacity>

                        {isActive ? (
                          <TouchableOpacity
                            onPress={() => handleDeactivateRate(rate)}
                            style={[
                              s.actionIconBtn,
                              {
                                backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                                borderColor: 'rgba(239, 68, 68, 0.3)',
                              },
                            ]}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ban size={15} color="#EF4444" />
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            onPress={() => handleActivateRate(rate)}
                            style={[
                              s.actionIconBtn,
                              {
                                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.18)' : 'rgba(16, 185, 129, 0.12)',
                                borderColor: 'rgba(16, 185, 129, 0.35)',
                              },
                            ]}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <RotateCcw size={15} color="#10B981" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </GlassCard>
                );
              })
            )}
          </View>
        ) : (
          /* ========================================================== */
          /* TAB 2: TAX GROUPS                                         */
          /* ========================================================== */
          <View>
            <View style={s.sectionHeaderRow}>
              <Text style={[s.sectionHeaderLabel, { color: colors.textSecondary }]}>
                Configured Invoicing Groups ({taxGroups.length})
              </Text>
              <Text style={[s.sectionHeaderSub, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                Applied at Checkout
              </Text>
            </View>

            {/* Sub-Filter Chips for Tax Groups */}
            <View style={s.subFilterRow}>
              <TouchableOpacity
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                  setGroupFilter('ACTIVE');
                }}
                style={[
                  s.subFilterChip,
                  groupFilter === 'ACTIVE' && s.subFilterChipActive,
                  {
                    backgroundColor: groupFilter === 'ACTIVE'
                      ? (isDark ? 'rgba(16, 185, 129, 0.22)' : 'rgba(16, 185, 129, 0.12)')
                      : (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)'),
                    borderColor: groupFilter === 'ACTIVE'
                      ? '#10B981'
                      : (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'),
                  },
                ]}
              >
                <Text
                  style={[
                    s.subFilterText,
                    { color: groupFilter === 'ACTIVE' ? (isDark ? '#34D399' : '#059669') : colors.textSecondary },
                    groupFilter === 'ACTIVE' && { fontWeight: '900' },
                  ]}
                >
                  Active ({taxGroups.filter((g) => g.isActive === 1).length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                  setGroupFilter('INACTIVE');
                }}
                style={[
                  s.subFilterChip,
                  groupFilter === 'INACTIVE' && s.subFilterChipActive,
                  {
                    backgroundColor: groupFilter === 'INACTIVE'
                      ? (isDark ? 'rgba(239, 68, 68, 0.22)' : 'rgba(239, 68, 68, 0.12)')
                      : (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)'),
                    borderColor: groupFilter === 'INACTIVE'
                      ? '#EF4444'
                      : (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'),
                  },
                ]}
              >
                <Text
                  style={[
                    s.subFilterText,
                    { color: groupFilter === 'INACTIVE' ? (isDark ? '#F87171' : '#DC2626') : colors.textSecondary },
                    groupFilter === 'INACTIVE' && { fontWeight: '900' },
                  ]}
                >
                  Inactive ({taxGroups.filter((g) => g.isActive === 0).length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                  setGroupFilter('ALL');
                }}
                style={[
                  s.subFilterChip,
                  groupFilter === 'ALL' && s.subFilterChipActive,
                  {
                    backgroundColor: groupFilter === 'ALL'
                      ? (isDark ? 'rgba(217, 119, 6, 0.22)' : 'rgba(217, 119, 6, 0.12)')
                      : (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)'),
                    borderColor: groupFilter === 'ALL'
                      ? '#D97706'
                      : (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'),
                  },
                ]}
              >
                <Text
                  style={[
                    s.subFilterText,
                    { color: groupFilter === 'ALL' ? (isDark ? '#FBBF24' : '#B45309') : colors.textSecondary },
                    groupFilter === 'ALL' && { fontWeight: '900' },
                  ]}
                >
                  All ({taxGroups.length})
                </Text>
              </TouchableOpacity>
            </View>

            {filteredGroups.length === 0 ? (
              <GlassCard style={s.emptyCard}>
                <Layers size={36} color={colors.textSecondary} />
                <Text style={[s.emptyTitle, { color: colors.vjText }]}>
                  {groupFilter === 'ACTIVE'
                    ? 'No active tax groups'
                    : groupFilter === 'INACTIVE'
                    ? 'No inactive tax groups'
                    : 'No tax groups found'}
                </Text>
                <Text style={[s.emptySubtitle, { color: colors.textSecondary }]}>
                  {groupFilter === 'ACTIVE'
                    ? 'All groups are currently inactive or none configured.'
                    : groupFilter === 'INACTIVE'
                    ? 'Deactivated tax groups will appear here.'
                    : 'Combine a CGST and SGST rate to create your first invoicing tax group.'}
                </Text>
              </GlassCard>
            ) : (
              filteredGroups.map((group) => {
                const isActive = group.isActive === 1;

                return (
                  <GlassCard key={group.id} style={s.groupCard}>
                    <View style={s.groupCardHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={s.groupTitleRow}>
                          <Text style={[s.groupNameText, { color: colors.vjText }]}>
                            {group.groupName}
                          </Text>

                          {/* Status Pill */}
                          <View
                            style={[
                              s.statusPill,
                              {
                                backgroundColor: isActive
                                  ? isDark ? 'rgba(16, 185, 129, 0.18)' : 'rgba(16, 185, 129, 0.12)'
                                  : isDark ? 'rgba(156, 163, 175, 0.18)' : 'rgba(156, 163, 175, 0.12)',
                                borderColor: isActive
                                  ? 'rgba(16, 185, 129, 0.35)'
                                  : 'rgba(156, 163, 175, 0.35)',
                              },
                            ]}
                          >
                            <View
                              style={[
                                s.statusDotSmall,
                                { backgroundColor: isActive ? '#10B981' : '#9CA3AF' },
                              ]}
                            />
                            <Text
                              style={[
                                s.statusPillText,
                                { color: isActive ? (isDark ? '#34D399' : '#059669') : colors.textSecondary },
                              ]}
                            >
                              {isActive ? 'Active' : 'Inactive'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Deactivate / Reactivate Button */}
                      {isActive ? (
                        <TouchableOpacity
                          onPress={() => handleDeactivateGroup(group)}
                          style={[
                            s.actionIconBtn,
                            {
                              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                              borderColor: 'rgba(239, 68, 68, 0.3)',
                            },
                          ]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ban size={15} color="#EF4444" />
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          onPress={() => handleActivateGroup(group)}
                          style={[
                            s.actionIconBtn,
                            {
                              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.18)' : 'rgba(16, 185, 129, 0.12)',
                              borderColor: 'rgba(16, 185, 129, 0.35)',
                            },
                          ]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <RotateCcw size={15} color="#10B981" />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Hero Total Rate Display Strip */}
                    <View
                      style={[
                        s.groupHeroStrip,
                        {
                          backgroundColor: isDark ? 'rgba(217, 119, 6, 0.15)' : 'rgba(245, 158, 11, 0.12)',
                          borderColor: isDark ? 'rgba(245, 158, 11, 0.35)' : 'rgba(217, 119, 6, 0.25)',
                        },
                      ]}
                    >
                      <View style={s.heroRateLeft}>
                        <Text style={[s.heroRateLabel, { color: isDark ? '#FCD34D' : '#92400E' }]}>
                          TOTAL INVOICE GST
                        </Text>
                        <Text style={[s.heroRateValue, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                          {group.combinedRatePercent}%
                        </Text>
                      </View>

                      <View style={s.heroRateDivider} />

                      {/* Split Breakdown */}
                      <View style={s.heroRateRight}>
                        <View style={s.splitComponentRow}>
                          <Building2 size={11} color={isDark ? '#38BDF8' : '#0284C7'} />
                          <Text style={[s.splitComponentText, { color: colors.vjText }]}>
                            {group.cgstRate.taxName} ({(group.cgstRate.rateBps / 100).toFixed(2)}%)
                          </Text>
                        </View>
                        <View style={s.splitComponentRow}>
                          <Landmark size={11} color={isDark ? '#34D399' : '#059669'} />
                          <Text style={[s.splitComponentText, { color: colors.vjText }]}>
                            {group.sgstRate.taxName} ({(group.sgstRate.rateBps / 100).toFixed(2)}%)
                          </Text>
                        </View>
                      </View>
                    </View>
                  </GlassCard>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* Floating Bottom Action Bar */}
      <FixedGlassBar>
        {activeTab === 'RATES' ? (
          <TouchableOpacity
            style={fixedBarStyles.pillPrimaryBtn}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
              setRateName('');
              setRatePercent('');
              setRateComponent('CGST');
              setShowAddRateModal(true);
            }}
            activeOpacity={0.85}
          >
            <Plus size={18} color="#FFFFFF" />
            <Text style={fixedBarStyles.pillPrimaryText}>Add Tax Rate</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={fixedBarStyles.pillPrimaryBtn}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
              setGroupName('');
              setSelectedCgstRateId(activeCgstRates[0]?.id || '');
              setSelectedSgstRateId(activeSgstRates[0]?.id || '');
              setShowCreateGroupModal(true);
            }}
            activeOpacity={0.85}
          >
            <Plus size={18} color="#FFFFFF" />
            <Text style={fixedBarStyles.pillPrimaryText}>Create Tax Group</Text>
          </TouchableOpacity>
        )}
      </FixedGlassBar>

      {/* ============================================================ */}
      {/* MODAL 1: ADD TAX RATE                                        */}
      {/* ============================================================ */}
      <Modal visible={showAddRateModal} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.modalBackdrop}
        >
          <View
            style={[
              s.modalCard,
              {
                backgroundColor: colors.surface,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
              },
            ]}
          >
            <View style={s.modalHeader}>
              <View style={s.modalHeaderLeft}>
                <View style={s.modalHeaderIconWrap}>
                  <Percent size={18} color="#D4AF37" />
                </View>
                <View>
                  <Text style={[s.modalTitle, { color: colors.vjText }]}>Add Tax Rate</Text>
                  <Text style={[s.modalSubtitle, { color: colors.textSecondary }]}>
                    Define a single CGST or SGST rate component
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowAddRateModal(false)}
                style={s.modalCloseBtn}
              >
                <X size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Tax Component Segmented Selector */}
            <Text style={[s.inputFieldLabel, { color: colors.textSecondary }]}>TAX COMPONENT</Text>
            <View style={s.componentSelectRow}>
              <TouchableOpacity
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                  setRateComponent('CGST');
                  if (!rateName || rateName.startsWith('SGST')) {
                    setRateName(ratePercent ? `CGST ${ratePercent}%` : 'CGST ');
                  }
                }}
                style={[
                  s.componentSelectCard,
                  rateComponent === 'CGST' && [
                    s.componentSelectCardActive,
                    {
                      backgroundColor: isDark ? 'rgba(14, 165, 233, 0.2)' : 'rgba(14, 165, 233, 0.1)',
                      borderColor: '#0284C7',
                    },
                  ],
                ]}
              >
                <Building2
                  size={16}
                  color={rateComponent === 'CGST' ? '#0284C7' : colors.textSecondary}
                />
                <Text
                  style={[
                    s.componentSelectText,
                    { color: rateComponent === 'CGST' ? '#0284C7' : colors.vjText },
                  ]}
                >
                  CGST (Central)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                  setRateComponent('SGST');
                  if (!rateName || rateName.startsWith('CGST')) {
                    setRateName(ratePercent ? `SGST ${ratePercent}%` : 'SGST ');
                  }
                }}
                style={[
                  s.componentSelectCard,
                  rateComponent === 'SGST' && [
                    s.componentSelectCardActive,
                    {
                      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.1)',
                      borderColor: '#059669',
                    },
                  ],
                ]}
              >
                <Landmark
                  size={16}
                  color={rateComponent === 'SGST' ? '#059669' : colors.textSecondary}
                />
                <Text
                  style={[
                    s.componentSelectText,
                    { color: rateComponent === 'SGST' ? '#059669' : colors.vjText },
                  ]}
                >
                  SGST (State)
                </Text>
              </TouchableOpacity>
            </View>

            {/* Rate Percentage Input */}
            <Text style={[s.inputFieldLabel, { color: colors.textSecondary }]}>RATE PERCENT (%)</Text>
            <View
              style={[
                s.inputContainer,
                {
                  backgroundColor: isDark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.85)',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)',
                },
              ]}
            >
              <TextInput
                value={ratePercent}
                onChangeText={(val) => {
                  setRatePercent(val);
                  if (val && (!rateName || rateName.includes('%') || rateName.startsWith('CGST') || rateName.startsWith('SGST'))) {
                    setRateName(`${rateComponent} ${val}%`);
                  }
                }}
                keyboardType="decimal-pad"
                placeholder="e.g. 1.5"
                placeholderTextColor={colors.textSecondary}
                style={[s.modalTextInput, { color: colors.vjText }]}
              />
              <View style={s.inputSuffixBadge}>
                <Text style={s.inputSuffixText}>%</Text>
              </View>
            </View>

            {/* Live BPS conversion note */}
            {parseFloat(ratePercent) > 0 && (
              <View style={s.bpsHelperRow}>
                <Sparkles size={13} color="#D97706" />
                <Text style={s.bpsHelperText}>
                  Stored as {Math.round(parseFloat(ratePercent) * 100)} Basis Points (BPS) in system.
                </Text>
              </View>
            )}

            {/* Rate Name Input */}
            <Text style={[s.inputFieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>
              DISPLAY TAX NAME
            </Text>
            <View
              style={[
                s.inputContainer,
                {
                  backgroundColor: isDark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.85)',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)',
                },
              ]}
            >
              <TextInput
                value={rateName}
                onChangeText={setRateName}
                placeholder="e.g. CGST 1.5%"
                placeholderTextColor={colors.textSecondary}
                style={[s.modalTextInput, { color: colors.vjText }]}
              />
            </View>

            {/* Buttons */}
            <View style={s.modalBtnRow}>
              <View style={{ flex: 1 }}>
                <GlassButton
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setShowAddRateModal(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <GlassButton title="Save Rate" variant="primary" onPress={handleSaveRate} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ============================================================ */}
      {/* MODAL 2: EDIT TAX RATE NAME                                  */}
      {/* ============================================================ */}
      <Modal visible={!!editingRate} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.modalBackdrop}
        >
          <View
            style={[
              s.modalCard,
              {
                backgroundColor: colors.surface,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
              },
            ]}
          >
            <View style={s.modalHeader}>
              <View style={s.modalHeaderLeft}>
                <View style={s.modalHeaderIconWrap}>
                  <Pencil size={18} color="#D4AF37" />
                </View>
                <View>
                  <Text style={[s.modalTitle, { color: colors.vjText }]}>Edit Tax Rate Name</Text>
                  <Text style={[s.modalSubtitle, { color: colors.textSecondary }]}>
                    {(editingRate?.rateBps ?? 0) / 100}% • {editingRate?.taxType}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setEditingRate(null)}
                style={s.modalCloseBtn}
              >
                <X size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Statutory Immutability Alert */}
            <View
              style={[
                s.immutableNotice,
                {
                  backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : 'rgba(254, 243, 199, 0.8)',
                  borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : 'rgba(252, 211, 77, 0.6)',
                },
              ]}
            >
              <Info size={15} color={isDark ? '#FCD34D' : '#B45309'} />
              <Text style={[s.immutableNoticeText, { color: isDark ? '#FCD34D' : '#92400E' }]}>
                The percentage ({(editingRate?.rateBps ?? 0) / 100}%) is locked by law to preserve
                past invoice records. Only the descriptive label can be changed.
              </Text>
            </View>

            <Text style={[s.inputFieldLabel, { color: colors.textSecondary }]}>NEW TAX NAME</Text>
            <View
              style={[
                s.inputContainer,
                {
                  backgroundColor: isDark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.85)',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)',
                },
              ]}
            >
              <TextInput
                value={editRateName}
                onChangeText={setEditRateName}
                placeholder="e.g. CGST 1.5% (Updated)"
                placeholderTextColor={colors.textSecondary}
                style={[s.modalTextInput, { color: colors.vjText }]}
              />
            </View>

            <View style={s.modalBtnRow}>
              <View style={{ flex: 1 }}>
                <GlassButton
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setEditingRate(null)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <GlassButton title="Update Name" variant="primary" onPress={handleUpdateRateName} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ============================================================ */}
      {/* MODAL 3: CREATE TAX GROUP                                    */}
      {/* ============================================================ */}
      <Modal visible={showCreateGroupModal} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.modalBackdrop}
        >
          <View
            style={[
              s.modalCard,
              {
                backgroundColor: colors.surface,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
                maxHeight: '90%',
              },
            ]}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.modalHeader}>
                <View style={s.modalHeaderLeft}>
                  <View style={s.modalHeaderIconWrap}>
                    <Layers size={18} color="#D4AF37" />
                  </View>
                  <View>
                    <Text style={[s.modalTitle, { color: colors.vjText }]}>Create Tax Group</Text>
                    <Text style={[s.modalSubtitle, { color: colors.textSecondary }]}>
                      Pair 1 CGST + 1 SGST for checkout
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setShowCreateGroupModal(false)}
                  style={s.modalCloseBtn}
                >
                  <X size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Group Name */}
              <Text style={[s.inputFieldLabel, { color: colors.textSecondary }]}>GROUP NAME</Text>
              <View
                style={[
                  s.inputContainer,
                  {
                    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.85)',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)',
                  },
                ]}
              >
                <TextInput
                  value={groupName}
                  onChangeText={setGroupName}
                  placeholder="e.g. GST 3%"
                  placeholderTextColor={colors.textSecondary}
                  style={[s.modalTextInput, { color: colors.vjText }]}
                />
              </View>

              {/* Live Preview Strip */}
              <View
                style={[
                  s.groupPreviewBox,
                  {
                    backgroundColor: isDark ? 'rgba(217, 119, 6, 0.15)' : 'rgba(245, 158, 11, 0.1)',
                    borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : 'rgba(217, 119, 6, 0.2)',
                  },
                ]}
              >
                <View style={s.groupPreviewTop}>
                  <Text style={[s.groupPreviewLabel, { color: isDark ? '#FCD34D' : '#92400E' }]}>
                    Combined Invoicing Rate
                  </Text>
                  <Text style={[s.groupPreviewValue, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                    {combinedModalPercent}%
                  </Text>
                </View>

                {!isGroupSymmetric && selectedCgst && selectedSgst && (
                  <View style={s.groupWarningRow}>
                    <AlertCircle size={14} color="#EF4444" />
                    <Text style={s.groupWarningText}>
                      Intra-state GST law requires CGST & SGST to match identically.
                    </Text>
                  </View>
                )}
              </View>

              {/* Select CGST Rate */}
              <Text style={[s.inputFieldLabel, { color: colors.textSecondary, marginTop: 14 }]}>
                SELECT CGST RATE (CENTRAL)
              </Text>
              <View style={s.radioRateList}>
                {activeCgstRates.map((r) => {
                  const isSelected = selectedCgstRateId === r.id;
                  return (
                    <TouchableOpacity
                      key={r.id}
                      onPress={() => {
                        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                        setSelectedCgstRateId(r.id);
                        // Auto-match SGST if available with same bps
                        const matchingSgst = activeSgstRates.find((sRate) => sRate.rateBps === r.rateBps);
                        if (matchingSgst) {
                          setSelectedSgstRateId(matchingSgst.id);
                        }
                        if (!groupName || groupName.startsWith('GST')) {
                          const total = ((r.rateBps * 2) / 100).toFixed(0);
                          setGroupName(`GST ${total}%`);
                        }
                      }}
                      style={[
                        s.radioRateItem,
                        {
                          backgroundColor: isSelected
                            ? isDark ? 'rgba(14, 165, 233, 0.2)' : 'rgba(14, 165, 233, 0.1)'
                            : isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                          borderColor: isSelected
                            ? '#0284C7'
                            : isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
                        },
                      ]}
                    >
                      <View style={s.radioRateLeft}>
                        <View
                          style={[
                            s.radioCircle,
                            isSelected && { borderColor: '#0284C7', backgroundColor: '#0284C7' },
                          ]}
                        >
                          {isSelected && <Check size={11} color="#FFFFFF" />}
                        </View>
                        <Text style={[s.radioRateName, { color: colors.vjText }]}>{r.taxName}</Text>
                      </View>
                      <Text style={[s.radioRatePercent, { color: isDark ? '#38BDF8' : '#0284C7' }]}>
                        {(r.rateBps / 100).toFixed(2)}%
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Select SGST Rate */}
              <Text style={[s.inputFieldLabel, { color: colors.textSecondary, marginTop: 14 }]}>
                SELECT SGST RATE (STATE)
              </Text>
              <View style={s.radioRateList}>
                {activeSgstRates.map((r) => {
                  const isSelected = selectedSgstRateId === r.id;
                  return (
                    <TouchableOpacity
                      key={r.id}
                      onPress={() => {
                        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                        setSelectedSgstRateId(r.id);
                      }}
                      style={[
                        s.radioRateItem,
                        {
                          backgroundColor: isSelected
                            ? isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.1)'
                            : isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                          borderColor: isSelected
                            ? '#059669'
                            : isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
                        },
                      ]}
                    >
                      <View style={s.radioRateLeft}>
                        <View
                          style={[
                            s.radioCircle,
                            isSelected && { borderColor: '#059669', backgroundColor: '#059669' },
                          ]}
                        >
                          {isSelected && <Check size={11} color="#FFFFFF" />}
                        </View>
                        <Text style={[s.radioRateName, { color: colors.vjText }]}>{r.taxName}</Text>
                      </View>
                      <Text style={[s.radioRatePercent, { color: isDark ? '#34D399' : '#059669' }]}>
                        {(r.rateBps / 100).toFixed(2)}%
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[s.modalBtnRow, { marginTop: 20 }]}>
                <View style={{ flex: 1 }}>
                  <GlassButton
                    title="Cancel"
                    variant="secondary"
                    onPress={() => setShowCreateGroupModal(false)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <GlassButton
                    title="Create Group"
                    variant="primary"
                    onPress={handleSaveGroup}
                  />
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  headerPillsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  tabContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 18,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    gap: 6,
  },
  tabButtonActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  tabTextActive: {
    fontWeight: '900',
  },
  tabCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: '900',
  },
  scrollContent: {
    paddingTop: 12,
    paddingBottom: 110,
    paddingHorizontal: 16,
  },
  guidanceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  guidanceIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guidanceTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  guidanceSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
    lineHeight: 15,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionHeaderLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHeaderSub: {
    fontSize: 11,
    fontWeight: '800',
  },
  subFilterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  subFilterChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subFilterChipActive: {
    borderWidth: 1.5,
  },
  subFilterText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyCard: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 240,
    lineHeight: 17,
  },
  rateCard: {
    padding: 14,
    marginBottom: 10,
  },
  rateCardInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rateTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  componentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  componentPillText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusDotSmall: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  rateCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  rateMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratePercentText: {
    fontSize: 14,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  rateBpsChip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
  },
  rateBpsText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
  },
  rateActionCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupCard: {
    padding: 14,
    marginBottom: 10,
  },
  groupCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  groupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupNameText: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  groupHeroStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  heroRateLeft: {
    paddingRight: 14,
  },
  heroRateLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heroRateValue: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  heroRateDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(217, 119, 6, 0.25)',
    marginRight: 14,
  },
  heroRateRight: {
    flex: 1,
    gap: 4,
  },
  splitComponentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  splitComponentText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 26,
    borderWidth: 1,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  modalHeaderIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(156, 163, 175, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputFieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  componentSelectRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  componentSelectCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(156, 163, 175, 0.25)',
  },
  componentSelectCardActive: {
    borderWidth: 1.5,
  },
  componentSelectText: {
    fontSize: 12,
    fontWeight: '800',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 48,
  },
  modalTextInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  inputSuffixBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
  },
  inputSuffixText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#D97706',
  },
  bpsHelperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  bpsHelperText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D97706',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  immutableNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  immutableNoticeText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
  },
  groupPreviewBox: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 8,
  },
  groupPreviewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupPreviewLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  groupPreviewValue: {
    fontSize: 18,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  groupWarningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(239, 68, 68, 0.2)',
  },
  groupWarningText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
  },
  radioRateList: {
    gap: 6,
  },
  radioRateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  radioRateLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioRateName: {
    fontSize: 13,
    fontWeight: '700',
  },
  radioRatePercent: {
    fontSize: 13,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
});
