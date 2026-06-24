// app/settings/close-fy.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Alert, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { GlassCard, GlassButton } from '../../components/ui/Glass';
import { useFirmStore } from '../../store/firmStore';
import { useSession } from '../../hooks/useSession';
import { fyService } from '../../services/fyService';
import { backupService } from '../../services/backupService';
import { Lock, ShieldAlert, ShieldCheck, HardDriveDownload, AlertTriangle, CheckCircle2 } from 'lucide-react-native';
import type { VerifyIssue } from '../../types/phase2.types';

const COLORS = {
  vjText: '#2E1D00',
  vjBg: '#FAF3E0',
  vjAccent: '#B87333',
  danger: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
};

export default function CloseFYWizard() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  const { firm, activeFY, refreshSession } = useSession();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  
  // Step 1 State
  const [issues, setIssues] = useState<VerifyIssue[]>([]);
  const [canClose, setCanClose] = useState(false);
  
  // Step 2 State
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [hasBackup, setHasBackup] = useState(false);

  // Step 3 State
  const [confirmText, setConfirmText] = useState('');
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    const runChecks = async () => {
      if (!activeFirmId || !activeFY) return;
      try {
        const result = await fyService.preCloseChecks(activeFY.id, activeFirmId);
        setIssues(result.issues);
        setCanClose(result.canClose);
      } catch (e: any) {
        Alert.alert('Check Failed', e.message);
      } finally {
        setLoading(false);
      }
    };
    runChecks();
  }, [activeFirmId, activeFY]);

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      await backupService.createBackup();
      setHasBackup(true);
      setStep(3); // Auto advance to final step
    } catch (e: any) {
      Alert.alert('Backup Failed', e.message);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleCloseFY = async () => {
    if (confirmText !== 'CLOSE') {
      Alert.alert('Validation Error', 'Please type CLOSE exactly as shown to proceed.');
      return;
    }
    if (!activeFirmId || !activeFY) return;

    setIsClosing(true);
    try {
      await fyService.closeFY(activeFY.id, activeFirmId);
      await refreshSession();
      setStep(4); // Success screen
    } catch (e: any) {
      Alert.alert('Close Operation Failed', e.message);
      setIsClosing(false);
    }
  };

  if (!activeFY) {
    return (
      <TwoToneWrapper title="Close Financial Year" showBack>
        <View style={s.centerBox}>
          <Lock size={48} color="rgba(46,29,0,0.2)" />
          <Text style={s.emptyTitle}>No Active FY</Text>
          <Text style={s.emptySub}>You do not have an active financial year to close.</Text>
        </View>
      </TwoToneWrapper>
    );
  }

  const renderStep1 = () => (
    <View>
      <View style={s.headerBox}>
        <ShieldCheck size={32} color={COLORS.vjAccent} />
        <Text style={s.headerTitle}>Step 1: Database Integrity</Text>
        <Text style={s.headerDesc}>Running constitutional pre-close checks for {activeFY.label}</Text>
      </View>

      <GlassCard style={{ padding: 16, marginBottom: 24 }}>
        {loading ? (
          <ActivityIndicator size="small" color={COLORS.vjAccent} style={{ marginVertical: 20 }} />
        ) : issues.length === 0 ? (
          <View style={s.successBox}>
            <CheckCircle2 size={24} color={COLORS.success} />
            <Text style={s.successText}>All checks passed. Ready to close.</Text>
          </View>
        ) : (
          <View>
            <Text style={s.issueWarningTitle}>Please resolve these issues first:</Text>
            {issues.map((i, idx) => (
              <View key={idx} style={s.issueRow}>
                {i.severity === 'CRITICAL' ? (
                  <ShieldAlert size={16} color={COLORS.danger} />
                ) : (
                  <AlertTriangle size={16} color={COLORS.warning} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={s.issueCode}>{i.code}</Text>
                  <Text style={s.issueMessage}>{i.message}</Text>
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
        <HardDriveDownload size={32} color={COLORS.vjAccent} />
        <Text style={s.headerTitle}>Step 2: Mandatory Backup</Text>
        <Text style={s.headerDesc}>You must create a secure backup before performing a destructive year-close operation.</Text>
      </View>

      <GlassCard style={{ padding: 24, marginBottom: 24, alignItems: 'center' }}>
        <Text style={{ textAlign: 'center', color: 'rgba(46,29,0,0.6)', marginBottom: 20, lineHeight: 22 }}>
          Closing the financial year will lock all current records, index the audit logs, and calculate opening balances for the new year.
        </Text>
        <GlassButton 
          title={isBackingUp ? "Creating Backup..." : "Create Secure Backup"} 
          onPress={handleBackup} 
          disabled={isBackingUp}
          icon={!isBackingUp ? <HardDriveDownload size={20} color="#fff" /> : undefined}
        />
      </GlassCard>
    </View>
  );

  const renderStep3 = () => (
    <View>
      <View style={s.headerBox}>
        <AlertTriangle size={32} color={COLORS.danger} />
        <Text style={[s.headerTitle, { color: COLORS.danger }]}>Step 3: Point of No Return</Text>
        <Text style={s.headerDesc}>You are about to permanently lock {activeFY.label}. This action cannot be undone.</Text>
      </View>

      <GlassCard style={{ padding: 20, marginBottom: 24, borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.05)' }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.danger, textTransform: 'uppercase', marginBottom: 12 }}>
          Type CLOSE to confirm
        </Text>
        <TextInput 
          style={s.confirmInput}
          value={confirmText}
          onChangeText={setConfirmText}
          placeholder="Type CLOSE here"
          autoCapitalize="characters"
        />
      </GlassCard>

      <GlassButton 
        title={isClosing ? "Locking Year..." : `Close ${activeFY.label} Permanently`} 
        onPress={handleCloseFY} 
        disabled={confirmText !== 'CLOSE' || isClosing} 
        variant="danger"
      />
    </View>
  );

  const renderStep4 = () => (
    <View style={s.centerBox}>
      <CheckCircle2 size={64} color={COLORS.success} style={{ marginBottom: 16 }} />
      <Text style={s.emptyTitle}>Year Closed Successfully</Text>
      <Text style={[s.emptySub, { marginBottom: 32 }]}>
        {activeFY.label} has been locked and audit logs have been successfully indexed and purged per retention rules.
      </Text>
      <GlassButton 
        title="Return to Dashboard" 
        onPress={() => router.replace('/dashboard')} 
      />
    </View>
  );

  return (
    <TwoToneWrapper title="Close Financial Year" showBack>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View style={s.stepper}>
          {[1, 2, 3].map((num) => (
            <View key={num} style={[s.stepDot, step >= num && s.stepDotActive, step === 4 && s.stepDotSuccess]}>
              <Text style={[s.stepText, step >= num && s.stepTextActive]}>{num}</Text>
            </View>
          ))}
        </View>

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </ScrollView>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 80, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 24, fontWeight: '800', color: COLORS.vjText, marginBottom: 8 },
  emptySub: { fontSize: 14, color: 'rgba(46,29,0,0.6)', textAlign: 'center', lineHeight: 22 },
  
  stepper: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 32, marginTop: 16 },
  stepDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(46,29,0,0.1)', justifyContent: 'center', alignItems: 'center' },
  stepDotActive: { backgroundColor: COLORS.vjAccent },
  stepDotSuccess: { backgroundColor: COLORS.success },
  stepText: { color: 'rgba(46,29,0,0.4)', fontWeight: '800', fontSize: 14 },
  stepTextActive: { color: '#fff' },

  headerBox: { alignItems: 'center', marginBottom: 24, paddingHorizontal: 20 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: COLORS.vjText, marginTop: 12, marginBottom: 6, textAlign: 'center' },
  headerDesc: { fontSize: 13, color: 'rgba(46,29,0,0.6)', textAlign: 'center', lineHeight: 20 },

  successBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 12 },
  successText: { fontSize: 14, fontWeight: '700', color: COLORS.success },

  issueWarningTitle: { fontSize: 13, fontWeight: '800', color: COLORS.vjText, marginBottom: 16, textTransform: 'uppercase' },
  issueRow: { flexDirection: 'row', gap: 12, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(46,29,0,0.05)', paddingBottom: 16 },
  issueCode: { fontSize: 12, fontWeight: '800', color: COLORS.vjText, marginBottom: 2, fontFamily: 'monospace' },
  issueMessage: { fontSize: 13, color: 'rgba(46,29,0,0.6)', lineHeight: 18 },

  confirmInput: { backgroundColor: '#fff', borderRadius: 12, padding: 16, fontSize: 18, fontWeight: '800', color: COLORS.danger, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', textAlign: 'center' },
});