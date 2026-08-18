import React, { useState, useMemo, useEffect, useCallback, useDeferredValue } from 'react';
import { 
  View, 
  Text, 
  Modal, 
  TouchableOpacity, 
  TextInput, 
  FlatList, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform,
  Keyboard,
  useWindowDimensions
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

interface OptionRowProps {
  item: GlassPickerOption;
  isSelected: boolean;
  onSelect: (item: GlassPickerOption) => void;
}

const OptionRow = React.memo(
  ({ item, isSelected, onSelect }: OptionRowProps) => {
    return (
      <TouchableOpacity
        style={[styles.optionRow, isSelected && styles.optionRowSelected]}
        onPress={() => onSelect(item)}
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
  },
  (prev, next) => prev.isSelected === next.isSelected && prev.item === next.item
);

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
  const { width: windowWidth } = useWindowDimensions();
  const isTablet = windowWidth >= 768;

  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
      setSearchQuery('');
    }
  }, [visible]);

  const deferredQuery = useDeferredValue(searchQuery);

  const filteredOptions = useMemo(() => {
    const query = deferredQuery.toLowerCase().trim();
    if (!query) return options;
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(query) ||
        (opt.sublabel && opt.sublabel.toLowerCase().includes(query)) ||
        (opt.badge && opt.badge.toLowerCase().includes(query))
    );
  }, [options, deferredQuery]);

  const selectedOption = useMemo(() => {
    if (!selectedId) return null;
    return options.find((opt) => opt.id === selectedId) || null;
  }, [options, selectedId]);

  const handleSelect = useCallback(
    (option: GlassPickerOption | null) => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (e) {}
      onSelect(option);
      onClose();
    },
    [onSelect, onClose]
  );

  const renderOptionItem = useCallback(
    ({ item }: { item: GlassPickerOption }) => (
      <OptionRow
        item={item}
        isSelected={item.id === selectedId}
        onSelect={handleSelect}
      />
    ),
    [selectedId, handleSelect]
  );

  if (!visible) return null;

  const isQueryEmpty = searchQuery.trim().length === 0;

  return (
    <Modal 
      visible={visible} 
      transparent 
      animationType="fade" 
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={[styles.overlay, isTablet && styles.overlayTablet]}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        
        <View style={[styles.sheetContainer, isTablet && styles.sheetContainerTablet]}>
          {/* Modern Top Sheet Drag Handle */}
          <View style={styles.handleWrap}>
            <View style={styles.handleBar} />
          </View>

          <View style={styles.sheetContent}>
            {/* Header Bar */}
            <View style={styles.headerBar}>
              <View style={styles.headerTitleRow}>
                <Text style={styles.headerTitle}>{title}</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>
                    {isQueryEmpty
                      ? `${options.length} options`
                      : `${filteredOptions.length} of ${options.length} found`}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                <X size={20} color={COLORS.vjText} />
              </TouchableOpacity>
            </View>

            {/* Search Input Bar */}
            <View style={styles.searchBar}>
              <Search size={18} color="#D4AF37" style={{ marginRight: 8, opacity: 0.9 }} />
              <TextInput
                style={styles.searchInput}
                placeholder={placeholder}
                placeholderTextColor="rgba(92,22,35,0.4)"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus={false}
                autoCorrect={false}
                autoCapitalize="none"
                spellCheck={false}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                  <X size={16} color="rgba(92,22,35,0.5)" />
                </TouchableOpacity>
              )}
            </View>

            {/* Options List */}
            <FlatList
              data={filteredOptions}
              keyExtractor={(item) => item.id}
              renderItem={renderOptionItem}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              updateCellsBatchingPeriod={30}
              windowSize={7}
              removeClippedSubviews={Platform.OS === 'android'}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
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
                options.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Search size={32} color="rgba(92,22,35,0.25)" style={{ marginBottom: 8 }} />
                    <Text style={styles.emptyTitle}>No options available</Text>
                    <Text style={styles.emptySubtitle}>No {title.toLowerCase()} configured in system</Text>
                  </View>
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>No matching options</Text>
                    <Text style={styles.emptySubtitle}>No {title.toLowerCase()} match "{searchQuery}"</Text>
                  </View>
                )
              }
            />
          </View>
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
  overlayTablet: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheetContainer: {
    maxHeight: '82%',
    minHeight: '45%',
    width: '100%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.25)',
    backgroundColor: '#FFFDF9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  sheetContainerTablet: {
    maxWidth: 580,
    borderRadius: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    maxHeight: '75%',
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handleBar: {
    width: 44,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: 'rgba(92, 22, 35, 0.18)',
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 6,
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
