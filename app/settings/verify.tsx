// app/settings/verify.tsx — Phase 2 v2.24 Canonical Screen (Unified System Integrity Scan)

import React, { useState, useEffect, memo } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { verifyService, phase2VerifyService, VerifyFinding } from '@/services/phase1/verifyService';
import { verifyStore } from '@/store/phase1/verifyStore';
import { HeaderPill, GlassCard, GlassButton } from '@/components/ui/Glass'; 
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { ShieldCheck, AlertTriangle, CheckCircle, XCircle, Activity, Database, Info } from 'lucide-react-native';
import { COLORS, getThemeColors } from '@/constants/theme';

interface VerifyFindingRowProps {
  item: VerifyFinding;
  colors: ReturnType<typeof getThemeColors>;
}

const VerifyFindingRow = memo(({ item, colors }: VerifyFindingRowProps) => {
  const isCritical = item.severity === 'CRITICAL' || (item.severity as string) === 'CORRUPTED';
  const isInfo = (item.severity as string) === 'INFO';

  const bgColor = isCritical 
    ? 'rgba(254, 226, 226, 0.65)' 
    : isInfo 
    ? 'rgba(224, 242, 254, 0.65)' 
    : 'rgba(255, 237, 213, 0.65)';

  const borderColor = isCritical 
    ? 'rgba(239, 68, 68, 0.4)' 
    : isInfo 
    ? 'rgba(56, 189, 248, 0.4)' 
    : 'rgba(249, 115, 22, 0.4)';

  const iconColor = isCritical ? '#DC2626' : isInfo ? '#0284C7' : '#D97706';
  const textColor = isCritical ? '#991B1B' : isInfo ? '#075985' : '#9A3412';

  return (
    <GlassCard 
      style={{ 
        backgroundColor: bgColor,
        borderColor: borderColor,
        marginBottom: 12,
        borderWidth: 1,
      }}
    >
      <View style={s.findingRowInner}>
        <View style={[s.iconCircle, { borderColor: `${iconColor}40` }]}>
          {isCritical ? (
            <XCircle size={22} color={iconColor} />
          ) : isInfo ? (
            <Info size={22} color={iconColor} />
          ) : (
            <AlertTriangle size={22} color={iconColor} />
          )}
        </View>
        
        <View style={{ flex: 1 }}>
          <View style={s.checkHeaderRow}>
            <Text style={[s.checkTitle, { color: textColor }]}>
              {item.check}
            </Text>
            <View style={[s.severityBadge, { backgroundColor: `${iconColor}18`, borderColor: `${iconColor}35` }]}>
              <Text style={[s.severityBadgeText, { color: iconColor }]}>
                {item.severity}
              </Text>
            </View>
          </View>

          <Text style={[s.checkDetail, { color: textColor }]}>
            {item.detail}
          </Text>
          
          {isCritical && (
            <View style={s.safeModeBadge}>
              <ShieldCheck size={12} color="#DC2626" />
              <Text style={s.safeModeBadgeText}>CONSTITUTIONAL GUARD ACTIVE</Text>
            </View>
          )}
        </View>
      </View>
    </GlassCard>
  );
});

