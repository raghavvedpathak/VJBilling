// app/inventory/barcode-print.tsx — Phase 2 v2.11 Canonical Screen

import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, Alert, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { HeaderPill, GlassCard, GlassButton, FixedGlassBar, fixedBarStyles } from '@/components/ui/Glass';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { barcodeLabelService } from '@/services/phase2/barcodeLabelService';
import { Printer, Share, CheckCircle, RefreshCcw, Tag, Scale } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import type { BarcodeLabel } from '@/types/phase2/phase2.types';
import { COLORS, getThemeColors } from '@/constants/theme';

export default function BarcodePrintScreen() {
  const router = useRouter();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const { activeFirmId } = useFirmStore();
  
  const [label, setLabel] = useState<BarcodeLabel | null>(null);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchLabel = async () => {
      if (!activeFirmId || !itemId) return;
      try {
        const data = await barcodeLabelService.generateBarcodeLabel(itemId, activeFirmId);
        if (active) setLabel(data);
      } catch (e: any) {
        Alert.alert('Error', e.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchLabel();
    return () => { active = false; };
  }, [activeFirmId, itemId]);

  const generateTagHTML = () => {
    if (!label) return '';
    
    const rawGross = label.frontSide.grossWeightDisplay.replace(' g', '');
    const rawNet = label.frontSide.netWeightDisplay.replace(' g', '');

    const karatMatch = label.frontSide.purityDisplay.match(/(\d+K)/);
    const karatOnly = karatMatch ? karatMatch[1] : '';
    const topRowText = karatOnly 
      ? `${label.frontSide.designName.toUpperCase()} ${karatOnly}` 
      : label.frontSide.designName.toUpperCase();

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
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
              padding-left: 1mm;
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
              border-top: 1px dashed #ccc;
            }
            .right-wing {
              padding-right: 1mm;
              align-items: center;
              text-align: center;
            }
            .text-title {
              font-size: 7.5px;
              font-weight: 900;
              color: #000;
              line-height: 1;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              margin-bottom: 1px;
            }
            .text-line {
              font-size: 7px;
              font-weight: 800;
              color: #000;
              line-height: 1;
              margin-top: 1px;
            }
            .firm-code {
              font-size: 7px;
              font-weight: 900;
              color: #000;
              line-height: 1;
              margin-bottom: 0.5px;
            }
            .sku-text {
              font-size: 7px;
              font-weight: 900;
              font-family: monospace;
              color: #000;
              line-height: 1;
              margin-top: 0.5px;
            }
            #qrcode {
              display: flex;
              justify-content: center;
              align-items: center;
              padding: 0.5px;
              background: #ffffff;
            }
          </style>
        </head>
        <body>
          <div class="dumbbell-tag">
            <!-- LEFT WING (DETAILS LOBE) -->
            <div class="wing left-wing">
              <div class="text-title">${topRowText}</div>
              <div class="text-line">Gr.Wt : ${rawGross}g</div>
              <div class="text-line">Nt.Wt : ${rawNet}g</div>
            </div>

            <!-- CENTER DUMBBELL STEM (TAIL BRIDGE) -->
            <div class="center-stem">
              <div class="stem-line"></div>
            </div>

            <!-- RIGHT WING (BARCODE LOBE) -->
            <div class="wing right-wing">
              <div class="firm-code">${label.backSide.firmCode}</div>
              <div id="qrcode"></div>
              <div class="sku-text">${label.backSide.skuDisplay}</div>
            </div>
          </div>

          <script>
            new QRCode(document.getElementById("qrcode"), {
              text: "${label.backSide.barcodeValue}",
              width: 32,
              height: 32,
              colorDark : "#000000",
              colorLight : "#ffffff",
              correctLevel : QRCode.CorrectLevel.L
            });
          </script>
        </body>
      </html>
    `;
  };

  const handlePrint = async () => {
    if (!label || !activeFirmId || !itemId) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
    setIsProcessing(true);
    try {
      const html = generateTagHTML();
      await Print.printAsync({ html });
      await barcodeLabelService.logBarcodeReprint(itemId, activeFirmId);
      setSuccessMessage('Label sent to printer and audit log updated.');
    } catch (e: any) {
      Alert.alert('Print Failed', e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveToDevice = async () => {
    if (!label || !activeFirmId || !itemId) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
    setIsProcessing(true);
    try {
      const html = generateTagHTML();
      const { uri } = await Print.printToFileAsync({ html });
      
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing Unavailable', 'Sharing is not available on your device.');
        return;
      }

      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      await barcodeLabelService.logBarcodeReprint(itemId, activeFirmId);

    } catch (e: any) {
      Alert.alert('Save Failed', e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const activeTheme = appSettingsStore((s: any) => s.theme);
  const colors = getThemeColors(activeTheme);

  const barcodeHeaderPills = label ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<Tag size={12} color={colors.vjBg} />} label={label.frontSide.designName.toUpperCase()} />
      <HeaderPill icon={<Scale size={12} color="#4ADE80" />} label={`Nt: ${label.frontSide.netWeightDisplay}`} variant="success" />
    </View>
  ) : null;

  if (loading) {
    return (
      <TwoToneWrapper title="Print Barcode Tag" showBack headerContent={null}>
        <ActivityIndicator size="large" color={COLORS.vjAccent} style={{ marginTop: 40 }} />
      </TwoToneWrapper>
    );
  }

  if (!label) return null;

  return (
    <TwoToneWrapper title="Print Barcode Tag" showBack headerContent={barcodeHeaderPills}>
      <View style={{ flex: 1, paddingTop: 16 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.vjText, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginLeft: 4 }}>Dumbbell Tag Live Preview (50mm × 12mm)</Text>
        <GlassCard style={{ padding: 18, marginBottom: 24 }}>
          {/* DUMBBELL SHAPED JEWELRY TAG SILHOUETTE PREVIEW */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}>
            
            {/* LEFT WING (DETAILS) */}
            <View style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', padding: 10, justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '900', color: COLORS.vjText, marginBottom: 4 }}>
                {(() => {
                  const km = label.frontSide.purityDisplay.match(/(\d+K)/);
                  const ko = km ? km[1] : '';
                  return ko 
                    ? `${label.frontSide.designName.toUpperCase()} ${ko}` 
                    : label.frontSide.designName.toUpperCase();
                })()}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 2 }}>
                Gr.Wt : {label.frontSide.grossWeightDisplay.replace(' g', '')}g
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.vjAccent }}>
                Nt.Wt : {label.frontSide.netWeightDisplay.replace(' g', '')}g
              </Text>
            </View>

            {/* DUMBBELL CENTER TAIL STEM */}
            <View style={{ width: 28, height: 40, justifyContent: 'center', alignItems: 'center' }}>
              <View style={{ width: '100%', height: 2, borderStyle: 'dashed', borderWidth: 1, borderColor: '#94A3B8' }} />
              <View style={{ position: 'absolute', backgroundColor: '#94A3B8', borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 }}>
                <Text style={{ fontSize: 8, fontWeight: '900', color: '#FFFFFF' }}>STEM</Text>
              </View>
            </View>

            {/* RIGHT WING (BARCODE / QR) */}
            <View style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', padding: 10, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '900', color: COLORS.vjText, marginBottom: 4 }}>{label.backSide.firmCode}</Text>
              <View style={{ marginBottom: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', padding: 2 }}>
                <QRCode 
                  value={label.backSide.barcodeValue} 
                  size={42} 
                  color={COLORS.vjText} 
                  backgroundColor="#ffffff" 
                  quietZone={2}
                />
              </View>
              <Text style={{ fontSize: 12, fontWeight: '900', color: COLORS.vjText, fontFamily: 'monospace' }}>{label.backSide.skuDisplay}</Text>
            </View>

          </View>
        </GlassCard>
        <View style={{ backgroundColor: 'rgba(92,22,35,0.04)', padding: 16, borderRadius: 12, marginBottom: 24, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <RefreshCcw size={20} color={COLORS.vjAccent} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, fontSize: 13, color: 'rgba(92,22,35,0.7)', lineHeight: 20 }}>
            Printing or saving this label will securely log a <Text style={{ fontWeight: '800' }}>BARCODE_REPRINTED</Text> event in the item's timeline to ensure audit traceability.
          </Text>
        </View>
        <View style={{ height: 60 }} />
      </View>

      <FixedGlassBar>
        <TouchableOpacity
          style={fixedBarStyles.pillSecondaryBtn}
          onPress={handleSaveToDevice}
          disabled={isProcessing}
        >
          <Share size={16} color={COLORS.vjText} />
          <Text style={fixedBarStyles.pillSecondaryText}>Share PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={fixedBarStyles.pillPrimaryBtn}
          onPress={handlePrint}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Printer size={18} color="#fff" />
              <Text style={fixedBarStyles.pillPrimaryText}>Print Label</Text>
            </>
          )}
        </TouchableOpacity>
      </FixedGlassBar>

      <Modal visible={!!successMessage} transparent animationType="fade">
        <View style={s.modalOverlayCenter}>
          <View style={s.successModalContent}>
            <View style={s.successIconContainer}>
              <CheckCircle size={56} color="#10B981" />
            </View>
            <Text style={s.successTitle}>Success!</Text>
            <Text style={s.successSubtitle}>{successMessage}</Text>
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
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successModalContent: {
    backgroundColor: COLORS.vjBg,
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
    color: COLORS.vjText,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    color: 'rgba(92,22,35,0.6)',
    textAlign: 'center',
    marginBottom: 24,
  },
});