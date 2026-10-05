// app/inventory/barcode-print.tsx — Phase 2 v2.34 Canonical Screen with Inline Action Dock & Offline Tag Generation
// Aligned with STEP 5.1 (50mm x 12mm Dumbbell Tag Specification) and RULE-1A-WEIGHT-DISPLAY (v1.54)

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, Alert, TouchableOpacity, Modal, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { HeaderPill, GlassCard, GlassButton } from '@/components/ui/Glass';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { barcodeLabelService } from '@/services/phase2/barcodeLabelService';
import { JewelryMonogramEmblem } from '@/utils/jewelryIcons';
import { Printer, Share, CheckCircle, RefreshCcw, Tag, Scale, Sparkles } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import type { BarcodeLabel } from '@/types/phase2/phase2.types';
import { getThemeColors } from '@/constants/theme';

export default function BarcodePrintScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const { activeFirmId } = useFirmStore();
  const activeTheme = appSettingsStore((s: any) => s.theme);
  const isDark = activeTheme === 'dark';
  const colors = getThemeColors(activeTheme);
  
  const [label, setLabel] = useState<BarcodeLabel | null>(null);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const qrRef = useRef<any>(null);

  useEffect(() => {
    let active = true;
    const fetchLabel = async () => {
      if (!activeFirmId || !itemId) return;
      try {
        const data = await barcodeLabelService.generateBarcodeLabel(itemId, activeFirmId);
        if (active) setLabel(data);
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to load barcode label data.');
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchLabel();
    return () => { active = false; };
  }, [activeFirmId, itemId]);

  // Extract base64 raster from native SVG for 100% offline-resilient printing
  const getQrBase64 = (): Promise<string> => {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(''), 800);
      if (qrRef.current?.toDataURL) {
        qrRef.current.toDataURL((data: string) => {
          clearTimeout(timeout);
          resolve(`data:image/png;base64,${data}`);
        });
      } else {
        clearTimeout(timeout);
        resolve('');
      }
    });
  };

  // STEP 5.1 & RULE-1A-WEIGHT-DISPLAY (v1.54): Purity Displayed After Design Name on 50mm × 12mm Dumbbell Tag
  const generateTagHTML = (qrDataUri: string) => {
    if (!label) return '';
    
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            @page {
              size: 50mm 12mm;
              margin: 0;
            }
            @media print {
              html, body {
                width: 50mm !important;
                height: 12mm !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .dumbbell-tag {
                page-break-inside: avoid !important;
                page-break-after: avoid !important;
              }
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body { 
              font-family: Arial, Helvetica, sans-serif; 
              width: 50mm; 
              height: 12mm; 
              background-color: white; 
              overflow: hidden;
            }
            .dumbbell-tag {
              width: 50mm;
              height: 12mm;
              display: flex;
              flex-direction: row;
              align-items: center;
              justify-content: space-between;
              padding: 0.5mm 1mm;
            }
            .wing {
              width: 22mm;
              height: 11mm;
              display: flex;
              flex-direction: column;
              justify-content: center;
              overflow: hidden;
            }
            .left-wing {
              padding-left: 0.8mm;
              align-items: flex-start;
            }
            .center-stem {
              width: 4mm;
              height: 11mm;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .stem-line {
              width: 100%;
              border-top: 1px dashed #cbd5e1;
            }
            .right-wing {
              padding-right: 0.8mm;
              align-items: center;
              text-align: center;
            }
            .text-title {
              font-size: 7.5px;
              font-weight: 900;
              color: #000;
              line-height: 1.1;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              margin-bottom: 0.5px;
            }
            .text-line {
              font-size: 6.5px;
              font-weight: 800;
              color: #000;
              line-height: 1.1;
              margin-top: 0.5px;
            }
            .firm-code {
              font-size: 7px;
              font-weight: 900;
              color: #000;
              line-height: 1;
              margin-bottom: 0.5px;
            }
            .sku-text {
              font-size: 6.5px;
              font-weight: 900;
              font-family: monospace;
              color: #000;
              line-height: 1;
              margin-top: 0.5px;
            }
            .qr-img {
              width: 28px;
              height: 28px;
              image-rendering: pixelated;
              display: block;
              margin: 0 auto;
            }
          </style>
        </head>
        <body>
          <div class="dumbbell-tag">
            <div class="wing left-wing">
              <div class="text-title">${label.frontSide.designName.toUpperCase()} ${label.frontSide.purityDisplay}</div>
              <div class="text-line">Gr.Wt : ${label.frontSide.grossWeightDisplay}</div>
              <div class="text-line">Nt.Wt : ${label.frontSide.netWeightDisplay}</div>
            </div>

            <div class="center-stem">
              <div class="stem-line"></div>
            </div>

            <div class="wing right-wing">
              <div class="firm-code">${label.backSide.firmCode}</div>
              ${qrDataUri ? `<img class="qr-img" src="${qrDataUri}" alt="QR" />` : ''}
              <div class="sku-text">${label.backSide.skuDisplay}</div>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const handlePrint = async () => {
    if (!label || !activeFirmId || !itemId) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setIsProcessing(true);
    try {
      const qrDataUri = await getQrBase64();
      const html = generateTagHTML(qrDataUri);
      await Print.printAsync({
        html,
        width: 142,
        height: 34,
      });
      await barcodeLabelService.logBarcodeReprint(itemId, activeFirmId);
      setSuccessMessage('Label sent to printer and reprint logged in timeline.');
    } catch (e: any) {
      Alert.alert('Print Failed', e.message || 'Could not complete print job.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveToDevice = async () => {
    if (!label || !activeFirmId || !itemId) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setIsProcessing(true);
    try {
      const qrDataUri = await getQrBase64();
      const html = generateTagHTML(qrDataUri);
      const { uri } = await Print.printToFileAsync({
        html,
        width: 142,
        height: 34,
      });
      
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing Unavailable', 'Sharing is not available on your device.');
        return;
      }

      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      await barcodeLabelService.logBarcodeReprint(itemId, activeFirmId);
      setSuccessMessage('Label exported as PDF and reprint logged in timeline.');
    } catch (e: any) {
      Alert.alert('Save Failed', e.message || 'Could not export label PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const barcodeHeaderPills = label ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Tag size={12} color={colors.vjBg} />} label={`${label.frontSide.designName.toUpperCase()} · ${label.frontSide.purityDisplay}`} />
      <HeaderPill icon={<Scale size={12} color="#4ADE80" />} label={`Nt: ${label.frontSide.netWeightDisplay}`} variant="success" />
    </View>
  ) : null;

  if (loading) {
    return (
      <TwoToneWrapper title="Print Barcode Tag" showBack headerContent={null}>
        <ActivityIndicator size="large" color={colors.vjAccent} style={{ marginTop: 40 }} />
      </TwoToneWrapper>
    );
  }

  if (!label) return null;

  return (
    <TwoToneWrapper title="Print Barcode Tag" showBack headerContent={barcodeHeaderPills}>
      <ScrollView 
        style={{ flex: 1 }} 
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: 60,
          paddingHorizontal: 16,
          ...(isTablet ? { maxWidth: 740, alignSelf: 'center', width: '100%' } : {}),
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ITEM OVERVIEW BANNER */}
        <View style={[
          s.overviewCard,
          {
            backgroundColor: isDark ? 'rgba(28, 20, 24, 0.96)' : 'rgba(252, 251, 248, 0.98)',
            borderColor: isDark ? 'rgba(212, 175, 55, 0.25)' : 'rgba(212, 175, 55, 0.2)',
          }
        ]}>
          <JewelryMonogramEmblem
            designName={label.frontSide.designName}
            size={40}
          />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[s.overviewDesignName, { color: colors.vjText }]} numberOfLines={1}>
                {label.frontSide.designName.toUpperCase()}
              </Text>
              <View style={s.purityBadge}>
                <Sparkles size={10} color="#D4AF37" />
                <Text style={s.purityBadgeText}>{label.frontSide.purityDisplay}</Text>
              </View>
            </View>
            <Text style={[s.overviewSku, { color: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(92,22,35,0.65)' }]}>
              SKU: <Text style={{ fontFamily: 'monospace', fontWeight: '800' }}>{label.backSide.skuDisplay}</Text> • Firm: {label.backSide.firmCode}
            </Text>
          </View>
        </View>

        <Text style={{ fontSize: 13, fontWeight: '800', color: colors.vjText, opacity: 0.75, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
          Dumbbell Tag Live Preview (50mm × 12mm)
        </Text>
        
        <GlassCard style={{
          padding: 16,
          marginBottom: 20,
          backgroundColor: isDark ? 'rgba(28, 20, 24, 0.96)' : 'rgba(252, 251, 248, 0.98)',
          borderColor: isDark ? 'rgba(212, 175, 55, 0.22)' : 'rgba(212, 175, 55, 0.25)',
        }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDark ? 'rgba(18, 14, 16, 0.95)' : '#F8FAFC',
            borderRadius: 14,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0',
            padding: 10,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 6,
            elevation: 3,
          }}>
            
            {/* LEFT WING (DETAILS: Purity after Design Name) */}
            <View style={{
              flex: 1,
              backgroundColor: '#FFFFFF',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#CBD5E1',
              padding: 10,
              justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 13, fontWeight: '900', color: '#1E293B', marginBottom: 4 }} numberOfLines={1}>
                {label.frontSide.designName.toUpperCase()}{' '}
                <Text style={{ color: '#D4AF37' }}>{label.frontSide.purityDisplay}</Text>
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#334155', marginBottom: 2 }}>
                Gr.Wt : {label.frontSide.grossWeightDisplay}
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#B45309' }}>
                Nt.Wt : {label.frontSide.netWeightDisplay}
              </Text>
            </View>

            {/* DUMBBELL CENTER TAIL STEM */}
            <View style={{ width: 28, height: 40, justifyContent: 'center', alignItems: 'center' }}>
              <View style={{ width: '100%', height: 2, borderStyle: 'dashed', borderWidth: 1, borderColor: '#94A3B8' }} />
              <View style={{ position: 'absolute', backgroundColor: '#94A3B8', borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 }}>
                <Text style={{ fontSize: 8, fontWeight: '900', color: '#FFFFFF' }}>STEM</Text>
              </View>
            </View>

            {/* RIGHT WING (BARCODE LOBE: 3 Lines) */}
            <View style={{
              flex: 1,
              backgroundColor: '#FFFFFF',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#CBD5E1',
              padding: 10,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 11, fontWeight: '900', color: '#1E293B', marginBottom: 4 }}>{label.backSide.firmCode}</Text>
              <View style={{ marginBottom: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', padding: 2 }}>
                <QRCode 
                  getRef={(c) => { qrRef.current = c; }}
                  value={label.backSide.barcodeValue} 
                  size={42} 
                  color="#000000" 
                  backgroundColor="#ffffff" 
                  quietZone={2}
                />
              </View>
              <Text style={{ fontSize: 12, fontWeight: '900', color: '#1E293B', fontFamily: 'monospace' }}>{label.backSide.skuDisplay}</Text>
            </View>

          </View>
        </GlassCard>

        {/* Audit Notification Banner */}
        <View style={{
          backgroundColor: isDark ? 'rgba(212, 175, 55, 0.12)' : `${colors.vjAccent}10`,
          padding: 16,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(212, 175, 55, 0.28)' : `${colors.vjAccent}25`,
          marginBottom: 24,
          flexDirection: 'row',
          gap: 12,
          alignItems: 'flex-start',
        }}>
          <RefreshCcw size={18} color={colors.vjAccent} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, fontSize: 13, color: colors.vjText, opacity: 0.85, lineHeight: 19 }}>
            Printing or saving this label will securely log a <Text style={{ fontWeight: '800' }}>BARCODE_REPRINTED</Text> event in the item's timeline for constitutional audit compliance.
          </Text>
        </View>

        {/* ACTION BUTTONS DOCK */}
        <View style={s.actionRow}>
          <TouchableOpacity
            style={[
              s.shareBtn,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
                borderColor: isDark ? 'rgba(212, 175, 55, 0.3)' : `${colors.vjAccent}35`,
              }
            ]}
            onPress={handleSaveToDevice}
            disabled={isProcessing}
            activeOpacity={0.75}
          >
            <Share size={18} color={colors.vjText} />
            <Text style={[s.shareBtnText, { color: colors.vjText }]}>Share PDF</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.printBtn, { backgroundColor: colors.vjAccent }]}
            onPress={handlePrint}
            disabled={isProcessing}
            activeOpacity={0.75}
          >
            {isProcessing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Printer size={18} color="#fff" />
                <Text style={s.printBtnText}>Print Label</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

      </ScrollView>

      <Modal visible={!!successMessage} transparent animationType="fade">
        <View style={s.modalOverlayCenter}>
          <View style={[
            s.successModalContent,
            {
              backgroundColor: isDark ? '#23181C' : colors.vjBg,
              borderColor: isDark ? 'rgba(212, 175, 55, 0.25)' : 'rgba(255,255,255,0.5)',
            }
          ]}>
            <View style={s.successIconContainer}>
              <CheckCircle size={56} color="#10B981" />
            </View>
            <Text style={[s.successTitle, { color: colors.vjText }]}>Success!</Text>
            <Text style={[s.successSubtitle, { color: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(92,22,35,0.6)' }]}>
              {successMessage}
            </Text>
            <View style={{ width: '100%', marginTop: 16 }}>
              <GlassButton 
                title="Done" 
                onPress={() => {
                  setSuccessMessage(null);
                  router.back();
                }} 
              />
            </View>
          </View>
        </View>
      </Modal>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  overviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  overviewDesignName: {
    fontSize: 15,
    fontWeight: '800',
    flex: 1,
  },
  overviewSku: {
    fontSize: 12,
    marginTop: 3,
  },
  purityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
  },
  purityBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D4AF37',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    marginBottom: 20,
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    paddingVertical: 15,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  shareBtnText: {
    fontSize: 15,
    fontWeight: '800',
  },
  printBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  printBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successModalContent: {
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
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
});