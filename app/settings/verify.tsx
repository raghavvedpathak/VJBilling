// app/settings/verify.tsx — Phase 2 v2.15 Canonical Screen (Unified System Integrity Scan)

import React, { useState, useEffect, memo } from 'react';
import { View, Text, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { phase2VerifyService, VerifyFinding } from '@/services/phase1/verifyService';
import { verifyStore } from '@/store/phase1/verifyStore';
import { HeaderPill, GlassCard, GlassButton } from '@/components/ui/Glass'; 
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { ShieldCheck, AlertTriangle, CheckCircle, XCircle, Activity, Database, Info } from 'lucide-react-native';
import { COLORS, getThemeColors } from '@/constants/theme';

const VerifyFindingRow = memo(({ item }: { item: VerifyFinding }) => {
  const isCritical = item.severity === 'CRITICAL' || (item.severity as string) === 'CORRUPTED';
  const isInfo = (item.severity as string) === 'INFO';

  const bgColor = isCritical 
    ? 'rgba(254, 226, 226, 0.5)' 
    : isInfo 
    ? 'rgba(224, 242, 254, 0.5)' 
    : 'rgba(255, 237, 213, 0.5)';

  const borderColor = isCritical 
    ? 'rgba(239, 68, 68, 0.3)' 
    : isInfo 
    ? 'rgba(56, 189, 248, 0.3)' 
    : 'rgba(249, 115, 22, 0.3)';

  return (
    <GlassCard 
      style={{ 
        backgroundColor: bgColor,
        borderColor: borderColor,
        marginBottom: 12
      }}
    >
      <View className="flex-row gap-4">
        <View className="mt-1 bg-white/40 p-2 rounded-full self-start border border-white/50">
          {isCritical ? (
            <XCircle size={24} color="#b91c1c" />
          ) : isInfo ? (
            <Info size={24} color="#0284c7" />
          ) : (
            <AlertTriangle size={24} color="#c2410c" />
          )}
        </View>
        
        <View className="flex-1">
          <Text className={`font-bold text-lg ${isCritical ? 'text-vj-danger' : isInfo ? 'text-sky-900' : 'text-orange-900'}`}>
            {item.check}
          </Text>
          <Text className={`${isCritical ? 'text-vj-danger/80' : isInfo ? 'text-sky-800' : 'text-orange-800'} mt-1 font-medium leading-5`}>
            {item.detail}
          </Text>
          
          {isCritical && (
            <View className="bg-red-500/10 border border-red-500/20 self-start px-3 py-1.5 rounded-lg mt-3">
              <Text className="text-vj-danger text-[10px] font-bold">SAFE MODE TRIGGERED</Text>
            </View>
          )}
        </View>
      </View>
    </GlassCard>
  );
});

export default function VerifyDataScreen() {
  const { activeFirmId } = useFirmStore();
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<VerifyFinding[] | null>(null);
  const [status, setStatus] = useState<'IDLE' | 'CLEAN' | 'ISSUES'>('IDLE');

  const { lastScanIssues, markWarningsViewed } = verifyStore();

  const activeTheme = appSettingsStore((s) => s.theme);
  const colors = getThemeColors(activeTheme);

  useEffect(() => {
    if (lastScanIssues && lastScanIssues.length > 0) {
      setResults(lastScanIssues);
      setStatus('ISSUES');
    }
    if (markWarningsViewed) {
      markWarningsViewed();
    }
  }, []);

  // FIX-VERIFY-ADAPTER-1 (v1.31): Executes Phase 1 Core checks + Phase 2 Inventory checks
  const runScan = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    if (!activeFirmId) {
      Alert.alert("Firm Required", "Please select an active firm before running verification.");
      return;
    }
    setScanning(true);
    setResults(null);
    setStatus('IDLE');

    try {
      const issues = await phase2VerifyService.runVerify(activeFirmId);
      const findings: VerifyFinding[] = issues.map(i => ({
        check: i.code,
        severity: i.severity as any,
        detail: i.message,
        firmId: activeFirmId,
      }));

      setResults(findings);
      setStatus(findings.length > 0 ? 'ISSUES' : 'CLEAN');
    } catch (e: any) {
      Alert.alert("Scan Failed", e.message || 'Verification scan failed');
    } finally {
      setScanning(false);
    }
  };

  const verifyHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Database size={12} color={colors.vjBg} />} label="Constitutional Scan" />
      <HeaderPill icon={<ShieldCheck size={12} color="#4ADE80" />} label="Safe Mode Guard" variant="success" />
    </View>
  );

  const listHeader = (
    <View style={{ paddingTop: 32 }}>
      <View className="mb-8">
        <GlassButton 
          title={scanning ? "Scanning Deep Layers..." : "Run Deep Scan"} 
          onPress={runScan} 
          loading={scanning} 
          icon={!scanning ? <Activity size={20} color="#FCFBF8" /> : undefined}
        />
      </View>

      {status === 'CLEAN' && (
        <GlassCard style={{ backgroundColor: 'rgba(220, 252, 231, 0.4)', borderColor: 'rgba(22, 163, 74, 0.3)', marginBottom: 24 }}>
          <View className="items-center py-4">
            <View className="mb-4"><CheckCircle size={48} color="#15803d" /></View>
            <Text className="text-vj-success font-bold text-xl">All Systems Healthy</Text>
            <Text className="text-vj-success/80 text-center mt-2">
              No corruption, orphans, or boundary violations found across inventory or financial records.
            </Text>
          </View>
        </GlassCard>
      )}

      {status === 'ISSUES' && results && (
        <Text className="text-vj-danger font-bold mb-4 uppercase tracking-widest text-xs ml-1">
          Issues Found ({results.length})
        </Text>
      )}
    </View>
  );

  return (
    <TwoToneWrapper title="System Integrity" showBack headerContent={verifyHeaderPills}>
      <View className="flex-1 px-4">
        <FlashList
          data={status === 'ISSUES' && results ? results : []}
          // @ts-ignore
          estimatedItemSize={120}
          keyExtractor={(item) => item.check + '_' + item.detail}
          renderItem={({ item }) => <VerifyFindingRow item={item} />}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{ paddingBottom: 150 }}
        />
      </View>
    </TwoToneWrapper>
  );
}