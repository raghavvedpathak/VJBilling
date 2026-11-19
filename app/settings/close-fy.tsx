// app/settings/close-fy.tsx — Phase 1 v8.0 & Phase 2 Canonical Screen
// Implements CLOSE-FY-FLOW (Step 5), FIX-V710-4, FIX-V742-3 (share: false), FIX-V745-1/2 (kind: 'FYCLOSE'), FIX-V80-8

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { GlassCard, GlassButton, HeaderPill } from '@/components/ui/Glass';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { useSession } from '@/hooks/useSession';
import { useFyBannerStore } from '@/store/phase1/fyBannerStore';
import { fyInventoryService } from '@/services/phase2/fyInventoryService';
import { backupService } from '@/services/phase1/backupService';
import { purgeExpiredAuditLogs } from '@/services/phase1/auditRetentionService';
import '@/services/phase2/inventoryBackupService';
import '@/services/phase3/billingBackupService';
import '@/services/phase4/goldIntelligenceBackupService';
import {
  Lock,
  ShieldAlert,
  ShieldCheck,
  HardDriveDownload,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react-native';
import type { VerifyIssue } from '@/types/phase2/phase2.types';
import { getThemeColors } from '@/constants/theme';

export default function CloseFYScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const { activeFirmId } = useFirmStore();
  const { activeFY, refreshSession } = useSession();

  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [issues, setIssues] = useState<VerifyIssue[]>([]);
  const [canClose, setCanClose] = useState<boolean>(false);

  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [backupPathInfo, setBackupPathInfo] = useState<string | null>(null);
  const [mirroredToPublic, setMirroredToPublic] = useState<boolean>(true);

  const [confirmText, setConfirmText] = useState<string>('');
  const [isClosing, setIsClosing] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    const runPreChecks = async () => {
      if (!activeFirmId || !activeFY) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const result = await fyInventoryService.preCloseChecks(activeFY.id, activeFirmId);
        if (mounted) {
          setIssues(result.issues);
          setCanClose(result.canClose);
        }
      } catch (e: any) {
        if (mounted) {
          Alert.alert(
            'Verification Error',
            e.message || 'Failed to complete pre-close audit.'
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void runPreChecks();
    return () => {
      mounted = false;
    };
  }, [activeFirmId, activeFY]);

  const handleBackup = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    setIsBackingUp(true);
    try {
      const result = await backupService.createBackup(undefined, {
        share: false,
        kind: 'FYCLOSE',
        trigger: 'NOW',
      });
      const kbSize =
        result.fileSizeBytes >= 1024 * 1024
          ? `${(result.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.round(result.fileSizeBytes / 1024)} KB`;
      setMirroredToPublic(result.mirroredToPublicStorage);
      const mirrorText = result.mirroredToPublicStorage
        ? '\nAlso copied to Documents/VJ Billing/backups/'
        : '';
      setBackupPathInfo(`${result.filePath} · ${kbSize}${mirrorText}`);
      setStep(3);
    } catch (e: any) {
      Alert.alert(
        'Backup Failed',
        e.message || 'Backup failed. Financial year closing cancelled for database safety.'
      );
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleCloseFY = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    if (confirmText.trim() !== 'CLOSE') {
      Alert.alert('Validation Error', 'Please type CLOSE exactly as shown to proceed.');
      return;
    }
    if (!activeFirmId || !activeFY) return;

    setIsClosing(true);
    try {
      await fyInventoryService.closeFY(activeFY.id, activeFirmId);

      // FIX-V710-4: Run canonical gated audit retention purge after FY close commits (non-blocking)
      void purgeExpiredAuditLogs().catch(console.error);

      useFyBannerStore.getState().setBannerVisible(false);

      await refreshSession();
      setStep(4);
    } catch (e: any) {
      Alert.alert(
        'Close Operation Failed',
        e.message || 'An error occurred while locking the financial year.'
      );
      setIsClosing(false);
    }
  };

  const headerPills = (
    <View style={s.headerPillRow}>
      <HeaderPill
        icon={<Lock size={12} color={colors.vjBg} />}
        label={activeFY?.label || 'Financial Year'}
      />
      <HeaderPill
        icon={<ShieldCheck size={12} color="#4ADE80" />}
        label="Constitutional Guard"
        variant="success"
      />
    </View>
  );

  if (!activeFY) {
    return (
      <TwoToneWrapper title="Close Financial Year" showBack headerContent={headerPills}>
        <View style={s.centerBox}>
          <Lock size={48} color={colors.vjText} style={{ opacity: 0.3 }} />
          <Text style={[s.emptyTitle, { color: colors.vjText }]}>No Active FY</Text>
          <Text style={[s.emptySub, { color: colors.vjText }]}>
            You do not currently have an active financial year to close.
          </Text>
        </View>
      </TwoToneWrapper>
    );
  }

  const renderStep1 = () => (
    <View>
      <View style={s.headerBox}>
        <View style={[s.stepIconCircle, { backgroundColor: `${colors.vjAccent}15` }]}>
          <ShieldCheck size={32} color={colors.vjAccent} />
        </View>
        <Text style={[s.headerTitle, { color: colors.vjText }]}>
          Step 1: Database Integrity
        </Text>
        <Text style={[s.headerDesc, { color: colors.vjText }]}>
          Running constitutional pre-close checks for {activeFY.label}
        </Text>
      </View>

      <GlassCard style={[s.stepCard, { borderColor: `${colors.vjAccent}25` }]}>
        {loading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator size="small" color={colors.vjAccent} />
            <Text style={[s.loadingText, { color: colors.vjText }]}>
              Validating ledger and inventory truth...
            </Text>
          </View>
        ) : issues.length === 0 ? (
          <View style={s.successBox}>
            <CheckCircle2 size={24} color="#15803d" />
            <Text style={s.successText}>
              All checks passed. Ready to proceed with backup.
            </Text>
          </View>
        ) : (
          <View>
            <Text style={[s.issueWarningTitle, { color: colors.vjText }]}>
              Please resolve these ledger discrepancies first:
            </Text>
            {issues.map((i, idx) => (
              <View
                key={`${i.code}-${idx}`}
                style={[s.issueRow, { borderBottomColor: `${colors.vjAccent}15` }]}
              >
                {i.severity === 'CRITICAL' ? (
                  <ShieldAlert size={18} color="#ef4444" style={{ marginTop: 2 }} />
                ) : (
                  <AlertTriangle size={18} color="#D97706" style={{ marginTop: 2 }} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[s.issueCode, { color: colors.vjText }]}>{i.code}</Text>
                  <Text style={[s.issueMessage, { color: colors.vjText }]}>{i.message}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </GlassCard>

      <GlassButton
        title={canClose ? 'Continue to Backup' : 'Cannot Proceed'}
        onPress={() => setStep(2)}
        disabled={!canClose || loading}
      />
    </View>
  );

  const renderStep2 = () => (
    <View>
      <View style={s.headerBox}>
        <View style={[s.stepIconCircle, { backgroundColor: `${colors.vjAccent}15` }]}>
          <HardDriveDownload size={32} color={colors.vjAccent} />
        </View>
        <Text style={[s.headerTitle, { color: colors.vjText }]}>
          Step 2: Mandatory Safety Snapshot
        </Text>
        <Text style={[s.headerDesc, { color: colors.vjText }]}>
          A complete, verifiable backup is required before final financial year closure.
        </Text>
      </View>

      <GlassCard style={[s.stepCard, { borderColor: `${colors.vjAccent}25` }]}>
        <Text style={[s.infoCardText, { color: colors.vjText }]}>
          Closing a financial year is a permanent, non-reversible operation. Closing balances will
          roll over into new opening balance lots. A full database snapshot guarantees your data
          can always be reconstructed.
        </Text>
        <GlassButton
          title={isBackingUp ? 'Securing Snapshot...' : 'Create Snapshot & Continue'}
          onPress={handleBackup}
          loading={isBackingUp}
        />
      </GlassCard>
    </View>
  );

  const renderStep3 = () => (
    <View>
      <View style={s.headerBox}>
        <View style={[s.stepIconCircle, { backgroundColor: '#fee2e2' }]}>
          <ShieldAlert size={32} color="#ef4444" />
        </View>
        <Text style={[s.headerTitle, { color: '#ef4444' }]}>
          Step 3: Point of No Return
        </Text>
        <Text style={[s.headerDesc, { color: colors.vjText }]}>
          Type CLOSE below to permanently finalize and lock {activeFY.label}.
        </Text>
      </View>

      <GlassCard style={[s.stepCard, { borderColor: 'rgba(239,68,68,0.3)' }]}>
        {backupPathInfo && (
          <View style={{ marginBottom: 14 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '800',
                textTransform: 'uppercase',
                color: colors.vjText,
                opacity: 0.5,
                marginBottom: 4,
              }}
            >
              Verified Snapshot Secured:
            </Text>
            <Text
              style={{
                fontSize: 12,
                fontWeight: '700',
                color: '#15803d',
                fontFamily: 'monospace',
              }}
            >
              {backupPathInfo}
            </Text>
          </View>
        )}

        {/* FIX-V80-8: Non-blocking notice when FY-close backup has no public mirror copy */}
        {!mirroredToPublic && (
          <View style={s.localOnlyNotice}>
            <AlertTriangle size={16} color="#B45309" style={{ marginTop: 1 }} />
            <Text style={s.localOnlyNoticeText}>
              Saved on this phone only. This copy is deleted if app data is cleared or the app is
              uninstalled. Grant the public backup folder in Settings &gt; Backup/Restore.
            </Text>
          </View>
        )}

        <Text style={s.confirmLabel}>Type &quot;CLOSE&quot; to Confirm:</Text>
        <TextInput
          value={confirmText}
          onChangeText={setConfirmText}
          placeholder="CLOSE"
          placeholderTextColor="rgba(239,68,68,0.4)"
          autoCapitalize="characters"
          autoCorrect={false}
          style={s.confirmInput}
        />

        <View style={{ marginTop: 24 }}>
          <GlassButton
            title={isClosing ? 'Locking Financial Year...' : 'Permanently Close FY'}
            onPress={handleCloseFY}
            disabled={confirmText.trim() !== 'CLOSE' || isClosing}
            loading={isClosing}
          />
        </View>
      </GlassCard>
    </View>
  );

  const renderStep4 = () => (
    <View style={s.centerBox}>
      <CheckCircle2 size={56} color="#15803d" style={{ marginBottom: 16 }} />
      <Text style={[s.emptyTitle, { color: colors.vjText }]}>Financial Year Closed</Text>
      <Text style={[s.emptySub, { color: colors.vjText, marginBottom: 32 }]}>
        {activeFY.label} has been locked. Audit logs have been indexed and opening stock balances
        rolled over per constitutional retention rules.
      </Text>
      <GlassButton title="Return to Dashboard" onPress={() => router.replace('/dashboard')} />
    </View>
  );

  return (
    <TwoToneWrapper title="Close Financial Year" showBack headerContent={headerPills}>
      <KeyboardAwareScrollView
        contentContainerStyle={{
          paddingTop: 24,
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom + 40, 80),
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        extraScrollHeight={120}
        extraHeight={140}
      >
        <View style={s.stepper}>
          {[1, 2, 3].map((num) => (
            <View
              key={num}
              style={[
                s.stepDot,
                { backgroundColor: `${colors.vjAccent}15` },
                step >= num && [s.stepDotActive, { backgroundColor: colors.vjAccent }],
                step === 4 && s.stepDotSuccess,
              ]}
            >
              <Text
                style={[
                  s.stepText,
                  { color: colors.vjText },
                  step >= num && s.stepTextActive,
                ]}
              >
                {num}
              </Text>
            </View>
          ))}
        </View>

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </KeyboardAwareScrollView>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  headerPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: { fontSize: 22, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 22, opacity: 0.65 },
  stepper: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 28,
    marginTop: 8,
  },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepDotActive: {},
  stepDotSuccess: { backgroundColor: '#15803d' },
  stepText: { fontWeight: '800', fontSize: 13, opacity: 0.5 },
  stepTextActive: { color: '#ffffff', opacity: 1 },
  headerBox: { alignItems: 'center', marginBottom: 20, paddingHorizontal: 16 },
  stepIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  headerDesc: { fontSize: 13, textAlign: 'center', lineHeight: 19, opacity: 0.65 },
  stepCard: { padding: 18, marginBottom: 24, borderRadius: 18, borderWidth: 1 },
  loadingBox: { paddingVertical: 24, alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 13, fontWeight: '600', opacity: 0.7 },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
  },
  successText: { fontSize: 13.5, fontWeight: '700', color: '#15803d', flex: 1 },
  issueWarningTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  issueRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
    borderBottomWidth: 1,
    paddingBottom: 12,
  },
  issueCode: { fontSize: 12, fontWeight: '800', marginBottom: 2, fontFamily: 'monospace' },
  issueMessage: { fontSize: 12.5, lineHeight: 18, opacity: 0.75 },
  infoCardText: {
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
    fontSize: 13.5,
    opacity: 0.7,
  },
  localOnlyNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  localOnlyNoticeText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#92400E',
    lineHeight: 16,
  },
  confirmLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#ef4444',
    textTransform: 'uppercase',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  confirmInput: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    fontWeight: '800',
    color: '#ef4444',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    textAlign: 'center',
    letterSpacing: 2,
  },
});