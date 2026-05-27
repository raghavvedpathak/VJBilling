import { useState, useEffect, useCallback } from 'react';
import { AppState } from 'react-native';
import { leaseRepository } from '../repositories/leaseRepository';

// ============================================================================
// LAYER COMPLIANCE FIX: Previously imported `db` and `writerLeases` schema
// directly — a hard spec violation (hooks must never query the DB).
// All data access now goes through leaseRepository.getActiveLease(),
// the same fix applied to LeaseStatusBanner.
//
// NOTE ON DUPLICATION: LeaseStatusBanner manages its own internal polling and
// is a self-contained display component. useLeaseStatus exists as a separate
// hook for screens that need to react to lease state without rendering the
// banner UI (e.g. a settings screen that disables buttons during a backup).
// Both correctly poll at 5-second intervals via leaseRepository.
// ============================================================================

const POLL_INTERVAL_MS = 5000;

export function useLeaseStatus() {
  const [activeLease, setActiveLease] = useState<any>(null);
  const [isChecking, setIsChecking] = useState(true);

  const pollDB = useCallback(async () => {
    try {
      const lease = await leaseRepository.getActiveLease();
      setActiveLease(lease ?? null);
    } catch (error) {
      console.error('[useLeaseStatus] Lease poll failed:', error);
      setActiveLease(null);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    pollDB();

    // Poll every 5 seconds while in foreground (STEP 18)
    const interval = setInterval(pollDB, POLL_INTERVAL_MS);

    // Re-check immediately on app resume (STEP 18)
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        setIsChecking(true);
        pollDB();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [pollDB]);

  return { activeLease, isChecking };
}