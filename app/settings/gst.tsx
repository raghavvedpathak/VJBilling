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
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { useSession } from '@/hooks/useSession';
import { taxMasterService } from '@/services/phase3/taxMasterService';
import { TaxRate, TaxGroupWithRates, TaxComponent } from '@/types/phase3/phase3.types';
import { GlassCard, GlassButton } from '@/components/ui/Glass';
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
} from 'lucide-react-native';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { getThemeColors } from '@/constants/theme';
import { ERR } from '@/constants/errorCodes';

export default function GSTSettingsScreen() {
  const router = useRouter();
  const { firm } = useSession();
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const [activeTab, setActiveTab] = useState<'RATES' | 'GROUPS'>('RATES');
  const [isLoading, setIsLoading] = useState(true);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [taxGroups, setTaxGroups] = useState<TaxGroupWithRates[]>([]);

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

  const activeCgstRates = taxRates.filter((r) => r.isActive === 1 && r.taxType === 'CGST');
  const activeSgstRates = taxRates.filter((r) => r.isActive === 1 && r.taxType === 'SGST');

  const customHeader = (
    <View className="mb-2">
      <View className="flex-row items-center justify-between mb-4">
        <TouchableOpacity
          onPress={() => router.back()}
          className="bg-white/15 p-2.5 rounded-full border border-white/20 active:bg-white/25"
        >
          <ArrowLeft size={20} color="#FCFBF8" />
        </TouchableOpacity>
        <Text className="text-vj-bg text-xl font-extrabold tracking-tight">GST Tax Master</Text>
        <View className="w-10" />
      </View>

      {/* Segmented Tab Switcher */}
      <View className="flex-row bg-white/10 p-1 rounded-2xl border border-white/20 mb-2">
        <TouchableOpacity
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            setActiveTab('RATES');
          }}
          className={`flex-1 py-2.5 rounded-xl items-center flex-row justify-center gap-1.5 ${
            activeTab === 'RATES' ? 'bg-white shadow-sm' : ''
          }`}
        >
          <Percent size={15} color={activeTab === 'RATES' ? colors.vjText : '#FCFBF8'} />
          <Text
            className={`text-xs font-black uppercase tracking-wider ${
              activeTab === 'RATES' ? 'text-vj-text' : 'text-vj-bg/80'
            }`}
          >
            Tax Rates
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            setActiveTab('GROUPS');
          }}
          className={`flex-1 py-2.5 rounded-xl items-center flex-row justify-center gap-1.5 ${
            activeTab === 'GROUPS' ? 'bg-white shadow-sm' : ''
          }`}
        >
          <Layers size={15} color={activeTab === 'GROUPS' ? colors.vjText : '#FCFBF8'} />
          <Text
            className={`text-xs font-black uppercase tracking-wider ${
              activeTab === 'GROUPS' ? 'text-vj-text' : 'text-vj-bg/80'
            }`}
          >
            Tax Groups
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <TwoToneWrapper title="" headerContent={customHeader}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 100 }}
      >
        {isLoading ? (
          <View className="py-20 justify-center items-center">
            <ActivityIndicator size="large" color="#D4AF37" />
            <Text className="text-vj-text/60 font-semibold mt-3 text-sm">
              Loading Tax Master...
            </Text>
          </View>
        ) : activeTab === 'RATES' ? (
          /* ========================================================== */
          /* TAB 1: TAX RATES                                          */
          /* ========================================================== */
          <View>
            <View className="flex-row justify-between items-center mb-4 px-1">
              <Text className="text-vj-text/70 text-xs font-black uppercase tracking-wider">
                Active & Inactive Rates ({taxRates.length})
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setRateName('');
                  setRatePercent('');
                  setRateComponent('CGST');
                  setShowAddRateModal(true);
                }}
                className="flex-row items-center gap-1 bg-amber-600/15 border border-amber-500/30 px-3 py-1.5 rounded-full active:bg-amber-600/25"
              >
                <Plus size={14} color="#D97706" />
                <Text className="text-xs font-bold text-amber-800">Add Rate</Text>
              </TouchableOpacity>
            </View>

            {taxRates.length === 0 ? (
              <GlassCard className="p-8 items-center justify-center">
                <Text className="text-vj-text/60 font-semibold text-center">
                  No tax rates configured.
                </Text>
              </GlassCard>
            ) : (
              taxRates.map((rate) => {
                const isActive = rate.isActive === 1;
                return (
                  <GlassCard key={rate.id} className="p-4 mb-3">
                    <View className="flex-row justify-between items-center">
                      <View className="flex-1 pr-2">
                        <View className="flex-row items-center gap-2 mb-1">
                          <Text className="text-vj-text text-base font-black tracking-tight">
                            {rate.taxName}
                          </Text>
                          <View
                            className={`px-2 py-0.5 rounded-full border ${
                              isActive
                                ? 'bg-emerald-500/15 border-emerald-500/30'
                                : 'bg-gray-400/15 border-gray-400/30'
                            }`}
                          >
                            <Text
                              className={`text-[10px] font-black uppercase ${
                                isActive ? 'text-emerald-700' : 'text-gray-500'
                              }`}
                            >
                              {isActive ? 'Active' : 'Inactive'}
                            </Text>
                          </View>
                        </View>
                        <Text className="text-vj-text/60 text-xs font-medium">
                          Component: <Text className="font-bold">{rate.taxType}</Text> • Rate:{' '}
                          <Text className="font-bold text-amber-700">
                            {(rate.rateBps / 100).toFixed(2)}%
                          </Text>{' '}
                          ({rate.rateBps} bps)
                        </Text>
                      </View>

                      <View className="flex-row items-center gap-2">
                        <TouchableOpacity
                          onPress={() => {
                            setEditingRate(rate);
                            setEditRateName(rate.taxName);
                          }}
                          className="p-2 bg-white/60 rounded-xl border border-gray-200 active:bg-white"
                        >
                          <Pencil size={15} color="#4B5563" />
                        </TouchableOpacity>

                        {isActive && (
                          <TouchableOpacity
                            onPress={() => handleDeactivateRate(rate)}
                            className="p-2 bg-red-500/10 rounded-xl border border-red-500/25 active:bg-red-500/20"
                          >
                            <Ban size={15} color="#EF4444" />
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
            <View className="flex-row justify-between items-center mb-4 px-1">
              <Text className="text-vj-text/70 text-xs font-black uppercase tracking-wider">
                Configured Tax Groups ({taxGroups.length})
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setGroupName('');
                  setSelectedCgstRateId(activeCgstRates[0]?.id || '');
                  setSelectedSgstRateId(activeSgstRates[0]?.id || '');
                  setShowCreateGroupModal(true);
                }}
                className="flex-row items-center gap-1 bg-amber-600/15 border border-amber-500/30 px-3 py-1.5 rounded-full active:bg-amber-600/25"
              >
                <Plus size={14} color="#D97706" />
                <Text className="text-xs font-bold text-amber-800">Create Group</Text>
              </TouchableOpacity>
            </View>

            {taxGroups.length === 0 ? (
              <GlassCard className="p-8 items-center justify-center">
                <Text className="text-vj-text/60 font-semibold text-center">
                  No tax groups configured.
                </Text>
              </GlassCard>
            ) : (
              taxGroups.map((group) => {
                const isActive = group.isActive === 1;
                return (
                  <GlassCard key={group.id} className="p-4 mb-3">
                    <View className="flex-row justify-between items-center">
                      <View className="flex-1 pr-2">
                        <View className="flex-row items-center gap-2 mb-1">
                          <Text className="text-vj-text text-base font-black tracking-tight">
                            {group.groupName}
                          </Text>
                          <View
                            className={`px-2 py-0.5 rounded-full border ${
                              isActive
                                ? 'bg-emerald-500/15 border-emerald-500/30'
                                : 'bg-gray-400/15 border-gray-400/30'
                            }`}
                          >
                            <Text
                              className={`text-[10px] font-black uppercase ${
                                isActive ? 'text-emerald-700' : 'text-gray-500'
                              }`}
                            >
                              {isActive ? 'Active' : 'Inactive'}
                            </Text>
                          </View>
                        </View>
                        <Text className="text-amber-800 font-extrabold text-xs mb-0.5">
                          Combined: {group.combinedRatePercent}%
                        </Text>
                        <Text className="text-vj-text/60 text-xs font-medium">
                          {group.cgstRate.taxName} ({(group.cgstRate.rateBps / 100).toFixed(1)}%) +{' '}
                          {group.sgstRate.taxName} ({(group.sgstRate.rateBps / 100).toFixed(1)}%)
                        </Text>
                      </View>

                      {isActive && (
                        <TouchableOpacity
                          onPress={() => handleDeactivateGroup(group)}
                          className="p-2 bg-red-500/10 rounded-xl border border-red-500/25 active:bg-red-500/20"
                        >
                          <Ban size={15} color="#EF4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </GlassCard>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* ============================================================ */}
      {/* MODAL: ADD TAX RATE                                         */}
      {/* ============================================================ */}
      <Modal visible={showAddRateModal} transparent animationType="fade">
        <View className="flex-1 bg-black/60 justify-center items-center px-5">
          <View className="w-full bg-vj-bg rounded-3xl p-6 border border-white/40 shadow-2xl">
            <Text className="text-xl font-black text-vj-text mb-4">Add Tax Rate</Text>

            <Text className="text-xs font-bold text-vj-text/70 mb-1">TAX NAME</Text>
            <TextInput
              value={rateName}
              onChangeText={setRateName}
              placeholder="e.g. CGST 1.5%"
              className="w-full bg-white/70 border border-black/10 rounded-xl p-3 mb-3 text-vj-text font-bold"
            />

            <Text className="text-xs font-bold text-vj-text/70 mb-1">RATE PERCENT (%)</Text>
            <TextInput
              value={ratePercent}
              onChangeText={setRatePercent}
              keyboardType="decimal-pad"
              placeholder="e.g. 1.5"
              className="w-full bg-white/70 border border-black/10 rounded-xl p-3 mb-3 text-vj-text font-bold"
            />

            <Text className="text-xs font-bold text-vj-text/70 mb-1">TAX COMPONENT</Text>
            <View className="flex-row gap-2 mb-6">
              <TouchableOpacity
                onPress={() => setRateComponent('CGST')}
                className={`flex-1 py-2.5 rounded-xl items-center border ${
                  rateComponent === 'CGST'
                    ? 'bg-amber-500 border-amber-600'
                    : 'bg-white/60 border-black/10'
                }`}
              >
                <Text
                  className={`font-bold text-xs ${
                    rateComponent === 'CGST' ? 'text-white' : 'text-vj-text'
                  }`}
                >
                  CGST
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setRateComponent('SGST')}
                className={`flex-1 py-2.5 rounded-xl items-center border ${
                  rateComponent === 'SGST'
                    ? 'bg-amber-500 border-amber-600'
                    : 'bg-white/60 border-black/10'
                }`}
              >
                <Text
                  className={`font-bold text-xs ${
                    rateComponent === 'SGST' ? 'text-white' : 'text-vj-text'
                  }`}
                >
                  SGST
                </Text>
              </TouchableOpacity>
            </View>

            <View className="flex-row gap-2">
              <View className="flex-1">
                <GlassButton
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setShowAddRateModal(false)}
                />
              </View>
              <View className="flex-1">
                <GlassButton title="Save Rate" variant="primary" onPress={handleSaveRate} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* MODAL: EDIT TAX RATE NAME                                    */}
      {/* ============================================================ */}
      <Modal visible={!!editingRate} transparent animationType="fade">
        <View className="flex-1 bg-black/60 justify-center items-center px-5">
          <View className="w-full bg-vj-bg rounded-3xl p-6 border border-white/40 shadow-2xl">
            <Text className="text-xl font-black text-vj-text mb-2">Edit Tax Rate Name</Text>
            <Text className="text-xs text-vj-text/60 mb-4">
              Note: Rate BPS is immutable to protect past financial records.
            </Text>

            <Text className="text-xs font-bold text-vj-text/70 mb-1">NEW TAX NAME</Text>
            <TextInput
              value={editRateName}
              onChangeText={setEditRateName}
              placeholder="e.g. CGST 1.5% (Updated)"
              className="w-full bg-white/70 border border-black/10 rounded-xl p-3 mb-6 text-vj-text font-bold"
            />

            <View className="flex-row gap-2">
              <View className="flex-1">
                <GlassButton
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setEditingRate(null)}
                />
              </View>
              <View className="flex-1">
                <GlassButton title="Update" variant="primary" onPress={handleUpdateRateName} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* MODAL: CREATE TAX GROUP                                     */}
      {/* ============================================================ */}
      <Modal visible={showCreateGroupModal} transparent animationType="fade">
        <View className="flex-1 bg-black/60 justify-center items-center px-5">
          <View className="w-full bg-vj-bg rounded-3xl p-6 border border-white/40 shadow-2xl max-h-[85%]">
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text className="text-xl font-black text-vj-text mb-2">Create Tax Group</Text>
              <Text className="text-xs text-vj-text/60 mb-4">
                Rule: Intra-state GST requires exactly 1 CGST and 1 SGST with identical rates.
              </Text>

              <Text className="text-xs font-bold text-vj-text/70 mb-1">GROUP NAME</Text>
              <TextInput
                value={groupName}
                onChangeText={setGroupName}
                placeholder="e.g. GST 3%"
                className="w-full bg-white/70 border border-black/10 rounded-xl p-3 mb-4 text-vj-text font-bold"
              />

              <Text className="text-xs font-bold text-vj-text/70 mb-1.5">SELECT CGST RATE</Text>
              <View className="gap-1.5 mb-4">
                {activeCgstRates.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    onPress={() => setSelectedCgstRateId(r.id)}
                    className={`p-3 rounded-xl border flex-row justify-between items-center ${
                      selectedCgstRateId === r.id
                        ? 'bg-amber-500/15 border-amber-500'
                        : 'bg-white/60 border-black/10'
                    }`}
                  >
                    <Text className="font-bold text-xs text-vj-text">{r.taxName}</Text>
                    <Text className="font-black text-xs text-amber-800">
                      {(r.rateBps / 100).toFixed(2)}%
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text className="text-xs font-bold text-vj-text/70 mb-1.5">SELECT SGST RATE</Text>
              <View className="gap-1.5 mb-6">
                {activeSgstRates.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    onPress={() => setSelectedSgstRateId(r.id)}
                    className={`p-3 rounded-xl border flex-row justify-between items-center ${
                      selectedSgstRateId === r.id
                        ? 'bg-amber-500/15 border-amber-500'
                        : 'bg-white/60 border-black/10'
                    }`}
                  >
                    <Text className="font-bold text-xs text-vj-text">{r.taxName}</Text>
                    <Text className="font-black text-xs text-amber-800">
                      {(r.rateBps / 100).toFixed(2)}%
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View className="flex-row gap-2">
                <View className="flex-1">
                  <GlassButton
                    title="Cancel"
                    variant="secondary"
                    onPress={() => setShowCreateGroupModal(false)}
                  />
                </View>
                <View className="flex-1">
                  <GlassButton title="Create Group" variant="primary" onPress={handleSaveGroup} />
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </TwoToneWrapper>
  );
}
