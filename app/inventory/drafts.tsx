// app/inventory/drafts.tsx — Phase 2 v2.34 Canonical Screen
// Aligned with Step 6.5, Step 10.5, and MastersSyncStore

import React, { useState, useCallback, useMemo, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, Alert, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { HeaderPill, GlassButton } from '@/components/ui/Glass';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { inventoryDrillDownService } from '@/services/phase2/inventoryDrillDownService';
import { itemService } from '@/services/phase2/itemService';
import type { ItemSearchResult } from '@/types/phase2/phase2.types';
import { getDisplayPurity, formatKaratBadge, formatSKUDisplay, formatWeightMg as formatWeight } from '@/utils/calculations';
import { JewelryMonogramEmblem } from '@/utils/jewelryIcons';
import { Check, PackageSearch, Edit3, CheckCircle, Package, Scale, ShieldCheck, Trash2, Sparkles } from 'lucide-react-native';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { COLORS, getThemeColors } from '@/constants/theme';

type DraftRowProps = {
  item: ItemSearchResult;
  colors: ReturnType<typeof getThemeColors>;
  isDark: boolean;
  onActivate: (itemId: string, sku: string) => void;
  onEdit: (itemId: string) => void;
  onDiscard: (itemId: string, sku: string) => void;
};

const DraftRow = memo(({ item, colors, isDark, onActivate, onEdit, onDiscard }: DraftRowProps) => {
  const metalColor = item.metal === 'GOLD' ? COLORS.bullionGold : COLORS.bullionSilver;
  const isGold = item.metal === 'GOLD';

  const karatBadge = formatKaratBadge(item.purityPercent, item.metal);
  const purityDisplay = (isGold && karatBadge)
    ? `${karatBadge} · ${item.purityPercent.toFixed(1)}%`
    : getDisplayPurity(item.purityPercent, item.purityKarat ?? null, item.metal);

  const displaySku = formatSKUDisplay(item.sku);
  const hasSize = item.sizeValue !== null && item.sizeValue !== undefined;
  const sizeDisplay = hasSize ? `Size ${item.sizeValue}${item.sizeUnit ? ' ' + item.sizeUnit : ''}` : null;

  return (
    <View
      testID={`draft-card-${item.itemId}`}
      style={[
        s.card,
        {
          backgroundColor: isDark ? 'rgba(28, 20, 24, 0.96)' : '#ffffff',
          borderColor: isDark ? 'rgba(212, 175, 55, 0.22)' : `${colors.vjAccent}25`,
        }
      ]}
    >
      <View style={[s.metalStripe, { backgroundColor: metalColor }]} />

      <View style={{ paddingLeft: 10 }}>
        <JewelryMonogramEmblem
          designName={item.designName || ''}
          categoryName={item.categoryName || ''}
          metal={item.metal}
          size={36}
        />
      </View>

      <View style={s.cardBody}>
        <View style={s.rowTop}>
          <Text style={[s.sku, { color: colors.vjText }]} numberOfLines={1}>{displaySku}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={s.draftBadge}>
              <Text style={s.draftBadgeText}>DRAFT</Text>
            </View>
            <View style={[s.metalPill, { borderColor: metalColor, backgroundColor: `${metalColor}15` }]}>
              <Text style={[s.metalPillText, { color: metalColor }]}>{purityDisplay}</Text>
            </View>
          </View>
        </View>

        <Text style={[s.designName, { color: colors.vjText }]} numberOfLines={1}>
          {item.designName || 'Unknown Design'}
          <Text style={{ opacity: 0.6, fontWeight: '500' }}> ({item.categoryName || 'Unknown Category'})</Text>
        </Text>

        <View style={s.metaRow}>
          <Text style={[s.weightText, { color: isDark ? 'rgba(255,255,255,0.7)' : colors.vjText }]}>
            Gross: <Text style={{ fontFamily: 'monospace' }}>{formatWeight(item.grossWeightMg)}</Text>
          </Text>
          <Text style={[s.weightDivider, { color: `${colors.vjText}4D` }]}>•</Text>
          <Text style={[s.weightText, { color: '#D4AF37', fontWeight: '800' }]}>
            Net: <Text style={{ fontFamily: 'monospace' }}>{formatWeight(item.netWeightMg ?? item.grossWeightMg)}</Text>
          </Text>

          {sizeDisplay && (
            <>
              <Text style={[s.weightDivider, { color: `${colors.vjText}4D` }]}>•</Text>
              <View style={[s.sizeBadge, { backgroundColor: `${colors.vjAccent}14`, borderColor: `${colors.vjAccent}35` }]}>
                <Text style={[s.sizeBadgeText, { color: colors.vjText }]}>{sizeDisplay}</Text>
              </View>
            </>
          )}

          {item.huid ? (
            <>
              <Text style={[s.weightDivider, { color: `${colors.vjText}4D` }]}>•</Text>
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
          testID={`discard-draft-btn-${item.itemId}`}
          style={[
            s.discardBtn,
            {
              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.08)',
              borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.25)',
            }
          ]} 
          activeOpacity={0.7}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            onDiscard(item.itemId, displaySku);
          }}
        >
          <Trash2 size={17} color="#EF4444" />
        </TouchableOpacity>

        <TouchableOpacity 
          testID={`edit-draft-btn-${item.itemId}`}
          style={[
            s.editBtn,
            {
              backgroundColor: `${colors.vjAccent}14`,
              borderColor: `${colors.vjAccent}35`,
            }
          ]} 
          activeOpacity={0.7}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            onEdit(item.itemId);
          }}
        >
          <Edit3 size={17} color={colors.vjAccent} />
        </TouchableOpacity>

        <TouchableOpacity 
          testID={`activate-draft-btn-${item.itemId}`}
          style={[s.activateBtn, { backgroundColor: COLORS.success }]} 
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
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const { activeFirmId } = useFirmStore();
  const [data, setData] = useState<ItemSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [metalFilter, setMetalFilter] = useState<'ALL' | 'GOLD' | 'SILVER'>('ALL');

  const [successSku, setSuccessSku] = useState<string | null>(null);
  const [confirmActivate, setConfirmActivate] = useState<{ itemId: string; displaySku: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const isDark = activeTheme === 'dark';
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
      loadDrafts();
    }, [loadDrafts])
  );

  const handleEdit = useCallback((itemId: string) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    router.push({ pathname: '/inventory/edit-draft', params: { itemId } });
  }, [router]);

  const handleActivate = useCallback((itemId: string, displaySku: string) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setConfirmActivate({ itemId, displaySku });
  }, []);

  const handleDiscard = useCallback((itemId: string, displaySku: string) => {
    Alert.alert(
      'Discard Draft',
      `Are you sure you want to permanently discard draft item ${displaySku}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            if (!activeFirmId) return;
            try {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
              await itemService.discardDraftItem(itemId, activeFirmId);
              await loadDrafts();
            } catch (err: any) {
              Alert.alert('Discard Failed', err.message || 'Could not discard draft.');
            }
          },
        },
      ]
    );
  }, [activeFirmId, loadDrafts]);

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
  const goldCount = useMemo(() => data.filter((d) => d.metal === 'GOLD').length, [data]);
  const silverCount = useMemo(() => data.filter((d) => d.metal === 'SILVER').length, [data]);

  const filteredData = useMemo(() => {
    if (metalFilter === 'ALL') return data;
    return data.filter((item) => item.metal === metalFilter);
  }, [data, metalFilter]);

  const totalWeightMg = useMemo(() => {
    return filteredData.reduce((acc, curr) => {
      const net = curr.netWeightMg != null && curr.netWeightMg > 0 ? curr.netWeightMg : curr.grossWeightMg;
      return acc + (net || 0);
    }, 0);
  }, [filteredData]);

  const draftsHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Package size={12} color={colors.vjBg} />} label={`${totalItems} Pending Drafts`} />
      <HeaderPill icon={<Scale size={12} color="#4ADE80" />} label={`Net: ${formatWeight(totalWeightMg)}`} variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Pending Drafts" showBack headerContent={draftsHeaderPills}>
      <View style={[
        s.listContainer,
        isTablet ? { maxWidth: 780, alignSelf: 'center', width: '100%' } : null,
      ]}>
        {/* Metal Quick Filters (when items exist) */}
        {data.length > 0 && (
          <View style={s.filterRow}>
            <TouchableOpacity
              style={[
                s.filterChip,
                metalFilter === 'ALL' && [s.filterChipActive, { backgroundColor: colors.vjAccent, borderColor: colors.vjAccent }],
                metalFilter !== 'ALL' && { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }
              ]}
              onPress={() => setMetalFilter('ALL')}
            >
              <Text style={[s.filterChipText, { color: metalFilter === 'ALL' ? '#fff' : colors.vjText }]}>
                All ({totalItems})
              </Text>
            </TouchableOpacity>

            {goldCount > 0 && (
              <TouchableOpacity
                style={[
                  s.filterChip,
                  metalFilter === 'GOLD' && [s.filterChipActive, { backgroundColor: COLORS.bullionGold, borderColor: COLORS.bullionGold }],
                  metalFilter !== 'GOLD' && { backgroundColor: isDark ? 'rgba(212,175,55,0.1)' : 'rgba(212,175,55,0.08)', borderColor: 'rgba(212,175,55,0.25)' }
                ]}
                onPress={() => setMetalFilter('GOLD')}
              >
                <Sparkles size={11} color={metalFilter === 'GOLD' ? '#fff' : COLORS.bullionGold} />
                <Text style={[s.filterChipText, { color: metalFilter === 'GOLD' ? '#fff' : COLORS.bullionGold }]}>
                  Gold ({goldCount})
                </Text>
              </TouchableOpacity>
            )}

            {silverCount > 0 && (
              <TouchableOpacity
                style={[
                  s.filterChip,
                  metalFilter === 'SILVER' && [s.filterChipActive, { backgroundColor: COLORS.bullionSilver, borderColor: COLORS.bullionSilver }],
                  metalFilter !== 'SILVER' && { backgroundColor: isDark ? 'rgba(156,163,175,0.12)' : 'rgba(156,163,175,0.1)', borderColor: 'rgba(156,163,175,0.3)' }
                ]}
                onPress={() => setMetalFilter('SILVER')}
              >
                <Text style={[s.filterChipText, { color: metalFilter === 'SILVER' ? '#fff' : (isDark ? '#E5E7EB' : '#4B5563') }]}>
                  Silver ({silverCount})
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {loading && data.length === 0 ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={colors.vjAccent} />
            <Text style={[s.loadingText, { color: colors.vjText }]}>Loading drafts...</Text>
          </View>
        ) : (
          <FlashList
            data={filteredData}
            keyExtractor={(item) => item.itemId}
            renderItem={({ item }) => (
              <DraftRow 
                item={item} 
                colors={colors}
                isDark={isDark}
                onActivate={handleActivate} 
                onEdit={handleEdit}
                onDiscard={handleDiscard}
              />
            )}
            // @ts-ignore: estimatedItemSize required by FlashList
            estimatedItemSize={100}
            contentContainerStyle={{ paddingBottom: 100, paddingTop: 16 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <PackageSearch size={52} color={colors.vjAccent} style={{ opacity: 0.35, marginBottom: 6 }} />
                <Text style={[s.emptyTitle, { color: colors.vjText }]}>
                  {metalFilter !== 'ALL' ? `No ${metalFilter} Drafts` : 'No Drafts Found'}
                </Text>
                <Text style={[s.emptySubtitle, { color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)' }]}>
                  {metalFilter !== 'ALL' 
                    ? `There are currently no pending ${metalFilter.toLowerCase()} drafts.`
                    : 'All intake items have been verified and moved to available showroom stock.'}
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
            style={[
              s.successModalContent,
              {
                backgroundColor: isDark ? '#23181C' : '#FCFBF8',
                borderColor: isDark ? 'rgba(212, 175, 55, 0.25)' : colors.border,
              }
            ]}
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
            style={[
              s.successModalContent,
              {
                backgroundColor: isDark ? '#23181C' : '#FCFBF8',
                borderColor: isDark ? 'rgba(212, 175, 55, 0.25)' : colors.border,
              }
            ]}
          >
            <View style={[s.successIconContainer, { backgroundColor: `${colors.vjAccent}18` }]}>
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
            style={[
              s.successModalContent,
              {
                backgroundColor: isDark ? '#23181C' : '#FCFBF8',
                borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : colors.border,
              }
            ]}
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
  listContainer: {
    flex: 1,
    paddingHorizontal: 14,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 16,
    paddingBottom: 4,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  card: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#ffffff', 
    marginBottom: 10, 
    borderRadius: 16, 
    overflow: 'hidden', 
    borderWidth: 1, 
    paddingRight: 12, 
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  metalStripe: { 
    width: 5, 
    alignSelf: 'stretch' 
  },
  cardBody: { 
    flex: 1, 
    paddingVertical: 12 
  },
  rowTop: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 4 
  },
  sku: { 
    fontWeight: '800', 
    fontSize: 14,
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
    marginBottom: 5 
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
    gap: 6 
  },
  discardBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  editBtn: { 
    width: 38, 
    height: 38, 
    borderRadius: 11, 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderWidth: 1 
  },
  activateBtn: { 
    width: 38, 
    height: 38, 
    borderRadius: 11, 
    justifyContent: 'center', 
    alignItems: 'center', 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.2, 
    shadowRadius: 4, 
    elevation: 3 
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