import React, { useState, useEffect, memo } from 'react';
import { View, Text } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { verifyService, VerifyFinding } from '../../services/verifyService';
import { verifyStore } from '../../store/verifyStore';
import { HeaderPill, GlassCard, GlassButton } from '../../components/ui/Glass'; 
import { useStore } from 'zustand';
import { appSettingsStore } from '../../store/appSettingsStore';
import { ShieldCheck, AlertTriangle, CheckCircle, XCircle, Activity, Database } from 'lucide-react-native';
import { COLORS, getThemeColors } from '../../constants/theme';

const VerifyFindingRow = memo(({ item }: { item: VerifyFinding }) => {
  return (
    <GlassCard 
      style={{ 
        backgroundColor: item.severity === 'CRITICAL' ? 'rgba(254, 226, 226, 0.5)' : 'rgba(255, 237, 213, 0.5)',
        borderColor: item.severity === 'CRITICAL' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(249, 115, 22, 0.3)',
        marginBottom: 12
      }}
    >
      <View className="flex-row gap-4">
        <View className="mt-1 bg-white/40 p-2 rounded-full self-start border border-white/50">
          {item.severity === 'CRITICAL' ? (
            <XCircle size={24} color="#b91c1c" />
          ) : (
            <AlertTriangle size={24} color="#c2410c" />
          )}
        </View>
        
        <View className="flex-1">
          <Text className={`font-bold text-lg ${item.severity === 'CRITICAL' ? 'text-vj-danger' : 'text-orange-900'}`}>
            {item.check}
          </Text>
          <Text className={`${item.severity === 'CRITICAL' ? 'text-vj-danger/80' : 'text-orange-800'} mt-1 font-medium leading-5`}>
            {item.detail}
          </Text>
          
          {item.severity === 'CRITICAL' && (
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
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<VerifyFinding[] | null>(null);
  const [status, setStatus] = useState<'IDLE' | 'CLEAN' | 'ISSUES'>('IDLE');

  const { lastScanIssues, markWarningsViewed } = verifyStore();

  const activeTheme = useStore(appSettingsStore, (s) => s.theme);
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

  const runScan = async () => {
    setScanning(true);
    setResults(null);
    setStatus('IDLE');

    try {
      const { status: scanStatus, findings } = await verifyService.runVerify();
      setResults(findings);
      setStatus(findings.length > 0 ? 'ISSUES' : 'CLEAN');
    } catch (e) {
      alert("Scan Failed: " + (e as Error).message);
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
          icon={!scanning && <Activity size={20} color="#FCFBF8" />}
        />
      </View>

      {status === 'CLEAN' && (
        <GlassCard style={{ backgroundColor: 'rgba(220, 252, 231, 0.4)', borderColor: 'rgba(22, 163, 74, 0.3)', marginBottom: 24 }}>
          <View className="items-center py-4">
            <View className="mb-4"><CheckCircle size={48} color="#15803d" /></View>
            <Text className="text-vj-success font-bold text-xl">All Systems Healthy</Text>
            <Text className="text-vj-success/80 text-center mt-2">
              No corruption, orphans, or boundary violations found in the database.
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
          // @ts-ignore: estimatedItemSize required by spec even if missing from standard local FlashList type signatures
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