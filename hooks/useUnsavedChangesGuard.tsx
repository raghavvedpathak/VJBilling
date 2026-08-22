// hooks/useUnsavedChangesGuard.tsx — Phase 1 & Phase 2 Modern Unsaved Changes Hook

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigation } from 'expo-router';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { UnsavedChangesModal } from '@/components/UnsavedChangesModal';

export function useUnsavedChangesGuard(isDirty: boolean) {
  const navigation = useNavigation();
  const [showModal, setShowModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<any>(null);

  // Reactively bind to settings store so it updates instantly if toggled in Settings
  const warnUnsavedChanges = appSettingsStore((s) => s.warnUnsavedChanges);
  const warnEnabled = warnUnsavedChanges === 1;

  useEffect(() => {
    if (!warnEnabled || !isDirty) return;

    // Intercept Expo Router back navigation
    const sub = navigation.addListener('beforeRemove', (e: any) => {
      e.preventDefault();
      setPendingAction(e.data.action);
      setShowModal(true);
    });

    return () => sub();
  }, [isDirty, warnEnabled, navigation]);

  const handleStay = useCallback(() => {
    setShowModal(false);
    setPendingAction(null);
  }, []);

  const handleDiscard = useCallback(() => {
    setShowModal(false);
    if (pendingAction) {
      navigation.dispatch(pendingAction);
    }
  }, [navigation, pendingAction]);

  const UnsavedModal = (
    <UnsavedChangesModal
      visible={showModal}
      onStay={handleStay}
      onDiscard={handleDiscard}
    />
  );

  return {
    showModal,
    handleStay,
    handleDiscard,
    UnsavedModal,
  };
}