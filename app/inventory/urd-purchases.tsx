// app/inventory/urd-purchases.tsx
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Modal, ScrollView } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { GlassCard, GlassButton } from '../../components/ui/Glass';
import { useFirmStore } from '../../store/firmStore';
import { urdPurchaseRepository } from '../../repositories/urdPurchaseRepository';
import { firmRepository } from '../../repositories/firmRepository';
import { urdPurchaseService } from '../../services/urdPurchaseService';
import { amountToWords, getCurrencySymbol } from '../../utils/currency';
import { FileDown, Plus, Scale, Banknote, ShieldAlert, CheckCircle, Printer, Trash2, Eye, X, Share2 } from 'lucide-react-native';
import type { URDPurchase } from '../../types/phase2.types';
import type { Firm } from '../../types/firm';

const FlashListAny: any = FlashList;

const COLORS = {
  vjText: '#5C1623',
  vjBg: '#FCFBF8',
  vjAccent: '#D4AF37',
  gold: '#C8860A',
  silver: '#6B7280',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
};

const formatWeight = (mg: number) => (mg / 1000).toFixed(3) + ' g';
const formatCurrency = (paise: number) => getCurrencySymbol() + (paise / 100).toFixed(2);

export default function URDPurchasesScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  const [data, setData] = useState<URDPurchase[]>([]);
  const [firm, setFirm] = useState<Firm | null>(null);
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Document Preview Modal State
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [selectedUrd, setSelectedUrd] = useState<URDPurchase | null>(null);
  const [docType, setDocType] = useState<'BILL' | 'DECLARATION'>('BILL');

  const loadData = useCallback(async () => {
    if (!activeFirmId) return;
    setLoading(true);
    try {
      const results = await urdPurchaseRepository.findByFirmId(activeFirmId);
      setData(results);
      const firmData = await firmRepository.getById(activeFirmId);
      setFirm(firmData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activeFirmId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleConfirm = (id: string, name: string) => {
    Alert.alert(
      'Confirm Purchase',
      `Are you sure you want to finalize the purchase from ${name}? This will generate a permanent URD bill number.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'default',
          onPress: async () => {
            try {
              if (!activeFirmId) return;
              await urdPurchaseService.confirmURDPurchase(id, activeFirmId);
              setSuccessMessage('Purchase confirmed. Bill number generated.');
              loadData();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          }
        }
      ]
    );
  };

  const handlePreviewBill = async (item: URDPurchase) => {
    try {
      if (!activeFirmId) return;
      setSelectedUrd(item);
      setDocType('BILL');
      setPreviewTitle('URD Purchase Bill Preview');
      const html = await urdPurchaseService.generateURDPurchaseBill(item.id, activeFirmId);
      setPreviewHtml(html);
      setPreviewVisible(true);
    } catch (error: any) {
      Alert.alert('Preview Error', error.message);
    }
  };

  const handlePreviewDeclaration = async (item: URDPurchase) => {
    try {
      if (!activeFirmId) return;
      setSelectedUrd(item);
      setDocType('DECLARATION');
      setPreviewTitle('घोषणापत्र / शपथपत्र Preview');
      const html = await urdPurchaseService.generateURDCustomerDeclaration(item.id, activeFirmId);
      setPreviewHtml(html);
      setPreviewVisible(true);
    } catch (error: any) {
      Alert.alert('Preview Error', error.message);
    }
  };

  const handlePrintFromPreview = async () => {
    if (!previewHtml) return;
    try {
      await Print.printAsync({ html: previewHtml });
    } catch (error: any) {
      Alert.alert('Print Error', error.message);
    }
  };

  const handleShareFromPreview = async () => {
    if (!previewHtml) return;
    try {
      const { uri } = await Print.printToFileAsync({ html: previewHtml });
      await Sharing.shareAsync(uri);
    } catch (error: any) {
      Alert.alert('Share Error', error.message);
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      'Delete Entry',
      `Are you sure you want to delete draft purchase from ${name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!activeFirmId) return;
              await urdPurchaseService.deleteURDPurchase(id, activeFirmId);
              loadData();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: URDPurchase }) => {
    const isConfirmed = item.status === 'CONFIRMED';
    const metalColor = item.metalType === 'GOLD' ? COLORS.gold : COLORS.silver;

    return (
      <GlassCard style={s.card}>
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.customerName} numberOfLines={1}>{item.customerName}</Text>
            {isConfirmed ? (
              <Text style={s.billNumber}>{item.urdNumber}</Text>
            ) : (
              <Text style={s.draftDate}>Draft — {item.purchaseDate}</Text>
            )}
          </View>

          <View style={[s.statusBadge, { backgroundColor: isConfirmed ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)' }]}>
            {isConfirmed ? <CheckCircle size={12} color={COLORS.success} /> : <ShieldAlert size={12} color={COLORS.warning} />}
            <Text style={[s.statusText, { color: isConfirmed ? COLORS.success : COLORS.warning }]}>
              {item.status}
            </Text>
          </View>
        </View>

        <View style={s.cardMiddle}>
          <View style={s.detailCol}>
            <View style={s.iconRow}><Scale size={14} color="rgba(92,22,35,0.4)" /><Text style={s.detailLabel}>Net Fine</Text></View>
            <Text style={s.detailValue}>{formatWeight(item.fineWeightMg)}</Text>
          </View>
          <View style={s.detailCol}>
            <View style={s.iconRow}><Banknote size={14} color="rgba(92,22,35,0.4)" /><Text style={s.detailLabel}>Total Payout</Text></View>
            <Text style={s.detailValue}>{formatCurrency(item.totalValuePaise)}</Text>
          </View>
          <View style={s.detailCol}>
            <View style={[s.metalPill, { borderColor: metalColor }]}><Text style={[s.metalPillText, { color: metalColor }]}>{item.metalType}</Text></View>
          </View>
        </View>

        <View style={s.cardActions}>
          <View style={s.actionRowMain}>
            {isConfirmed ? (
              <TouchableOpacity style={s.printBillBtn} onPress={() => handlePreviewBill(item)}>
                <Eye size={15} color="#5C1623" />
                <Text style={s.printBillBtnText}>Preview & Print Bill</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.confirmBtn} onPress={() => handleConfirm(item.id, item.customerName)}>
                <CheckCircle size={15} color="#fff" />
                <Text style={s.confirmBtnText}>Confirm & Generate Bill</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={s.actionRowSub}>
            <TouchableOpacity style={s.declarationBtn} onPress={() => handlePreviewDeclaration(item)}>
              <Eye size={14} color="#C8860A" />
              <Text style={s.declarationBtnText}>Preview शपथपत्र (Declaration)</Text>
            </TouchableOpacity>

            {!isConfirmed && (
              <TouchableOpacity style={s.deleteBtn} onPress={() => handleDelete(item.id, item.customerName)}>
                <Trash2 size={14} color={COLORS.danger} />
                <Text style={s.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </GlassCard>
    );
  };

  const headerContent = (
    <View>
      <View style={s.headerIconRow}>
        <View style={s.headerIconCircle}><FileDown size={28} color={COLORS.vjBg} /></View>
      </View>
      <Text style={s.headerTitle}>URD Purchases</Text>
      <Text style={s.headerSubtitle}>Customer Old Gold Receipts & शपथपत्र</Text>
    </View>
  );

  const firmTitleDisplay = firm?.name || 'रुपेश ज्वेलर्स';
  const firmAddressDisplay = (firm?.addressLine1 ? `${firm.addressLine1}, ${firm.city || ''}` : 'सराफ लाईन, कळंब, जि. धाराशिव');
  const firmPhoneDisplay = firm?.phone1 || '9999999999';

  return (
    <TwoToneWrapper title="" showBack headerContent={headerContent}>
      <View style={s.listContainer}>
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.vjAccent} style={{ marginTop: 40 }} />
        ) : (
          <FlashListAny
            data={data}
            renderItem={renderItem}
            estimatedItemSize={180}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <FileDown size={48} color="rgba(92,22,35,0.2)" />
                <Text style={s.emptyTitle}>No URD Purchases Yet</Text>
                <Text style={s.emptySubtitle}>Tap + to record an unrefined gold/silver purchase.</Text>
              </View>
            }
          />
        )}
      </View>

      {/* FAB */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => router.push('/inventory/add-urd')}
        activeOpacity={0.85}
      >
        <Plus size={28} color="#ffffff" />
      </TouchableOpacity>

      {/* Success Modal */}
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
                onPress={() => setSuccessMessage(null)} 
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* DOCUMENT PREVIEW MODAL */}
      <Modal visible={previewVisible} animationType="slide" onRequestClose={() => setPreviewVisible(false)}>
        <View style={s.previewModalContainer}>
          <View style={s.previewHeader}>
            <Text style={s.previewHeaderTitle} numberOfLines={1}>{previewTitle}</Text>
            <TouchableOpacity onPress={() => setPreviewVisible(false)} style={s.closeIconBtn}>
              <X size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView style={s.previewBody} contentContainerStyle={s.previewContent}>
            {selectedUrd && docType === 'BILL' && (
              <View style={s.billPreviewPaper}>
                {/* MAROON BANNER HEADER */}
                <View style={s.billMaroonHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 8, color: '#fff' }}>Subject to {firm?.city || 'Local'} Jurisdiction</Text>
                    <Text style={{ fontSize: 8, color: '#fff' }}>GSTIN {firm?.gstin || 'Unregistered'}</Text>
                  </View>
                  <View style={{ flex: 2, alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, color: '#F7D273', fontWeight: 'bold' }}>URD PURCHASE BILL</Text>
                    <Text style={{ fontSize: 18, color: '#fff', fontWeight: 'bold' }}>{firmTitleDisplay}</Text>
                    <Text style={{ fontSize: 8, color: '#fff' }}>{firmAddressDisplay}</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 8, color: '#fff' }}>प्रोप्रा. {firm?.proprietor || firmTitleDisplay}</Text>
                    <Text style={{ fontSize: 8, color: '#fff' }}>Mo. {firmPhoneDisplay}</Text>
                    <Text style={{ fontSize: 8, color: '#fff', fontWeight: 'bold', marginTop: 2 }}>1/1</Text>
                  </View>
                </View>

                {/* CUSTOMER & VOUCHER DETAILS */}
                <View style={s.billCustGrid}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.billCustRow}><Text style={{ fontWeight: 'bold' }}>Name: </Text>{selectedUrd.customerName}</Text>
                    <Text style={s.billCustRow}><Text style={{ fontWeight: 'bold' }}>Address: </Text>{selectedUrd.customerAddress || '-'}</Text>
                    <Text style={s.billCustRow}><Text style={{ fontWeight: 'bold' }}>Mob: </Text>{selectedUrd.customerMobile || '-'}</Text>
                    {selectedUrd.customerAadhaar && <Text style={s.billCustRow}><Text style={{ fontWeight: 'bold' }}>Aadhaar: </Text>XXXX-XXXX-{selectedUrd.customerAadhaar.slice(-4)}</Text>}
                    {selectedUrd.customerPAN && <Text style={s.billCustRow}><Text style={{ fontWeight: 'bold' }}>PAN: </Text>{selectedUrd.customerPAN}</Text>}
                  </View>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={s.billCustRow}><Text style={{ fontWeight: 'bold' }}>Date: </Text>{selectedUrd.purchaseDate}</Text>
                    <Text style={s.billCustRow}><Text style={{ fontWeight: 'bold' }}>Voucher No: </Text>{selectedUrd.urdNumber || 'DRAFT'}</Text>
                    <Text style={s.billCustRow}><Text style={{ fontWeight: 'bold' }}>GSTIN: </Text>{selectedUrd.customerPAN || '-'}</Text>
                  </View>
                </View>

                {/* TABLE OF ITEMS */}
                <View style={s.billTable}>
                  <View style={s.billTableHead}>
                    <Text style={[s.billTh, { flex: 1, textAlign: 'center' }]}>#</Text>
                    <Text style={[s.billTh, { flex: 4, textAlign: 'center' }]}>Description</Text>
                    <Text style={[s.billTh, { flex: 2, textAlign: 'center' }]}>HSN</Text>
                    <Text style={[s.billTh, { flex: 2, textAlign: 'center' }]}>HUID</Text>
                    <Text style={[s.billTh, { flex: 2, textAlign: 'center' }]}>Net Wt</Text>
                    <Text style={[s.billTh, { flex: 2, textAlign: 'center' }]}>Rate</Text>
                    <Text style={[s.billTh, { flex: 2, textAlign: 'center' }]}>Purity</Text>
                    <Text style={[s.billTh, { flex: 3, textAlign: 'center' }]}>Amount</Text>
                  </View>
                  <View style={s.billTableRow}>
                    <Text style={[s.billTd, { flex: 1, textAlign: 'center' }]}>1</Text>
                    <Text style={[s.billTd, { flex: 4, textAlign: 'left', fontWeight: 'bold' }]}>OLD {selectedUrd.metalType} ORNAMENT ({selectedUrd.purityPercent}%)</Text>
                    <Text style={[s.billTd, { flex: 2, textAlign: 'center' }]}>7113</Text>
                    <Text style={[s.billTd, { flex: 2, textAlign: 'center' }]}>-</Text>
                    <Text style={[s.billTd, { flex: 2, textAlign: 'center' }]}>{formatWeight(selectedUrd.grossWeightMg)}</Text>
                    <Text style={[s.billTd, { flex: 2, textAlign: 'center' }]}>{formatCurrency(selectedUrd.ratePerGramPaise)}</Text>
                    <Text style={[s.billTd, { flex: 2, textAlign: 'center' }]}>{selectedUrd.purityPercent}%</Text>
                    <Text style={[s.billTd, { flex: 3, textAlign: 'center', fontWeight: 'bold' }]}>{formatCurrency(selectedUrd.totalValuePaise)}</Text>
                  </View>
                  {[2, 3, 4].map((i) => (
                    <View key={i} style={s.billTableRow}>
                      <Text style={[s.billTd, { flex: 1, textAlign: 'center' }]}>{i}</Text>
                      <Text style={[s.billTd, { flex: 4 }]}></Text>
                      <Text style={[s.billTd, { flex: 2 }]}></Text>
                      <Text style={[s.billTd, { flex: 2 }]}></Text>
                      <Text style={[s.billTd, { flex: 2 }]}></Text>
                      <Text style={[s.billTd, { flex: 2 }]}></Text>
                      <Text style={[s.billTd, { flex: 2 }]}></Text>
                      <Text style={[s.billTd, { flex: 3 }]}></Text>
                    </View>
                  ))}
                </View>

                {/* SUMMARY & TOTALS */}
                <View style={s.billSummaryGrid}>
                  <View style={s.billPayCol}>
                    <View style={s.billPayRow}><Text style={{ fontWeight: 'bold' }}>PAYMENT MODE</Text><Text style={{ fontWeight: 'bold' }}>{selectedUrd.paymentMode}</Text></View>
                    <View style={s.billPayRow}><Text style={{ fontWeight: 'bold' }}>AMOUNT PAID</Text><Text style={{ fontWeight: 'bold' }}>{formatCurrency(selectedUrd.totalValuePaise)}</Text></View>
                    <View style={{ marginTop: 6 }}><Text style={{ fontSize: 10, fontWeight: 'bold' }}>Amt In Words: <Text style={{ fontWeight: 'normal' }}>{amountToWords(selectedUrd.totalValuePaise)}</Text></Text></View>
                  </View>
                  <View style={s.billTotalsCol}>
                    <View style={s.billTotalRow}><Text style={{ fontWeight: 'bold' }}>NET TOTAL</Text><Text style={{ fontWeight: 'bold' }}>{formatCurrency(selectedUrd.totalValuePaise)}</Text></View>
                    <View style={s.billTotalRow}><Text style={{ fontWeight: 'bold' }}>GRAND TOTAL</Text><Text style={{ fontWeight: 'bold' }}>{formatCurrency(selectedUrd.totalValuePaise)}</Text></View>
                  </View>
                </View>

                {/* SIGNATURES */}
                <View style={s.billFooterRow}>
                  <Text style={{ fontWeight: 'bold', fontSize: 11 }}>Customer Signature</Text>
                  <Text style={{ fontWeight: 'bold', fontSize: 11, color: COLORS.vjText }}>! Thank You !</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 10 }}>तर्फे : {firmTitleDisplay}</Text>
                    <Text style={{ fontWeight: 'bold', fontSize: 11 }}>Authorised Signatory</Text>
                  </View>
                </View>
              </View>
            )}

            {selectedUrd && docType === 'DECLARATION' && (
              <View style={s.declPreviewPaper}>
                {/* PAGE 1 HEADER */}
                <View style={s.declOuterBox}>
                  <View style={s.declFirmBox}>
                    <Text style={s.declFirmTitle}>{firmTitleDisplay}</Text>
                    <Text style={s.declFirmSub}>{firmAddressDisplay} | मो. {firmPhoneDisplay}</Text>
                  </View>

                  <View style={s.declMetaRow}>
                    <Text style={{ fontWeight: 'bold' }}>अनु.क्र. : {selectedUrd.urdNumber || 'DRAFT'}</Text>
                    <Text style={{ fontWeight: 'bold' }}>दिनांक : {selectedUrd.purchaseDate}</Text>
                  </View>

                  <View style={{ alignItems: 'center', marginVertical: 8 }}>
                    <Text style={{ fontSize: 12 }}>जुने किंवा वापरलेल्या दागिन्यांच्या मालकीबाबत...</Text>
                    <Text style={{ fontSize: 20, fontWeight: 'bold', marginVertical: 2 }}>घोषणापत्र / शपथपत्र</Text>
                    <Text style={{ fontSize: 14, fontWeight: 'bold' }}>भाग - १</Text>
                    <Text style={{ fontSize: 11, color: '#666' }}>(खालील नियम वाचून ग्राहकांनी भरवायची माहिती)</Text>
                  </View>

                  {/* 3 MARATHI CLAUSES */}
                  <View style={{ gap: 8, marginVertical: 8 }}>
                    <Text style={s.declClauseText}>
                      १) मी या घोषणापत्र/शपथपत्राद्वारे प्रमाणित करतो की, खाली नमूद केलेल्या वर्णनाचे दागिने माझ्या स्वतःच्या / कुटुंबातील व्यक्ती (नांव: <Text style={{ fontWeight: 'bold' }}>{selectedUrd.customerName}</Text> ) पूर्ण मालकीचे आहेत. सदर वर्णनाचे दागिने मी/कुटुंबातील व्यक्तीने कायदेशीररित्या मिळवले असून मालकी हक्काबाबत भविष्यात काही कायदेशीर कारवाई झाली तर त्याला सर्वस्वी मी व माझे कुटुंब जबाबदार असेल.
                    </Text>
                    <Text style={s.declClauseText}>
                      २) खाली नमूद सर्व दागिने माझ्या स्वतःच्या तसेच कुटुंबातील सर्वांच्या संमतीने तुम्हास विकत आहे. त्याबाबत कोणतीही तक्रार मी व माझ्या कुटुंबाकडून येणार नाही.
                    </Text>
                    <Text style={s.declClauseText}>
                      ३) भविष्यामध्ये मी विकत असलेल्या खालील दागिन्यांमुळे सदर ज्वेलर्सवरती कोणत्याही प्रकारची कायदेशीर कारवाई झाली आणि आर्थिक नुकसान झाले तर नुकसान भरपाईसाठी सर्वस्वी मी व माझे कुटुंब जबाबदार असेल.
                    </Text>
                  </View>

                  {/* FORM FIELDS */}
                  <View style={{ gap: 6, marginVertical: 8 }}>
                    <Text style={s.declFieldRow}><Text style={{ fontWeight: 'bold' }}>ग्राहकाचे नांव : </Text>{selectedUrd.customerName}</Text>
                    <Text style={s.declFieldRow}><Text style={{ fontWeight: 'bold' }}>पत्ता : </Text>{selectedUrd.customerAddress || 'माहिती उपलब्ध नाही'}</Text>
                    <Text style={s.declFieldRow}><Text style={{ fontWeight: 'bold' }}>मोबाईल नंबर : </Text>{selectedUrd.customerMobile || 'माहिती उपलब्ध नाही'}</Text>
                    <Text style={s.declFieldRow}><Text style={{ fontWeight: 'bold' }}>ओळखपत्र पुरावा : </Text>{selectedUrd.customerAadhaar ? 'आधार कार्ड (' + selectedUrd.customerAadhaar + ')' : (selectedUrd.customerPAN ? 'पॅन कार्ड (' + selectedUrd.customerPAN + ')' : 'पॅन / आधार कार्ड')}</Text>
                    <Text style={s.declFieldRow}><Text style={{ fontWeight: 'bold' }}>दागिना पावती तपशील : </Text>URD खरेदी पावती क्र. {selectedUrd.urdNumber || 'DRAFT'}</Text>
                    <Text style={s.declFieldRow}><Text style={{ fontWeight: 'bold' }}>पावती नसल्याचे कारण : </Text>जुने कौटुंबिक वारसा दागिने</Text>
                  </View>

                  {/* TABLE OF ORNAMENTS */}
                  <Text style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 13, marginTop: 8 }}>✽ दागिन्यांचे वर्णन ✽</Text>
                  <View style={s.declTable}>
                    <View style={s.declTableHead}>
                      <Text style={[s.declTh, { flex: 1, textAlign: 'center' }]}>अ.क्र.</Text>
                      <Text style={[s.declTh, { flex: 4, textAlign: 'center' }]}>दागिन्यांचे वर्णन</Text>
                      <Text style={[s.declTh, { flex: 2, textAlign: 'center' }]}>ग्रॅम</Text>
                    </View>
                    <View style={s.declTableRow}>
                      <Text style={[s.declTd, { flex: 1, textAlign: 'center' }]}>१</Text>
                      <Text style={[s.declTd, { flex: 4, textAlign: 'left' }]}>जुने {selectedUrd.metalType === 'GOLD' ? 'सोने' : 'चांदी'} दागिने ({selectedUrd.purityPercent}% शुद्धता)</Text>
                      <Text style={[s.declTd, { flex: 2, textAlign: 'center' }]}>{formatWeight(selectedUrd.grossWeightMg)}</Text>
                    </View>
                  </View>

                  {/* PAGE 1 FOOTER */}
                  <View style={s.declSigRow}>
                    <View><Text style={{ fontWeight: 'bold', fontSize: 12 }}>साक्षीदार : १) ____________________</Text><Text style={{ fontWeight: 'bold', fontSize: 12, marginTop: 4 }}>           २) ____________________</Text></View>
                    <View><Text style={{ fontWeight: 'bold', fontSize: 12 }}>ग्राहकाची सही</Text></View>
                  </View>

                  <View style={{ height: 2, backgroundColor: '#8B2538', marginVertical: 20 }} />

                  {/* PAGE 2 HEADER (भाग - २) */}
                  <View style={{ alignItems: 'center', marginBottom: 12 }}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold' }}>भाग - २</Text>
                    <Text style={{ fontSize: 12, color: '#666' }}>(ज्वेलर्सच्या वतीने भरावयाची माहिती)</Text>
                  </View>

                  <Text style={{ fontWeight: 'bold', marginBottom: 8, fontSize: 12 }}>जुने दागिने खरेदी पावती क्रमांक : {selectedUrd.urdNumber || 'DRAFT'} (दिनांक : {selectedUrd.purchaseDate})</Text>

                  {/* PAGE 2 TABLE */}
                  <View style={s.declTable}>
                    <View style={s.declTableHead}>
                      <Text style={[s.declTh, { flex: 1, textAlign: 'center' }]}>अ.क्र.</Text>
                      <Text style={[s.declTh, { flex: 4, textAlign: 'center' }]}>वर्णन</Text>
                      <Text style={[s.declTh, { flex: 2, textAlign: 'center' }]}>ढोबळ (g)</Text>
                      <Text style={[s.declTh, { flex: 2, textAlign: 'center' }]}>निव्वळ (g)</Text>
                      <Text style={[s.declTh, { flex: 2, textAlign: 'center' }]}>किंमत</Text>
                    </View>
                    <View style={s.declTableRow}>
                      <Text style={[s.declTd, { flex: 1, textAlign: 'center' }]}>१</Text>
                      <Text style={[s.declTd, { flex: 4, textAlign: 'left' }]}>जुने {selectedUrd.metalType === 'GOLD' ? 'सोने' : 'चांदी'} ({selectedUrd.purityPercent}%)</Text>
                      <Text style={[s.declTd, { flex: 2, textAlign: 'center' }]}>{formatWeight(selectedUrd.grossWeightMg)}</Text>
                      <Text style={[s.declTd, { flex: 2, textAlign: 'center' }]}>{formatWeight(selectedUrd.fineWeightMg)}</Text>
                      <Text style={[s.declTd, { flex: 2, textAlign: 'center' }]}>{formatCurrency(selectedUrd.totalValuePaise)}</Text>
                    </View>
                    <View style={s.declTableRow}>
                      <Text style={[s.declTd, { flex: 5, fontWeight: 'bold' }]}>एकूण खरेदी किंमत</Text>
                      <Text style={[s.declTd, { flex: 6, fontWeight: 'bold' }]}>{formatCurrency(selectedUrd.totalValuePaise)}</Text>
                    </View>
                  </View>

                  <View style={{ marginVertical: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: 'bold' }}>* टीप :</Text>
                    <Text style={{ fontSize: 11, color: '#444' }}>१) दागिन्यांची किंमत हजर बाजारभावच्या सोन्याच्या किंमतीवर आधारित आहे.</Text>
                    <Text style={{ fontSize: 11, color: '#444' }}>२) तूटीची टक्केवारी वजा केल्यावर खरेदी किंमत काढली जाते.</Text>
                  </View>

                  <View style={{ backgroundColor: 'rgba(212,175,55,0.1)', padding: 10, borderRadius: 8, marginVertical: 10, borderWidth: 1, borderColor: 'rgba(212,175,55,0.3)' }}>
                    <Text style={{ fontWeight: 'bold', fontSize: 12, textAlign: 'center', marginBottom: 4 }}>ग्राहकाकडून दागिन्यांच्या केलेल्या व्हॅल्युएशनबाबत घोषणापत्र / शपथपत्र</Text>
                    <Text style={{ fontSize: 11, textAlign: 'center', color: '#444' }}>
                      भाग-२ मध्ये केलेल्या आमच्या सर्व दागिन्यांचे व्हॅल्युएशन आम्हाला मान्य असून त्याबाबत कोणतीही तक्रार नाही. व्यवहारानुसार आम्हाला आमच्या दागिन्यांची पूर्ण रक्कम मिळाली आहे आणि ती आम्हाला मान्य आहे.
                    </Text>
                  </View>

                  <View style={s.declSigRow}>
                    <View><Text style={{ fontWeight: 'bold', fontSize: 12 }}>साक्षीदार : १) ____________________</Text><Text style={{ fontWeight: 'bold', fontSize: 12, marginTop: 4 }}>           २) ____________________</Text></View>
                    <View><Text style={{ fontWeight: 'bold', fontSize: 12 }}>ग्राहकाची सही</Text></View>
                  </View>

                </View>
              </View>
            )}
          </ScrollView>

          <View style={s.previewFooter}>
            <TouchableOpacity style={s.previewShareBtn} onPress={handleShareFromPreview}>
              <Share2 size={16} color={COLORS.vjText} />
              <Text style={s.previewShareBtnText}>Share PDF</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.previewPrintBtn} onPress={handlePrintFromPreview}>
              <Printer size={16} color="#fff" />
              <Text style={s.previewPrintBtnText}>Print Full Document</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  listContainer: { flex: 1 },
  headerIconRow: { marginBottom: 12 },
  headerIconCircle: { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  headerTitle: { color: COLORS.vjBg, fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  headerSubtitle: { color: 'rgba(252,251,248,0.55)', fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyTitle: { color: 'rgba(92,22,35,0.5)', fontSize: 18, fontWeight: '700' },
  emptySubtitle: { color: 'rgba(92,22,35,0.35)', fontSize: 13 },
  fab: { position: 'absolute', bottom: 40, right: 24, width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.vjAccent, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 8 },
  
  card: { padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  customerName: { fontSize: 16, fontWeight: '800', color: COLORS.vjText, maxWidth: 250, marginBottom: 2 },
  billNumber: { fontSize: 13, fontWeight: '700', color: COLORS.vjAccent, fontFamily: 'monospace' },
  draftDate: { fontSize: 12, color: 'rgba(92,22,35,0.5)' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  
  cardMiddle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(92,22,35,0.03)', padding: 12, borderRadius: 12, marginBottom: 12 },
  detailCol: { gap: 4 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailLabel: { fontSize: 11, color: 'rgba(92,22,35,0.5)', fontWeight: '600', textTransform: 'uppercase' },
  detailValue: { fontSize: 14, fontWeight: '700', color: COLORS.vjText },
  metalPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  metalPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  cardActions: { borderTopWidth: 1, borderTopColor: 'rgba(92,22,35,0.06)', paddingTop: 12, gap: 10 },
  actionRowMain: { flexDirection: 'row' },
  actionRowSub: { flexDirection: 'row', gap: 10 },
  printBillBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(212,175,55,0.18)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.35)' },
  printBillBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.vjText },
  confirmBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.success },
  confirmBtnText: { fontSize: 13, fontWeight: '800', color: '#ffffff' },
  declarationBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(200,134,10,0.12)', borderWidth: 1, borderColor: 'rgba(200,134,10,0.3)' },
  declarationBtnText: { fontSize: 12, fontWeight: '800', color: '#C8860A' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' },
  deleteBtnText: { fontSize: 12, fontWeight: '800', color: COLORS.danger },
  
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  successModalContent: { backgroundColor: COLORS.vjBg, alignSelf: 'stretch', maxWidth: 400, borderRadius: 24, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 10 },
  successIconContainer: { marginBottom: 16, backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: 16, borderRadius: 50 },
  successTitle: { fontSize: 24, fontWeight: '800', color: COLORS.vjText, marginBottom: 8 },
  successSubtitle: { fontSize: 14, color: 'rgba(92,22,35,0.6)', textAlign: 'center', marginBottom: 24 },

  previewModalContainer: { flex: 1, backgroundColor: '#FCFBF8' },
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#8B2538', paddingHorizontal: 16, paddingTop: 48, paddingBottom: 16 },
  previewHeaderTitle: { color: '#FCFBF8', fontSize: 16, fontWeight: '700', flex: 1, marginRight: 16 },
  closeIconBtn: { padding: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)' },
  previewBody: { flex: 1, padding: 16 },
  previewContent: { paddingBottom: 40 },
  previewFooter: { flexDirection: 'row', gap: 12, backgroundColor: '#FCFBF8', padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.1)' },
  previewShareBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, backgroundColor: 'rgba(92,22,35,0.08)' },
  previewShareBtnText: { color: '#5C1623', fontWeight: '700', fontSize: 14 },
  previewPrintBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, backgroundColor: '#D4AF37' },
  previewPrintBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 14 },

  billPreviewPaper: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1.5, borderColor: '#000000', overflow: 'hidden', marginBottom: 20 },
  billMaroonHeader: { backgroundColor: '#8B2538', padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  billCustGrid: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#000000', flexDirection: 'row', justifyContent: 'space-between' },
  billCustRow: { fontSize: 12, color: '#000000', marginBottom: 3 },
  billTable: {},
  billTableHead: { flexDirection: 'row', backgroundColor: '#E5E7EB', borderBottomWidth: 1, borderBottomColor: '#000000' },
  billTh: { paddingVertical: 6, paddingHorizontal: 4, fontSize: 11, fontWeight: 'bold', color: '#000000', borderRightWidth: 1, borderRightColor: '#000000' },
  billTableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', minHeight: 24 },
  billTd: { paddingVertical: 4, paddingHorizontal: 4, fontSize: 11, color: '#000000', borderRightWidth: 1, borderRightColor: '#000000' },
  billSummaryGrid: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#000000' },
  billPayCol: { flex: 1, borderRightWidth: 1, borderRightColor: '#000000', padding: 8 },
  billPayRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  billTotalsCol: { flex: 1, padding: 8 },
  billTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  billFooterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderTopWidth: 1, borderTopColor: '#000000', backgroundColor: '#FAFAFA' },

  declPreviewPaper: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1.5, borderColor: '#000000', padding: 14, marginBottom: 20 },
  declOuterBox: { gap: 8 },
  declFirmBox: { borderWidth: 1.5, borderColor: '#000000', borderRadius: 8, padding: 8, alignItems: 'center', backgroundColor: '#FAFAFA' },
  declFirmTitle: { fontSize: 20, fontWeight: 'bold', color: '#8B2538' },
  declFirmSub: { fontSize: 11, color: '#333333', marginTop: 2 },
  declMetaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  declClauseText: { fontSize: 12, color: '#111111', lineHeight: 18 },
  declFieldRow: { fontSize: 12, color: '#000000', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingBottom: 4 },
  declTable: { borderWidth: 1, borderColor: '#000000', borderRadius: 6, overflow: 'hidden', marginVertical: 6 },
  declTableHead: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderBottomWidth: 1, borderBottomColor: '#000000' },
  declTh: { padding: 6, fontSize: 11, fontWeight: 'bold', color: '#000000', borderRightWidth: 1, borderRightColor: '#000000' },
  declTableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  declTd: { padding: 6, fontSize: 11, color: '#000000', borderRightWidth: 1, borderRightColor: '#000000' },
  declSigRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
}) as any;