// components/ui/GlassPickerModal.tsx — Centralized Glassmorphic Modal Picker for VJ Billing
// Purpose: High-performance searchable bottom-sheet picker with translucent frosted glass styling.
// Visual Architecture: Frosted Glass Sheet, Etched Search Bar, Golden Selection Highlights, and Dynamic Theme Tokens.

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
import { COLORS, getThemeColors } from '../../constants/theme';
import { appSettingsStore } from '../../store/phase1/appSettingsStore';

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
  colors: ReturnType<typeof getThemeColors>;
  isDark: boolean;
}

const OptionRow = React.memo(
  ({ item, isSelected, onSelect, colors, isDark }: OptionRowProps) => {
    return (
      <TouchableOpacity
        style={[
          styles.optionRow,
          {
            backgroundColor: isSelected
              ? (isDark ? 'rgba(212, 175, 55, 0.22)' : '#FEF3C7')
              : (isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.75)'),
            borderColor: isSelected
              ? '#D4AF37'
              : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(212, 175, 55, 0.20)'),
            borderWidth: isSelected ? 1.5 : 1,
          },
        ]}
        onPress={() => onSelect(item)}
        activeOpacity={0.7}
      >
        <View style={styles.optionTextContainer}>
          <Text
            style={[
              styles.optionLabel,
              { color: isSelected ? (isDark ? '#FDE68A' : '#92400E') : colors.vjText },
              isSelected && styles.optionLabelSelected,
            ]}
          >
            {item.label}
          </Text>
          {item.sublabel ? (
            <Text
              style={[
                styles.optionSublabel,
                { color: isDark ? 'rgba(255, 255, 255, 0.55)' : `${colors.vjText}99` },
              ]}
            >
              {item.sublabel}
            </Text>
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
  (prev, next) =>
    prev.isSelected === next.isSelected &&
    prev.item === next.item &&
    prev.isDark === next.isDark
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

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);
  const isDark = activeTheme === 'dark';

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
        colors={colors}
        isDark={isDark}
      />
    ),
    [selectedId, handleSelect, colors, isDark]
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
        
        <View 
          style={[
            styles.sheetContainer, 
            isTablet && styles.sheetContainerTablet,
            { borderColor: isDark ? 'rgba(212, 175, 55, 0.35)' : 'rgba(212, 175, 55, 0.35)' }
          ]}
        >
          <BlurView
            intensity={Platform.OS === 'ios' ? 70 : 0}
            tint={isDark ? 'dark' : 'light'}
            {...(Platform.OS === 'android' ? { blurMethod: 'none' as const } : {})}
            style={[
              styles.sheetBlurContent,
              {
                backgroundColor: isDark ? 'rgba(28, 20, 24, 0.92)' : 'rgba(255, 253, 249, 0.92)',
              },
            ]}
          >
            {/* Modern Top Sheet Drag Handle */}
            <View style={styles.handleWrap}>
              <View 
                style={[
                  styles.handleBar, 
                  { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(92, 22, 35, 0.20)' }
                ]} 
              />
            </View>

            <View style={styles.sheetContent}>
              {/* Header Bar */}
              <View style={styles.headerBar}>
                <View style={styles.headerTitleRow}>
                  <Text style={[styles.headerTitle, { color: colors.vjText }]}>{title}</Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>
                      {isQueryEmpty
                        ? `${options.length} options`
                        : `${filteredOptions.length} of ${options.length} found`}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                  <X size={20} color={colors.vjText} />
                </TouchableOpacity>
              </View>

              {/* Etched Frosted Glass Search Input Bar */}
              <View 
                style={[
                  styles.searchBar,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.82)',
                    borderColor: isDark ? 'rgba(212, 175, 55, 0.30)' : 'rgba(212, 175, 55, 0.30)',
                  },
                ]}
              >
                <Search size={18} color="#D4AF37" style={{ marginRight: 8, opacity: 0.9 }} />
                <TextInput
                  style={[styles.searchInput, { color: colors.vjText }]}
                  placeholder={placeholder}
                  placeholderTextColor={isDark ? 'rgba(255, 255, 255, 0.38)' : 'rgba(92, 22, 35, 0.38)'}
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
                    <X size={16} color={isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(92, 22, 35, 0.5)'} />
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
                        <View 
                          style={[
                            styles.optionRow, 
                            { 
                              backgroundColor: isDark ? 'rgba(212, 175, 55, 0.22)' : '#FEF3C7',
                              borderColor: '#D4AF37',
                              borderWidth: 1.5,
                              marginBottom: 8,
                            }
                          ]}
                        >
                          <View style={styles.optionTextContainer}>
                            <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#FDE68A' : 'rgba(146, 64, 14, 0.8)', textTransform: 'uppercase', marginBottom: 2 }}>
                              Current Selection
                            </Text>
                            <Text style={[styles.optionLabelSelected, { color: isDark ? '#FDE68A' : '#92400E' }]}>
                              {selectedOption.label}
                            </Text>
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
                      <Search size={32} color={isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(92, 22, 35, 0.25)'} style={{ marginBottom: 8 }} />
                      <Text style={[styles.emptyTitle, { color: colors.vjText }]}>No options available</Text>
                      <Text style={[styles.emptySubtitle, { color: `${colors.vjText}80` }]}>No {title.toLowerCase()} configured in system</Text>
                    </View>
                  ) : (
                    <View style={styles.emptyState}>
                      <Text style={[styles.emptyTitle, { color: colors.vjText }]}>No matching options</Text>
                      <Text style={[styles.emptySubtitle, { color: `${colors.vjText}80` }]}>No {title.toLowerCase()} match "{searchQuery}"</Text>
                    </View>
                  )
                }
              />
            </View>
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
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  sheetContainerTablet: {
    maxWidth: 580,
    borderRadius: 32,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    maxHeight: '75%',
    borderWidth: 1.5,
  },
  sheetBlurContent: {
    flex: 1,
    width: '100%',
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
    backgroundColor: 'rgba(212, 175, 55, 0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1.2,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    padding: 0,
  },
  clearOptionRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
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
    borderRadius: 16,
    marginBottom: 6,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  optionLabelSelected: {
    fontWeight: '800',
  },
  optionSublabel: {
    fontSize: 12,
    marginTop: 2,
  },
  badgeContainer: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
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
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    fontWeight: '600',
  },
});
