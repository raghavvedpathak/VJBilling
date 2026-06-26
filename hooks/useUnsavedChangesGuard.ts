import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useAppSettingsStore } from '@/store/appSettingsStore'; // v6.4 BLOCKER B fix (path fixed to match the actual store)
import { useNavigation } from '@react-navigation/native';

export function useUnsavedChangesGuard(isDirty: boolean) {
  const navigation = useNavigation(); // required: Expo Router navigation instance
  const warnEnabled = useAppSettingsStore.getState().warnUnsavedChanges === 1;

  useEffect(() => {
    if (!warnEnabled || !isDirty) return;

    // Intercept Expo Router back navigation
    const sub = navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
      Alert.alert('Unsaved Changes', 'You have unsaved changes. Leave anyway?', [
        { text: 'Stay' },
        { text: 'Leave', onPress: () => navigation.dispatch(e.data.action) }
      ]);
    });

    return () => sub();
  }, [isDirty, warnEnabled, navigation]);
}