// app/database-error.tsx — Phase 1 v7.47 & Phase 2 Canonical Recovery Screen
// Implements FIX-VSEC-12, FIX-V741-2, FIX-V7411-3, FIX-V744-12

import React, { useEffect, useState } from 'react';
import { View, Text, Alert, ScrollView, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import quickCrypto, { Buffer } from 'react-native-quick-crypto';
import { PRE_MIGRATION_SNAPSHOT_PATH } from '@/services/phase1/bootstrapService';
import { performFactoryResetFiles } from '@/services/phase1/factoryResetService';
import { decryptSnapshot } from '@/utils/backupCrypto';
import { getDeviceDerivedKeyMaterial } from '@/utils/deviceKey';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { ScreenWrapper } from '@/components/common/ScreenWrapper';
import { AlertTriangle, Database, Trash2, Mail } from 'lucide-react-native';
import { GlassCard, GlassButton, GlassInput } from '@/components/ui/Glass';

export default function DatabaseErrorScreen() {
  const [snapshotAvailable, setSnapshotAvailable] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [showFactoryReset, setShowFactoryReset] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [delaySeconds, setDelaySeconds] = useState(5);
  const [isResetting, setIsResetting] = useState(false);

  const firms = useFirmStore((s) => s.firms);
  const activeFirmId = useFirmStore((s) => s.activeFirmId);
  const activeFirm = firms.find((f) => f.id === activeFirmId) ?? firms[0];
  // FIX-VSEC-12: Require active firmCode when available, or 'DELETE' if DB failed before firm load
  const requiredToken = activeFirm?.firmCode ? activeFirm.firmCode : 'DELETE';

  const checkSnapshot = async () => {
    try {
      const infoEnc = await FileSystem.getInfoAsync(PRE_MIGRATION_SNAPSHOT_PATH);
      setSnapshotAvailable(infoEnc.exists);
    } catch {
      setSnapshotAvailable(false);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkSnapshot();
  }, []);

  // FIX-VSEC-12: 5-second enforced delay before factory reset confirmation is enabled
  useEffect(() => {
    if (!showFactoryReset) {
      setDelaySeconds(5);
      return;
    }
    setDelaySeconds(5);
    const interval = setInterval(() => {
      setDelaySeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [showFactoryReset]);

  const handleExportRaw = async () => {
    if (!snapshotAvailable) return;
    try {
      setIsExporting(true);
      const fileContent = await FileSystem.readAsStringAsync(PRE_MIGRATION_SNAPSHOT_PATH, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const parsedBlob = JSON.parse(fileContent);

      let decryptedStr: string;
      // FIX-V7411-3: Use decryptSnapshot() for v2 Keystore snapshots, with v1 fallback
      if (parsedBlob?.v === 2) {
        decryptedStr = await decryptSnapshot(fileContent);
      } else {
        const saltBytes = Buffer.from(parsedBlob.salt, 'base64');
        const ivBytes = Buffer.from(parsedBlob.iv, 'base64');
        const combinedCipher = Buffer.from(parsedBlob.ciphertext, 'base64');

        const authTag = combinedCipher.subarray(combinedCipher.length - 16);
        const ciphertextBody = combinedCipher.subarray(0, combinedCipher.length - 16);

        const keySourceMaterial = Buffer.from(await getDeviceDerivedKeyMaterial());

        const key = quickCrypto.pbkdf2Sync(
          keySourceMaterial,
          saltBytes,
          100_000,
          32,
          'sha256'
        );

        const decipher = (quickCrypto as any).createDecipheriv('aes-256-gcm', key, ivBytes);
        decipher.setAuthTag(authTag);

        decryptedStr = Buffer.concat([
          decipher.update(ciphertextBody),
          decipher.final(),
        ]).toString('utf8');
      }

      const fsAny = FileSystem as any;
      const tempPath = `${
        fsAny.cacheDirectory ?? fsAny.documentDirectory ?? ''
      }vjbilling_premigration_decrypted.json`;
      await FileSystem.writeAsStringAsync(tempPath, decryptedStr, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(tempPath, {
          dialogTitle: 'Export Decrypted Pre-Migration Data',
          mimeType: 'application/json',
        });
      }

      await FileSystem.deleteAsync(tempPath, { idempotent: true });
    } catch (e: any) {
      Alert.alert('Export Failed', 'Could not decrypt the snapshot. Error: ' + e.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleContactSupport = () => {
    const body = `CRITICAL MIGRATION FAILURE\n\nPlease assist with manual recovery.\nDevice Date: ${new Date().toISOString()}`;
    const mailtoUrl = `mailto:support@vjbilling.com?subject=VJ Billing - Critical Migration Failure&body=${encodeURIComponent(
      body
    )}`;
    Linking.canOpenURL(mailtoUrl)
      .then((supported) => {
        if (supported) {
          Linking.openURL(mailtoUrl);
        } else {
          Alert.alert(
            'Contact Support',
            'Please email support@vjbilling.com with your migration error details.'
          );
        }
      })
      .catch(() => {
        Alert.alert(
          'Contact Support',
          'Please email support@vjbilling.com with your migration error details.'
        );
      });
  };

  const handleFactoryReset = async () => {
    if (delaySeconds > 0) return;
    if (
      deleteConfirm.trim().toUpperCase() !== requiredToken.toUpperCase() &&
      deleteConfirm.trim() !== 'DELETE'
    ) {
      Alert.alert(
        'Validation Error',
        `You must type ${requiredToken} to confirm factory reset.`
      );
      return;
    }
    try {
      setIsResetting(true);
      await performFactoryResetFiles(requiredToken);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to complete factory reset.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <ScreenWrapper title="Critical System Error" showBack={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingVertical: 24,
          paddingBottom: 40,
        }}
      >
        <View className="w-full items-center px-6">
          <View className="bg-vj-danger/20 p-4 rounded-full mb-6">
            <AlertTriangle size={48} color="#ef4444" />
          </View>

          <Text className="text-2xl font-bold text-vj-text text-center mb-2">
            Database Error
          </Text>

          <Text className="text-vj-text/70 text-center mb-10">
            The application encountered a critical error while opening or upgrading your local
            database. To prevent data corruption, the system has halted in safe emergency mode.
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
                      ? 'Export Decrypted Data'
                      : 'No snapshot available — pre-migration backup did not complete'
              }
              onPress={handleExportRaw}
              disabled={!snapshotAvailable || isChecking || isExporting}
              variant="primary"
              icon={<Database size={20} color={snapshotAvailable ? '#fff' : '#9ca3af'} />}
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
                  WARNING: This will permanently delete all your data, encryption key, and
                  journal records. Type &apos;{requiredToken}&apos; to confirm.
                </Text>
                <GlassInput
                  value={deleteConfirm}
                  onChangeText={setDeleteConfirm}
                  placeholder={`Type ${requiredToken}`}
                  autoCapitalize="characters"
                />
                <View className="gap-3 mt-4">
                  <GlassButton
                    title={
                      isResetting
                        ? 'Resetting...'
                        : delaySeconds > 0
                          ? `Wait ${delaySeconds}s to Confirm`
                          : 'Confirm Permanent Delete'
                    }
                    onPress={handleFactoryReset}
                    disabled={delaySeconds > 0 || isResetting}
                    variant="danger"
                  />
                  <GlassButton
                    title="Cancel"
                    disabled={isResetting}
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
