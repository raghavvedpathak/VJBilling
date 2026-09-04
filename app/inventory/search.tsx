// app/inventory/search.tsx — Phase 2 v2.24 Canonical Screen

import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, Alert, Keyboard } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Search, PackageSearch, Ghost, Hash, Sparkles, Coins, ScanLine, X, ShieldCheck } from 'lucide-react-native';
import { inventorySearchService } from '@/services/phase2/inventorySearchService';
import { formatWeightMg as formatWeight, formatKaratBadge } from '@/utils/calculations';
import { formatSKUDisplay } from '@/utils/skuDisplay';
import type { ItemSearchResult } from '@/types/phase2/phase2.types';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { HeaderPill } from '@/components/ui/Glass';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { COLORS as CENTRAL_COLORS, getThemeColors } from '@/constants/theme';

const COLORS = {
  ...CENTRAL_COLORS,
  highlight: 'rgba(212, 175, 55, 0.22)',
};

const HighlightText = memo(({ text, query, style }: { text?: string | null; query: string; style: any }) => {
  if (!text) return null;
  const activeQuery = query.trim();
  if (!activeQuery) return <Text style={style}>{text}</Text>;

  const tokens = activeQuery.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return <Text style={style}>{text}</Text>;

  let parts: string[] = [text];
  try {
    const escapedTokens = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(${escapedTokens.join('|')})`, 'gi');
    parts = text.split(pattern);
  } catch {
    parts = [text];
  }

  return (
    <Text style={style}>
      {parts.map((part, index) => {
        const isMatch = tokens.some((t) => t.toLowerCase() === part.toLowerCase());
        return isMatch ? (
          <Text 
            key={`${part}-${index}`} 
            style={[
              style, 
              { 
                backgroundColor: '#FDE047', 
                color: '#78350F', 
                fontWeight: '900', 
                borderRadius: 4, 
                paddingHorizontal: 2 
              }
            ]}
          >
            {part}
          </Text>
        ) : (
          <Text key={`${part}-${index}`} style={style}>{part}</Text>
        );
      })}
    </Text>
  );
});

type SearchResultRowProps = {
  item: ItemSearchResult;
  query: string;
  colors: ReturnType<typeof getThemeColors>;
  onPress: (itemId: string) => void;
};

const SearchResultRow = memo(({ item, query, colors, onPress }: SearchResultRowProps) => {
  const isGold = item.metal === 'GOLD';
  const isPhantom = item.status === 'PHANTOM_AVAILABLE';
  const activeQuery = query.trim();
  const metalColor = isGold ? COLORS.bullionGold : COLORS.bullionSilver;

  return (
    <TouchableOpacity 
      testID={`search-result-row-${item.itemId}`}
      style={[s.card, { borderColor: `${colors.vjAccent}25` }]}
      activeOpacity={0.7}
      onPress={() => {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
        onPress(item.itemId);
      }}
    >
      <View style={s.cardHeader}>
        <View style={s.badgeRow}>
          <View style={[s.metalBadge, { backgroundColor: `${metalColor}18`, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
            {isGold ? <Sparkles size={12} color={metalColor} /> : <Coins size={12} color={metalColor} />}
            <Text style={[s.metalText, { color: metalColor }]}>
              {item.metal} {formatKaratBadge(item.purityPercent, item.metal) ?? `${item.purityPercent}%`}
            </Text>
          </View>
          
          {item.sizeValue != null && (
            <View style={[s.metalBadge, { backgroundColor: `${colors.vjAccent}14`, marginLeft: 6 }]}>
              <Text style={[s.metalText, { color: colors.vjText }]}>
                SZ:{' '}
                <HighlightText 
                  text={`${item.sizeValue}${item.sizeUnit ? ' ' + item.sizeUnit : ''}`} 
                  query={activeQuery} 
                  style={[s.metalText, { color: colors.vjText }]} 
                />
              </Text>
            </View>
          )}
          
          {isPhantom && (
            <View style={[s.metalBadge, { backgroundColor: `${COLORS.phantom}15`, marginLeft: 6 }]}>
              <Ghost size={10} color={COLORS.phantom} style={{ marginRight: 4 }} />
              <Text style={[s.metalText, { color: COLORS.phantom }]}>PHANTOM</Text>
            </View>
          )}
        </View>
        
        {item.huid ? (
          <View style={s.huidContainer}>
            <ShieldCheck size={12} color="#15803d" />
            <Text style={s.huidText}>
              HUID: <HighlightText text={item.huid} query={activeQuery} style={s.huidText} />
            </Text>
          </View>
        ) : (
          <Text style={[s.huidTextMuted, { color: colors.vjText }]}>No HUID</Text>
        )}
      </View>

      <View style={s.cardBody}>
        <View style={s.mainDetails}>
          <Text style={[s.itemNameText, { color: colors.vjText }]} numberOfLines={1}>
            <HighlightText text={item.designName} query={activeQuery} style={[s.itemNameText, { color: colors.vjText }]} />
            {item.categoryName ? (
              <Text style={[s.itemCategorySub, { color: colors.vjText }]}> ({item.categoryName})</Text>
            ) : null}
          </Text>
          <Text style={[s.skuSubText, { color: colors.vjText, opacity: 0.6 }]}>
            SKU: <HighlightText text={formatSKUDisplay(item.sku)} query={activeQuery} style={[s.skuSubText, { color: colors.vjText, opacity: 0.8 }]} />
            {item.barcode ? (
              <>
                {' • Barcode: '}
                <HighlightText text={item.barcode} query={activeQuery} style={[s.skuSubText, { color: colors.vjText, opacity: 0.8 }]} />
              </>
            ) : null}
          </Text>
          <View style={[s.inlineWeightRow, { backgroundColor: `${colors.vjAccent}08`, borderColor: `${colors.vjAccent}18` }]}>
            <Text style={[s.weightInlineLabel, { color: colors.vjText }]}>Gross: </Text>
            <Text style={[s.weightInlineVal, { color: colors.vjText }]}>{formatWeight(item.grossWeightMg)}</Text>
            <Text style={s.weightInlineDivider}>   •   </Text>
            <Text style={[s.weightInlineLabel, { color: colors.vjText }]}>Net: </Text>
            <HighlightText 
              text={formatWeight(item.netWeightMg ?? item.grossWeightMg ?? 0)} 
              query={activeQuery} 
              style={[s.weightInlineValBold, { color: colors.vjAccent }]} 
            />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function InventorySearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeFirmId } = useFirmStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ItemSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const isScanningRef = useRef(false);

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  useEffect(() => {
    const trimmedQuery = query.trim();
    
    if (trimmedQuery.length < 2 || !activeFirmId) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    let isCurrent = true;
    setIsSearching(true);
    const delayDebounceFn = setTimeout(async () => {
      try {
        const data = await inventorySearchService.searchItems(activeFirmId, trimmedQuery);
        if (isCurrent) {
          setResults(data || []);
        }
      } catch (error) {
        if (isCurrent) {
          console.error('[Search] Failed to fetch results:', error);
        }
      } finally {
        if (isCurrent) {
          setIsSearching(false);
        }
      }
    }, 80);

    return () => {
      isCurrent = false;
      clearTimeout(delayDebounceFn);
    };
  }, [query, activeFirmId]);

  const handleItemPress = useCallback((itemId: string) => {
    router.push({ pathname: '/inventory/item-detail', params: { itemId } });
  }, [router]);

  const handleScanPress = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('Permission Required', 'Camera access is needed to scan product barcodes.');
        return;
      }
    }
    isScanningRef.current = false;
    setShowScanner(true);
  };

  const handleBarcodeScanned = useCallback(async ({ data }: { data: string }) => {
    if (!data || isScanningRef.current) return;
    isScanningRef.current = true;
    
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    setShowScanner(false);
    setQuery(data.trim());

    if (activeFirmId) {
      try {
        setIsSearching(true);
        const searchResults = await inventorySearchService.searchItems(activeFirmId, data.trim());
        setResults(searchResults || []);
        if (searchResults && searchResults.length === 1) {
          router.push({ pathname: '/inventory/item-detail', params: { itemId: searchResults[0].itemId } });
        }
      } catch (e) {
        console.error('[Search] Barcode lookup failed:', e);
      } finally {
        setIsSearching(false);
      }
    }
  }, [activeFirmId, router]);

  const searchHeaderPills = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
      <HeaderPill icon={<Search size={12} color={colors.vjBg} />} label="Instant SKU & HUID Lookup" />
      <HeaderPill icon={<ScanLine size={12} color="#4ADE80" />} label="Barcode Auto-Scan" variant="success" />
    </View>
  );

  return (
    <TwoToneWrapper title="Stock Search" showBack headerContent={searchHeaderPills}>
      <View style={s.topSearchSection}>
        <View style={[s.searchBox, { borderColor: `${colors.vjAccent}40` }]}>
          <Search size={18} color={colors.vjAccent} style={s.searchIcon} />
          <TextInput
            testID="inventory-search-input"
            style={[s.input, { color: colors.vjText }]}
            placeholder="Scan Barcode / Search SKU, HUID, Size..."
            placeholderTextColor="rgba(92, 22, 35, 0.4)"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => Keyboard.dismiss()}
            returnKeyType="search"
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
          />
          {isSearching ? (
            <ActivityIndicator size="small" color={colors.vjAccent} style={s.spinner} />
          ) : query.length > 0 ? (
            <TouchableOpacity 
              testID="clear-search-btn"
              onPress={() => setQuery('')}
              style={s.clearBtn}
            >
              <X size={16} color={colors.vjText} style={{ opacity: 0.5 }} />
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            testID="barcode-scan-btn"
            activeOpacity={0.7}
            onPress={handleScanPress}
            style={[s.scanBtn, { backgroundColor: `${colors.vjAccent}14`, borderColor: `${colors.vjAccent}35` }]}
          >
            <ScanLine size={20} color={colors.vjAccent} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.listContainer}>
        {query.trim().length === 0 ? (
          <View style={s.emptyState}>
            <Hash size={44} color={colors.vjAccent} style={{ opacity: 0.3 }} />
            <Text style={[s.emptyTitle, { color: colors.vjText }]}>Search Inventory</Text>
            <Text style={[s.emptySub, { color: colors.vjText, opacity: 0.55 }]}>
              Type SKU, HUID, Category, Design, or scan barcode
            </Text>
          </View>
        ) : results.length === 0 && !isSearching ? (
          <View style={s.emptyState}>
            <PackageSearch size={44} color={colors.vjAccent} style={{ opacity: 0.3 }} />
            <Text style={[s.emptyTitle, { color: colors.vjText }]}>No items found</Text>
            <Text style={[s.emptySub, { color: colors.vjText, opacity: 0.55 }]}>
              Try searching for a different SKU, HUID, or tag
            </Text>
          </View>
        ) : (
          <>
            {results.length > 0 && (
              <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.vjAccent, letterSpacing: 0.5 }}>
                  ✨ {results.length} {results.length === 1 ? 'ITEM' : 'ITEMS'} FOUND
                </Text>
              </View>
            )}
            <FlashList
              data={results}
              // @ts-ignore: estimatedItemSize required by FlashList
              estimatedItemSize={95}
              getItemType={(item) => item.metal}
              keyExtractor={(item) => item.itemId}
              renderItem={({ item }) => (
                <SearchResultRow item={item} query={query} colors={colors} onPress={handleItemPress} />
              )}
              contentContainerStyle={{
                paddingHorizontal: 14,
                paddingTop: 12,
                paddingBottom: Math.max(insets.bottom + 24, 40),
              }}
              keyboardShouldPersistTaps="handled"
            />
          </>
        )}
      </View>

      <Modal
        visible={showScanner}
        animationType="slide"
        onRequestClose={() => {
          setShowScanner(false);
          isScanningRef.current = false;
        }}
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
            <View style={[s.scannerHeader, { paddingTop: Math.max(insets.top + 16, 48) }]}>
              <TouchableOpacity
                onPress={() => {
                  setShowScanner(false);
                  isScanningRef.current = false;
                }}
                style={s.closeScannerBtn}
              >
                <X size={24} color="#FFF" />
              </TouchableOpacity>
              <Text style={s.scannerTitle}>Scan Tag Barcode</Text>
              <View style={{ width: 40 }} />
            </View>

            <View style={s.viewfinderContainer}>
              <View style={s.viewfinderBox}>
                <View style={[s.corner, s.cornerTL, { borderColor: colors.vjAccent }]} />
                <View style={[s.corner, s.cornerTR, { borderColor: colors.vjAccent }]} />
                <View style={[s.corner, s.cornerBL, { borderColor: colors.vjAccent }]} />
                <View style={[s.corner, s.cornerBR, { borderColor: colors.vjAccent }]} />
              </View>
            </View>

            <View style={[s.scannerFooter, { paddingBottom: Math.max(insets.bottom + 24, 48) }]}>
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
    height: 52,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    height: '100%',
  },
  clearBtn: {
    padding: 6,
    marginRight: 4,
  },
  scanBtn: {
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginLeft: 4,
  },
  spinner: {
    marginLeft: 8,
  },
  listContainer: {
    flex: 1,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
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
  huidContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(22, 163, 74, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.25)',
  },
  huidText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803d',
    fontFamily: 'monospace',
  },
  huidTextMuted: {
    fontSize: 11,
    fontWeight: '600',
    fontStyle: 'italic',
    opacity: 0.4,
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  mainDetails: {
    flex: 1,
    marginRight: 8,
  },
  itemNameText: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  itemCategorySub: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.55,
  },
  skuSubText: {
    fontSize: 12,
    fontWeight: '700',
  },
  inlineWeightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
  weightInlineLabel: {
    fontSize: 11,
    fontWeight: '700',
    opacity: 0.6,
  },
  weightInlineVal: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  weightInlineValBold: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: 'monospace',
  },
  weightInlineDivider: {
    fontSize: 10,
    color: 'rgba(92,22,35,0.25)',
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
    marginTop: 16,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    fontWeight: '500',
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