// components/LeaseStatusBanner.tsx — Phase 2 v2.11 Canonical Component

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, AppState, ActivityIndicator, Animated } from 'react-native';
import { ShieldCheck, Lock } from 'lucide-react-native';
import { leaseService } from '@/services/phase1/leaseService';
import { now } from '@/utils/now';

const POLL_INTERVAL_MS = 5000;

const formatElapsed = (totalSeconds: number) => {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

export function LeaseStatusBanner() {
  const [appState, setAppState] = useState(AppState.currentState);
  const [leaseState, setLeaseState] = useState<{
    status: 'CHECKING' | 'FREE' | 'ACTIVE';
    leaseType: string | null;
    elapsedSeconds: number;
  }>({
    status: 'CHECKING',
    leaseType: null,
    elapsedSeconds: 0,
  });

  const [pulseAnim] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (leaseState.status === 'ACTIVE') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [leaseState.status, pulseAnim]);

  const checkLease = useCallback(async () => {
    try {
      const currentLease = await leaseService.getActiveLease();

      if (!currentLease) {
        setLeaseState({ status: 'FREE', leaseType: null, elapsedSeconds: 0 });
        return;
      }

      const currentMs = new Date(now()).getTime();
      const acquiredMs = new Date(currentLease.acquiredAt).getTime();
      const elapsed = Math.floor((currentMs - acquiredMs) / 1000);

      setLeaseState({
        status: 'ACTIVE',
        leaseType: currentLease.leaseType,
        elapsedSeconds: Math.max(0, elapsed),
      });
    } catch (e) {
      console.warn('[LeaseStatusBanner] Failed to read lease state:', e);
      setLeaseState({ status: 'FREE', leaseType: null, elapsedSeconds: 0 });
    }
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appState.match(/inactive|background/) && nextAppState === 'active') {
        setLeaseState((prev) => ({ ...prev, status: 'CHECKING' }));
        checkLease();
      }
      setAppState(nextAppState);
    });
    return () => subscription.remove();
  }, [appState, checkLease]);

  useEffect(() => {
    checkLease();
    const interval = setInterval(checkLease, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkLease]);

  if (leaseState.status === 'CHECKING') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignSelf: 'flex-start', marginBottom: 8 }}>
        <ActivityIndicator size="small" color="#F7D273" style={{ marginRight: 6 }} />
        <Text style={{ color: '#FCFBF8', fontWeight: '600', fontSize: 11 }}>Checking lease...</Text>
      </View>
    );
  }

  if (leaseState.status === 'ACTIVE') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', alignSelf: 'flex-start', marginBottom: 8 }}>
        <Animated.View style={{ opacity: pulseAnim, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Lock size={13} color="#EF4444" />
          <Text style={{ color: '#FCA5A5', fontWeight: '700', fontSize: 11, textTransform: 'uppercase' }}>
            {leaseState.leaseType} Locked ({formatElapsed(leaseState.elapsedSeconds)})
          </Text>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16,185,129,0.12)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)', alignSelf: 'flex-start', marginBottom: 8, gap: 6 }}>
      <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#10B981' }} />
      <ShieldCheck size={13} color="#10B981" />
      <Text style={{ color: '#E2E8F0', fontWeight: '600', fontSize: 11, letterSpacing: 0.3 }}>
        System Ready • Secure
      </Text>
    </View>
  );
}