import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity } from 'react-native';
// FIX: Import useStore and the compliant store
import { useStore } from 'zustand';
import { appSettingsStore } from '../store/appSettingsStore';
import { useNavigation } from 'expo-router';
import { AlertTriangle } from 'lucide-react-native';

export function useUnsavedChangesGuard(isDirty: boolean) {
  const navigation = useNavigation();
  // FIX: Use useStore to reactively bind to the static store
  const warnUnsavedChanges = useStore(appSettingsStore, (s) => s.warnUnsavedChanges);
  const warnEnabled = warnUnsavedChanges === 1;
  
  const [showModal, setShowModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<any>(null);

  useEffect(() => {
    if (!warnEnabled || !isDirty) return;

    const sub = navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
      setPendingAction(e.data.action);
      setShowModal(true);
    });

    return () => sub();
  }, [isDirty, warnEnabled, navigation]);

  const handleLeave = () => {
    setShowModal(false);
    if (pendingAction) {
      navigation.dispatch(pendingAction);
    }
  };

  const handleStay = () => {
    setShowModal(false);
    setPendingAction(null);
  };

  const modalElement = (
    <Modal
      visible={showModal}
      animationType="fade"
      transparent
      onRequestClose={handleStay}
    >
      <View className="flex-1 bg-black/60 justify-center items-center px-6">
        <View className="w-full bg-white rounded-3xl p-8 shadow-xl items-center border border-vj-text/30">
          <View className="bg-vj-text/10 p-5 rounded-full mb-6 border border-vj-text/20">
            <AlertTriangle size={42} color="#5C1623" />
          </View>
          <Text className="text-2xl font-black text-vj-text mb-3 text-center tracking-tight uppercase">
            Unsaved Changes
          </Text>
          <Text className="text-vj-text/60 text-center mb-8 font-medium text-base">
            You have unsaved changes. Are you sure you want to discard them and leave?
          </Text>
          <View className="w-full flex-row gap-4">
            <TouchableOpacity
              onPress={handleStay}
              className="flex-1 bg-white border-2 border-vj-text py-4 rounded-2xl items-center"
            >
              <Text className="font-bold text-vj-text text-base">Stay</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleLeave}
              className="flex-1 bg-vj-text py-4 rounded-2xl items-center"
            >
              <Text className="font-bold text-white text-base">Leave</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return modalElement;
}