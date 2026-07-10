// hooks/useUnsavedChangesGuard.tsx
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from 'expo-router';
import { useStore } from 'zustand';
import { appSettingsStore } from '../store/appSettingsStore';

export function useUnsavedChangesGuard(isDirty: boolean) {
  const navigation = useNavigation();
  
  // Reactively bind to the store so it updates instantly if toggled in Settings
  const warnUnsavedChanges = useStore(appSettingsStore, (s) => s.warnUnsavedChanges);
  const warnEnabled = warnUnsavedChanges === 1;

  useEffect(() => {
    if (!warnEnabled || !isDirty) return;

    // Intercept Expo Router back navigation
    const sub = navigation.addListener('beforeRemove', (e: any) => {
      e.preventDefault();
      
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Are you sure you want to discard them and leave?',
        [
          { text: 'Stay', style: 'cancel', onPress: () => {} },
          { 
            text: 'Leave', 
            style: 'destructive', 
            onPress: () => navigation.dispatch(e.data.action) 
          }
        ]
      );
    });

    return () => sub();
  }, [isDirty, warnEnabled, navigation]);
}