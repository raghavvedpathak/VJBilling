// app/settings/invoice.tsx — Phase 3 Invoice & Print Settings Screen
// Strictly adheres to STEP 4 Specification & FIX-INVOICE-PRINT-1 (v5.19):
// Supported Paper Sizes: A4 | A5 (Default: A5)
// Orientations: Portrait | Landscape (Default: Landscape)
// Terms & Conditions toggle + Multiline text editor with character counter.
// Document prefix configuration (SALE, PURCHASE, CN, DN, EST).

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { GlassCard, GlassButton, HeaderPill } from '@/components/ui/Glass';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { getThemeColors } from '@/constants/theme';
import { invoicePrintSettingsService } from '@/services/phase3/invoicePrintSettingsService';
import { invoiceNumberService } from '@/services/phase3/invoiceNumberService';
import { fyService } from '@/services/phase1/fyService';
import { PaperSize, PageOrientation, DocType } from '@/types/phase3/phase3.types';
import {
  FileText,
  Printer,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  ArrowLeft,
  Sparkles,
} from 'lucide-react-native';

const CANVAS_HINTS: Record<string, string> = {
  'A5_LANDSCAPE': 'A5 Landscape — 210mm × 148mm (Default Jeweller Book Layout)',
  'A5_PORTRAIT': 'A5 Portrait — 148mm × 210mm (Narrow Receipts Layout)',
  'A4_PORTRAIT': 'A4 Portrait — 210mm × 297mm (Standard Full Page Layout)',
  'A4_LANDSCAPE': 'A4 Landscape — 297mm × 210mm (Wide Multi-Item Table Layout)',
};

