import React, { useState, useCallback, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { useFirmStore } from '../../store/firmStore';
import { inventoryDrillDownService } from '../../services/inventoryDrillDownService';
import { itemService } from '../../services/itemService';
import type { ItemSearchResult } from '../../types/phase2.types';
import { getDisplayPurity } from '../../utils/purity.constants';
import { Check, ClipboardList, PackageSearch } from 'lucide-react-native';

const formatWeight = (mg: number): string => (mg / 1000).toFixed(3) + ' g';

const COLORS = {
  vjText: '#2E1D00',
  vjBg: '#FAF3E0',
  vjAccent: '#B87333',
  gold: '#C8860A',
  silver: '#6B7280',
  success: '#22c55e'
};

type DraftRowProps = {
  item: ItemSearchResult;
  onActivate: (itemId: string, sku: string) => void;
};

const DraftRow = memo(({ item, onActivate }: DraftRowProps) => {
  const metalColor = item.metal === 'GOLD' ? COLORS.gold : COLORS.silver;
  const purityDisplay = getDisplayPurity(item.purityPercent, item.purityKarat || 0, item.metal);

  return (
    <View style={s.card}>
      <View style={[s.metalStripe, { backgroundColor: metalColor }]} />

      <View style={s.cardBody}>
        <View style={s.rowTop}>
          <Text style={s.sku} numberOfLines={1}>{item.sku}</Text>
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

      <TouchableOpacity 
        style={s.activateBtn} 
        activeOpacity={0.7}
        onPress={() => onActivate(item.itemId, item.sku)}
      >
        <Check size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );
});

export default function DraftsScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  const [data, setData] = useState<ItemSearchResult[]>([]);
  const [loading, setLoading] = useState(true);

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

  const handleActivate = useCallback((itemId: string, sku: string) => {
    Alert.alert(
      'Activate Item',
      `Are you sure you want to verify and activate ${sku}? It will move to available stock.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Activate', 
          style: 'default',
          onPress: async () => {
            try {
              if (!activeFirmId) return;
              await itemService.updateItemStatus(itemId, activeFirmId, 'AVAILABLE', 'Manually verified from drafts');
              Alert.alert('Success', `${sku} is now AVAILABLE.`);
              loadDrafts();
            } catch (error: any) {
              Alert.alert('Activation Failed', error.message);
            }
          }
        }
      ]
    );
  }, [activeFirmId, loadDrafts]);

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
              <DraftRow item={item} onActivate={handleActivate} />
            )}
            // @ts-ignore: estimatedItemSize required by spec
            estimatedItemSize={100}
            contentContainerStyle={{ paddingBottom: 100, paddingTop: 8 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <PackageSearch size={48} color="rgba(46,29,0,0.2)" />
                <Text style={s.emptyTitle}>No Drafts Found</Text>
                <Text style={s.emptySubtitle}>All items have been verified.</Text>
              </View>
            }
          />
        )}
      </View>
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
    borderColor: 'rgba(46,29,0,0.08)',
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
    color: 'rgba(46,29,0,0.6)',
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
    color: 'rgba(46,29,0,0.3)',
    fontSize: 10,
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
    color: 'rgba(250,243,224,0.55)',
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
    color: 'rgba(46,29,0,0.4)',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
    gap: 8,
  },
  emptyTitle: {
    color: 'rgba(46,29,0,0.5)',
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: 'rgba(46,29,0,0.35)',
    fontSize: 13,
  },
});
