// app/inventory/barcode-print.tsx
// FEAT-BARCODE-LABEL-1 (v1.66) - Dumbbell Tag Layout
import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, Alert, TouchableOpacity, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { GlassCard, GlassButton } from '../../components/ui/Glass';
import { useFirmStore } from '../../store/firmStore';
import { barcodeLabelService } from '../../services/barcodeLabelService';
import { Printer, Share, CheckCircle, RefreshCcw, QrCode } from 'lucide-react-native';
import type { BarcodeLabel } from '../../types/phase2.types';

const COLORS = {
  vjText: '#2E1D00',
  vjBg: '#FAF3E0',
  vjAccent: '#B87333',
};

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

  // The perfect HTML layout matching the "Dumbbell" Jewelry Tag
  const generateTagHTML = () => {
    if (!label) return '';
    
    // Extract numbers without the " g" suffix to match the photo's exact look
    const rawGross = label.frontSide.grossWeightDisplay.replace(' g', '');
    const rawNet = label.frontSide.netWeightDisplay.replace(' g', '');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
          <style>
            /* Standard jewelry tag size: 2 inches wide by 0.5 inches tall */
            @page { size: 2in 0.5in; margin: 0; }
            body { 
              font-family: Arial, sans-serif; 
              margin: 0; padding: 0; 
              width: 2in; height: 0.5in; 
              display: flex; flex-direction: row; 
              background-color: white; 
            }
            .head { 
              width: 50%; height: 100%; 
              padding: 2px 4px; box-sizing: border-box; 
              display: flex; flex-direction: column; justify-content: center; 
            }
            .tail { 
              width: 50%; height: 100%; 
              padding: 2px 0; box-sizing: border-box; 
              display: flex; flex-direction: column; justify-content: center; align-items: center; 
            }
            .text-line { font-size: 8px; font-weight: bold; margin: 1.5px 0; color: black; line-height: 1; }
            .sku-text { font-size: 8px; font-weight: bold; color: black; margin-top: 2px; margin-bottom: 2px; }
            #qrcode { margin: 1px 0; display: flex; justify-content: center; align-items: center; }
          </style>
        </head>
        <body>
          <div class="head">
            <div class="text-line">${label.frontSide.purityDisplay} ${label.frontSide.designName.toUpperCase()}</div>
            <div class="text-line">Gr.Wt. : ${rawGross}</div>
            <div class="text-line">Nt.Wt. : ${rawNet}</div>
          </div>
          
          <div class="tail">
            <div class="sku-text">${label.backSide.firmCode}</div>
            <div id="qrcode"></div>
            <div class="sku-text">${label.backSide.skuDisplay}</div>
          </div>

          <script>
            // Generate exact QR Code inside the div
            new QRCode(document.getElementById("qrcode"), {
              text: "${label.backSide.skuDisplay}",
              width: 32,
              height: 32,
              colorDark : "#000000",
              colorLight : "#ffffff",
              correctLevel : QRCode.CorrectLevel.M
            });
          </script>
        </body>
      </html>
    `;
  };

  const handlePrint = async () => {
    if (!label || !activeFirmId || !itemId) return;
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
    setIsProcessing(true);
    try {
      const html = generateTagHTML();
      
      // Generate a perfectly crisp Vector PDF
      const { uri } = await Print.printToFileAsync({ html });
      
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing Unavailable', 'Sharing is not available on your device.');
        return;
      }

      // Open standard OS share/save dialog
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      await barcodeLabelService.logBarcodeReprint(itemId, activeFirmId);

    } catch (e: any) {
      Alert.alert('Save Failed', e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const headerContent = (
    <View>
      <View style={{ marginBottom: 12 }}>
        <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
          <Printer size={28} color={COLORS.vjBg} />
        </View>
      </View>
      <Text style={{ color: COLORS.vjBg, fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 }}>Print Tag</Text>
    </View>
  );

  if (loading) {
    return (
      <TwoToneWrapper title="" showBack headerContent={headerContent}>
        <ActivityIndicator size="large" color={COLORS.vjAccent} style={{ marginTop: 40 }} />
      </TwoToneWrapper>
    );
  }

  if (!label) return null;

  return (
    <TwoToneWrapper title="" showBack headerContent={headerContent}>
      <View style={{ flex: 1, paddingTop: 16 }}>
        
        <Text style={{ fontSize: 13, fontWeight: '700', color: 'rgba(46,29,0,0.5)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginLeft: 4 }}>Live Tag Preview</Text>
        
        <GlassCard style={{ padding: 24, marginBottom: 24 }}>
          {/* Virtual "Dumbbell Tag" representation */}
          <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderRadius: 4, borderWidth: 1, borderColor: '#ddd', overflow: 'hidden' }}>
            
            {/* Front Side (Head) */}
            <View style={{ flex: 1, padding: 12, borderRightWidth: 1, borderRightColor: '#ccc', borderStyle: 'dashed', justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.vjText, marginBottom: 6 }}>
                {label.frontSide.purityDisplay} {label.frontSide.designName.toUpperCase()}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.vjText, marginBottom: 4 }}>
                Gr.Wt. : {label.frontSide.grossWeightDisplay.replace(' g', '')}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.vjText }}>
                Nt.Wt. : {label.frontSide.netWeightDisplay.replace(' g', '')}
              </Text>
            </View>

            {/* Back Side (Tail) */}
            <View style={{ flex: 1, padding: 12, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.vjText, marginBottom: 4 }}>{label.backSide.firmCode}</Text>
              
              {/* QR CODE PREVIEW */}
              <View style={{ marginBottom: 4, alignItems: 'center', justifyContent: 'center' }}>
                <QrCode size={36} color={COLORS.vjText} strokeWidth={1.5} />
              </View>

              <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.vjText, fontFamily: 'monospace' }}>{label.backSide.skuDisplay}</Text>
            </View>

          </View>
        </GlassCard>

        <View style={{ backgroundColor: 'rgba(46,29,0,0.04)', padding: 16, borderRadius: 12, marginBottom: 24, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <RefreshCcw size={20} color={COLORS.vjAccent} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, fontSize: 13, color: 'rgba(46,29,0,0.7)', lineHeight: 20 }}>
            Printing or saving this label will securely log a <Text style={{ fontWeight: '800' }}>BARCODE_REPRINTED</Text> event in the item's timeline to ensure audit traceability.
          </Text>
        </View>

        <View style={{ gap: 12 }}>
          <GlassButton 
            title={isProcessing ? 'Processing...' : 'Print Thermal Label'} 
            onPress={handlePrint} 
            disabled={isProcessing}
            icon={!isProcessing ? <Printer size={20} color="#fff" /> : undefined}
          />

          <TouchableOpacity 
            onPress={handleSaveToDevice}
            disabled={isProcessing}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 12, backgroundColor: 'rgba(184,115,51,0.1)' }}
          >
            <Share size={20} color={COLORS.vjAccent} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.vjAccent }}>Save / Share PDF Tag</Text>
          </TouchableOpacity>
        </View>

      </View>

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

import { StyleSheet } from 'react-native';
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
    color: 'rgba(46,29,0,0.6)',
    textAlign: 'center',
    marginBottom: 24,
  },
});