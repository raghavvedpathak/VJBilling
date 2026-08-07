// components/RestorePreviewModal.tsx
import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GlassCard, GlassButton } from './ui/Glass';
import { 
  DatabaseBackup, 
  ShieldAlert, 
  Building2, 
  Package, 
  Layers, 
  Gem, 
  FileSpreadsheet, 
  Calendar, 
  Clock, 
  HardDrive,
  X,
  AlertTriangle,
  Coins
} from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import { BackupEnvelope } from '../services/backupService';

export interface RestorePreviewModalProps {
  visible: boolean;
  backup: BackupEnvelope | null;
  fileContent: string | null;
  isRestoring?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RestorePreviewModal({
  visible,
  backup,
  isRestoring = false,
  onConfirm,
  onCancel,
}: RestorePreviewModalProps) {
  if (!visible || !backup) return null;

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

  const handleConfirmPress = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}
    onConfirm();
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
      onRequestClose={handleCancelPress}
    >
      <View style={s.overlay}>
        <View style={s.container}>
          <GlassCard style={s.modalCard}>
            
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
                
                {/* Inventory Items */}
                <View style={s.gridTile}>
                  <View style={s.gridTileHeader}>
                    <Package size={16} color="#4F46E5" />
                    <Text style={s.gridTileLabel}>Inventory</Text>
                  </View>
                  <Text style={s.gridTileValue}>{itemCount} Items</Text>
                </View>

                {/* Categories & Designs */}
                <View style={s.gridTile}>
                  <View style={s.gridTileHeader}>
                    <Layers size={16} color="#059669" />
                    <Text style={s.gridTileLabel}>Catalog</Text>
                  </View>
                  <Text style={s.gridTileValue}>{categoryCount} Cat / {designCount} Des</Text>
                </View>

                {/* URD & Gemstones */}
                <View style={s.gridTile}>
                  <View style={s.gridTileHeader}>
                    <Coins size={16} color="#E11D48" />
                    <Text style={s.gridTileLabel}>Stones & URD</Text>
                  </View>
                  <Text style={s.gridTileValue}>{gemstoneLotCount} Gem / {urdCount} URD</Text>
                </View>

                {/* Audit Logs */}
                <View style={s.gridTile}>
                  <View style={s.gridTileHeader}>
                    <FileSpreadsheet size={16} color="#D97706" />
                    <Text style={s.gridTileLabel}>Audit Logs</Text>
                  </View>
                  <Text style={s.gridTileValue}>{auditCount} Events</Text>
                </View>

              </View>

              {/* Warnings Banner */}
              {isSafeModeActive && (
                <View style={s.safeModeAlert}>
                  <ShieldAlert size={18} color={COLORS.danger} />
                  <Text style={s.safeModeAlertText}>
                    SAFE MODE ACTIVE IN BACKUP: Restoring will activate Safe Mode integrity verification.
                  </Text>
                </View>
              )}

              <View style={s.warningCard}>
                <AlertTriangle size={18} color="#D97706" />
                <Text style={s.warningText}>
                  Restoring will permanently overwrite all current store data on this device with the contents of this backup file.
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
                disabled={isRestoring}
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
      </View>
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
    maxHeight: '85%',
  },
  modalCard: {
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderColor: 'rgba(212, 175, 55, 0.35)',
    borderWidth: 1.5,
    borderRadius: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
    maxHeight: 380,
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
    marginBottom: 14,
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
  safeModeAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
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
