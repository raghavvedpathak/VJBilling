// components/ui/GlassPickerModal.tsx — Phase 2 v2.11 Canonical Component

import React, { useState, useMemo, useEffect } from 'react';
import { 
  View, 
  Text, 
  Modal, 
  TouchableOpacity, 
  TextInput, 
  FlatList, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform 
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { X, Search, Check } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';

export interface GlassPickerOption {
  id: string;
  label: string;
  sublabel?: string | undefined;
  badge?: string | undefined;
}

interface GlassPickerModalProps {
  visible: boolean;
  title: string;
  placeholder?: string | undefined;
  options: GlassPickerOption[];
  selectedId: string | null;
  onClose: () => void;
  onSelect: (option: GlassPickerOption | null) => void;
  allowClear?: boolean | undefined;
}

export function GlassPickerModal({
  visible,
  title,
  placeholder = 'Search...',
  options,
  selectedId,
  onClose,
  onSelect,
  allowClear = true,
}: GlassPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (visible) {
      setSearchQuery('');
    }
  }, [visible]);

  const filteredOptions = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return [];
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(query) ||
        (opt.sublabel && opt.sublabel.toLowerCase().includes(query)) ||
        (opt.badge && opt.badge.toLowerCase().includes(query))
    );
  }, [options, searchQuery]);

  const selectedOption = useMemo(() => {
    if (!selectedId) return null;
    return options.find((opt) => opt.id === selectedId) || null;
  }, [options, selectedId]);

  const handleSelect = (option: GlassPickerOption | null) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    onSelect(option);
    onClose();
  };

  if (!visible) return null;

  const isQueryEmpty = searchQuery.trim().length === 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.overlay}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        
        <View style={styles.sheetContainer}>
          <BlurView intensity={40} tint="light" style={styles.sheetContent}>
            
            {/* Header Bar */}
            <View style={styles.headerBar}>
              <View style={styles.headerTitleRow}>
                <Text style={styles.headerTitle}>{title}</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>
                    {isQueryEmpty ? `${options.length} total` : `${filteredOptions.length} found`}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                <X size={20} color={COLORS.vjText} />
              </TouchableOpacity>
            </View>

            {/* Search Input Bar */}
            <View style={styles.searchBar}>
              <Search size={18} color="rgba(92,22,35,0.5)" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder={placeholder}
                placeholderTextColor="rgba(92,22,35,0.4)"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 && Platform.OS !== 'ios' && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                  <X size={16} color="rgba(92,22,35,0.5)" />
                </TouchableOpacity>
              )}
            </View>

            {/* Options List */}
            <FlatList
              data={filteredOptions}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingBottom: 32 }}
              ListHeaderComponent={
                allowClear && selectedId !== null && isQueryEmpty ? (
                  <View style={{ marginBottom: 12 }}>
                    {selectedOption && (
                      <View style={[styles.optionRow, styles.optionRowSelected, { marginBottom: 8 }]}>
                        <View style={styles.optionTextContainer}>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: 'rgba(146, 64, 14, 0.7)', textTransform: 'uppercase', marginBottom: 2 }}>
                            Current Selection
                          </Text>
                          <Text style={styles.optionLabelSelected}>{selectedOption.label}</Text>
                        </View>
                        <Check size={18} color="#D4AF37" />
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.clearOptionRow}
                      onPress={() => handleSelect(null)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.clearOptionText}>Clear Selection</Text>
                    </TouchableOpacity>
                  </View>
                ) : null
              }
              ListEmptyComponent={
                isQueryEmpty ? (
                  <View style={styles.emptyState}>
                    <Search size={32} color="rgba(92,22,35,0.25)" style={{ marginBottom: 8 }} />
                    <Text style={styles.emptyTitle}>Type to Search</Text>
                    <Text style={styles.emptySubtitle}>Start typing to search {title.toLowerCase()}</Text>
                  </View>
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>No matching options</Text>
                    <Text style={styles.emptySubtitle}>No {title.toLowerCase()} match "{searchQuery}"</Text>
                  </View>
                )
              }
              renderItem={({ item }) => {
                const isSelected = item.id === selectedId;
                return (
                  <TouchableOpacity
                    style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                    onPress={() => handleSelect(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.optionTextContainer}>
                      <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                        {item.label}
                      </Text>
                      {item.sublabel ? (
                        <Text style={styles.optionSublabel}>{item.sublabel}</Text>
                      ) : null}
                    </View>

                    {item.badge ? (
                      <View style={styles.badgeContainer}>
                        <Text style={styles.badgeText}>{item.badge}</Text>
                      </View>
                    ) : null}

                    {isSelected && (
                      <View style={styles.checkIcon}>
                        <Check size={18} color="#D4AF37" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </BlurView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheetContainer: {
    maxHeight: '80%',
    minHeight: '40%',
    width: '100%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 16,
    backgroundColor: '#FCFBF8',
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.vjText,
  },
  countBadge: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
  },
  countText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B8860B',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(92, 22, 35, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(92, 22, 35, 0.15)',
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.vjText,
    padding: 0,
  },
  clearOptionRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    marginBottom: 8,
    alignItems: 'center',
  },
  clearOptionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EF4444',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(92, 22, 35, 0.06)',
  },
  optionRowSelected: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D4AF37',
  },
  optionTextContainer: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.vjText,
  },
  optionLabelSelected: {
    color: '#92400E',
    fontWeight: '800',
  },
  optionSublabel: {
    fontSize: 12,
    color: 'rgba(92, 22, 35, 0.6)',
    marginTop: 2,
  },
  badgeContainer: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    marginRight: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  checkIcon: {
    marginLeft: 4,
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.vjText,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(92, 22, 35, 0.4)',
  },
});
