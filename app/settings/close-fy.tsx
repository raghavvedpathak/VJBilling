// app/settings/close-fy.tsx — Phase 2 v2.24 Canonical Screen

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TextInput } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { GlassCard, GlassButton, HeaderPill } from '@/components/ui/Glass';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { useSession } from '@/hooks/useSession';
import { useFyBannerStore } from '@/store/phase1/fyBannerStore';
import { fyService } from '@/services/phase1/fyService';
import { backupService } from '@/services/phase1/backupService';
import { Lock, ShieldAlert, ShieldCheck, HardDriveDownload, AlertTriangle, CheckCircle2 } from 'lucide-react-native';
import type { VerifyIssue } from '@/types/phase2/phase2.types';
import { COLORS, getThemeColors } from '@/constants/theme';

export default function CloseFYWizard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeFirmId } = useFirmStore();
  const { activeFY, refreshSession } = useSession();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  
  // Step 1 State: Integrity & Phase 2 Inventory Truth Checks
  const [issues, setIssues] = useState<VerifyIssue[]>([]);
  const [canClose, setCanClose] = useState(false);
  
  // Step 2 State: Mandatory Pre-Close Backup
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupPathInfo, setBackupPathInfo] = useState('');

  // Step 3 State: Permanent Confirmation
  const [confirmText, setConfirmText] = useState('');
  const [isClosing, setIsClosing] = useState(false);

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  useEffect(() => {
    let isMounted = true;
    const runChecks = async () => {
      if (!activeFirmId || !activeFY) return;
      try {
        const result = await fyService.preCloseChecks(activeFY.id, activeFirmId);
        if (isMounted) {
          setIssues(result.issues || []);
          setCanClose(result.canClose);
        }
      } catch (e: any) {
        if (isMounted) {
          Alert.alert('Pre-Close Check Failed', e.message || 'Unable to complete pre-close validation.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    runChecks();
    return () => {
      isMounted = false;
    };
  }, [activeFirmId, activeFY]);

  // Mandatory Pre-Close Backup with storage mirroring notification
  const handleBackup = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setIsBackingUp(true);
    try {
      const result = await backupService.createBackup();
      const mbSize = (result.fileSizeBytes / (1024 * 1024)).toFixed(1);
      const mirrorText = result.mirroredToPublicStorage ? '\nAlso copied to Documents/VJ Billing/backups/' : '';
      setBackupPathInfo(`${result.filePath} · ${mbSize} MB${mirrorText}`);
      setStep(3); // Advance to final point of no return
    } catch (e: any) {
      Alert.alert('Backup Failed', e.message || 'Backup failed. Financial year closing cancelled for database safety.');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleCloseFY = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    if (confirmText.trim() !== 'CLOSE') {
      Alert.alert('Validation Error', 'Please type CLOSE exactly as shown to proceed.');
      return;
    }
    if (!activeFirmId || !activeFY) return;

    setIsClosing(true);
    try {
      await fyService.closeFY(activeFY.id, activeFirmId);
      
      // Clear warning banner state outside transaction strictly after success
      useFyBannerStore.getState().setBannerVisible(false);

      await refreshSession();
      setStep(4); // Success completion step
    } catch (e: any) {
      Alert.alert('Close Operation Failed', e.message || 'An error occurred while locking the financial year.');
      setIsClosing(false);
    }
  };

  const headerPills = (
    <View style={s.headerPillRow}>
      <HeaderPill icon={<Lock size={12} color={colors.vjBg} />} label={activeFY?.label || 'Financial Year'} />
      <HeaderPill icon={<ShieldCheck size={12} color="#4ADE80" />} label="Constitutional Guard" variant="success" />
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
        <Text style={[s.headerTitle, { color: colors.vjText }]}>Step 1: Database Integrity</Text>
        <Text style={[s.headerDesc, { color: colors.vjText }]}>
          Running constitutional pre-close checks for {activeFY.label}
        </Text>
      </View>

      <GlassCard style={[s.stepCard, { borderColor: `${colors.vjAccent}25` }]}>
        {loading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator size="small" color={colors.vjAccent} />
            <Text style={[s.loadingText, { color: colors.vjText }]}>Validating ledger and inventory truth...</Text>
          </View>
        ) : issues.length === 0 ? (
          <View style={s.successBox}>
            <CheckCircle2 size={24} color="#15803d" />
            <Text style={s.successText}>All checks passed. Ready to proceed with backup.</Text>
          </View>
        ) : (
          <View>
            <Text style={[s.issueWarningTitle, { color: colors.vjText }]}>
              Please resolve these ledger discrepancies first:
            </Text>
            {issues.map((i, idx) => (
              <View key={`${i.code}-${idx}`} style={[s.issueRow, { borderBottomColor: `${colors.vjAccent}15` }]}>
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
        title={canClose ? "Continue to Backup" : "Cannot Proceed"} 
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
        <Text style={[s.headerTitle, { color: colors.vjText }]}>Step 2: Mandatory Backup</Text>
        <Text style={[s.headerDesc, { color: colors.vjText }]}>
          You must create an authenticated backup snapshot before executing a permanent year-close operation.
        </Text>
      </View>

      <GlassCard style={[s.stepCard, { borderColor: `${colors.vjAccent}25`, alignItems: 'center' }]}>
        <Text style={[s.infoCardText, { color: colors.vjText }]}>
          Closing the financial year locks all transactions, seals the audit trail, and rolls over clean opening inventory and stock weights for the new period.
        </Text>
        <GlassButton 
          title={isBackingUp ? "Creating Backup..." : "Create Secure Backup"} 
          onPress={handleBackup} 
          disabled={isBackingUp}
          icon={
            isBackingUp ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <HardDriveDownload size={20} color="#fff" />
            )
          }
        />
      </GlassCard>
    </View>
  );

  const renderStep3 = () => (
    <View>
      <View style={s.headerBox}>
        <View style={[s.stepIconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
          <AlertTriangle size={32} color="#ef4444" />
        </View>
        <Text style={[s.headerTitle, { color: '#ef4444' }]}>Step 3: Point of No Return</Text>
        <Text style={[s.headerDesc, { color: colors.vjText }]}>
          You are about to permanently lock {activeFY?.label}. This action cannot be reversed. Backup secured at: {backupPathInfo}.
        </Text>
      </View>

      <GlassCard style={[s.stepCard, { borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.05)' }]}>
        <Text style={s.confirmLabel}>
          Type CLOSE to confirm
        </Text>
        <TextInput 
          testID="confirm-close-fy-input"
          style={s.confirmInput}
          value={confirmText}
          onChangeText={setConfirmText}
          placeholder="Type CLOSE here"
          placeholderTextColor="rgba(239, 68, 68, 0.4)"
          autoCapitalize="characters"
          autoCorrect={false}
          spellCheck={false}
        />
      </GlassCard>

      <GlassButton 
        title={isClosing ? "Locking Year..." : `Close ${activeFY.label} Permanently`} 
        onPress={handleCloseFY} 
        disabled={confirmText.trim() !== 'CLOSE' || isClosing} 
        variant="danger"
        icon={
          isClosing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Lock size={18} color="#fff" />
          )
        }
      />
    </View>
  );

  const renderStep4 = () => (
    <View style={s.centerBox}>
      <CheckCircle2 size={64} color="#15803d" style={{ marginBottom: 16 }} />
      <Text style={[s.emptyTitle, { color: colors.vjText }]}>Year Closed Successfully</Text>
      <Text style={[s.emptySub, { color: colors.vjText, marginBottom: 32 }]}>
        {activeFY.label} has been locked. Audit logs have been indexed and opening stock balances rolled over per constitutional retention rules.
      </Text>
      <GlassButton 
        title="Return to Dashboard" 
        onPress={() => router.replace('/dashboard')} 
      />
    </View>
  );

  return (
    <TwoToneWrapper title="Close Financial Year" showBack headerContent={headerPills}>
      <KeyboardAwareScrollView 
        contentContainerStyle={{ 
          paddingTop: 24, 
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom + 40, 80) 
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
                step === 4 && s.stepDotSuccess
              ]}
            >
              <Text 
                style={[
                  s.stepText, 
                  { color: colors.vjText },
                  step >= num && s.stepTextActive
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
    paddingHorizontal: 20 
  },
  emptyTitle: { 
    fontSize: 22, 
    fontWeight: '800', 
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySub: { 
    fontSize: 14, 
    textAlign: 'center', 
    lineHeight: 22,
    opacity: 0.65,
  },
  stepper: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    gap: 16, 
    marginBottom: 28, 
    marginTop: 8 
  },
  stepDot: { 
    width: 32, 
    height: 32, 
    borderRadius: 16, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  stepDotActive: {},
  stepDotSuccess: { 
    backgroundColor: '#15803d' 
  },
  stepText: { 
    fontWeight: '800', 
    fontSize: 13,
    opacity: 0.5,
  },
  stepTextActive: { 
    color: '#ffffff',
    opacity: 1,
  },
  headerBox: { 
    alignItems: 'center', 
    marginBottom: 20, 
    paddingHorizontal: 16 
  },
  stepIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: { 
    fontSize: 20, 
    fontWeight: '800', 
    marginBottom: 6, 
    textAlign: 'center' 
  },
  headerDesc: { 
    fontSize: 13, 
    textAlign: 'center', 
    lineHeight: 19,
    opacity: 0.65,
  },
  stepCard: { 
    padding: 18, 
    marginBottom: 24,
    borderRadius: 18,
    borderWidth: 1,
  },
  loadingBox: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.7,
  },
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
  successText: { 
    fontSize: 13.5, 
    fontWeight: '700', 
    color: '#15803d',
    flex: 1,
  },
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
    paddingBottom: 12 
  },
  issueCode: { 
    fontSize: 12, 
    fontWeight: '800', 
    marginBottom: 2, 
    fontFamily: 'monospace' 
  },
  issueMessage: { 
    fontSize: 12.5, 
    lineHeight: 18,
    opacity: 0.75,
  },
  infoCardText: { 
    textAlign: 'center', 
    marginBottom: 20, 
    lineHeight: 22,
    fontSize: 13.5,
    opacity: 0.7,
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