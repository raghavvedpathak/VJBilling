import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, TextInput } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { STORAGE_PATHS } from '../constants/storagePaths';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { AlertTriangle, Database, Trash2, Mail } from 'lucide-react-native';
import * as Updates from 'expo-updates';
import { GlassCard, GlassButton, GlassInput } from '../components/ui/Glass';

export default function DatabaseErrorScreen() {
  const [snapshotAvailable, setSnapshotAvailable] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [showFactoryReset, setShowFactoryReset] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  useEffect(() => {
    checkSnapshot();
  }, []);

  const checkSnapshot = async () => {
    try {
      // RULE 3: Check file existence via getInfoAsync()
      const info = await FileSystem.getInfoAsync(STORAGE_PATHS.PRE_MIGRATION_SNAPSHOT);
      setSnapshotAvailable(info.exists);
    } catch (e) {
      setSnapshotAvailable(false);
    } finally {
      setIsChecking(false);
    }
  };

  const handleExportRaw = async () => {
    alert("Raw data export will be wired up in Phase 2.");
  };

  const handleContactSupport = () => {
    // Show support contact flow
    Alert.alert('Contact Support', 'Migration error details have been copied to clipboard (simulation). Please email support@vjbilling.com.');
  };

  const handleFactoryReset = async () => {
    if (deleteConfirm !== 'DELETE') {
      Alert.alert('Validation Error', 'You must type DELETE to confirm factory reset.');
      return;
    }
    try {
      const dbPath = `${STORAGE_PATHS.RAW_DB_DIR}${STORAGE_PATHS.DB_FILENAME}`;
      await FileSystem.deleteAsync(dbPath, { idempotent: true });
      Alert.alert('Reset Complete', 'Database deleted. The app will now restart.', [
        { text: 'Restart', onPress: () => Updates.reloadAsync() }
      ]);
    } catch (e) {
      Alert.alert('Error', 'Failed to delete database file.');
    }
  };

  return (
    <ScreenWrapper title="Critical System Error" showBack={false}>
      <View className="flex-1 justify-center items-center px-6">
        <View className="bg-vj-danger/20 p-4 rounded-full mb-6">
          <AlertTriangle size={48} color="#ef4444" />
        </View>

        <Text className="text-2xl font-bold text-vj-text text-center mb-2">
          Database Migration Failed
        </Text>
        
        <Text className="text-vj-text/70 text-center mb-10">
          The application encountered a critical error while upgrading your local database. To prevent data corruption, the system has halted.
        </Text>

        <View className="w-full gap-4 mt-6">
          {/* OPTION 1: Export Raw Data */}
          <GlassButton
            title={
              isChecking 
                ? 'Checking for snapshot...' 
                : snapshotAvailable 
                  ? 'Export Raw Data' 
                  : 'No snapshot available'
            }
            onPress={handleExportRaw}
            disabled={!snapshotAvailable || isChecking}
            variant="primary"
            icon={<Database size={20} color={snapshotAvailable ? "#fff" : "#9ca3af"} />}
          />

          {/* OPTION 2: Contact Support */}
          <GlassButton
            title="Contact Support"
            onPress={handleContactSupport}
            variant="secondary"
            icon={<Mail size={20} color="#1f2937" />}
          />

          {/* OPTION 3: Factory Reset */}
          {!showFactoryReset ? (
            <GlassButton
              title="Factory Reset (Delete All Data)"
              onPress={() => setShowFactoryReset(true)}
              variant="danger"
              icon={<Trash2 size={20} color="#ffffff" />}
            />
          ) : (
            <GlassCard>
              <Text className="text-vj-danger text-sm text-center font-bold mb-4">
                WARNING: This will permanently delete all your data. Type 'DELETE' to confirm.
              </Text>
              <GlassInput
                value={deleteConfirm}
                onChangeText={setDeleteConfirm}
                placeholder="Type DELETE"
                autoCapitalize="characters"
              />
              <View className="gap-3 mt-2">
                <GlassButton
                  title="Confirm Reset"
                  onPress={handleFactoryReset}
                  variant="danger"
                />
                <GlassButton
                  title="Cancel"
                  onPress={() => {
                    setShowFactoryReset(false);
                    setDeleteConfirm('');
                  }}
                  variant="secondary"
                />
              </View>
            </GlassCard>
          )}
        </View>
      </View>
    </ScreenWrapper>
  );
}