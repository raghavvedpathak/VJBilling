// components/ItemSearchSection.tsx — Phase 3 Item Search UI
// LOCKED UI CONTRACT: FIX-ITEM-SEARCH-UI-1 (v5.15)
// Triggers: Item Name, SKU, Barcode Scan | Max 5 results | Debounce 300ms | No direct DB queries | No raw item.status

import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Search, ScanLine, X, Sparkles } from 'lucide-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { inventorySearchService } from '@/services/phase2/inventorySearchService';
import type { ItemSearchResult } from '@/types/phase2/phase2.types';
import { COLORS } from '@/constants/theme';

interface ItemSearchSectionProps {
  firmId: string;
  onSelectItem: (item: ItemSearchResult) => void;
  disabled?: boolean;
}

function getHighlightedSegments(text: string, query: string): { part: string; isMatch: boolean }[] {
  const trimmed = query.trim();
  if (!trimmed) return [{ part: text, isMatch: false }];

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [{ part: text, isMatch: false }];

  try {
    const escapedTokens = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(${escapedTokens.join('|')})`, 'gi');
    const parts = text.split(pattern);
    return parts.map((part) => ({
      part,
      isMatch: tokens.some((t) => t.toLowerCase() === part.toLowerCase()),
    }));
  } catch {
    return [{ part: text, isMatch: false }];
  }
}

// Matched text highlighter component
const HighlightedText = memo(({ text, query, style }: { text: string | null | undefined; query: string; style: any }) => {
  if (!text) return null;
  const segments = getHighlightedSegments(text, query);

  return (
    <Text style={style}>
      {segments.map((seg, i) =>
        seg.isMatch ? (
          <Text key={`${seg.part}-${i}`} style={[style, styles.highlight]}>
            {seg.part}
          </Text>
        ) : (
          <Text key={`${seg.part}-${i}`} style={style}>
            {seg.part}
          </Text>
        )
      )}
    </Text>
  );
});

export const ItemSearchSection: React.FC<ItemSearchSectionProps> = ({
  firmId,
  onSelectItem,
  disabled = false,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ItemSearchResult[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [barcodeNotFoundMessage, setBarcodeNotFoundMessage] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Perform search via inventorySearchService.searchItems ONLY (no direct items table queries)
  const performSearch = useCallback(
    async (searchQuery: string, isBarcode = false) => {
      const trimmed = searchQuery.trim();
      if (trimmed.length < 2) {
        setResults([]);
        setTotalCount(0);
        setBarcodeNotFoundMessage(null);
        return;
      }

      setIsSearching(true);
      setBarcodeNotFoundMessage(null);

      try {
        const found = await inventorySearchService.searchItems(firmId, trimmed);
        setTotalCount(found.length);

        // LOCKED CONTRACT: Maximum 5 results shown. Do not paginate.
        setResults(found.slice(0, 5));

        if (isBarcode && found.length === 0) {
          setBarcodeNotFoundMessage('Item not found. Check barcode or search by name.');
        }
      } catch (err) {
        setResults([]);
        setTotalCount(0);
      } finally {
        setIsSearching(false);
      }
    },
    [firmId]
  );

  // Debounced typeahead: 300ms debounce, minimum 2 characters
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (query.trim().length >= 2) {
      debounceTimerRef.current = setTimeout(() => {
        performSearch(query);
      }, 300);
    } else {
      setResults([]);
      setTotalCount(0);
      setBarcodeNotFoundMessage(null);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, performSearch]);

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    setScannerVisible(false);
    setQuery(data);
    await performSearch(data, true);
  };

  const handleSelect = (item: ItemSearchResult) => {
    onSelectItem(item);
    setQuery('');
    setResults([]);
    setTotalCount(0);
    setBarcodeNotFoundMessage(null);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setTotalCount(0);
    setBarcodeNotFoundMessage(null);
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    setScannerVisible(true);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>ADD SERIALIZED ITEM</Text>

      <View style={styles.inputRow}>
        <View style={styles.searchBox}>
          <Search size={18} color="#9CA3AF" style={styles.searchIcon} />
          <TextInput
            style={styles.input}
            placeholder="Search by Item Name, SKU, or HUID (min 2 chars)..."
            placeholderTextColor="#9CA3AF"
            value={query}
            onChangeText={setQuery}
            editable={!disabled}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {isSearching && (
            <ActivityIndicator size="small" color={COLORS.bullionGold} style={styles.actionIcon} />
          )}
          {query.length > 0 && !isSearching && (
            <TouchableOpacity onPress={handleClear} style={styles.actionIcon}>
              <X size={16} color="#6B7280" />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.scanButton}
          onPress={openScanner}
          disabled={disabled}
          activeOpacity={0.7}
        >
          <ScanLine size={20} color="#1E293B" />
        </TouchableOpacity>
      </View>

      {/* Barcode not found inline warning */}
      {barcodeNotFoundMessage && (
        <Text style={styles.inlineWarning}>{barcodeNotFoundMessage}</Text>
      )}

      {/* Search Results List (Maximum 5 items) */}
      {results.length > 0 && (
        <View style={styles.resultsCard}>
          {results.map((item) => {
            const availableWeightGrams = ((item.netWeightMg ?? item.grossWeightMg ?? 0) / 1000).toFixed(3);
            const isPhantom = item.status === 'PHANTOM_AVAILABLE';
            const displayIdentifier = item.huid || item.sku;

            return (
              <TouchableOpacity
                key={item.itemId}
                style={styles.resultRow}
                onPress={() => handleSelect(item)}
                activeOpacity={0.7}
              >
                <View style={styles.rowMain}>
                  <View style={styles.nameRow}>
                    <Sparkles size={14} color={COLORS.bullionGold} style={{ marginRight: 4 }} />
                    <HighlightedText
                      text={item.designName || 'Jewellery Item'}
                      query={query}
                      style={styles.itemName}
                    />
                    {isPhantom && (
                      <View style={styles.phantomBadge}>
                        <Text style={styles.phantomText}>[PHANTOM]</Text>
                      </View>
                    )}
                  </View>


                  <View style={styles.subRow}>
                    <Text style={styles.subTextLabel}>ID: </Text>
                    <HighlightedText
                      text={displayIdentifier}
                      query={query}
                      style={styles.subTextValue}
                    />
                  </View>
                </View>

                {/* Available weight in grams (3 decimal places) */}
                <View style={styles.weightContainer}>
                  <Text style={styles.weightValue}>{availableWeightGrams} g</Text>
                  <Text style={styles.weightSub}>available</Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Prompt if more than 5 results matched */}
          {totalCount > 5 && (
            <View style={styles.refinePrompt}>
              <Text style={styles.refineText}>
                Showing 5 of {totalCount} items. Type more to refine.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Barcode Camera Modal */}
      <Modal
        visible={scannerVisible}
        animationType="slide"
        onRequestClose={() => setScannerVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Scan Item Barcode</Text>
            <TouchableOpacity
              onPress={() => setScannerVisible(false)}
              style={styles.closeBtn}
            >
              <X size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'upc_a'],
            }}
            onBarcodeScanned={handleBarcodeScanned}
          />
          <View style={styles.overlayCenter}>
            <View style={styles.scanTargetBox} />
            <Text style={styles.scanGuideText}>Align barcode within square</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
  },
  actionIcon: {
    padding: 4,
    marginLeft: 4,
  },
  scanButton: {
    width: 48,
    height: 48,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  inlineWarning: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    marginLeft: 4,
  },
  resultsCard: {
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  rowMain: {
    flex: 1,
    paddingRight: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 3,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  phantomBadge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
    alignSelf: 'center',
  },
  phantomText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subTextLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  subTextValue: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  weightContainer: {
    alignItems: 'flex-end',
    minWidth: 80,
  },
  weightValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  weightSub: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  highlight: {
    backgroundColor: '#FEF08A',
    color: '#854D0E',
    fontWeight: '900',
  },
  refinePrompt: {
    backgroundColor: '#F8FAFC',
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  refineText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  modalHeader: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF',
  },
  closeBtn: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 8,
    borderRadius: 20,
  },
  overlayCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanTargetBox: {
    width: 240,
    height: 240,
    borderWidth: 2,
    borderColor: '#FACC15',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  scanGuideText: {
    marginTop: 16,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
});
