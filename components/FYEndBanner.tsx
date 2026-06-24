// components/FYEndBanner.tsx
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '../hooks/useSession';
import { useFyBannerStore } from '../store/fyBannerStore';
import { AlertTriangle, X, ChevronRight } from 'lucide-react-native';

export function FYEndBanner() {
  const router = useRouter();
  const { activeFY } = useSession();
  const { isDismissed, dismissBanner } = useFyBannerStore();

  const isExpired = useMemo(() => {
    if (!activeFY) return false;
    // Simple ISO string comparison works because format is YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];
    return today > activeFY.endDate;
  }, [activeFY]);

  if (!isExpired || isDismissed) {
    return null;
  }

  return (
    <View style={s.banner}>
      <View style={s.iconContainer}>
        <AlertTriangle size={24} color="#B45309" />
      </View>
      <View style={s.textContainer}>
        <Text style={s.title}>Financial Year Ended</Text>
        <Text style={s.message}>
          {activeFY?.label} ended on {activeFY?.endDate}. You must close the year to carry forward opening balances.
        </Text>
        <TouchableOpacity 
          style={s.actionBtn} 
          activeOpacity={0.7}
          onPress={() => router.push('/settings/close-fy')}
        >
          <Text style={s.actionText}>Start FY Close</Text>
          <ChevronRight size={14} color="#B45309" />
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={s.closeBtn} onPress={dismissBanner} activeOpacity={0.5}>
        <X size={20} color="#B45309" style={{ opacity: 0.5 }} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 8,
  },
  iconContainer: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    padding: 10,
    borderRadius: 12,
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 4,
  },
  message: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B45309',
    lineHeight: 18,
    marginBottom: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(245,158,11,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#B45309',
  },
  closeBtn: {
    padding: 4,
    marginLeft: 8,
  },
});