export default function VerifyDataScreen() {
  const insets = useSafeAreaInsets();
  const { activeFirmId } = useFirmStore();
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<VerifyFinding[] | null>(null);
  const [status, setStatus] = useState<'IDLE' | 'CLEAN' | 'ISSUES'>('IDLE');

  const lastScanIssues = verifyStore((s: any) => s.lastScanIssues);
  const markWarningsViewed = verifyStore((s: any) => s.markWarningsViewed);

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  useEffect(() => {
    if (lastScanIssues && lastScanIssues.length > 0) {
      setResults(lastScanIssues);
      setStatus('ISSUES');
    }
    if (typeof markWarningsViewed === 'function') {
      markWarningsViewed();
    }
  }, [lastScanIssues, markWarningsViewed]);

  const runScan = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    if (!activeFirmId) {
      Alert.alert('Firm Required', 'Please select an active firm before running a constitutional scan.');
      return;
    }

    setScanning(true);
    setResults(null);
    setStatus('IDLE');

    try {
      const allFindings: VerifyFinding[] = [];

      // Phase 1: Core System, SQLite PRAGMAs, Firms & Settings Checks
      if (verifyService && typeof verifyService.runVerify === 'function') {
        const coreResult = await verifyService.runVerify(activeFirmId);
        const coreIssues = Array.isArray(coreResult) 
          ? coreResult 
          : (coreResult as any)?.findings || (coreResult as any)?.issues || [];
        coreIssues.forEach((issue: any) => {
          allFindings.push({
            check: issue.code || issue.check || 'CORE_INTEGRITY',
            severity: (issue.severity as any) || 'CRITICAL',
            detail: issue.message || issue.detail || 'Phase 1 core system integrity check failed.',
            firmId: activeFirmId,
          });
        });
      }

      // Phase 2: Inventory Ledger, Masters, Weights, URD & Vault Truth Checks
      if (phase2VerifyService && typeof phase2VerifyService.runVerify === 'function') {
        const phase2Result = await phase2VerifyService.runVerify(activeFirmId);
        const p2Issues = Array.isArray(phase2Result) 
          ? phase2Result 
          : (phase2Result as any)?.issues || (phase2Result as any)?.findings || [];
        p2Issues.forEach((issue: any) => {
          // Avoid duplicate findings if services overlap
          const isDuplicate = allFindings.some(
            (f) => f.check === (issue.code || issue.check) && f.detail === (issue.message || issue.detail)
          );
          if (!isDuplicate) {
            allFindings.push({
              check: issue.code || issue.check || 'INVENTORY_INTEGRITY',
              severity: (issue.severity as any) || 'WARNING',
              detail: issue.message || issue.detail || 'Phase 2 inventory discrepancy detected.',
              firmId: activeFirmId,
            });
          }
        });
      }

      setResults(allFindings);
      setStatus(allFindings.length > 0 ? 'ISSUES' : 'CLEAN');
    } catch (e: any) {
      Alert.alert('Scan Failed', e.message || 'System integrity verification encountered an unhandled error.');
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
    <View style={{ paddingTop: 28 }}>
      <View style={{ marginBottom: 24 }}>
        <GlassButton 
          title={scanning ? 'Scanning System Layers...' : 'Run Deep Scan'} 
          onPress={runScan} 
          disabled={scanning}
          icon={
            scanning ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Activity size={18} color="#fff" />
            )
          }
        />
      </View>

      {status === 'CLEAN' && (
        <GlassCard style={[s.cleanCard, { borderColor: 'rgba(22, 163, 74, 0.35)' }]}>
          <View style={s.cleanCardInner}>
            <View style={s.cleanIconBox}>
              <CheckCircle size={44} color="#15803D" />
            </View>
            <Text style={s.cleanTitle}>All Systems Constitutional</Text>
            <Text style={s.cleanSubtitle}>
              Zero corruption, foreign key anomalies, or physical weight discrepancies detected across Phase 1 and Phase 2 ledgers.
            </Text>
          </View>
        </GlassCard>
      )}

      {status === 'ISSUES' && results && (
        <Text style={[s.issuesHeaderTitle, { color: COLORS.danger }]}>
          Discrepancies Detected ({results.length})
        </Text>
      )}
    </View>
  );

  return (
    <TwoToneWrapper title="System Integrity" showBack headerContent={verifyHeaderPills}>
      <View style={s.container}>
        <FlashList
          data={status === 'ISSUES' && results ? results : []}
          // @ts-ignore
          estimatedItemSize={120}
          keyExtractor={(item, index) => `${item.check}_${item.severity}_${index}`}
          renderItem={({ item }) => <VerifyFindingRow item={item} colors={colors} />}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{ 
            paddingHorizontal: 16,
            paddingBottom: Math.max(insets.bottom + 40, 80) 
          }}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  container: { 
    flex: 1 
  },
  findingRowInner: { 
    flexDirection: 'row', 
    gap: 12, 
    alignItems: 'flex-start' 
  },
  iconCircle: { 
    backgroundColor: '#fff', 
    padding: 8, 
    borderRadius: 999, 
    borderWidth: 1, 
    marginTop: 2 
  },
  checkHeaderRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    marginBottom: 4 
  },
  checkTitle: { 
    fontWeight: '800', 
    fontSize: 15, 
    flex: 1, 
    marginRight: 8 
  },
  severityBadge: { 
    paddingHorizontal: 7, 
    paddingVertical: 2, 
    borderRadius: 6, 
    borderWidth: 1 
  },
  severityBadgeText: { 
    fontSize: 9, 
    fontWeight: '900', 
    letterSpacing: 0.5 
  },
  checkDetail: { 
    fontSize: 13, 
    fontWeight: '500', 
    lineHeight: 18, 
    opacity: 0.9 
  },
  safeModeBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4, 
    backgroundColor: 'rgba(239, 68, 68, 0.12)', 
    borderColor: 'rgba(239, 68, 68, 0.25)', 
    borderWidth: 1, 
    alignSelf: 'flex-start', 
    paddingHorizontal: 8, 
    paddingVertical: 3, 
    borderRadius: 6, 
    marginTop: 8 
  },
  safeModeBadgeText: { 
    color: '#DC2626', 
    fontSize: 9.5, 
    fontWeight: '800', 
    letterSpacing: 0.5 
  },
  cleanCard: { 
    backgroundColor: 'rgba(220, 252, 231, 0.55)', 
    borderRadius: 20, 
    borderWidth: 1, 
    marginBottom: 20, 
    padding: 20 
  },
  cleanCardInner: { 
    alignItems: 'center', 
    paddingVertical: 8 
  },
  cleanIconBox: { 
    marginBottom: 12 
  },
  cleanTitle: { 
    color: '#15803D', 
    fontWeight: '800', 
    fontSize: 18, 
    marginBottom: 6 
  },
  cleanSubtitle: { 
    color: '#166534', 
    fontSize: 13, 
    textAlign: 'center', 
    lineHeight: 18, 
    opacity: 0.85 
  },
  issuesHeaderTitle: { 
    fontWeight: '900', 
    marginBottom: 12, 
    textTransform: 'uppercase', 
    letterSpacing: 1, 
    fontSize: 11, 
    marginLeft: 4 
  },
});