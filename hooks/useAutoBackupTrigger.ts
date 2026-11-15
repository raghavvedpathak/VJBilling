// hooks/useAutoBackupTrigger.ts — Phase 1 v7.47 Canonical Hook (FIX-V745-3)
// Mounted by the Dashboard screen ONLY. Runs catch-up auto-backup when Dashboard is focused and idle.

import { useCallback } from 'react';
import { AppState, InteractionManager } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { runAutoBackupIfDue } from '@/services/phase1/autoBackupService';

export function useAutoBackupTrigger(): void {
  useFocusEffect(
    useCallback(() => {
      let timer: ReturnType<typeof setTimeout> | null = null;

      const arm = (trigger: 'BOOT' | 'RESUME') => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          InteractionManager.runAfterInteractions(() => {
            void runAutoBackupIfDue(trigger);
          });
        }, 3000);
      };

      arm('BOOT');

      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active') {
          arm('RESUME');
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      });

      return () => {
        sub.remove();
        if (timer) clearTimeout(timer);
      };
    }, [])
  );
}

export default useAutoBackupTrigger;
