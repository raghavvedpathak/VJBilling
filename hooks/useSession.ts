import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useFirmStore } from '../store/firmStore';
import { firmRepository, Firm } from '../repositories/firmRepository';
import { fyRepository } from '../repositories/fyRepository';

// ============================================================================
// v7.5 FY-BOUNDARY-TRANSITION-RULE: useSession computes isFYExpired and
// exposes it to callers. Dashboard MUST render the amber FY-boundary banner
// when isFYExpired is true. This is a Phase 1 constitutional requirement —
// not Phase 2. The banner is non-blocking (user can still operate) but it
// must be visible with a CTA to Close Financial Year.
//
// isFYExpired = activeFY exists AND activeFY.endDate < today (YYYY-MM-DD).
// endDate is stored as YYYY-MM-DD — direct string comparison is safe here
// because both sides are in the same format and lexicographic order matches
// chronological order for ISO date strings.
// ============================================================================

export function useSession() {
  const router = useRouter();
  const { activeFirmId, clearActiveFirm } = useFirmStore();

  const [firm, setFirm] = useState<Firm | null>(null);
  const [activeFY, setActiveFY] = useState<any | null>(null);
  const [isFYExpired, setIsFYExpired] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    if (!activeFirmId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // 1. Fetch Firm Identity
      const firmData = await firmRepository.getById(activeFirmId);

      if (!firmData) {
        // CORRUPTION CHECK: activeFirmId exists in Zustand but not in DB.
        // Auto-logout to prevent the user from being stuck on a broken session.
        console.error('[useSession] CRITICAL: Session references missing firm. Logging out.');
        clearActiveFirm();
        // FIX: '/setup' route does not exist — correct entry point is '/welcome'
        router.replace('/welcome');
        return;
      }

      // 2. Fetch Active Financial Year
      const fyData = await fyRepository.getActiveFY(activeFirmId);

      // 3. v7.5 FY-BOUNDARY-TRANSITION-RULE: compute expiry flag.
      // Compare endDate ('YYYY-MM-DD') against today's date string.
      // Lexicographic comparison is safe for ISO date strings.
      let fyExpired = false;
      if (fyData?.endDate) {
        const todayStr = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
        fyExpired = fyData.endDate < todayStr;
      }

      setFirm(firmData);
      setActiveFY(fyData);
      setIsFYExpired(fyExpired);
    } catch (error) {
      console.error('[useSession] Session hydration failed:', error);
    } finally {
      setIsLoading(false);
    }
  // FIX: router and clearActiveFirm added to deps — exhaustive-deps compliance.
  // Both are stable refs so this does not cause extra re-runs.
  }, [activeFirmId, router, clearActiveFirm]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  return {
    firm,
    activeFY,
    isFYExpired, // v7.5: Dashboard must show amber FY-boundary banner when true
    isLoading,
    refreshSession,
  };
}