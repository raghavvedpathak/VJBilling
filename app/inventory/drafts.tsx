// app/inventory/drafts.tsx — Phase 2 v2.24 Canonical Screen

import React, { useState, useCallback, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { HeaderPill, GlassButton } from '@/components/ui/Glass';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { inventoryDrillDownService } from '@/services/phase2/inventoryDrillDownService';
import { itemService } from '@/services/phase2/itemService';
import type { ItemSearchResult } from '@/types/phase2/phase2.types';
import { getDisplayPurity, formatKaratBadge, formatSKUDisplay, formatWeightMg as formatWeight } from '@/utils/calculations';
import { Check, PackageSearch, Edit3, CheckCircle, Package, Scale, ShieldCheck } from 'lucide-react-native';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { COLORS, getThemeColors } from '@/constants/theme';

type DraftRowProps = {
  item: ItemSearchResult;
  colors: ReturnType<typeof getThemeColors>;
  onActivate: (itemId: string, sku: string) => void;
  onEdit: (itemId: string) => void;
};

const DraftRow = memo(({ item, colors, onActivate, onEdit }: DraftRowProps) => {
  const metalColor = item.metal === 'GOLD' ? (colors.vjAccent || COLORS.gold) : COLORS.silver;
  const isGold = item.metal === 'GOLD';

  const karatBadge = formatKaratBadge(item.purityPercent, item.metal);
  const purityDisplay = (isGold && karatBadge)
    ? `${karatBadge} · ${item.purityPercent.toFixed(1)}%`
    : getDisplayPurity(item.purityPercent, item.purityKarat ?? null, item.metal);

  const displaySku = formatSKUDisplay(item.sku);
  const hasSize = item.sizeValue !== null && item.sizeValue !== undefined;
  const sizeDisplay = hasSize ? `Size ${item.sizeValue}${item.sizeUnit ? ' ' + item.sizeUnit : ''}` : null;

  return (
    <View testID={`draft-card-${item.itemId}`} style={[s.card, { borderColor: `${colors.vjAccent}25` }]}>
      <View style={[s.metalStripe, { backgroundColor: metalColor }]} />

      <View style={s.cardBody}>
        <View style={s.rowTop}>
          <Text style={[s.sku, { color: colors.vjText }]} numberOfLines={1}>{displaySku}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={s.draftBadge}>
              <Text style={s.draftBadgeText}>DRAFT</Text>
            </View>
            <View style={[s.metalPill, { borderColor: metalColor, backgroundColor: `${metalColor}12` }]}>
              <Text style={[s.metalPillText, { color: metalColor }]}>{purityDisplay}</Text>
            </View>
          </View>
        </View>

        <Text style={[s.designName, { color: colors.vjText }]} numberOfLines={1}>
          {item.designName || 'Unknown Design'}
          <Text style={{ opacity: 0.6, fontWeight: '500' }}> ({item.categoryName || 'Unknown Category'})</Text>
        </Text>

        <View style={s.metaRow}>
          <Text style={[s.weightText, { color: colors.vjText }]}>Gross: {formatWeight(item.grossWeightMg)}</Text>
          <Text style={s.weightDivider}>•</Text>
          <Text style={[s.weightText, { color: colors.vjAccent }]}>
            Net: {formatWeight(item.netWeightMg ?? item.grossWeightMg)}
          </Text>

          {sizeDisplay && (
            <>
              <Text style={s.weightDivider}>•</Text>
              <View style={[s.sizeBadge, { backgroundColor: `${colors.vjAccent}14`, borderColor: `${colors.vjAccent}35` }]}>
                <Text style={[s.sizeBadgeText, { color: colors.vjText }]}>{sizeDisplay}</Text>
              </View>
            </>
          )}

          {item.huid ? (
            <>
              <Text style={s.weightDivider}>•</Text>
              <View style={s.huidBadge}>
                <ShieldCheck size={11} color="#15803d" />
                <Text style={s.huidBadgeText}>{item.huid}</Text>
              </View>
            </>
          ) : null}
        </View>
      </View>

      <View style={s.actionRow}>
        <TouchableOpacity 
          testID={`edit-draft-btn-${item.itemId}`}
          style={[s.editBtn, { backgroundColor: `${colors.vjAccent}14`, borderColor: `${colors.vjAccent}35` }]} 
          activeOpacity={0.7}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            onEdit(item.itemId);
          }}
        >
          <Edit3 size={18} color={colors.vjAccent} />
        </TouchableOpacity>

        <TouchableOpacity 
          testID={`activate-draft-btn-${item.itemId}`}
          style={s.activateBtn} 
          activeOpacity={0.7}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
            onActivate(item.itemId, displaySku);
          }}
        >
          <Check size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default function DraftsScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  const [data, setData] = useState<ItemSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  const [successSku, setSuccessSku] = useState<string | null>(null);
  const [confirmActivate, setConfirmActivate] = useState<{ itemId: string; displaySku: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const loadDrafts = useCallback(async () => {
    if (!activeFirmId) return;
    setLoading(true);
    try {
      const results = await inventoryDrillDownService.getDraftItems(activeFirmId);
      setData(results || []);
    } catch (e) {
      console.error('[Drafts] getDraftItems failed:', e);
    } finally {
      setLoading(false);
    }
  }, [activeFirmId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const fetchCurrent = async () => {
        if (!activeFirmId) return;
        setLoading(true);
        try {
          const results = await inventoryDrillDownService.getDraftItems(activeFirmId);
          if (active) setData(results || []);
        } catch (e) {
          console.error('[Drafts] fetchCurrent failed:', e);
        } finally {
          if (active) setLoading(false);
        }
      };

      fetchCurrent();
      return () => {
        active = false;
      };
    }, [activeFirmId])
  );

  const handleEdit = useCallback((itemId: string) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    router.push({ pathname: '/inventory/edit-draft', params: { itemId } });
  }, [router]);

  const handleActivate = useCallback((itemId: string, displaySku: string) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setConfirmActivate({ itemId, displaySku });
  }, []);

  const handleConfirmActivate = async () => {
    if (!confirmActivate || !activeFirmId) return;
    const { itemId, displaySku } = confirmActivate;

    setIsActivating(true);
    try {
      await itemService.updateItemStatus(
        itemId, 
        activeFirmId, 
        'AVAILABLE', 
        'Manually verified and activated from drafts'
      );
      setConfirmActivate(null);
      setSuccessSku(displaySku);
      await loadDrafts();
    } catch (error: any) {
      setConfirmActivate(null);
      setErrorMessage(error.message || 'Failed to activate draft item.');
    } finally {
      setIsActivating(false);
    }
  };

  const totalItems = data.length;
  const totalWeightMg = data.reduce((acc, curr) => {
    const net = curr.netWeightMg != null && curr.netWeightMg > 0 ? curr.netWeightMg : curr.grossWeightMg;
    return acc + (net || 0);
  }, 0);

  const draftsHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Package size={12} color={colors.vjBg} />} label={`${totalItems} Pending Drafts`} />
      <HeaderPill icon={<Scale size={12} color="#4ADE80" />} label={`Net: ${formatWeight(totalWeightMg)}`} variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Pending Drafts" showBack headerContent={draftsHeaderPills}>
      <View style={s.listContainer}>
        {loading && data.length === 0 ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={colors.vjAccent} />
            <Text style={[s.loadingText, { color: colors.vjText }]}>Loading drafts...</Text>
          </View>
        ) : (
          <FlashList
            data={data}
            keyExtractor={(item) => item.itemId}
            renderItem={({ item }) => (
              <DraftRow 
                item={item} 
                colors={colors}
                onActivate={handleActivate} 
                onEdit={handleEdit}
              />
            )}
            // @ts-ignore: estimatedItemSize required by FlashList
            estimatedItemSize={100}
            contentContainerStyle={{ paddingBottom: 100, paddingTop: 32 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <PackageSearch size={48} color={colors.vjAccent} style={{ opacity: 0.3 }} />
                <Text style={[s.emptyTitle, { color: colors.vjText }]}>No Drafts Found</Text>
                <Text style={[s.emptySubtitle, { color: colors.vjText, opacity: 0.5 }]}>
                  All intake items have been verified and moved to available stock.
                </Text>
              </View>
            }
          />
        )}
      </View>

      {/* SUCCESS ACTIVATED MODAL */}
      <Modal visible={!!successSku} transparent animationType="fade">
        <TouchableOpacity 
          style={s.modalOverlayCenter} 
          activeOpacity={1} 
          onPress={() => setSuccessSku(null)}
        >
          <TouchableOpacity 
            activeOpacity={1} 
            style={[s.successModalContent, { backgroundColor: colors.vjBg, borderColor: colors.border }]}
          >
            <View style={s.successIconContainer}>
              <CheckCircle size={56} color="#10B981" />
            </View>
            <Text style={[s.successTitle, { color: colors.vjText }]}>Item Activated!</Text>
            <Text style={[s.successSubtitle, { color: colors.vjText }]}>
              <Text style={{ fontWeight: '800' }}>{successSku}</Text> has been verified and moved to AVAILABLE stock.
            </Text>
            <View style={{ width: '100%', marginTop: 16 }}>
              <GlassButton title="Done" onPress={() => setSuccessSku(null)} />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* CONFIRM ACTIVATION MODAL */}
      <Modal visible={!!confirmActivate} transparent animationType="fade">
        <TouchableOpacity 
          style={s.modalOverlayCenter} 
          activeOpacity={1} 
          onPress={() => !isActivating && setConfirmActivate(null)}
        >
          <TouchableOpacity 
            activeOpacity={1} 
            style={[s.successModalContent, { backgroundColor: colors.vjBg, borderColor: colors.border }]}
          >
            <View style={[s.successIconContainer, { backgroundColor: 'rgba(184, 115, 51, 0.1)' }]}>
              <Check size={40} color={colors.vjAccent} />
            </View>
            <Text style={[s.successTitle, { color: colors.vjText }]}>Verify & Activate</Text>
            <Text style={[s.successSubtitle, { color: colors.vjText }]}>
              Move <Text style={{ fontWeight: '800' }}>{confirmActivate?.displaySku}</Text> to active showroom inventory? It will become available for billing and barcode printing.
            </Text>
            <View style={{ width: '100%', marginTop: 16, flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <GlassButton 
                  title="Cancel" 
                  onPress={() => setConfirmActivate(null)} 
                  variant="secondary" 
                  disabled={isActivating}
                />
              </View>
              <View style={{ flex: 1 }}>
                <GlassButton 
                  title={isActivating ? 'Activating...' : 'Activate'} 
                  onPress={handleConfirmActivate}
                  disabled={isActivating}
                />
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ERROR MODAL */}
      <Modal visible={!!errorMessage} transparent animationType="fade">
        <TouchableOpacity 
          style={s.modalOverlayCenter} 
          activeOpacity={1} 
          onPress={() => setErrorMessage(null)}
        >
          <TouchableOpacity 
            activeOpacity={1} 
            style={[s.successModalContent, { backgroundColor: colors.vjBg, borderColor: colors.border }]}
          >
            <View style={[s.successIconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
              <Text style={{ fontSize: 32 }}>⚠️</Text>
            </View>
            <Text style={[s.successTitle, { color: colors.vjText }]}>Activation Failed</Text>
            <Text style={[s.successSubtitle, { color: colors.vjText }]}>{errorMessage}</Text>
            <View style={{ width: '100%', marginTop: 16 }}>
              <GlassButton title="Dismiss" onPress={() => setErrorMessage(null)} />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  listContainer: { flex: 1 },
  card: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#ffffff', 
    marginBottom: 10, 
    borderRadius: 16, 
    overflow: 'hidden', 
    borderWidth: 1, 
    paddingRight: 12, 
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  metalStripe: { 
    width: 6, 
    alignSelf: 'stretch' 
  },
  cardBody: { 
    flex: 1, 
    paddingVertical: 14 
  },
  rowTop: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 4 
  },
  sku: { 
    fontWeight: '800', 
    fontSize: 15,
    fontFamily: 'monospace',
  },
  draftBadge: { 
    backgroundColor: 'rgba(217,119,6,0.15)', 
    paddingHorizontal: 6, 
    paddingVertical: 2, 
    borderRadius: 4, 
    borderWidth: 1, 
    borderColor: 'rgba(217,119,6,0.3)' 
  },
  draftBadgeText: { 
    fontSize: 9, 
    fontWeight: '800', 
    color: '#D97706', 
    textTransform: 'uppercase' 
  },
  metalPill: { 
    paddingHorizontal: 6, 
    paddingVertical: 2, 
    borderRadius: 6, 
    borderWidth: 1 
  },
  metalPillText: { 
    fontSize: 10, 
    fontWeight: '800', 
    letterSpacing: 0.5 
  },
  designName: { 
    fontWeight: '700', 
    fontSize: 13, 
    marginBottom: 6 
  },
  metaRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6, 
    flexWrap: 'wrap' 
  },
  weightText: { 
    fontSize: 12, 
    fontWeight: '700' 
  },
  weightDivider: { 
    color: 'rgba(92,22,35,0.3)', 
    fontSize: 10 
  },
  sizeBadge: { 
    paddingHorizontal: 6, 
    paddingVertical: 1.5, 
    borderRadius: 6, 
    borderWidth: 1 
  },
  sizeBadgeText: { 
    fontSize: 10, 
    fontWeight: '800' 
  },
  huidBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 3, 
    backgroundColor: 'rgba(22, 163, 74, 0.08)', 
    paddingHorizontal: 6, 
    paddingVertical: 1.5, 
    borderRadius: 6, 
    borderWidth: 1, 
    borderColor: 'rgba(22, 163, 74, 0.25)' 
  },
  huidBadgeText: { 
    fontSize: 10, 
    fontWeight: '800', 
    color: '#15803d', 
    fontFamily: 'monospace' 
  },
  actionRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8 
  },
  editBtn: { 
    width: 40, 
    height: 40, 
    borderRadius: 12, 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderWidth: 1 
  },
  activateBtn: { 
    width: 40, 
    height: 40, 
    borderRadius: 12, 
    backgroundColor: COLORS.success, 
    justifyContent: 'center', 
    alignItems: 'center', 
    shadowColor: COLORS.success, 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.3, 
    shadowRadius: 8, 
    elevation: 4 
  },
  loadingContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    gap: 12 
  },
  loadingText: { 
    fontSize: 14, 
    fontWeight: '600' 
  },
  emptyContainer: { 
    alignItems: 'center', 
    marginTop: 60, 
    gap: 8, 
    paddingHorizontal: 24 
  },
  emptyTitle: { 
    fontSize: 18, 
    fontWeight: '700' 
  },
  emptySubtitle: { 
    fontSize: 13, 
    textAlign: 'center' 
  },
  modalOverlayCenter: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 24 
  },
  successModalContent: { 
    width: '100%', 
    maxWidth: 400, 
    borderRadius: 24, 
    padding: 28, 
    alignItems: 'center', 
    borderWidth: 1, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 10 }, 
    shadowOpacity: 0.2, 
    shadowRadius: 20, 
    elevation: 10 
  },
  successIconContainer: { 
    marginBottom: 16, 
    backgroundColor: 'rgba(16, 185, 129, 0.1)', 
    padding: 16, 
    borderRadius: 50 
  },
  successTitle: { 
    fontSize: 22, 
    fontWeight: '800', 
    marginBottom: 8 
  },
  successSubtitle: { 
    fontSize: 14, 
    textAlign: 'center', 
    opacity: 0.7, 
    marginBottom: 20, 
    lineHeight: 20 
  },
});