export default function InvoiceSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeFirmId } = useFirmStore();
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const rawColors = getThemeColors(activeTheme);

  const colors = {
    surface: '#FFFFFF',
    text: rawColors.vjText,
    textSecondary: '#64748B',
    background: rawColors.vjBg,
    primary: rawColors.vjAccent,
    border: rawColors.border,
  };

  const [paperSize, setPaperSize] = useState<PaperSize>('A5');
  const [orientation, setOrientation] = useState<PageOrientation>('LANDSCAPE');
  const [showTerms, setShowTerms] = useState(false);
  const [termsText, setTermsText] = useState('');
  const [showEmptyWarning, setShowEmptyWarning] = useState(false);

  // Prefix Management
  const [activeFyId, setActiveFyId] = useState<string>('');
  const [prefixes, setPrefixes] = useState<Record<DocType, string>>({
    SALE: 'VJ',
    PURCHASE: 'VJ',
    CN: 'VJ-CN',
    DN: 'VJ-DN',
    EST: 'EST',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!activeFirmId) return;
    setIsLoading(true);
    try {
      // 1. Load Print Settings
      const settings = await invoicePrintSettingsService.getPrintSettings(activeFirmId);
      setPaperSize(settings.paperSize || 'A5');
      setOrientation(settings.orientation || 'LANDSCAPE');
      setShowTerms(settings.showTermsAndConditions || false);
      setTermsText(settings.termsAndConditionsText || '');

      // 2. Load Active FY and Prefixes
      const fy = await fyService.getActiveFY(activeFirmId);
      if (fy) {
        setActiveFyId(fy.id);
        const configs = await invoiceNumberService.getConfigs(activeFirmId, fy.id);
        const pMap: Record<DocType, string> = { ...prefixes };
        configs.forEach((c) => {
          pMap[c.docType] = c.prefix;
        });
        setPrefixes(pMap);
      }
    } catch (err) {
      console.warn('[InvoiceSettings] Failed to load settings:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeFirmId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleTermsToggle = (val: boolean) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    if (val && termsText.trim().length === 0) {
      setShowEmptyWarning(true);
      setShowTerms(false);
      return;
    }

    setShowEmptyWarning(false);
    setShowTerms(val);
  };

  const handleTermsTextChange = (text: string) => {
    setTermsText(text);
    if (text.trim().length > 0 && showEmptyWarning) {
      setShowEmptyWarning(false);
    }
    if (text.trim().length === 0 && showTerms) {
      setShowTerms(false);
    }
  };

  const handleSave = async () => {
    if (!activeFirmId) return;

    if (showTerms && termsText.trim().length === 0) {
      setShowEmptyWarning(true);
      setShowTerms(false);
      Alert.alert(
        'Validation Required',
        'Please enter your Terms and Conditions text before enabling this option.'
      );
      return;
    }

    setIsSaving(true);
    try {
      await invoicePrintSettingsService.savePrintSettings(
        {
          paperSize,
          orientation,
          showTermsAndConditions: showTerms,
          termsAndConditionsText: termsText,
        },
        activeFirmId
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Invoice print settings updated successfully.');
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Save Failed', err?.message || 'Could not save invoice print settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const canvasKey = `${paperSize}_${orientation}`;
  const canvasHint = CANVAS_HINTS[canvasKey] || 'Custom Layout';
  const charCount = termsText.length;

  return (
    <TwoToneWrapper>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={[styles.backBtn, { borderColor: colors.border }]}
            >
              <ArrowLeft size={20} color={colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <HeaderPill label="PRINT & INVOICE" icon={<Printer size={12} color={colors.primary} />} />
              <Text style={[styles.screenTitle, { color: colors.text }]}>Invoice Settings</Text>
            </View>
          </View>

          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <>
              {/* SECTION: Canvas & Paper Size */}
              <GlassCard style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Printer size={20} color={colors.primary} style={{ marginRight: 8 }} />
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Paper Size & Orientation
                  </Text>
                </View>

                {/* Paper Size Segmented Control */}
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                  Paper Size
                </Text>
                <View style={[styles.segmentedRow, { borderColor: colors.border }]}>
                  <TouchableOpacity
                    onPress={() => setPaperSize('A5')}
                    style={[
                      styles.segmentBtn,
                      paperSize === 'A5' && { backgroundColor: colors.primary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        { color: paperSize === 'A5' ? '#FFFFFF' : colors.text },
                      ]}
                    >
                      A5 (Jeweller Book Default)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setPaperSize('A4')}
                    style={[
                      styles.segmentBtn,
                      paperSize === 'A4' && { backgroundColor: colors.primary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        { color: paperSize === 'A4' ? '#FFFFFF' : colors.text },
                      ]}
                    >
                      A4 (Standard Sheet)
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Orientation Segmented Control */}
                <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 14 }]}>
                  Orientation
                </Text>
                <View style={[styles.segmentedRow, { borderColor: colors.border }]}>
                  <TouchableOpacity
                    onPress={() => setOrientation('LANDSCAPE')}
                    style={[
                      styles.segmentBtn,
                      orientation === 'LANDSCAPE' && { backgroundColor: colors.primary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        { color: orientation === 'LANDSCAPE' ? '#FFFFFF' : colors.text },
                      ]}
                    >
                      Landscape (Horizontal)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setOrientation('PORTRAIT')}
                    style={[
                      styles.segmentBtn,
                      orientation === 'PORTRAIT' && { backgroundColor: colors.primary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        { color: orientation === 'PORTRAIT' ? '#FFFFFF' : colors.text },
                      ]}
                    >
                      Portrait (Vertical)
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Canvas Hint */}
                <View style={[styles.hintBox, { backgroundColor: `${colors.primary}10` }]}>
                  <FileSpreadsheet size={16} color={colors.primary} style={{ marginRight: 8 }} />
                  <Text style={[styles.hintText, { color: colors.text }]}>{canvasHint}</Text>
                </View>
              </GlassCard>

              {/* SECTION: Terms and Conditions */}
              <GlassCard style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <FileText size={20} color={colors.primary} style={{ marginRight: 8 }} />
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Terms & Conditions
                  </Text>
                </View>

                {/* Toggle Switch */}
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={[styles.toggleTitle, { color: colors.text }]}>
                      Print Terms & Conditions on invoice
                    </Text>
                    <Text style={[styles.toggleSubtitle, { color: colors.textSecondary }]}>
                      Appears in Section 12 after the signature block
                    </Text>
                  </View>
                  <Switch
                    value={showTerms}
                    onValueChange={handleTermsToggle}
                    trackColor={{ false: '#D1D5DB', true: colors.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {/* Inline Warning for Empty Text */}
                {showEmptyWarning && (
                  <View style={styles.warningBox}>
                    <AlertTriangle size={16} color="#DC2626" style={{ marginRight: 8 }} />
                    <Text style={styles.warningText}>
                      Please enter your Terms and Conditions text before enabling this option.
                    </Text>
                  </View>
                )}

                {/* Text Area */}
                <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 14 }]}>
                  Custom Terms Text (Multilingual / Multiline)
                </Text>
                <View
                  style={[
                    styles.textAreaContainer,
                    { backgroundColor: colors.background, borderColor: colors.border },
                  ]}
                >
                  <TextInput
                    style={[styles.textArea, { color: colors.text }]}
                    placeholder="Enter your terms and conditions here (e.g., Goods once sold will not be taken back without original bill)..."
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    value={termsText}
                    onChangeText={handleTermsTextChange}
                  />
                </View>
                <Text
                  style={[
                    styles.counterText,
                    { color: charCount > 500 ? '#DC2626' : colors.textSecondary },
                  ]}
                >
                  {charCount} / 500 characters (recommended for A5)
                </Text>
              </GlassCard>

              {/* SECTION: Numbering Formats */}
              <GlassCard style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Sliders size={20} color={colors.primary} style={{ marginRight: 8 }} />
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Document Number Formats
                  </Text>
                </View>
                <Text style={[styles.prefixInfo, { color: colors.textSecondary }]}>
                  Invoice format is strictly [PREFIX]/[FY]/[SEQUENCE]. Sequences reset per financial
                  year and never go backward.
                </Text>

                <View style={styles.prefixTable}>
                  <View style={[styles.prefixRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.prefixColType, { color: colors.textSecondary }]}>Doc Type</Text>
                    <Text style={[styles.prefixColPrefix, { color: colors.textSecondary }]}>Prefix</Text>
                    <Text style={[styles.prefixColExample, { color: colors.textSecondary }]}>Example</Text>
                  </View>
                  <View style={[styles.prefixRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.prefixColType, { color: colors.text, fontWeight: '700' }]}>SALE</Text>
                    <Text style={[styles.prefixColPrefix, { color: colors.primary, fontWeight: '700' }]}>{prefixes.SALE}</Text>
                    <Text style={[styles.prefixColExample, { color: colors.text }]}>{prefixes.SALE}/24-25/0001</Text>
                  </View>
                  <View style={[styles.prefixRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.prefixColType, { color: colors.text, fontWeight: '700' }]}>PURCHASE</Text>
                    <Text style={[styles.prefixColPrefix, { color: colors.primary, fontWeight: '700' }]}>{prefixes.PURCHASE}</Text>
                    <Text style={[styles.prefixColExample, { color: colors.text }]}>{prefixes.PURCHASE}/24-25/0001</Text>
                  </View>
                  <View style={[styles.prefixRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.prefixColType, { color: colors.text, fontWeight: '700' }]}>CN</Text>
                    <Text style={[styles.prefixColPrefix, { color: colors.primary, fontWeight: '700' }]}>{prefixes.CN}</Text>
                    <Text style={[styles.prefixColExample, { color: colors.text }]}>{prefixes.CN}/24-25/0001</Text>
                  </View>
                  <View style={[styles.prefixRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.prefixColType, { color: colors.text, fontWeight: '700' }]}>DN</Text>
                    <Text style={[styles.prefixColPrefix, { color: colors.primary, fontWeight: '700' }]}>{prefixes.DN}</Text>
                    <Text style={[styles.prefixColExample, { color: colors.text }]}>{prefixes.DN}/24-25/0001</Text>
                  </View>
                  <View style={styles.prefixRow}>
                    <Text style={[styles.prefixColType, { color: colors.text, fontWeight: '700' }]}>EST</Text>
                    <Text style={[styles.prefixColPrefix, { color: colors.primary, fontWeight: '700' }]}>{prefixes.EST}</Text>
                    <Text style={[styles.prefixColExample, { color: colors.text }]}>{prefixes.EST}/24-25/0001</Text>
                  </View>
                </View>
              </GlassCard>

              {/* Save Button */}
              <TouchableOpacity
                onPress={handleSave}
                disabled={isSaving}
                style={[
                  styles.saveBtn,
                  { backgroundColor: colors.primary },
                  isSaving && { opacity: 0.6 },
                ]}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <CheckCircle2 size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={styles.saveBtnText}>Save Print Settings</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </TwoToneWrapper>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  loadingBox: {
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  segmentedRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
  },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  hintText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  toggleSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  warningText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
    flex: 1,
  },
  textAreaContainer: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    height: 110,
  },
  textArea: {
    fontSize: 14,
    height: 90,
    textAlignVertical: 'top',
  },
  counterText: {
    fontSize: 11,
    textAlign: 'right',
    marginTop: 4,
  },
  prefixInfo: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10,
  },
  prefixTable: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  prefixRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  prefixColType: {
    width: 90,
    fontSize: 12,
  },
  prefixColPrefix: {
    width: 80,
    fontSize: 12,
  },
  prefixColExample: {
    flex: 1,
    fontSize: 12,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
