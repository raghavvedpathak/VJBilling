import React, { useEffect, useState } from 'react';
import { View, Text, Alert, ActivityIndicator, ScrollView } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { STORAGE_PATHS } from '@/constants/storagePaths';
import { PRE_MIGRATION_SNAPSHOT_PATH } from '@/services/phase1/bootstrapService';
import { getDeviceDerivedKeyMaterial } from '@/utils/deviceKey';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { AlertTriangle, Database, Trash2, Mail } from 'lucide-react-native';
import * as Updates from 'expo-updates';
import { GlassCard, GlassButton, GlassInput } from '@/components/ui/Glass';

export default function DatabaseErrorScreen() {
  const [snapshotAvailable, setSnapshotAvailable] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [showFactoryReset, setShowFactoryReset] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const checkSnapshot = async () => {
    try {
      const infoEnc = await FileSystem.getInfoAsync(PRE_MIGRATION_SNAPSHOT_PATH);
      if (infoEnc.exists) {
        setSnapshotAvailable(true);
        return;
      }
      if (STORAGE_PATHS.PRE_MIGRATION_SNAPSHOT) {
        const infoRaw = await FileSystem.getInfoAsync(STORAGE_PATHS.PRE_MIGRATION_SNAPSHOT);
        setSnapshotAvailable(infoRaw.exists);
      } else {
        setSnapshotAvailable(false);
      }
    } catch (e) {
      setSnapshotAvailable(false);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkSnapshot();
  }, []);

  const handleExportRaw = async () => {
    if (!snapshotAvailable) return;
    try {
      setIsExporting(true);
      const fileContent = await FileSystem.readAsStringAsync(PRE_MIGRATION_SNAPSHOT_PATH, { encoding: FileSystem.EncodingType.UTF8 });
      const parsedBlob = JSON.parse(fileContent);

      const fromBase64 = (b64: string) => Uint8Array.from(atob(b64.trim()), c => c.charCodeAt(0));
      const saltBytes = fromBase64(parsedBlob.salt);
      const ivBytes = fromBase64(parsedBlob.iv);
      const cipherBytes = fromBase64(parsedBlob.ciphertext);

      const keySourceMaterial = await getDeviceDerivedKeyMaterial();
      
      const globalCrypto = (globalThis as any).crypto;
      const keyMaterial = await globalCrypto.subtle.importKey('raw', keySourceMaterial as any, 'PBKDF2', false, ['deriveKey']);
      const key = await globalCrypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
        keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
      );

      const decrypted = await globalCrypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, cipherBytes);
      const decryptedStr = new TextDecoder().decode(decrypted);

      const fsAny = FileSystem as any;
      const tempPath = (fsAny.cacheDirectory ?? fsAny.documentDirectory ?? '') + 'vjbilling_premigration_decrypted.json';
      await FileSystem.writeAsStringAsync(tempPath, decryptedStr, { encoding: FileSystem.EncodingType.UTF8 });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(tempPath, {
          dialogTitle: "Export Decrypted Pre-Migration Data",
          mimeType: 'application/json'
        });
      }
      
      await FileSystem.deleteAsync(tempPath, { idempotent: true });

    } catch (e: any) {
      Alert.alert("Export Failed", "Could not decrypt the snapshot. Error: " + e.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleContactSupport = () => {
    Alert.alert('Contact Support', 'Please email support@vjbilling.com with your migration error details.');
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 24, paddingBottom: 40 }}
      >
        <View className="w-full items-center px-6">
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
                  : isExporting
                    ? 'Decrypting Snapshot...'
                    : snapshotAvailable 
                      ? 'Export Raw Data' 
                      : 'No snapshot available'
              }
              onPress={handleExportRaw}
              disabled={!snapshotAvailable || isChecking || isExporting}
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
      </ScrollView>
    </ScreenWrapper>
  );
}