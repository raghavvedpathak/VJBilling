// app/inventory/search.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { Search, ArrowLeft, PackageSearch, Ghost, Hash } from 'lucide-react-native';
import { inventorySearchService } from '../../services/inventorySearchService';
import type { ItemSearchResult } from '../../types/phase2.types';

// Hardcoded for testing. In Phase 3, this will come from your AuthContext/Zustand store.
const TEMP_FIRM_ID = 'FIRM-1'; 

const COLORS = {
  vjText: '#2E1D00',
  vjBg: '#FAF3E0',
  surface: '#FFFFFF',
  border: 'rgba(46,29,0,0.08)',
  goldAccent: '#D97706',
  silverAccent: '#9CA3AF',
  phantom: '#8B5CF6',
  danger: '#DC2626',
  highlight: '#FDE047', // Yellow Highlight
  muted: 'rgba(46,29,0,0.5)',
};

// --- Custom Component: Smart Text Highlighter ---
const HighlightText = ({ text, query, style }: { text?: string | null, query: string, style: any }) => {
  if (!text) return null;
  if (!query) return <Text style={style}>{text}</Text>;

  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return (
    <Text style={style}>
      {parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <Text key={index} style={[style, { backgroundColor: COLORS.highlight, color: '#000' }]}>
            {part}
          </Text>
        ) : (
          <Text key={index} style={style}>{part}</Text>
        )
      )}
    </Text>
  );
};

export default function InventorySearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ItemSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Snappy Debounced Search Effect (150ms)
  useEffect(() => {
    const trimmedQuery = query.trim();
    
    if (trimmedQuery.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const delayDebounceFn = setTimeout(async () => {
      try {
        const data = await inventorySearchService.searchItems(TEMP_FIRM_ID, trimmedQuery);
        setResults(data);
      } catch (error) {
        console.error('[Search] Failed to fetch results:', error);
      } finally {
        setIsSearching(false);
      }
    }, 150); 

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  // Fix: Handle undefined weights safely
  const formatWeight = (mg?: number) => ((mg || 0) / 1000).toFixed(3) + ' g';

  const renderItem = ({ item }: { item: ItemSearchResult }) => {
    const isGold = item.metal === 'GOLD';
    const isPhantom = item.status === 'PHANTOM_AVAILABLE';
    const activeQuery = query.trim();

    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={s.badgeRow}>
            <View style={[s.metalBadge, { backgroundColor: isGold ? COLORS.goldAccent + '20' : COLORS.silverAccent + '20' }]}>
              <Text style={[s.metalText, { color: isGold ? COLORS.goldAccent : COLORS.silverAccent }]}>
                {item.metal} {item.purityKarat}K
              </Text>
            </View>
            
            {isPhantom && (
              <View style={[s.metalBadge, { backgroundColor: COLORS.phantom + '15' }]}>
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
            {/* We highlight the weight if the user searches for the exact formatted string */}
            <HighlightText text={formatWeight(item.netWeightMg)} query={activeQuery} style={s.weightValue} />
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={s.container}>
      {/* Search Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={24} color={COLORS.vjText} />
        </TouchableOpacity>
        
        <View style={s.searchBox}>
          <Search size={18} color={COLORS.muted} style={s.searchIcon} />
          <TextInput
            style={s.input}
            placeholder="Search SKU, HUID, Design..."
            placeholderTextColor={COLORS.muted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCapitalize="characters"
          />
          {isSearching && <ActivityIndicator size="small" color={COLORS.vjText} style={s.spinner} />}
        </View>
      </View>

      {/* Results Area */}
      <View style={s.listContainer}>
        {query.trim().length > 0 && query.trim().length < 2 ? (
          <View style={s.emptyState}>
            <Hash size={48} color={COLORS.border} />
            <Text style={s.emptyTitle}>Keep typing...</Text>
            <Text style={s.emptySub}>Enter at least 2 characters to search</Text>
          </View>
        ) : query.trim().length >= 2 && results.length === 0 && !isSearching ? (
          <View style={s.emptyState}>
            <PackageSearch size={48} color={COLORS.border} />
            <Text style={s.emptyTitle}>No items found</Text>
            <Text style={s.emptySub}>Try searching for a different SKU or HUID</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.itemId}
            renderItem={renderItem}
            contentContainerStyle={s.listPadding}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={10}
          />
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.vjBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
    marginLeft: -8,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.vjBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 44,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.vjText,
    height: '100%',
  },
  spinner: {
    marginLeft: 8,
  },
  listContainer: {
    flex: 1,
  },
  listPadding: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
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
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.vjText,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.muted,
  },
  weightDetails: {
    alignItems: 'flex-end',
  },
  weightLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.muted,
    marginBottom: 2,
  },
  weightValue: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.vjText,
    fontFamily: 'monospace',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.vjText,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.muted,
  },
});