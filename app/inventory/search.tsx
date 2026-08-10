// app/inventory/search.tsx — Phase 2 v2.11 Canonical Screen
import React, { useState, useEffect, useCallback, memo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Search, PackageSearch, Ghost, Hash, Sparkles, Coins, ScanLine, X } from 'lucide-react-native';
import { inventorySearchService } from '../../services/inventorySearchService';
import { formatWeightMg as formatWeight } from '../../utils/calculations';
import type { ItemSearchResult } from '../../types/phase2.types';
import { useFirmStore } from '../../store/useFirmStore';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { HeaderPill } from '../../components/ui/Glass';
import { useStore } from 'zustand';
import { appSettingsStore } from '../../store/appSettingsStore';
import { COLORS as CENTRAL_COLORS, getThemeColors } from '../../constants/theme';

const COLORS = {
  ...CENTRAL_COLORS,
  highlight: 'rgba(212, 175, 55, 0.22)',
};

const HighlightText = memo(({ text, query, style }: { text?: string | null, query: string, style: any }) => {
  if (!text) return null;
  if (!query) return <Text style={style}>{text}</Text>;

  const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const parts = text.split(new RegExp(`(${safeQuery})`, 'gi'));
    return (
      <Text style={style}>
        {parts.map((part, index) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <Text key={index} style={[style, { backgroundColor: COLORS.highlight, color: '#78350F', fontWeight: '900' }]}>
              {part}
            </Text>
          ) : (
            <Text key={index} style={style}>{part}</Text>
          )
        )}
      </Text>
    );
  } catch {
    return <Text style={style}>{text}</Text>;
  }
});

type SearchResultRowProps = {
  item: ItemSearchResult;
  query: string;
  onPress: (itemId: string) => void;
};

