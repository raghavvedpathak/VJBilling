// hooks/useLeaseStatus.ts — Phase 1 v8.0 & Phase 2 Canonical Hook
// Obeys Step 1 Layer Hierarchy (UI/hooks -> Service -> Repository)

import { useState, useEffect, useCallback } from 'react';
import { AppState } from 'react-native';
import { leaseService } from '@/services/phase1/leaseService';

const POLL_INTERVAL_MS = 5000;

export function useLeaseStatus() {
  const [activeLease, setActiveLease] = useState<any>(null);
  const [isChecking, setIsChecking] = useState(true);

  const pollDB = useCallback(async () => {
    try {
      const lease = await leaseService.getActiveLease();
      setActiveLease(lease ?? null);
    } catch (error) {
      console.error('[useLeaseStatus] Lease poll failed:', error);
      setActiveLease(null);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    void pollDB();

    // Poll every 5 seconds while in foreground
    const interval = setInterval(() => {
      void pollDB();
    }, POLL_INTERVAL_MS);

    // Re-check immediately on app resume
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        setIsChecking(true);
        void pollDB();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [pollDB]);

  return { activeLease, isChecking };
}
