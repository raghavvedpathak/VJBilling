// hooks/useSession.ts — Phase 2 v2.11 Canonical Hook

import { useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { firmRepository, Firm } from '@/repositories/phase1/firmRepository';
import { fyRepository } from '@/repositories/phase1/fyRepository';
import { useFyBannerStore } from '@/store/phase1/fyBannerStore';

export function useSession() {
  const router = useRouter();
  const { activeFirmId, clearActiveFirm } = useFirmStore();

  const [firm, setFirm] = useState<Firm | null>(null);
  const [activeFY, setActiveFY] = useState<any | null>(null);
  const [isFYExpired, setIsFYExpired] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSession = useCallback(() => {
    if (!activeFirmId) {
      setIsLoading(false);
      return;
    }

    try {
      // 1. Fetch Firm Identity (Synchronous JSI)
      const firmData = firmRepository.getById(activeFirmId);

      if (!firmData) {
        // CORRUPTION CHECK: activeFirmId exists in Zustand but not in DB.
        console.error('[useSession] CRITICAL: Session references missing firm. Logging out.');
        clearActiveFirm();
        router.replace('/welcome');
        return;
      }

      // 2. Fetch Active Financial Year (Synchronous JSI)
      const fyData = fyRepository.getActiveFY(activeFirmId);

      // 3. Timezone-Safe Date Comparison (IST Compatible YYYY-MM-DD)
      let fyExpired = false;
      if (fyData?.endDate) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        fyExpired = fyData.endDate < todayStr;
      }

      setFirm(firmData);
      setActiveFY(fyData);
      setIsFYExpired(fyExpired);

      // 4. Update banner state in Zustand store
      if (fyExpired) {
        useFyBannerStore.getState().setBannerVisible(true);
      }
    } catch (error) {
      console.error('[useSession] Session hydration failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [activeFirmId, router, clearActiveFirm]);

  useFocusEffect(
    useCallback(() => {
      refreshSession();
    }, [refreshSession])
  );

  return {
    firm,
    activeFY,
    isFYExpired, // Dashboard shows amber FY-boundary banner when true
    isLoading,
    refreshSession,
  };
}