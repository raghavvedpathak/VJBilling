import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { STORAGE_PATHS } from '../constants/storagePaths';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { AlertTriangle, Database, Trash2 } from 'lucide-react-native';

export default function DatabaseErrorScreen() {
  const [snapshotAvailable, setSnapshotAvailable] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

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

  const handleRestore = async () => {
    alert("Snapshot recovery engine will be wired up in Phase 2.");
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

        {/* RULE 3 IMPLEMENTATION */}
        <View className="w-full gap-4">
          <TouchableOpacity
            onPress={handleRestore}
            disabled={!snapshotAvailable || isChecking}
            className={`p-4 rounded-xl flex-row items-center justify-center gap-2 ${
              snapshotAvailable ? 'bg-vj-text' : 'bg-gray-300'
            }`}
          >
            {isChecking ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Database size={20} color={snapshotAvailable ? "#fff" : "#9ca3af"} />
            )}
            
            {/* EXACT string match for the specification */}
            <Text className={`font-bold text-center text-xs ${snapshotAvailable ? 'text-vj-bg' : 'text-gray-500'}`}>
              {isChecking 
                ? 'Checking for snapshot...' 
                : snapshotAvailable 
                  ? 'Recover from Snapshot' 
                  : 'No snapshot available — pre-migration backup did not complete'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="p-4 rounded-xl flex-row items-center justify-center gap-2 border border-vj-danger/30 bg-vj-danger/10"
            onPress={() => alert("Factory Reset logic will be implemented in Phase 2.")}
          >
            <Trash2 size={20} color="#ef4444" />
            <Text className="font-bold text-vj-danger text-center text-sm">
              Factory Reset (Delete All Data)
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenWrapper>
  );
}