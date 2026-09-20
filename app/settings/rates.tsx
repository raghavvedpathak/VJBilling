// app/settings/rates.tsx — Phase 3 Daily Metal Rates Screen
// Implements STEP RE (v5.6 / v5.41)

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { useSession } from '@/hooks/useSession';
import { rateEngineService } from '@/services/phase3/rateEngineService';
import { RateEngineOutput } from '@/types/phase3/phase3.types';
import { GlassCard, GlassButton } from '@/components/ui/Glass';
import { Coins, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { getUserFriendlyErrorMessage } from '@/constants/errorMessageMap';
import { getCurrencySymbol } from '@/utils/currency';

export default function MetalRatesScreen() {
  const router = useRouter();
  const { firm } = useSession();
  const currencySymbol = getCurrencySymbol();

  const [gold24Rupees, setGold24Rupees] = useState('');
  const [gold22Rupees, setGold22Rupees] = useState('');
  const [goldCashRupees, setGoldCashRupees] = useState('');
  const [silverCashRupees, setSilverCashRupees] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentRates, setCurrentRates] = useState<RateEngineOutput | null>(null);

  const loadCurrentRates = useCallback(async () => {
    if (!firm?.id) return;
    setIsLoading(true);
    try {
      const current = await rateEngineService.getCurrentRates(firm.id);
      setCurrentRates(current);
      if (current) {
        setGold24Rupees(String(Math.round((current.gold24BasePerGramPaise * 10) / 100)));
        setGold22Rupees(String(Math.round((current.gold22BasePerGramPaise * 10) / 100)));
        setGoldCashRupees(String(Math.round((current.goldCashPerGramPaise * 10) / 100)));
        setSilverCashRupees(String(Math.round((current.silverCashPerGramPaise * 1000) / 100)));
      }
    } catch (e) {
      console.warn('[MetalRatesScreen] Failed to load current rates:', e);
    } finally {
      setIsLoading(false);
    }
  }, [firm?.id]);

  useEffect(() => {
    loadCurrentRates();
  }, [loadCurrentRates]);

  // Real-time live preview calculations
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
    if (!firm?.id) return;
    const g24 = parseInt(gold24Rupees.trim(), 10);
    const g22 = parseInt(gold22Rupees.trim(), 10);
    const gCash = parseInt(goldCashRupees.trim(), 10);
    const sCash = parseInt(silverCashRupees.trim(), 10);

    if (isNaN(g24) || g24 <= 0 || isNaN(g22) || g22 <= 0 || isNaN(gCash) || gCash <= 0 || isNaN(sCash) || sCash <= 0) {
      Alert.alert('Validation Error', `All four rates must be positive whole numbers in rupees (e.g. ${currencySymbol}60,000).`);
      return;
    }

    setIsSaving(true);
    try {
      await rateEngineService.saveRates(firm.id, {
        gold24BasePer10g_rupees: g24,
        gold22BasePer10g_rupees: g22,
        goldCashPer10g_rupees: gCash,
        silverCashPerKg_rupees: sCash,
      });

      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      Alert.alert('Success', "Today's metal rates have been saved successfully.");
      await loadCurrentRates();
    } catch (e: any) {
      Alert.alert('Error', getUserFriendlyErrorMessage(e));
    } finally {
      setIsSaving(false);
    }
  };

  const header = (
    <View className="mb-2">
      <View className="flex-row items-center justify-between mb-2">
        <TouchableOpacity
          onPress={() => router.back()}
          className="bg-white/15 p-2.5 rounded-full border border-white/20 active:bg-white/25"
        >
          <ArrowLeft size={20} color="#FCFBF8" />
        </TouchableOpacity>
        <Text className="text-vj-bg text-xl font-extrabold tracking-tight">Daily Metal Rates</Text>
        <View className="w-10" />
      </View>
    </View>
  );

  return (
    <TwoToneWrapper title="" headerContent={header}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 100 }}
      >
        <View className="mb-4 px-1">
          <Text className="text-vj-text/60 text-xs font-black uppercase tracking-wider">
            Shop Metal Rate Configuration
          </Text>
          <Text className="text-vj-text/70 text-xs font-semibold mt-0.5">
            Configure today's gold and silver rates. Used to auto-fill invoice drafts and snapshotted permanently on POST.
          </Text>
        </View>

        {isLoading ? (
          <View className="py-20 justify-center items-center">
            <ActivityIndicator size="large" color="#D4AF37" />
            <Text className="text-vj-text/60 font-semibold mt-3 text-sm">
              Loading current rates...
            </Text>
          </View>
        ) : (
          <View>
            {/* GOLD 24K */}
            <GlassCard className="p-4 mb-3.5">
              <Text className="text-xs font-black text-amber-800 uppercase tracking-wider mb-1">
                Gold 24K Base Rate (per 10g)
              </Text>
              <View className="flex-row items-center bg-white/70 rounded-xl px-3 py-1.5 border border-black/10 mb-2">
                <Text className="text-lg font-black text-vj-text mr-2">{currencySymbol}</Text>
                <TextInput
                  value={gold24Rupees}
                  onChangeText={setGold24Rupees}
                  keyboardType="number-pad"
                  placeholder="e.g. 60000"
                  className="flex-1 text-base font-bold text-vj-text py-2"
                />
              </View>
              {g24Num > 0 && (
                <View className="flex-row justify-between bg-amber-50/70 p-2.5 rounded-xl border border-amber-200/60">
                  <Text className="text-xs font-medium text-amber-900">
                    Base: <Text className="font-bold">{currencySymbol}{g24PerGram}/g</Text>
                  </Text>
                  <Text className="text-xs font-medium text-amber-900">
                    GST (3%): <Text className="font-bold">{currencySymbol}{g24Gst}/g</Text>
                  </Text>
                  <Text className="text-xs font-black text-amber-900">
                    Total: {currencySymbol}{g24WithGst}/g
                  </Text>
                </View>
              )}
            </GlassCard>

            {/* GOLD 22K */}
            <GlassCard className="p-4 mb-3.5">
              <Text className="text-xs font-black text-amber-800 uppercase tracking-wider mb-1">
                Gold 22K Base Rate (per 10g)
              </Text>
              <View className="flex-row items-center bg-white/70 rounded-xl px-3 py-1.5 border border-black/10 mb-2">
                <Text className="text-lg font-black text-vj-text mr-2">{currencySymbol}</Text>
                <TextInput
                  value={gold22Rupees}
                  onChangeText={setGold22Rupees}
                  keyboardType="number-pad"
                  placeholder="e.g. 58000"
                  className="flex-1 text-base font-bold text-vj-text py-2"
                />
              </View>
              {g22Num > 0 && (
                <View className="flex-row justify-between bg-amber-50/70 p-2.5 rounded-xl border border-amber-200/60">
                  <Text className="text-xs font-medium text-amber-900">
                    Base: <Text className="font-bold">{currencySymbol}{g22PerGram}/g</Text>
                  </Text>
                  <Text className="text-xs font-medium text-amber-900">
                    GST (3%): <Text className="font-bold">{currencySymbol}{g22Gst}/g</Text>
                  </Text>
                  <Text className="text-xs font-black text-amber-900">
                    Total: {currencySymbol}{g22WithGst}/g
                  </Text>
                </View>
              )}
            </GlassCard>

            {/* GOLD CASH */}
            <GlassCard className="p-4 mb-3.5">
              <Text className="text-xs font-black text-amber-800 uppercase tracking-wider mb-1">
                Gold Cash Rate (per 10g — No GST)
              </Text>
              <View className="flex-row items-center bg-white/70 rounded-xl px-3 py-1.5 border border-black/10 mb-2">
                <Text className="text-lg font-black text-vj-text mr-2">{currencySymbol}</Text>
                <TextInput
                  value={goldCashRupees}
                  onChangeText={setGoldCashRupees}
                  keyboardType="number-pad"
                  placeholder="e.g. 59800"
                  className="flex-1 text-base font-bold text-vj-text py-2"
                />
              </View>
              {gCashNum > 0 && (
                <View className="bg-amber-50/70 p-2.5 rounded-xl border border-amber-200/60">
                  <Text className="text-xs font-bold text-amber-900">
                    Cash Rate: {currencySymbol}{gCashPerGram}/g
                  </Text>
                </View>
              )}
            </GlassCard>

            {/* SILVER CASH */}
            <GlassCard className="p-4 mb-6">
              <Text className="text-xs font-black text-gray-800 uppercase tracking-wider mb-1">
                Silver Cash Rate (per KG — No GST)
              </Text>
              <View className="flex-row items-center bg-white/70 rounded-xl px-3 py-1.5 border border-black/10 mb-2">
                <Text className="text-lg font-black text-vj-text mr-2">{currencySymbol}</Text>
                <TextInput
                  value={silverCashRupees}
                  onChangeText={setSilverCashRupees}
                  keyboardType="number-pad"
                  placeholder="e.g. 75000"
                  className="flex-1 text-base font-bold text-vj-text py-2"
                />
              </View>
              {sCashNum > 0 && (
                <View className="flex-row justify-between bg-gray-100/80 p-2.5 rounded-xl border border-gray-200">
                  <Text className="text-xs font-bold text-gray-800">
                    Per gram: {currencySymbol}{sCashPerGram}/g
                  </Text>
                  <Text className="text-xs font-bold text-gray-800">
                    Per 10g: {currencySymbol}{sCashPer10g}
                  </Text>
                </View>
              )}
            </GlassCard>

            <GlassButton
              title={isSaving ? "Saving Rates..." : "Save Today's Rates"}
              variant="primary"
              onPress={handleSave}
              disabled={isSaving}
            />
          </View>
        )}
      </ScrollView>
    </TwoToneWrapper>
  );
}
