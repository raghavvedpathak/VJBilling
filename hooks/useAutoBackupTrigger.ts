// hooks/useAutoBackupTrigger.ts — Phase 1 v7.47 Canonical Hook (FIX-V745-3)
// Mounted by the Dashboard screen ONLY. Runs catch-up auto-backup when Dashboard is focused and idle.

import { useCallback } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { runAutoBackupIfDue } from '@/services/phase1/autoBackupService';

function runWhenIdle(callback: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(() => callback());
    return () => {
      if (typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(handle);
      }
    };
  }
  const timer = setTimeout(callback, 1);
  return () => clearTimeout(timer);
}

export function useAutoBackupTrigger(): void {
  useFocusEffect(
    useCallback(() => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let cancelIdle: (() => void) | null = null;

      const arm = (trigger: 'BOOT' | 'RESUME') => {
        if (timer) clearTimeout(timer);
        if (cancelIdle) {
          cancelIdle();
          cancelIdle = null;
        }
        timer = setTimeout(() => {
          cancelIdle = runWhenIdle(() => {
            void runAutoBackupIfDue(trigger);
          });
        }, 3000);
      };

      arm('BOOT');

      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active') {
          arm('RESUME');
        } else {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          if (cancelIdle) {
            cancelIdle();
            cancelIdle = null;
          }
        }
      });

      return () => {
        sub.remove();
        if (timer) clearTimeout(timer);
        if (cancelIdle) cancelIdle();
      };
    }, [])
  );
}

export default useAutoBackupTrigger;
