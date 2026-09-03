// hooks/useSession.ts — Phase 2 v2.24 Canonical Hook

import { useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { firmRepository, type Firm } from '@/repositories/phase1/firmRepository';
import { bisLogoRepository } from '@/repositories/phase1/bisLogoRepository';
import { fyRepository } from '@/repositories/phase1/fyRepository';
import { useFyBannerStore } from '@/store/phase1/fyBannerStore';

type ActiveFY = Awaited<ReturnType<typeof fyRepository.getActiveFY>>;

export function useSession() {
  const router = useRouter();
  const { activeFirmId, clearActiveFirm } = useFirmStore();

  const [firm, setFirm] = useState<Firm | null>(null);
  const [activeFY, setActiveFY] = useState<ActiveFY | null>(null);
  const [isFYExpired, setIsFYExpired] = useState(false);
  const [bisLogoUri, setBisLogoUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    // 1. Reset state when no firm is selected
    if (!activeFirmId) {
      setFirm(null);
      setActiveFY(null);
      setIsFYExpired(false);
      setBisLogoUri(null);
      useFyBannerStore.getState().setBannerVisible(false);
      setIsLoading(false);
      return;
    }

    try {
      // 2. Fetch Firm Identity
      const firmData = await firmRepository.getById(activeFirmId);

      if (!firmData) {
        console.error('[useSession] CRITICAL: Session references missing firm. Logging out.');
        clearActiveFirm();
        useFyBannerStore.getState().setBannerVisible(false);
        router.replace('/welcome');
        return;
      }

      // 3. Fetch Active Financial Year
      const fyData = await fyRepository.getActiveFY(activeFirmId);

      // 4. Timezone-Safe Date Comparison (IST Compatible YYYY-MM-DD)
      let fyExpired = false;
      if (fyData?.endDate) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        fyExpired = fyData.endDate < todayStr;
      }

      // 5. Fetch Active BIS Logo
      const bisLogoRow = await bisLogoRepository.findActiveByFirmId(activeFirmId);
      const resolvedBisUri =
        bisLogoRow?.fileRef ||
        (firmData.bisLogoRef?.startsWith('file:') ||
        firmData.bisLogoRef?.startsWith('http') ||
        firmData.bisLogoRef?.startsWith('data:') ||
        firmData.bisLogoRef?.startsWith('/')
          ? firmData.bisLogoRef
          : null);

      setFirm(firmData);
      setActiveFY(fyData ?? null);
      setIsFYExpired(fyExpired);
      setBisLogoUri(resolvedBisUri || null);

      // 6. Synchronize Zustand banner state bidirectionally
      useFyBannerStore.getState().setBannerVisible(fyExpired);
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
    isFYExpired,
    bisLogoUri,
    isLoading,
    refreshSession,
  };
}