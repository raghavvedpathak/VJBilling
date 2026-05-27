import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, AppState, ActivityIndicator } from 'react-native';
import { ShieldCheck, Lock } from 'lucide-react-native';
import { leaseRepository } from '../repositories/leaseRepository';
import { now } from '../utils/now';

// ============================================================================
// LAYER COMPLIANCE FIX: This component previously imported `db` and
// `writerLeases` schema directly — a hard spec violation (components must
// never query the DB). All data access now goes through leaseRepository,
// which is the spec-compliant data access surface for lease reads.
// ============================================================================

// ============================================================================
// POLLING INTERVAL — 5 seconds.
// Previously 1000ms (1 second), which fired a DB query 60×/minute on the
// UI thread. On Android SQLite this causes measurable jank and battery drain.
// The AppState 'active' listener handles the "user returns to app" case
// instantly — the interval only exists for in-app lease expiry detection.
// 5 seconds is the correct balance: fast enough to detect lease release,
// slow enough to not impact rendering.
// ============================================================================
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

  const checkLease = useCallback(async () => {
    try {
      // leaseRepository.getActiveLease() handles the gt(expiresAt, now()) filter
      // internally — this component has no knowledge of the DB schema.
      const currentLease = await leaseRepository.getActiveLease();

      if (!currentLease) {
        setLeaseState({ status: 'FREE', leaseType: null, elapsedSeconds: 0 });
        return;
      }

      // Use now() for the current time — consistent with the centralized time
      // utility used everywhere else in the app. Prevents subtle clock drift
      // inconsistencies if the time utility is ever patched for test overrides.
      const currentMs = new Date(now()).getTime();
      const acquiredMs = new Date(currentLease.acquiredAt).getTime();
      const elapsed = Math.floor((currentMs - acquiredMs) / 1000);

      setLeaseState({
        status: 'ACTIVE',
        leaseType: currentLease.leaseType,
        elapsedSeconds: Math.max(0, elapsed),
      });
    } catch (e) {
      // FAIL-OPEN: On DB error, show FREE state rather than spinning 'CHECKING'
      // forever. A component that can't read the lease table should not block
      // the dashboard UI. The error is logged for diagnostics.
      console.warn('[LeaseStatusBanner] Failed to read lease state:', e);
      setLeaseState({ status: 'FREE', leaseType: null, elapsedSeconds: 0 });
    }
  }, []);

  // Re-check immediately when app returns to foreground
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

  // Initial check + 5-second polling interval
  useEffect(() => {
    checkLease();
    const interval = setInterval(checkLease, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkLease]);

  if (leaseState.status === 'CHECKING') {
    return (
      <View className="flex-row items-center bg-gray-100 p-2 rounded-lg border border-gray-200">
        <ActivityIndicator size="small" color="#6b7280" style={{ marginRight: 8 }} />
        <Text className="text-gray-600 font-medium text-xs">Checking system state...</Text>
      </View>
    );
  }

  if (leaseState.status === 'ACTIVE') {
    return (
      <View className="flex-row items-center justify-between bg-vj-danger/10 p-2 rounded-lg border border-vj-danger/20">
        <View className="flex-row items-center">
          <Lock size={16} color="#ef4444" style={{ marginRight: 8 }} />
          <Text className="text-vj-danger font-bold text-xs uppercase">
            {leaseState.leaseType} running
          </Text>
        </View>
        <Text className="text-vj-danger font-mono text-xs font-bold bg-white px-2 py-1 rounded border border-vj-danger/20">
          {formatElapsed(leaseState.elapsedSeconds)}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-row items-center bg-vj-success/10 p-2 rounded-lg border border-vj-success/20">
      <ShieldCheck size={16} color="#15803d" style={{ marginRight: 8 }} />
      <Text className="text-vj-success font-bold text-xs">System free</Text>
    </View>
  );
}