// components/RestorePreviewModal.tsx — Phase 1 (v7.38) & Phase 2 Canonical Component (FIX-V726-3, FIX-V736-1)

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GlassCard, GlassButton, GlassInput } from '@/components/ui/Glass';
import { 
  DatabaseBackup, 
  ShieldAlert, 
  Building2, 
  Package, 
  Layers, 
  FileSpreadsheet, 
  Calendar, 
  Clock, 
  HardDrive,
  X,
  AlertTriangle,
  Coins,
  Lock,
  ImageOff
} from 'lucide-react-native';
import { COLORS } from '@/constants/theme';
import { BackupEnvelope } from '@/services/phase1/backupService';

export interface RestorePreviewModalProps {
  visible: boolean;
  backup: BackupEnvelope | null;
  fileContent?: string | null;
  isRestoring?: boolean;
  onConfirm: (password?: string) => void;
  onCancel: () => void;
}

export function RestorePreviewModal({
  visible,
  backup,
  isRestoring = false,
  onConfirm,
  onCancel,
}: RestorePreviewModalProps) {
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!visible) {
      setPassword('');
    }
  }, [visible]);

  if (!visible || !backup) return null;

  const isPasswordProtected = backup.passwordProtected === true;
  const isConfirmDisabled = isRestoring || (isPasswordProtected && password.trim().length === 0);

  const firms = backup.payload?.firms || [];
  const primaryFirm = firms[0];
  const exportedDate = backup.exportedAt ? new Date(backup.exportedAt) : new Date();
  
  const formattedDate = exportedDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  
  const formattedTime = exportedDate.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const itemCount = backup.payload?.items?.length || 0;
  const categoryCount = backup.payload?.categories?.length || 0;
  const designCount = backup.payload?.designs?.length || 0;
  const gemstoneLotCount = backup.payload?.gemstoneLots?.length || 0;
  const urdCount = backup.payload?.urdPurchases?.length || 0;
  const auditCount = backup.payload?.auditLogs?.length || 0;
  const isSafeModeActive = backup.payload?.safeModeState?.isActive === 1;

  // v7.36 FIX-V736-1: Detect presence of embedded logo binaries
  const hasEmbeddedLogos = !!(backup.payload?.logoAssets && (
    (backup.payload.logoAssets.firmLogos && backup.payload.logoAssets.firmLogos.length > 0) ||
    (backup.payload.logoAssets.bisLogos && backup.payload.logoAssets.bisLogos.length > 0)
  ));

  const handleConfirmPress = () => {
    if (isConfirmDisabled) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}
    onConfirm(isPasswordProtected ? password : undefined);
  };

  const handleCancelPress = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent={true}
      onRequestClose={handleCancelPress}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : (Platform.OS === 'android' ? (require('react-native').StatusBar.currentHeight || 24) : 24)}
        style={s.overlay}
      >
        <View style={s.container}>
          <GlassCard style={s.modalCard}>
            
            {/* MANDATORY WATERMARK BANNER */}
            <View style={s.watermarkBanner}>
              <Text style={s.watermarkText}>PREVIEW — NOT RESTORED YET</Text>
            </View>

            {/* Header Title Bar */}
            <View style={s.headerRow}>
              <View style={s.headerTitleGroup}>
                <View style={s.iconBadge}>
                  <DatabaseBackup size={22} color="#D4AF37" />
                </View>
                <View>
                  <Text style={s.modalTitle}>Backup Preview</Text>
                  <Text style={s.modalSubtitle}>Review data before restoring</Text>
                </View>
              </View>

              {!isRestoring && (
                <TouchableOpacity activeOpacity={0.7} onPress={handleCancelPress} style={s.closeBtn}>
                  <X size={20} color="rgba(46,29,0,0.5)" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={s.scrollArea}>
              
              {/* Metadata Pills */}
              <View style={s.metaPillContainer}>
                <View style={s.metaPill}>
                  <Calendar size={12} color="#B8860B" />
                  <Text style={s.metaPillText}>{formattedDate}</Text>
                </View>
                <View style={s.metaPill}>
                  <Clock size={12} color="#B8860B" />
                  <Text style={s.metaPillText}>{formattedTime}</Text>
                </View>
                <View style={[s.metaPill, { backgroundColor: 'rgba(5, 150, 105, 0.12)', borderColor: 'rgba(5, 150, 105, 0.25)' }]}>
                  <HardDrive size={12} color="#059669" />
                  <Text style={[s.metaPillText, { color: '#059669' }]}>v{backup.appVersion || '1.0.0'}</Text>
                </View>
              </View>

              {/* Primary Firm Profile Card */}
              {primaryFirm && (
                <View style={s.firmCard}>
                  <View style={s.firmIconBox}>
                    <Building2 size={20} color={COLORS.vjText} />
                  </View>
                  <View style={s.firmInfo}>
                    <View style={s.firmNameRow}>
                      <Text style={s.firmName} numberOfLines={1}>{primaryFirm.name}</Text>
                      <View style={s.firmCodeBadge}>
                        <Text style={s.firmCodeText}>{primaryFirm.firmCode}</Text>
                      </View>
                    </View>
                    {primaryFirm.proprietor ? (
                      <Text style={s.firmProprietor}>Proprietor: {primaryFirm.proprietor}</Text>
                    ) : null}
                  </View>
                </View>
              )}

              {/* Data Breakdown Grid */}
              <Text style={s.sectionHeader}>Backup Contents Breakdown</Text>
              <View style={s.gridContainer}>
                <View style={s.gridTile}>
                  <View style={s.gridTileHeader}>
                    <Package size={16} color="#4F46E5" />
                    <Text style={s.gridTileLabel}>Inventory</Text>
                  </View>
                  <Text style={s.gridTileValue}>{itemCount} Items</Text>
                </View>
                <View style={s.gridTile}>
                  <View style={s.gridTileHeader}>
                    <Layers size={16} color="#059669" />
                    <Text style={s.gridTileLabel}>Catalog</Text>
                  </View>
                  <Text style={s.gridTileValue}>{categoryCount} Cat / {designCount} Des</Text>
                </View>
                <View style={s.gridTile}>
                  <View style={s.gridTileHeader}>
                    <Coins size={16} color="#E11D48" />
                    <Text style={s.gridTileLabel}>Stones & URD</Text>
                  </View>
                  <Text style={s.gridTileValue}>{gemstoneLotCount} Gem / {urdCount} URD</Text>
                </View>
                <View style={s.gridTile}>
                  <View style={s.gridTileHeader}>
                    <FileSpreadsheet size={16} color="#D97706" />
                    <Text style={s.gridTileLabel}>Audit Logs</Text>
                  </View>
                  <Text style={s.gridTileValue}>{auditCount} Events</Text>
                </View>
              </View>

              {/* CONDITIONAL BACKUP PASSWORD FIELD (v7.26 FIX-V726-3) */}
              {isPasswordProtected && (
                <View style={s.passwordContainer}>
                  <GlassInput
                    label="Backup Password *"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter decryption password"
                    secureTextEntry
                    icon={<Lock size={18} color="#D4AF37" />}
                  />
                </View>
              )}

              {/* LOGO EXCLUSION NOTICE — ONLY SHOWN FOR PRE-v7.36 BACKUPS (v7.36 FIX-V736-1) */}
              {!hasEmbeddedLogos && (
                <View style={s.logoNoticeCard}>
                  <ImageOff size={16} color="#D97706" />
                  <Text style={s.logoNoticeText}>
                    Logo images are not included in this backup and will need to be re-uploaded after restoring on a new device.
                  </Text>
                </View>
              )}

              {/* Safe Mode Alert */}
              {isSafeModeActive && (
                <View style={s.safeModeAlert}>
                  <ShieldAlert size={18} color={COLORS.danger} />
                  <Text style={s.safeModeAlertText}>
                    SAFE MODE ACTIVE IN BACKUP: Restoring will activate Safe Mode integrity verification.
                  </Text>
                </View>
              )}

              {/* Current Data Warning */}
              <View style={s.warningCard}>
                <AlertTriangle size={18} color="#D97706" />
                <Text style={s.warningText}>
                  Restoring will permanently replace all current store data on this device with the contents of this backup file.
                </Text>
              </View>

            </ScrollView>

            {/* Modal Actions */}
            <View style={s.actionRow}>
              <GlassButton
                title={isRestoring ? "Restoring Database..." : "OVERWRITE & RESTORE"}
                onPress={handleConfirmPress}
                variant="danger"
                loading={isRestoring}
                disabled={isConfirmDisabled}
                icon={isRestoring ? undefined : <DatabaseBackup size={18} color="white" />}
              />
              {!isRestoring && (
                <GlassButton
                  title="Cancel"
                  onPress={handleCancelPress}
                  variant="secondary"
                />
              )}
            </View>

          </GlassCard>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '88%',
  },
  modalCard: {
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: 'rgba(212, 175, 55, 0.35)',
    borderWidth: 1.5,
    borderRadius: 24,
  },
  watermarkBanner: {
    backgroundColor: 'rgba(212, 175, 55, 0.2)',
    borderColor: 'rgba(212, 175, 55, 0.4)',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignSelf: 'center',
    marginBottom: 12,
  },
  watermarkText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#B8860B',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBadge: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.vjText,
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(46,29,0,0.5)',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  scrollArea: {
    maxHeight: 480,
  },
  metaPillContainer: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    borderColor: 'rgba(212, 175, 55, 0.3)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  metaPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B8860B',
  },
  firmCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(46, 29, 0, 0.04)',
    borderColor: 'rgba(46, 29, 0, 0.1)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
  },
  firmIconBox: {
    backgroundColor: 'rgba(92, 22, 35, 0.08)',
    padding: 10,
    borderRadius: 12,
  },
  firmInfo: {
    flex: 1,
  },
  firmNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  firmName: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.vjText,
    flexShrink: 1,
  },
  firmCodeBadge: {
    backgroundColor: COLORS.vjText,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  firmCodeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  firmProprietor: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(46, 29, 0, 0.6)',
    marginTop: 2,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'rgba(46, 29, 0, 0.45)',
    marginBottom: 8,
    marginLeft: 2,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  gridTile: {
    width: '48%',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderColor: 'rgba(46, 29, 0, 0.08)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
  },
  gridTileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  gridTileLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(46, 29, 0, 0.5)',
    textTransform: 'uppercase',
  },
  gridTileValue: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.vjText,
    fontFamily: 'monospace',
  },
  passwordContainer: {
    marginBottom: 12,
  },
  logoNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(217, 119, 6, 0.06)',
    borderColor: 'rgba(217, 119, 6, 0.2)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  logoNoticeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
    flex: 1,
    lineHeight: 14,
  },
  safeModeAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  safeModeAlertText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.danger,
    flex: 1,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(217, 119, 6, 0.08)',
    borderColor: 'rgba(217, 119, 6, 0.25)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  warningText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
    flex: 1,
    lineHeight: 15,
  },
  actionRow: {
    marginTop: 16,
    gap: 10,
  },
});