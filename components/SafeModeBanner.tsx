import React from 'react';
import { View, Text } from 'react-native';
import { useSafeModeStore, SafeModeTrigger } from '../store/safeModeStore';
import { ShieldAlert } from 'lucide-react-native';

export function SafeModeBanner() {
  const { isActive, reason } = useSafeModeStore();

  if (!isActive) return null;

  return (
    // GLOBALLY STYLED: bg-vj-danger
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
          SYSTEM IS READ-ONLY • CONTACT SUPPORT
        </Text>
      </View>
    </View>
  );
}

function getHumanMessage(reason: SafeModeTrigger | null): string {
  switch (reason) {
    case 'RESTORE_VALIDATION_FAILED':
      return "The backup file you tried to restore is corrupted or invalid. The system protected your existing data.";
    case 'VERIFY_CRITICAL_ISSUE':
      return "Critical data integrity issues detected. Writing is disabled to prevent data loss. Please run 'Verify My Data' again.";
    case 'FY_INTEGRITY_BROKEN':
      return "Financial Year boundary violation detected. This firm has no active FY. Please contact support.";
    case 'CHECKSUM_MISMATCH':
      return "Security Alert: The backup file has been tampered with. Checksum verification failed.";
    case 'MIGRATION_FAILED':
      return "Database update failed. The app version does not match the database version.";
    // ARCHITECT FIX: Added specific message for our new bootstrap row guard
    case 'STORAGE_CORRUPTION_DETECTED':
      return "Storage corruption detected. Critical system configuration is missing. Operations locked to prevent data loss.";
    default:
      return "System integrity check failed. Operations locked for safety.";
  }
}