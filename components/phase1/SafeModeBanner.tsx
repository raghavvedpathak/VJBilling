// components/phase1/SafeModeBanner.tsx — Phase 1 v8.0 & Phase 2 Canonical Component

import React from 'react';
import { View, Text } from 'react-native';
import { safeModeStore, SafeModeTrigger } from '@/store/phase1/safeModeStore';
import { ShieldAlert } from 'lucide-react-native';

export function SafeModeBanner() {
  const isActive = safeModeStore((s) => s.isActive);
  const reason = safeModeStore((s) => s.reason);

  if (!isActive) return null;

  return (
    <View className="bg-vj-danger px-4 py-3 pb-4 shadow-xl z-50">
      <View className="flex-row items-center gap-3 mb-1">
        <View className="bg-white/20 p-1.5 rounded-full">
          <ShieldAlert size={20} color="#FFF" />
        </View>
        <Text className="text-white font-bold text-base tracking-wide">
          SAFE MODE ACTIVE
        </Text>
      </View>

      <Text className="text-white/90 text-sm font-medium leading-5 ml-1">
        {getHumanMessage(reason)}
      </Text>

      <View className="mt-3 bg-black/20 p-2 rounded-lg border border-white/30">
        <Text className="text-white text-[10px] font-bold uppercase tracking-widest text-center">
          SYSTEM IS READ-ONLY • BACKUP & VERIFY ALLOWED
        </Text>
      </View>
    </View>
  );
}

function getHumanMessage(reason: SafeModeTrigger | null): string {
  switch (reason) {
    case 'RESTORE_VALIDATION_FAILED':
      return 'Restore failed after data validation. Writing is disabled until integrity is restored.';
    case 'VERIFY_CRITICAL_ISSUE':
      return "Critical data integrity issues detected. Writing is disabled to prevent data loss. Please run 'Verify My Data' again.";
    case 'FY_INTEGRITY_BROKEN':
      return 'Financial Year boundary violation detected. This firm has no active FY. Please contact support.';
    case 'CHECKSUM_MISMATCH':
      return 'Backup decryption failed due to an incorrect password or tampered file. Operations are locked for safety.';
    case 'MIGRATION_FAILED':
      return 'Database schema update failed on startup. Operations are locked to protect your data.';
    case 'SCHEMA_VERSION_MISMATCH':
      return 'Database schema version does not match this app version. Please update the app or contact support.';
    case 'STORAGE_CORRUPTION_DETECTED':
      return 'Storage corruption detected. Critical system configuration is missing. Operations locked to prevent data loss.';
    default:
      return 'System integrity check failed. Operations locked for safety.';
  }
}
