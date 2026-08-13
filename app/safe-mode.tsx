// app/safe-mode.tsx — Phase 2 v2.11 Canonical Safe Mode Screen

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ShieldAlert, HardDriveUpload, RefreshCw } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { safeModeStore } from '@/store/phase1/safeModeStore';
import { bootstrapService } from '@/services/phase1/bootstrapService';
import { GlassCard, GlassButton } from '@/components/ui/Glass';

export default function SafeModeScreen() {
  const router = useRouter();
  const reason = safeModeStore((s: any) => s.reason);
  const activatedAt = safeModeStore((s: any) => s.activatedAt);

  const [retrying, setRetrying] = useState(false);

  // RETRY — Runs the full bootstrap sequence again.
  // PATH 1: verifyService clears Safe Mode if the system is HEALTHY during initApp().
  const handleRetry = async () => {
    try {
      setRetrying(true);
      const result = await bootstrapService.initApp();

      switch (result) {
        case 'DASHBOARD':
        case 'DASHBOARD_WARNING':
          router.replace('/dashboard');
          break;
        case 'SETUP':
          router.replace('/welcome');
          break;
        case 'SAFE_MODE':
          Alert.alert(
            'Still Unsafe',
            'The system detected the same integrity issues. Retry failed.'
          );
          break;
        case 'DATABASE_ERROR':
          router.replace('/');
          break;
      }
    } catch (e: any) {
      Alert.alert('Retry Failed', e?.message ?? 'An unexpected error occurred.');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-vj-danger/10"
    >
      <ScrollView
        contentContainerStyle={{ paddingTop: 32, flexGrow: 1, justifyContent: 'center', padding: 24 }}
      >
        {/* ICON */}
        <View className="items-center mb-8">
          <View className="bg-vj-danger/20 p-6 rounded-full border-4 border-vj-danger/30">
            <ShieldAlert size={64} color="#ef4444" />
          </View>
        </View>

        {/* TITLE */}
        <Text className="text-vj-danger text-3xl font-black text-center mb-2 uppercase tracking-tight">
          Safe Mode Active
        </Text>
        <Text className="text-vj-danger/80 text-center font-bold mb-6">
          System integrity compromised.
        </Text>

        {/* DIAGNOSTICS */}
        <GlassCard>
          <Text className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">
            Diagnostic Report
          </Text>
          <View className="flex-row justify-between mb-2">
            <Text className="text-gray-300">Error Code:</Text>
            <Text className="text-vj-danger font-mono font-bold">
              {reason || 'UNKNOWN_ERROR'}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-gray-400">Timestamp:</Text>
            <Text className="text-gray-400 font-mono text-xs">
              {activatedAt ? new Date(activatedAt).toLocaleString() : 'N/A'}
            </Text>
          </View>
        </GlassCard>

        {/* ACTIONS */}
        <View className="gap-4 mt-6">
          <GlassButton
            title={retrying ? 'Running Diagnostics...' : 'Retry Diagnostics'}
            onPress={handleRetry}
            loading={retrying}
            variant="danger"
            icon={<RefreshCw size={20} color="white" />}
          />

          <GlassButton
            title="Restore Backup"
            onPress={() =>
              Alert.alert(
                'Manual Restore',
                'To restore a healthy backup, please reinstall the app to access the "Restore from Backup" option on the welcome screen.'
              )
            }
            variant="secondary"
            icon={<HardDriveUpload size={20} color="#ef4444" />}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}