import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Image, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { useFirmStore } from '../../store/firmStore';
import { firmService } from '../../services/firmService';
import { GlassCard, GlassButton, HeaderPill } from '../../components/ui/Glass'; 
import { Building2, Plus, Pencil, Archive, ArchiveRestore, AlertTriangle, ShieldCheck } from 'lucide-react-native';
import { useStore } from 'zustand';
import { appSettingsStore } from '../../store/appSettingsStore';
import { COLORS, getThemeColors } from '../../constants/theme';

type DialogState = {
  visible: boolean;
  type: 'SWITCH' | 'ARCHIVE' | 'INFO';
  title: string;
  message: string;
  targetId?: string;
  isArchived?: boolean;
};

export default function FirmManagerScreen() {
  const router = useRouter();
  const { firms, activeFirmId, switchFirm } = useFirmStore();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const activeTheme = useStore(appSettingsStore, (s) => s.theme);
  const colors = getThemeColors(activeTheme);
  
  // MODERN MODAL STATE
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [brokenLogos, setBrokenLogos] = useState<Record<string, boolean>>({});

  const activeFirmCount = firms.filter(f => !f.isArchived).length;
  const canAddFirm = firms.length < 3;

  const handleSwitch = (targetFirmId: string) => {
    if (targetFirmId === activeFirmId) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
    setDialog({
      visible: true,
      type: 'SWITCH',
      title: 'Switch Firm',
      message: "The dashboard will reload with the selected firm's data.",
      targetId: targetFirmId
    });
  };

  const confirmSwitch = async () => {
    if (!dialog?.targetId) return;
    const targetId = dialog.targetId;
    setDialog(null);
    setLoadingId(targetId);
    try {
      await switchFirm(targetId);
      router.replace('/dashboard');
    } catch (err: any) {
      setDialog({
        visible: true,
        type: 'INFO',
        title: 'Error',
        message: err.message || 'Failed to switch firm'
      });
    } finally {
      setLoadingId(null);
    }
  };

  const handleAddFirm = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
    if (canAddFirm) {
      router.push('/create-firm'); 
    } else {
      setDialog({
        visible: true,
        type: 'INFO',
        title: 'Limit Reached',
        message: 'You can strictly manage up to 3 firms. Archive an existing firm to free up a slot.'
      });
    }
  };

  const handleEdit = (firmId: string) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
    router.push({ pathname: '/settings/firm-edit', params: { id: firmId } });
  };

  const handleToggleArchive = (firmId: string, isArchived: boolean) => {
    if (firmId === activeFirmId) {
      setDialog({
        visible: true,
        type: 'INFO',
        title: 'Action Prohibited',
        message: 'Cannot archive the currently active firm. Please switch to another firm first.'
      });
      return;
    }

    setDialog({
      visible: true,
      type: 'ARCHIVE',
      title: isArchived ? 'Reactivate Firm' : 'Archive Firm',
      message: isArchived ? 'This firm will be reactivated.' : 'Archived firms cannot be selected for daily billing.',
      targetId: firmId,
      isArchived
    });
  };

  const confirmToggleArchive = async () => {
    if (!dialog?.targetId) return;
    const { targetId, isArchived } = dialog;
    setLoadingId(targetId);
    setDialog(null);

    try {
      if (isArchived) {
        await firmService.unarchiveFirm(targetId);
      } else {
        await firmService.archiveFirm(targetId);
      }
    } catch (err: any) {
      setDialog({
        visible: true,
        type: 'INFO',
        title: 'Error',
        message: err.message || 'Action failed'
      });
    } finally {
      setLoadingId(null);
    }
  };

  const confirmDialog = async () => {
    if (!dialog) return;
    if (dialog.type === 'SWITCH') await confirmSwitch();
    else if (dialog.type === 'ARCHIVE') await confirmToggleArchive();
  };

  const capacityHeaderPills = (
    <View className="flex-row items-center gap-2 flex-wrap mt-1">
      <HeaderPill icon={<Building2 size={12} color={colors.vjBg} />} label={`${activeFirmCount} Active Firms`} />
      <HeaderPill icon={<ShieldCheck size={12} color="#4ADE80" />} label={`Capacity: ${firms.length}/3`} variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="My Firms" showBack headerContent={capacityHeaderPills}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 100, paddingTop: 20}}>

        {firms.map((firm) => {
          const isActive = firm.id === activeFirmId;
          const isArchived = firm.isArchived === 1;
          const isLoading = loadingId === firm.id;
          
          const displayLogo = firm.firmLogoRef;

          return (
            <GlassCard key={firm.id} style={{ padding: 0, opacity: isArchived ? 0.6 : 1 }}>
              <View className="flex-row items-center gap-2">
                
                <TouchableOpacity 
                  className="flex-1 flex-row items-center gap-3 p-4"
                  onPress={() => handleSwitch(firm.id)}
                  disabled={isActive || isArchived || isLoading}
                >
                  <View className={`h-12 w-12 rounded-full justify-center items-center overflow-hidden border border-white/50 ${isActive ? 'bg-vj-success/20' : isArchived ? 'bg-gray-200' : 'bg-vj-glass'}`}>
                    {isLoading ? (
                       <ActivityIndicator color={isActive ? '#15803d' : colors.vjText} />
                    ) : displayLogo && !brokenLogos[firm.id] ? (
                       <Image 
                         source={{ uri: displayLogo }} 
                         style={{ width: '100%', height: '100%' }}
                         resizeMode="contain"
                         onError={() => {
                           console.warn(`[FirmManager] Failed to load logo for firm ${firm.id}. Dead URI.`);
                           setBrokenLogos(prev => ({ ...prev, [firm.id]: true }));
                         }}
                       />
                    ) : (
                       <Building2 size={24} color={isActive ? '#15803d' : isArchived ? '#999' : colors.vjText} />
                    )}
                  </View>

                  <View className="flex-1 pr-2">
                    <View className="flex-row flex-wrap items-center gap-2 mb-1">
                      <Text className="text-vj-text font-bold text-lg leading-tight flex-shrink" numberOfLines={1}>
                        {firm.name}
                      </Text>
                      {isActive && (
                        <View className="bg-vj-success/10 px-2 py-0.5 rounded-full border border-vj-success/20">
                          <Text className="text-vj-success text-[10px] font-bold uppercase">Active</Text>
                        </View>
                      )}
                      {isArchived && (
                        <View className="bg-gray-200 px-2 py-0.5 rounded-full border border-gray-300">
                          <Text className="text-gray-600 text-[10px] font-bold uppercase">Archived</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-vj-text/60 text-xs font-medium">
                      Code: {firm.firmCode} • {firm.city}
                    </Text>
                  </View>
                </TouchableOpacity>

                <View className="flex-row items-center pr-2">
                  <View className="h-8 w-[1px] bg-vj-text/10 mr-1" />
                  
                  <TouchableOpacity 
                    onPress={() => handleEdit(firm.id)}
                    disabled={isLoading}
                    className="p-3 rounded-full active:bg-white/40"
                  >
                    <Pencil size={18} color="#D4AF37" />
                  </TouchableOpacity>

                  {!isActive && (
                    <TouchableOpacity 
                      onPress={() => handleToggleArchive(firm.id, isArchived)}
                      disabled={isLoading}
                      className="p-3 rounded-full active:bg-white/40"
                    >
                      {isArchived ? (
                         <ArchiveRestore size={18} color="#15803d" />
                      ) : (
                         <Archive size={18} color="#ef4444" />
                      )}
                    </TouchableOpacity>
                  )}
                </View>

              </View>
            </GlassCard>
          );
        })}

        <TouchableOpacity
          onPress={handleAddFirm}
          className={`mt-2 p-5 rounded-3xl border-2 border-dashed flex-row justify-center items-center gap-2 ${
            canAddFirm ? 'border-vj-text/20 bg-white/40' : 'border-gray-200 bg-gray-50/50 opacity-60'
          }`}
          disabled={!canAddFirm}
        >
          <Plus size={20} color={canAddFirm ? colors.vjText : "#999"} />
          <Text className={`text-center font-bold ${canAddFirm ? 'text-vj-text' : 'text-gray-400'}`}>
            {canAddFirm ? "Establish New Firm" : "Maximum Limit Reached"}
          </Text>
        </TouchableOpacity>

      </ScrollView>

      {/* MODERN DIALOG MODAL */}
      <Modal animationType="fade" transparent={true} visible={!!dialog && dialog.visible}>
        {dialog && (
          <View className="flex-1 bg-black/50 justify-center items-center px-6">
            <View className="w-full bg-vj-bg rounded-3xl p-8 shadow-xl items-center border border-white/50">
              
              <View className={`p-6 rounded-full mb-6 border ${dialog.type === 'ARCHIVE' && !dialog.isArchived ? 'bg-vj-danger/10 border-vj-danger/30' : 'bg-vj-accent/20 border-vj-accent/30'}`}>
                {dialog.type === 'INFO' ? <AlertTriangle size={48} color="#D4AF37" /> : 
                 dialog.type === 'ARCHIVE' && !dialog.isArchived ? <Archive size={48} color="#ef4444" /> :
                 <Building2 size={48} color="#D4AF37" />}
              </View>

              <Text className="text-2xl font-bold text-vj-text mb-2 text-center tracking-tight">{dialog.title}</Text>
              <Text className="text-vj-text/60 text-center mb-8 font-medium px-2">{dialog.message}</Text>

              <View className="w-full gap-3">
                {dialog.type !== 'INFO' && (
                  <GlassButton 
                    title={dialog.type === 'SWITCH' ? "Switch Firm" : dialog.isArchived ? "Restore Firm" : "Archive Firm"} 
                    variant={dialog.type === 'ARCHIVE' && !dialog.isArchived ? 'danger' : 'primary'}
                    onPress={confirmDialog} 
                    loading={loadingId !== null}
                  />
                )}
                <GlassButton 
                  title={dialog.type === 'INFO' ? "Got it" : "Cancel"} 
                  variant="secondary"
                  onPress={() => setDialog(null)} 
                  disabled={loadingId !== null}
                />
              </View>

            </View>
          </View>
        )}
      </Modal>

    </TwoToneWrapper>
  );
}