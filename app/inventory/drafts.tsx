// app/inventory/drafts.tsx
import React, { useState, useCallback, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { GlassButton } from '../../components/ui/Glass';
import { useFirmStore } from '../../store/firmStore';
import { inventoryDrillDownService } from '../../services/inventoryDrillDownService';
import { itemService } from '../../services/itemService';
import type { ItemSearchResult } from '../../types/phase2.types';
import { getDisplayPurity } from '../../utils/purity.constants';
import { formatSKUDisplay } from '../../utils/skuDisplay'; 
import { Check, ClipboardList, PackageSearch, Edit3, CheckCircle } from 'lucide-react-native'; // <-- Added Edit3 icon

const formatWeight = (mg: number): string => (mg / 1000).toFixed(3) + ' g';

const COLORS = {
  vjText: '#5C1623',
  vjBg: '#FCFBF8',
  vjAccent: '#D4AF37',
  gold: '#C8860A',
  silver: '#6B7280',
  success: '#22c55e'
};

type DraftRowProps = {
  item: ItemSearchResult;
  onActivate: (itemId: string, sku: string) => void;
  onEdit: (itemId: string) => void; // <-- Added onEdit prop
};

const DraftRow = memo(({ item, onActivate, onEdit }: DraftRowProps) => {
  const metalColor = item.metal === 'GOLD' ? COLORS.gold : COLORS.silver;
  const purityDisplay = getDisplayPurity(item.purityPercent, item.purityKarat || 0, item.metal);
  
  const displaySku = formatSKUDisplay(item.sku);

  return (
    <View style={s.card}>
      <View style={[s.metalStripe, { backgroundColor: metalColor }]} />

      <View style={s.cardBody}>
        <View style={s.rowTop}>
          <Text style={s.sku} numberOfLines={1}>{displaySku}</Text>
          <View style={[s.metalPill, { borderColor: metalColor }]}>
            <Text style={[s.metalPillText, { color: metalColor }]}>{purityDisplay}</Text>
          </View>
        </View>

        <Text style={s.designName} numberOfLines={1}>{item.designName || 'Unknown Design'} ({item.categoryName || 'Unknown Category'})</Text>

        <View style={s.metaRow}>
          <Text style={s.weightText}>Gross: {formatWeight(item.grossWeightMg)}</Text>
          <Text style={s.weightDivider}>•</Text>
          <Text style={s.weightText}>Net: {formatWeight(item.netWeightMg ?? item.grossWeightMg)}</Text>
        </View>
      </View>

      {/* Action Buttons Container */}
      <View style={s.actionRow}>
        <TouchableOpacity 
          style={s.editBtn} 
          activeOpacity={0.7}
          onPress={() => onEdit(item.itemId)} // <-- Calls handleEdit
        >
          <Edit3 size={20} color={COLORS.vjAccent} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={s.activateBtn} 
          activeOpacity={0.7}
          onPress={() => onActivate(item.itemId, displaySku)}
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
  const [successSku, setSuccessSku] = useState<string | null>(null);
  const [confirmActivate, setConfirmActivate] = useState<{ itemId: string, displaySku: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDrafts = useCallback(async () => {
    if (!activeFirmId) return;
    setLoading(true);
    try {
      const results = await inventoryDrillDownService.getDraftItems(activeFirmId);
      setData(results);
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

  // <-- New navigation handler for Edit Screen
  const handleEdit = useCallback((itemId: string) => {
    router.push({ pathname: '/inventory/edit-draft', params: { itemId } });
  }, [router]);

  const handleActivate = useCallback((itemId: string, displaySku: string) => {
    setConfirmActivate({ itemId, displaySku });
  }, []);

  const headerContent = (
    <View>
      <View style={s.headerIconRow}>
        <View style={s.headerIconCircle}>
          <ClipboardList size={28} color={COLORS.vjBg} />
        </View>
      </View>
      <Text style={s.headerTitle} numberOfLines={1}>Draft Items</Text>
      <Text style={s.headerSubtitle}>
        {data.length} Pending Verifications
      </Text>
    </View>
  );

  return (
    <TwoToneWrapper title="" showBack headerContent={headerContent}>
      <View style={s.listContainer}>
        {loading ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.vjAccent} />
            <Text style={s.loadingText}>Loading drafts...</Text>
          </View>
        ) : (
          <FlashList
            data={data}
            keyExtractor={(item) => item.itemId}
            renderItem={({ item }) => (
              <DraftRow 
                item={item} 
                onActivate={handleActivate} 
                onEdit={handleEdit} // <-- Passing handleEdit to row
              />
            )}
            // @ts-ignore: estimatedItemSize required by spec
            estimatedItemSize={100}
            contentContainerStyle={{ paddingBottom: 100, paddingTop: 8 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <PackageSearch size={48} color="rgba(92,22,35,0.2)" />
                <Text style={s.emptyTitle}>No Drafts Found</Text>
                <Text style={s.emptySubtitle}>All items have been verified.</Text>
              </View>
            }
          />
        )}
      </View>

      {/* Modern Success Modal */}
      <Modal visible={!!successSku} transparent animationType="fade">
        <View style={s.modalOverlayCenter}>
          <View style={s.successModalContent}>
            <View style={s.successIconContainer}>
              <CheckCircle size={56} color="#10B981" />
            </View>
            <Text style={s.successTitle}>Activated!</Text>
            <Text style={s.successSubtitle}>{successSku} is now AVAILABLE.</Text>
            
            <View style={{ width: '100%', marginTop: 16 }}>
              <GlassButton 
                title="Done" 
                onPress={() => setSuccessSku(null)} 
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modern Confirmation Modal */}
      <Modal visible={!!confirmActivate} transparent animationType="fade">
        <View style={s.modalOverlayCenter}>
          <View style={s.successModalContent}>
            <View style={[s.successIconContainer, { backgroundColor: 'rgba(184, 115, 51, 0.1)' }]}>
              <Text style={{ fontSize: 40 }}>❓</Text>
            </View>
            <Text style={s.successTitle}>Activate Item</Text>
            <Text style={s.successSubtitle}>Are you sure you want to verify and activate {confirmActivate?.displaySku}? It will move to available stock.</Text>
            
            <View style={{ width: '100%', marginTop: 16, flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <GlassButton 
                  title="Cancel" 
                  onPress={() => setConfirmActivate(null)} 
                  variant="secondary"
                />
              </View>
              <View style={{ flex: 1 }}>
                <GlassButton 
                  title="Activate" 
                  onPress={async () => {
                    const item = confirmActivate;
                    setConfirmActivate(null);
                    if (!item || !activeFirmId) return;
                    try {
                      setLoading(true);
                      await itemService.updateItemStatus(item.itemId, activeFirmId, 'AVAILABLE', 'Manually verified from drafts');
                      setSuccessSku(item.displaySku);
                      loadDrafts();
                    } catch (error: any) {
                      setErrorMessage(error.message);
                    } finally {
                      setLoading(false);
                    }
                  }} 
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modern Error Modal */}
      <Modal visible={!!errorMessage} transparent animationType="fade">
        <View style={s.modalOverlayCenter}>
          <View style={s.successModalContent}>
            <View style={[s.successIconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
              <Text style={{ fontSize: 40 }}>⚠️</Text>
            </View>
            <Text style={s.successTitle}>Activation Failed</Text>
            <Text style={s.successSubtitle}>{errorMessage}</Text>
            
            <View style={{ width: '100%', marginTop: 16 }}>
              <GlassButton 
                title="Dismiss" 
                onPress={() => setErrorMessage(null)} 
              />
            </View>
          </View>
        </View>
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
    borderColor: 'rgba(92,22,35,0.08)',
    paddingRight: 12,
    gap: 12,
  },
  metalStripe: {
    width: 6,
    alignSelf: 'stretch',
  },
  cardBody: {
    flex: 1,
    paddingVertical: 14,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sku: {
    color: COLORS.vjText,
    fontWeight: '800',
    fontSize: 16,
  },
  metalPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  metalPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  designName: {
    color: 'rgba(92,22,35,0.6)',
    fontWeight: '600',
    fontSize: 13,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weightText: {
    color: COLORS.vjText,
    fontSize: 12,
    fontWeight: '700',
  },
  weightDivider: {
    color: 'rgba(92,22,35,0.3)',
    fontSize: 10,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(184,115,51,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activateBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.success,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  headerIconRow: {
    marginBottom: 12,
  },
  headerIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  headerTitle: {
    color: COLORS.vjBg,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  headerSubtitle: {
    color: 'rgba(252,251,248,0.55)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: 'rgba(92,22,35,0.4)',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
    gap: 8,
  },
  emptyTitle: {
    color: 'rgba(92,22,35,0.5)',
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: 'rgba(92,22,35,0.35)',
    fontSize: 13,
  },
  
  // Success Modal Styles
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successModalContent: {
    backgroundColor: COLORS.vjBg,
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  successIconContainer: {
    marginBottom: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    padding: 16,
    borderRadius: 50,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.vjText,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    color: 'rgba(92,22,35,0.6)',
    textAlign: 'center',
    marginBottom: 24,
  },
});