const SearchResultRow = memo(({ item, query, onPress }: SearchResultRowProps) => {
  const isGold = item.metal === 'GOLD';
  const isPhantom = item.status === 'PHANTOM_AVAILABLE';
  const activeQuery = query.trim();

  return (
    <TouchableOpacity 
      style={s.card}
      activeOpacity={0.7}
      onPress={() => {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
        onPress(item.itemId);
      }}
    >
      <View style={s.cardHeader}>
        <View style={s.badgeRow}>
          <View style={[s.metalBadge, { backgroundColor: isGold ? COLORS.goldAccent + '20' : COLORS.silverAccent + '20', flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
            {isGold ? <Sparkles size={12} color={COLORS.goldAccent} /> : <Coins size={12} color={COLORS.silverAccent} />}
            <Text style={[s.metalText, { color: isGold ? COLORS.goldAccent : COLORS.silverAccent }]}>
              {item.metal} {item.purityKarat ? `${item.purityKarat}K` : `${item.purityPercent}%`}
            </Text>
          </View>
          
          {item.sizeValue != null && (
            <View style={[s.metalBadge, { backgroundColor: COLORS.border + '30', marginLeft: 6 }]}>
              <Text style={[s.metalText, { color: COLORS.vjText }]}>
                SZ: {item.sizeValue} {item.sizeUnit ? item.sizeUnit : ''}
              </Text>
            </View>
          )}
          
          {isPhantom && (
            <View style={[s.metalBadge, { backgroundColor: COLORS.phantom + '15', marginLeft: 6 }]}>
              <Ghost size={10} color={COLORS.phantom} style={{ marginRight: 4 }} />
              <Text style={[s.metalText, { color: COLORS.phantom }]}>PHANTOM</Text>
            </View>
          )}
        </View>
        
        <Text style={s.huidText}>
          HUID: <HighlightText text={item.huid || 'N/A'} query={activeQuery} style={s.huidText} />
        </Text>
      </View>

      <View style={s.cardBody}>
        <View style={s.mainDetails}>
          <HighlightText text={item.sku} query={activeQuery} style={s.skuText} />
          <Text style={s.categoryText}>
            <HighlightText text={item.categoryName} query={activeQuery} style={s.categoryText} />
            {' • '}
            <HighlightText text={item.designName} query={activeQuery} style={s.categoryText} />
          </Text>
        </View>
        
        <View style={s.weightDetails}>
          <Text style={s.weightLabel}>NET WT</Text>
          <HighlightText text={formatWeight(item.netWeightMg)} query={activeQuery} style={s.weightValue} />
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function InventorySearchScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ItemSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    const trimmedQuery = query.trim();
    
    if (trimmedQuery.length < 1 || !activeFirmId) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const delayDebounceFn = setTimeout(async () => {
      try {
        const data = await inventorySearchService.searchItems(activeFirmId, trimmedQuery);
        setResults(data);
      } catch (error) {
        console.error('[Search] Failed to fetch results:', error);
      } finally {
        setIsSearching(false);
      }
    }, 80); 

    return () => clearTimeout(delayDebounceFn);
  }, [query, activeFirmId]);

  const handleItemPress = useCallback((itemId: string) => {
    router.push(`/inventory/item-detail?itemId=${itemId}`);
  }, [router]);

  const handleAutoSubmitBarcode = useCallback(async () => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || !activeFirmId) return;
    try {
      const data = await inventorySearchService.searchItems(activeFirmId, trimmed);
      if (data.length === 1) {
        router.push(`/inventory/item-detail?itemId=${data[0].itemId}`);
      }
    } catch (e) {
      console.error('[Search] Barcode submit failed:', e);
    }
  }, [query, activeFirmId, router]);

  const handleScanPress = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert("Permission Required", "Camera access is needed to scan product barcodes.");
        return;
      }
    }
    setShowScanner(true);
  };

  const handleBarcodeScanned = useCallback(async ({ data }: { data: string }) => {
    if (!data) return;
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
    setShowScanner(false);
    setQuery(data);

    if (activeFirmId) {
      try {
        setIsSearching(true);
        const searchResults = await inventorySearchService.searchItems(activeFirmId, data);
        setResults(searchResults);
        if (searchResults.length === 1) {
          router.push(`/inventory/item-detail?itemId=${searchResults[0].itemId}`);
        }
      } catch (e) {
        console.error('[Search] Barcode lookup failed:', e);
      } finally {
        setIsSearching(false);
      }
    }
  }, [activeFirmId, router]);

  const activeTheme = useStore(appSettingsStore, (s) => s.theme);
  const colors = getThemeColors(activeTheme);

  const searchHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
      <HeaderPill icon={<Search size={12} color={colors.vjBg} />} label="Instant SKU & HUID Lookup" />
      <HeaderPill icon={<ScanLine size={12} color="#4ADE80" />} label="Barcode Auto-Scan" variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Stock Search" showBack headerContent={searchHeaderPills}>
      
      <View style={s.topSearchSection}>
        <View style={s.searchBox}>
          <Search size={18} color="#D4AF37" style={s.searchIcon} />
          <TextInput
            style={s.input}
            placeholder="Scan Barcode / Search SKU, HUID..."
            placeholderTextColor="rgba(46, 29, 0, 0.4)"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleAutoSubmitBarcode}
            autoFocus
            autoCapitalize="characters"
          />
          {isSearching ? (
            <ActivityIndicator size="small" color="#D4AF37" style={s.spinner} />
          ) : query.length > 0 ? (
            <TouchableOpacity 
              onPress={() => setQuery('')}
              style={s.clearBtn}
            >
              <X size={16} color="rgba(46, 29, 0, 0.5)" />
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleScanPress}
            style={s.scanBtn}
          >
            <ScanLine size={20} color="#B8860B" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.listContainer}>
        {query.trim().length === 0 ? (
          <View style={s.emptyState}>
            <Hash size={44} color="rgba(92,22,35,0.25)" />
            <Text style={s.emptyTitle}>Search Inventory</Text>
            <Text style={s.emptySub}>Type SKU, HUID, Category, Design, or scan barcode</Text>
          </View>
        ) : results.length === 0 && !isSearching ? (
          <View style={s.emptyState}>
            <PackageSearch size={44} color="rgba(92,22,35,0.25)" />
            <Text style={s.emptyTitle}>No items found</Text>
            <Text style={s.emptySub}>Try searching for a different SKU, HUID, or tag</Text>
          </View>
        ) : (
          <>
            {results.length > 0 && (
              <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#78350F', letterSpacing: 0.5 }}>
                  ✨ {results.length} {results.length === 1 ? 'ITEM' : 'ITEMS'} FOUND
                </Text>
              </View>
            )}
            <FlashList
              data={results}
              // @ts-ignore: estimatedItemSize required by spec
              estimatedItemSize={95}
              getItemType={(item) => item.metal}
              keyExtractor={(item) => item.itemId}
              renderItem={({ item }) => (
                <SearchResultRow item={item} query={query} onPress={handleItemPress} />
              )}
              contentContainerStyle={s.listPadding}
              keyboardShouldPersistTaps="handled"
            />
          </>
        )}
      </View>

      <Modal
        visible={showScanner}
        animationType="slide"
        onRequestClose={() => setShowScanner(false)}
      >
        <View style={s.scannerContainer}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8', 'upc_a'],
            }}
            onBarcodeScanned={handleBarcodeScanned}
          />

          <View style={s.overlay}>
            <View style={s.scannerHeader}>
              <TouchableOpacity
                onPress={() => setShowScanner(false)}
                style={s.closeScannerBtn}
              >
                <X size={24} color="#FFF" />
              </TouchableOpacity>
              <Text style={s.scannerTitle}>Scan Tag Barcode</Text>
              <View style={{ width: 40 }} />
            </View>

            <View style={s.viewfinderContainer}>
              <View style={s.viewfinderBox}>
                <View style={[s.corner, s.cornerTL]} />
                <View style={[s.corner, s.cornerTR]} />
                <View style={[s.corner, s.cornerBL]} />
                <View style={[s.corner, s.cornerBR]} />
              </View>
            </View>

            <View style={s.scannerFooter}>
              <Text style={s.scannerHint}>Align jewelry tag barcode inside frame</Text>
            </View>
          </View>
        </View>
      </Modal>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  topSearchSection: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    height: 52,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.vjText,
    height: '100%',
  },
  clearBtn: {
    padding: 6,
    marginRight: 4,
  },
  scanBtn: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.25)',
    marginLeft: 4,
  },
  spinner: {
    marginLeft: 8,
  },
  listContainer: {
    flex: 1,
  },
  listPadding: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.2)',
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  metalText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  huidText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
    fontFamily: 'monospace',
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  mainDetails: {
    flex: 1,
  },
  skuText: {
    fontSize: 17,
    fontWeight: '900',
    color: COLORS.vjText,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
  },
  weightDetails: {
    alignItems: 'flex-end',
  },
  weightLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.muted,
    marginBottom: 2,
  },
  weightValue: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.vjText,
    fontFamily: 'monospace',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.vjText,
    marginTop: 16,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.muted,
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  closeScannerBtn: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
  },
  scannerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  viewfinderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinderBox: {
    width: 260,
    height: 260,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    position: 'relative',
    backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: '#D4AF37',
  },
  cornerTL: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 16,
  },
  cornerTR: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 16,
  },
  cornerBL: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 16,
  },
  cornerBR: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 16,
  },
  scannerFooter: {
    paddingBottom: 60,
    alignItems: 'center',
  },
  scannerHint: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
});