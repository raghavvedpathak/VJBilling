// hooks/useSession.ts — Phase 2 v2.11 Canonical Hook

import { useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { useFirmStore } from '../store/useFirmStore';
import { firmRepository, Firm } from '../repositories/firmRepository';
import { fyRepository } from '../repositories/fyRepository';
import { useFyBannerStore } from '../store/fyBannerStore';

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
      // 1. Fetch Firm Identity
      const firmData = await firmRepository.getById(activeFirmId);

      if (!firmData) {
        // CORRUPTION CHECK: activeFirmId exists in Zustand but not in DB.
        console.error('[useSession] CRITICAL: Session references missing firm. Logging out.');
        clearActiveFirm();
        router.replace('/welcome');
        return;
      }

      // 2. Fetch Active Financial Year
      const fyData = await fyRepository.getActiveFY(activeFirmId);

      // 3. v7.5 FY-BOUNDARY-TRANSITION-RULE: compute expiry flag.
      let fyExpired = false;
      if (fyData?.endDate) {
        const todayStr = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
        fyExpired = fyData.endDate < todayStr;
      }

      setFirm(firmData);
      setActiveFY(fyData);
      setIsFYExpired(fyExpired);
      
      // STEP 5.5 (ALIGN-P1-V75): set bannerVisible in zustand store
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
    isFYExpired, // v7.5: Dashboard must show amber FY-boundary banner when true
    isLoading,
    refreshSession,
  };
}