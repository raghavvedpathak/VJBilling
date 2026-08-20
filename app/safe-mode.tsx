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

  // RETRY — Runs full bootstrap verification sequence.
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
            'The system detected the same integrity issues. Safe Mode remains active.'
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

  const handleRestoreFromBackup = () => {
    Alert.alert(
      'Emergency Restore',
      'Would you like to open the Restore from Backup tool to recover your store database?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Recovery Tool',
          style: 'destructive',
          onPress: () => router.push('/welcome'),
        },
      ]
    );
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
          System integrity protection triggered. Read-only gate engaged.
        </Text>

        {/* DIAGNOSTICS */}
        <GlassCard>
          <Text className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">
            Diagnostic Report
          </Text>
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-gray-700 font-medium">Error Code:</Text>
            <Text className="text-vj-danger font-mono font-bold">
              {reason || 'UNKNOWN_ERROR'}
            </Text>
          </View>
          <View className="flex-row justify-between items-center">
            <Text className="text-gray-500">Timestamp:</Text>
            <Text className="text-gray-500 font-mono text-xs">
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
            title="Restore from Backup"
            onPress={handleRestoreFromBackup}
            variant="secondary"
            icon={<HardDriveUpload size={20} color="#ef4444" />}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}