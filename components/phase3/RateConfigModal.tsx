// components/RateConfigModal.tsx — Phase 3 Daily Metal Rates Configuration Modal
// Implements STEP RE (v5.6 / v5.41)

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { GlassCard, GlassButton } from '@/components/ui/Glass';
import { rateEngineService } from '@/services/phase3/rateEngineService';
import { RateEngineOutput } from '@/types/phase3/phase3.types';
import { Coins, Sparkles, X, ShieldCheck } from 'lucide-react-native';
import { getUserFriendlyErrorMessage } from '@/constants/errorMessageMap';
import { getCurrencySymbol } from '@/utils/currency';

interface RateConfigModalProps {
  visible: boolean;
  firmId: string;
  onClose: () => void;
  onSaved?: (rates: RateEngineOutput) => void;
}

export function RateConfigModal({ visible, firmId, onClose, onSaved }: RateConfigModalProps) {
  const currencySymbol = getCurrencySymbol();
  const [gold24Rupees, setGold24Rupees] = useState('');
  const [gold22Rupees, setGold22Rupees] = useState('');
  const [goldCashRupees, setGoldCashRupees] = useState('');
  const [silverCashRupees, setSilverCashRupees] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (visible && firmId) {
      loadCurrentRates();
    }
  }, [visible, firmId]);

  const loadCurrentRates = async () => {
    setIsLoading(true);
    try {
      const current = await rateEngineService.getCurrentRates(firmId);
      if (current) {
        // Reverse conversion: per-gram / 100 * 10
        setGold24Rupees(String(Math.round((current.gold24BasePerGramPaise * 10) / 100)));
        setGold22Rupees(String(Math.round((current.gold22BasePerGramPaise * 10) / 100)));
        setGoldCashRupees(String(Math.round((current.goldCashPerGramPaise * 10) / 100)));
        setSilverCashRupees(String(Math.round((current.silverCashPerGramPaise * 1000) / 100)));
      }
    } catch (e) {
      console.warn('[RateConfigModal] Failed to load current rates:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // Real-time dynamic preview computations
  const g24Num = parseInt(gold24Rupees, 10) || 0;
  const g24PerGram = Math.round(g24Num / 10);
  const g24Gst = Math.round(g24PerGram * 0.03);
  const g24WithGst = g24PerGram + g24Gst;

  const g22Num = parseInt(gold22Rupees, 10) || 0;
  const g22PerGram = Math.round(g22Num / 10);
  const g22Gst = Math.round(g22PerGram * 0.03);
  const g22WithGst = g22PerGram + g22Gst;

  const gCashNum = parseInt(goldCashRupees, 10) || 0;
  const gCashPerGram = Math.round(gCashNum / 10);

  const sCashNum = parseInt(silverCashRupees, 10) || 0;
  const sCashPerGram = (sCashNum / 1000).toFixed(2);
  const sCashPer10g = Math.round(sCashNum / 100);

  const handleSave = async () => {
    const g24 = parseInt(gold24Rupees.trim(), 10);
    const g22 = parseInt(gold22Rupees.trim(), 10);
    const gCash = parseInt(goldCashRupees.trim(), 10);
    const sCash = parseInt(silverCashRupees.trim(), 10);

    if (isNaN(g24) || g24 <= 0 || isNaN(g22) || g22 <= 0 || isNaN(gCash) || gCash <= 0 || isNaN(sCash) || sCash <= 0) {
      Alert.alert('Validation Error', `All four rates must be positive whole numbers in rupees (e.g. ${currencySymbol}60000).`);
      return;
    }

    setIsSaving(true);
    try {
      await rateEngineService.saveRates(firmId, {
        gold24BasePer10g_rupees: g24,
        gold22BasePer10g_rupees: g22,
        goldCashPer10g_rupees: gCash,
        silverCashPerKg_rupees: sCash,
      });

      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      const updated = await rateEngineService.getCurrentRates(firmId);
      if (updated && onSaved) {
        onSaved(updated);
      }
      onClose();
    } catch (e: any) {
      Alert.alert('Error', getUserFriendlyErrorMessage(e));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View className="flex-1 bg-black/60 justify-end">
        <View className="bg-vj-bg rounded-t-3xl p-6 border-t border-white/50 shadow-2xl max-h-[90%]">
          <View className="flex-row justify-between items-center mb-4">
            <View className="flex-row items-center gap-2">
              <View className="p-2 bg-amber-500/15 rounded-xl border border-amber-500/30">
                <Coins size={20} color="#D97706" />
              </View>
              <Text className="text-xl font-black text-vj-text tracking-tight">Daily Metal Rates</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="p-2 bg-black/5 rounded-full">
              <X size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <Text className="text-xs text-vj-text/60 mb-4 font-semibold">
            Enter today's base rates in rupees. All values are automatically converted to paise and snapshotted at invoice creation.
          </Text>

          {isLoading ? (
            <View className="py-12 items-center">
              <ActivityIndicator size="large" color="#D4AF37" />
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* GOLD 24K */}
              <GlassCard className="p-3.5 mb-3">
                <Text className="text-xs font-black text-amber-800 uppercase tracking-wider mb-1">
                  Gold 24K Base Rate (per 10g)
                </Text>
                <View className="flex-row items-center bg-white/70 rounded-xl px-3 py-1 border border-black/10 mb-2">
                  <Text className="text-base font-black text-vj-text mr-1.5">{currencySymbol}</Text>
                  <TextInput
                    value={gold24Rupees}
                    onChangeText={setGold24Rupees}
                    keyboardType="number-pad"
                    placeholder="e.g. 60000"
                    className="flex-1 text-base font-bold text-vj-text py-2"
                  />
                </View>
                {g24Num > 0 && (
                  <View className="flex-row justify-between bg-amber-50/60 p-2 rounded-lg border border-amber-200/50">
                    <Text className="text-[11px] font-medium text-amber-900">
                      Base: <Text className="font-bold">{currencySymbol}{g24PerGram}/g</Text>
                    </Text>
                    <Text className="text-[11px] font-medium text-amber-900">
                      GST (3%): <Text className="font-bold">{currencySymbol}{g24Gst}/g</Text>
                    </Text>
                    <Text className="text-[11px] font-black text-amber-900">
                      Total: {currencySymbol}{g24WithGst}/g
                    </Text>
                  </View>
                )}
              </GlassCard>

              {/* GOLD 22K */}
              <GlassCard className="p-3.5 mb-3">
                <Text className="text-xs font-black text-amber-800 uppercase tracking-wider mb-1">
                  Gold 22K Base Rate (per 10g)
                </Text>
                <View className="flex-row items-center bg-white/70 rounded-xl px-3 py-1 border border-black/10 mb-2">
                  <Text className="text-base font-black text-vj-text mr-1.5">{currencySymbol}</Text>
                  <TextInput
                    value={gold22Rupees}
                    onChangeText={setGold22Rupees}
                    keyboardType="number-pad"
                    placeholder="e.g. 58000"
                    className="flex-1 text-base font-bold text-vj-text py-2"
                  />
                </View>
                {g22Num > 0 && (
                  <View className="flex-row justify-between bg-amber-50/60 p-2 rounded-lg border border-amber-200/50">
                    <Text className="text-[11px] font-medium text-amber-900">
                      Base: <Text className="font-bold">{currencySymbol}{g22PerGram}/g</Text>
                    </Text>
                    <Text className="text-[11px] font-medium text-amber-900">
                      GST (3%): <Text className="font-bold">{currencySymbol}{g22Gst}/g</Text>
                    </Text>
                    <Text className="text-[11px] font-black text-amber-900">
                      Total: {currencySymbol}{g22WithGst}/g
                    </Text>
                  </View>
                )}
              </GlassCard>

              {/* GOLD CASH */}
              <GlassCard className="p-3.5 mb-3">
                <Text className="text-xs font-black text-amber-800 uppercase tracking-wider mb-1">
                  Gold Cash Rate (per 10g — No GST)
                </Text>
                <View className="flex-row items-center bg-white/70 rounded-xl px-3 py-1 border border-black/10 mb-2">
                  <Text className="text-base font-black text-vj-text mr-1.5">{currencySymbol}</Text>
                  <TextInput
                    value={goldCashRupees}
                    onChangeText={setGoldCashRupees}
                    keyboardType="number-pad"
                    placeholder="e.g. 59800"
                    className="flex-1 text-base font-bold text-vj-text py-2"
                  />
                </View>
                {gCashNum > 0 && (
                  <View className="bg-amber-50/60 p-2 rounded-lg border border-amber-200/50">
                    <Text className="text-[11px] font-bold text-amber-900">
                      Cash Rate: {currencySymbol}{gCashPerGram}/g
                    </Text>
                  </View>
                )}
              </GlassCard>

              {/* SILVER CASH */}
              <GlassCard className="p-3.5 mb-6">
                <Text className="text-xs font-black text-gray-800 uppercase tracking-wider mb-1">
                  Silver Cash Rate (per KG — No GST)
                </Text>
                <View className="flex-row items-center bg-white/70 rounded-xl px-3 py-1 border border-black/10 mb-2">
                  <Text className="text-base font-black text-vj-text mr-1.5">{currencySymbol}</Text>
                  <TextInput
                    value={silverCashRupees}
                    onChangeText={setSilverCashRupees}
                    keyboardType="number-pad"
                    placeholder="e.g. 75000"
                    className="flex-1 text-base font-bold text-vj-text py-2"
                  />
                </View>
                {sCashNum > 0 && (
                  <View className="flex-row justify-between bg-gray-100/80 p-2 rounded-lg border border-gray-200">
                    <Text className="text-[11px] font-bold text-gray-800">
                      Per gram: {currencySymbol}{sCashPerGram}/g
                    </Text>
                    <Text className="text-[11px] font-bold text-gray-800">
                      Per 10g: {currencySymbol}{sCashPer10g}
                    </Text>
                  </View>
                )}
              </GlassCard>

              <View className="flex-row gap-2.5 mb-6">
                <View className="flex-1">
                  <GlassButton title="Cancel" variant="secondary" onPress={onClose} disabled={isSaving} />
                </View>
                <View className="flex-1">
                  <GlassButton title={isSaving ? "Saving..." : "Save Rates"} variant="primary" onPress={handleSave} disabled={isSaving} />
                </View>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
