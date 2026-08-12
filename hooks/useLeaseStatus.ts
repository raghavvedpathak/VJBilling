// hooks/useLeaseStatus.ts — Phase 2 v2.11 Canonical Hook

import { useState, useEffect, useCallback } from 'react';
import { AppState } from 'react-native';
import { leaseRepository } from '@/repositories/phase1/leaseRepository';

const POLL_INTERVAL_MS = 5000;

export function useLeaseStatus() {
  const [activeLease, setActiveLease] = useState<any>(null);
  const [isChecking, setIsChecking] = useState(true);

  const pollDB = useCallback(() => {
    try {
      const lease = leaseRepository.getActiveLease();
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

    // Poll every 5 seconds while in foreground
    const interval = setInterval(pollDB, POLL_INTERVAL_MS);

    // Re-check immediately on app resume
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