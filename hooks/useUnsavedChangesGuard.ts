import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from 'expo-router';
import { useAppSettingsStore } from '../store/appSettingsStore';

// ============================================================================
// G69: Unsaved Changes Guard — Phase 1 constitutional requirement.
//
// FIX: Previously used appSettingsStore.getState().warnUnsavedChanges — a
// one-shot snapshot read at hook mount time. If the user changed the setting
// while the screen was open, the guard would not react to the change, and the
// stale value in the dependency array would prevent the useEffect from re-running.
//
// Fix: useAppSettingsStore() is the reactive Zustand selector — it subscribes
// to the store and re-renders (re-runs the effect) whenever warnUnsavedChanges
// changes. warnEnabled is now always current.
// ============================================================================
export function useUnsavedChangesGuard(isDirty: boolean) {
  const navigation = useNavigation();

  // Reactive read — updates if user changes the setting in another tab/screen
  const warnEnabled = useAppSettingsStore((s) => s.warnUnsavedChanges === 1);

  useEffect(() => {
    if (!warnEnabled || !isDirty) return;

    const sub = navigation.addListener('beforeRemove', (e: any) => {
      e.preventDefault();

      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Leave anyway?',
        [
          { text: 'Stay', style: 'cancel' },
          {
            text: 'Leave',
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ]
      );
    });

    return () => sub();
  }, [isDirty, warnEnabled, navigation]);
}