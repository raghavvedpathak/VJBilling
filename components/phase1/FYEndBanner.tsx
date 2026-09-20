// components/FYEndBanner.tsx — Phase 2 v2.11 Canonical Component

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSession } from '@/hooks/useSession';
import { useFyBannerStore } from '@/store/phase1/fyBannerStore';
import { AlertTriangle, ChevronRight } from 'lucide-react-native';
import { COLORS } from '@/constants/theme';

interface FYEndBannerProps {
  activeFY?: any;
}

export function FYEndBanner({ activeFY: propActiveFY }: FYEndBannerProps = {}) {
  const router = useRouter();
  const { activeFY: sessionActiveFY } = useSession();
  const bannerVisible = useFyBannerStore((s) => s.bannerVisible);

  const activeFY = propActiveFY ?? sessionActiveFY;

  if (!bannerVisible) {
    return null;
  }

  return (
    <View style={s.banner}>
      <View style={s.iconContainer}>
        <AlertTriangle size={24} color={COLORS.warningOrange} />
      </View>
      <View style={s.textContainer}>
        <Text style={s.title}>Financial Year Ended</Text>
        <Text style={s.message}>
          {activeFY?.label ? `${activeFY.label} ended` : 'Current financial year ended'} on {activeFY?.endDate ?? 'period boundary'}. You must close the year to carry forward opening balances.
        </Text>
        <TouchableOpacity 
          style={s.actionBtn} 
          activeOpacity={0.7}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
            router.push('/settings/close-fy');
          }}
        >
          <Text style={s.actionText}>Start FY Close</Text>
          <ChevronRight size={14} color="#B45309" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    backgroundColor: 'rgba(254, 243, 199, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.5)',
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
});