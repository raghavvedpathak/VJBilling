// app/billing/sale.tsx — Phase 3 Canonical Sale Screen (v4.0, v5.15, v5.21, v5.35)
// Section Order (LOCKED): Customer → Items → Old Metal → Summary → Payments
// Scroll-friendly, inline warnings only, manual rate explicit opt-in, preview gate before save

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  User,
  ShoppingBag,
  Coins,
  Receipt,
  CreditCard,
  Trash2,
  Edit3,
  Check,
  X,
  AlertCircle,
  Eye,
  ArrowLeft,
  Sparkles,
} from 'lucide-react-native';

import { useSession } from '@/hooks/useSession';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { CustomerSearchPickerModal } from '@/components/phase3/CustomerSearchPickerModal';
import { ItemSearchSection } from '@/components/phase3/ItemSearchSection';
import { LooseStockEntrySection, LooseStockEntryPayload } from '@/components/phase3/LooseStockEntrySection';
import { InvoiceGstSection } from '@/components/phase3/InvoiceGstSection';
import { InvoicePreviewModal } from '@/components/phase3/InvoicePreviewModal';

import { draftInvoiceService } from '@/services/phase3/draftInvoiceService';
import { invoicePostService } from '@/services/phase3/invoicePostService';
import { rateEngineService } from '@/services/phase3/rateEngineService';
import { accountingTruthService } from '@/services/phase3/accountingTruthService';
import { customerService } from '@/services/phase3/customerService';
import { taxMasterService } from '@/services/phase3/taxMasterService';
import { formatPaiseToRupees, rupeesToPaise, getCurrencySymbol } from '@/utils/currency';
import { resolveFineWeightMg } from '@/utils/purity.constants';

import type {
  Customer,
  SaleInvoiceWithItems,
  SaleInvoiceItem,
  InvoiceCalculation,
} from '@/types/phase3/phase3.types';
import type { ItemSearchResult } from '@/types/phase2/phase2.types';
import { COLORS } from '@/constants/theme';

export default function SaleScreen() {
  const router = useRouter();
  const currencySymbol = getCurrencySymbol();
  const { firm, activeFY, isLoading: sessionLoading } = useSession();

  // Active Draft state
  const [draft, setDraft] = useState<SaleInvoiceWithItems | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Section 1: Customer
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerPickerVisible, setCustomerPickerVisible] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);

  // Section 2: Items & Rates
  const [dailyRatePaise, setDailyRatePaise] = useState<number>(720000);
  const [activeRatePaise, setActiveRatePaise] = useState<number>(720000);
  const [isManualRate, setIsManualRate] = useState<number>(0);
  const [isEditingRate, setIsEditingRate] = useState<boolean>(false);
  const [manualRateInputRupees, setManualRateInputRupees] = useState<string>('');
  const [rateError, setRateError] = useState<string | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);

  // GST Groups
  const [metalTaxGroupId, setMetalTaxGroupId] = useState<string>('');
  const [makingTaxGroupId, setMakingTaxGroupId] = useState<string>('');

  // Section 3: Old Metal (v5.1, v5.46)
  const [oldMetalMetal, setOldMetalMetal] = useState<'GOLD' | 'SILVER'>('GOLD');
  const [oldMetalGramsText, setOldMetalGramsText] = useState<string>('');
  const [oldMetalPurityText, setOldMetalPurityText] = useState<string>('91.6');
  const [oldMetalFineGrams, setOldMetalFineGrams] = useState<number>(0);
  const [oldMetalBhavText, setOldMetalBhavText] = useState<string>('');
  const [oldMetalNotes, setOldMetalNotes] = useState<string>('');
  const [oldMetalDeductionPaise, setOldMetalDeductionPaise] = useState<number>(0);

  // Section 4: Summary / Discount
  const [discountRupeesText, setDiscountRupeesText] = useState<string>('');

  // Section 5: Payments & Excess Settlement (Step 12 — FIX-OLD-GOLD-UI-1 v5.15)
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'MIXED'>('CASH');
  const [amountPaidRupeesText, setAmountPaidRupeesText] = useState<string>('');
  const [excessChoice, setExcessChoice] = useState<'PAY_NOW' | 'PAY_LATER'>('PAY_LATER');
  const [excessPaymentMode, setExcessPaymentMode] = useState<'CASH' | 'BANK' | 'UPI'>('CASH');
  const [excessBankAccountId, setExcessBankAccountId] = useState<string>('');

  // Preview Gate state
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewCalc, setPreviewCalc] = useState<InvoiceCalculation | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [postSuccessMessage, setPostSuccessMessage] = useState<string | null>(null);

  // 1. Initial Draft Creation
  useEffect(() => {
    async function initDraft() {
      if (!firm?.id || !activeFY?.id) return;
      setIsInitializing(true);
      try {
        const rates = await rateEngineService.getCurrentRates(firm.id);
        const defaultRate = rates?.gold24BasePerGramPaise || rates?.gold22BasePerGramPaise || 720000;
        setDailyRatePaise(defaultRate);
        setActiveRatePaise(defaultRate);
        setManualRateInputRupees((defaultRate / 100).toFixed(0));

        // Create initial draft
        const newDraft = await draftInvoiceService.createDraft({
          firmId: firm.id,
          fyId: activeFY.id,
          customerId: 'temp-walkin', // updated when customer chosen
          metalRatePaisePerGram: defaultRate,
          isManualRate: 0,
        });

        const fullDraft = await draftInvoiceService.getDraft(newDraft.id);
        setDraft(fullDraft);
      } catch (err: any) {
        console.error('Failed to init draft:', err);
      } finally {
        setIsInitializing(false);
      }
    }

    if (firm?.id && activeFY?.id) {
      initDraft();
    }
  }, [firm?.id, activeFY?.id]);

  // Recalculate Old Metal Deduction & Fine Weight (v5.1 / v5.46)
  useEffect(() => {
    const grams = parseFloat(oldMetalGramsText.trim()) || 0;
    const purity = parseFloat(oldMetalPurityText.trim()) || 0;
    const bhavRupees = parseFloat(oldMetalBhavText.trim()) || 0;
    if (grams > 0 && purity > 0) {
      const grossWeightMg = Math.round(grams * 1000);
      const { fineWeightMg } = resolveFineWeightMg(grossWeightMg, purity, oldMetalMetal);
      setOldMetalFineGrams(fineWeightMg / 1000);
      if (bhavRupees > 0) {
        const bhavPaise = Math.round(bhavRupees * 100);
        const deduction = Math.round((fineWeightMg / 1000) * bhavPaise);
        setOldMetalDeductionPaise(deduction);
      } else {
        setOldMetalDeductionPaise(0);
      }
    } else {
      setOldMetalFineGrams(0);
      setOldMetalDeductionPaise(0);
    }
  }, [oldMetalGramsText, oldMetalPurityText, oldMetalMetal, oldMetalBhavText]);

  // Sync details into draft whenever discount or old metal changes
  useEffect(() => {
    if (!draft?.id) return;
    const discountPaise = discountRupeesText ? (rupeesToPaise(parseFloat(discountRupeesText)) ?? 0) : 0;
    draftInvoiceService.updateDraftDetails(draft.id, {
      discountPaise,
      oldMetalDeductionPaise,
      oldMetalNotes: oldMetalNotes || undefined,
      customerId: selectedCustomer?.id || undefined,
    }).then(() => {
      draftInvoiceService.getDraft(draft.id).then(setDraft);
    });
  }, [discountRupeesText, oldMetalDeductionPaise, oldMetalNotes, selectedCustomer?.id, draft?.id]);

  // Handle Manual Rate Override Confirmation (LOCKED UX PRINCIPLE)
  const handleStartRateOverride = () => {
    Alert.alert(
      'Override Daily Rate?',
      'You are entering a custom rate. This will override the daily rate. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Override Rate',
          style: 'destructive',
          onPress: () => {
            setIsEditingRate(true);
            setRateError(null);
          },
        },
      ]
    );
  };

  const handleApplyManualRate = async () => {
    const rateRs = parseFloat(manualRateInputRupees.trim());
    if (isNaN(rateRs) || rateRs <= 0) {
      setRateError(`Enter a valid positive rate in ${currencySymbol}/g`);
      return;
    }

    const newRatePaise = Math.round(rateRs * 100);
    setActiveRatePaise(newRatePaise);
    setIsManualRate(1);
    setIsEditingRate(false);
    setRateError(null);

    if (draft?.id) {
      await draftInvoiceService.updateDraftDetails(draft.id, {
        metalRatePaisePerGram: newRatePaise,
        isManualRate: 1,
      });
      const updated = await draftInvoiceService.getDraft(draft.id);
      setDraft(updated);
    }
  };

  const handleResetToDailyRate = async () => {
    setActiveRatePaise(dailyRatePaise);
    setManualRateInputRupees((dailyRatePaise / 100).toFixed(0));
    setIsManualRate(0);
    setIsEditingRate(false);
    setRateError(null);

    if (draft?.id) {
      await draftInvoiceService.updateDraftDetails(draft.id, {
        metalRatePaisePerGram: dailyRatePaise,
        isManualRate: 0,
      });
      const updated = await draftInvoiceService.getDraft(draft.id);
      setDraft(updated);
    }
  };

  // Add Serialized Item to Draft
  const handleAddSerializedItem = async (item: ItemSearchResult) => {
    if (!draft?.id) return;
    setItemsError(null);
    try {
      await draftInvoiceService.addSerializedItem({
        invoiceId: draft.id,
        item,
        metalTaxGroupId: metalTaxGroupId || undefined,
        makingTaxGroupId: makingTaxGroupId || undefined,
      });
      const updated = await draftInvoiceService.getDraft(draft.id);
      setDraft(updated);
    } catch (err: any) {
      setItemsError(err.message || 'Failed to add serialized item');
    }
  };

  // Add Loose Stock to Draft (FEAT-LOOSE-STOCK-SALE-1 v5.35)
  const handleAddLooseStockItem = async (payload: LooseStockEntryPayload) => {
    if (!draft?.id) return;
    setItemsError(null);
    try {
      await draftInvoiceService.addLooseStockItem({
        invoiceId: draft.id,
        designId: payload.designId,
        purityPercent: payload.purityPercent,
        qtySold: payload.qtySold,
        weightSoldMg: payload.weightSoldMg,
        itemName: payload.designName,
        metal: payload.metal,
        hsnCode: payload.hsnCode,
        metalTaxGroupId: metalTaxGroupId || undefined,
        makingTaxGroupId: makingTaxGroupId || undefined,
      });
      const updated = await draftInvoiceService.getDraft(draft.id);
      setDraft(updated);
    } catch (err: any) {
      setItemsError(err.message || 'Failed to add loose stock item');
    }
  };

  // Remove Item Line
  const handleRemoveItem = async (itemId: string) => {
    if (!draft?.id) return;
    try {
      await draftInvoiceService.removeItem(draft.id, itemId);
      const updated = await draftInvoiceService.getDraft(draft.id);
      setDraft(updated);
    } catch (err: any) {
      setItemsError(err.message || 'Failed to remove item');
    }
  };

  // Preview Gate Validation & Trigger
  const handleOpenPreview = async () => {
    setCustomerError(null);
    setItemsError(null);

    if (!selectedCustomer) {
      setCustomerError('Please select a customer before previewing invoice.');
      return;
    }

    if (!draft || draft.items.length === 0) {
      setItemsError('Please add at least one item before previewing invoice.');
      return;
    }

    try {
      const calc = await accountingTruthService.previewInvoice({
        firmId: firm!.id,
        metalValuePaise: draft.taxableMetalAmtPaise,
        makingChargesPaise: draft.taxableMakingAmtPaise,
        stoneAmtPaise: draft.stoneAmtPaise,
        metalTaxGroupId: metalTaxGroupId || undefined,
        makingTaxGroupId: makingTaxGroupId || undefined,
        oldMetalDeductionPaise: draft.oldMetalDeductionPaise || 0,
      });

      setPreviewCalc(calc);
      setPreviewVisible(true);
    } catch (err: any) {
      setItemsError(err.message || 'Failed to compute invoice preview.');
    }
  };

  // Confirm and Post Invoice
  const handleConfirmPost = async () => {
    if (!draft || !firm) return;
    setIsPosting(true);
    try {
      const isNegative = (previewCalc?.netPayablePaise ?? draft.netPayablePaise ?? 0) < 0;

      const oldMetalPayload = oldMetalDeductionPaise > 0 ? {
        grossWeightMg: Math.round((parseFloat(oldMetalGramsText) || 0) * 1000),
        purityPct: parseFloat(oldMetalPurityText) || 91.6,
        metal: oldMetalMetal,
        valuePaise: oldMetalDeductionPaise,
        notes: oldMetalNotes || undefined,
      } : undefined;

      const excessSettlementPayload = isNegative ? {
        choice: excessChoice,
        mode: excessChoice === 'PAY_NOW' ? excessPaymentMode : undefined,
        bankAccountId: (excessChoice === 'PAY_NOW' && (excessPaymentMode === 'BANK' || excessPaymentMode === 'UPI')) ? excessBankAccountId : undefined,
      } : undefined;

      const posted = await invoicePostService.postInvoice({
        draftInvoiceId: draft.id,
        firmId: firm.id,
        oldMetal: oldMetalPayload,
        excessSettlement: excessSettlementPayload,
      });
      setPostSuccessMessage(`Invoice ${posted.invoiceNumber || 'POSTED'} successfully! Stock items marked SOLD.`);
      setPreviewVisible(false);
      setTimeout(() => {
        router.replace('/dashboard');
      }, 1500);
    } catch (err: any) {
      Alert.alert('Post Error', err.message || 'Could not post invoice');
    } finally {
      setIsPosting(false);
    }
  };

  if (sessionLoading || isInitializing) {
    return (
      <TwoToneWrapper title="Billing & Sales">
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.bullionGold} />
          <Text style={styles.loadingText}>Initializing Draft Invoice...</Text>
        </View>
      </TwoToneWrapper>
    );
  }

  const itemsCount = draft?.items?.length || 0;

  return (
    <TwoToneWrapper
      title="Sale Invoice (Draft)"
      headerContent={
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerFirmText}>{firm?.name || 'VJ Jewellers'}</Text>
            <Text style={styles.headerSubText}>
              FY: {activeFY?.label || 'Active FY'} | {firm?.gstin ? 'Tax Invoice' : 'Bill of Supply'}
            </Text>
          </View>
        </View>
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        {postSuccessMessage && (
          <View style={styles.successBanner}>
            <Text style={styles.successBannerText}>{postSuccessMessage}</Text>
          </View>
        )}

        {/* ========================================================================= */}
        {/* SECTION 1: CUSTOMER (LOCKED ORDER)                                        */}
        {/* ========================================================================= */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <User size={18} color={COLORS.bullionGold} />
            <Text style={styles.sectionTitle}>1. CUSTOMER DETAILS</Text>
          </View>

          {selectedCustomer ? (
            <View style={styles.customerCard}>
              <View style={styles.customerCardMain}>
                <Text style={styles.customerCardName}>{selectedCustomer.name}</Text>
                {selectedCustomer.mobile && (
                  <Text style={styles.customerCardMeta}>Mobile: {selectedCustomer.mobile}</Text>
                )}
                {selectedCustomer.address && (
                  <Text style={styles.customerCardMeta}>Address: {selectedCustomer.address}</Text>
                )}
                <Text style={styles.customerCardMeta}>
                  {selectedCustomer.gstin ? `GSTIN: ${selectedCustomer.gstin}` : 'Non-GST Retail Customer'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setCustomerPickerVisible(true)}
                style={styles.changeBtn}
              >
                <Text style={styles.changeBtnText}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.selectCustomerBtn, customerError ? styles.selectCustomerBtnError : null]}
              onPress={() => setCustomerPickerVisible(true)}
            >
              <User size={18} color="#64748B" />
              <Text style={styles.selectCustomerBtnText}>Select or Search Customer</Text>
            </TouchableOpacity>
          )}

          {customerError && <Text style={styles.inlineWarning}>{customerError}</Text>}
        </View>

        {/* ========================================================================= */}
        {/* SECTION 2: ITEMS (LOCKED ORDER)                                           */}
        {/* ========================================================================= */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <ShoppingBag size={18} color={COLORS.bullionGold} />
            <Text style={styles.sectionTitle}>2. ITEMS & RATES</Text>
          </View>

          {/* Metal Rate Bar & Manual Override Opt-in */}
          <View style={styles.rateBar}>
            <View style={styles.rateInfo}>
              <Text style={styles.rateTitle}>Active Bhav Rate:</Text>
              <Text style={styles.rateValue}>{currencySymbol}{(activeRatePaise / 100).toFixed(2)} /g</Text>
              {isManualRate ? (
                <View style={styles.manualBadge}>
                  <Text style={styles.manualBadgeText}>MANUAL OVERRIDE</Text>
                </View>
              ) : (
                <View style={styles.dailyBadge}>
                  <Text style={styles.dailyBadgeText}>DAILY RATE</Text>
                </View>
              )}
            </View>

            {!isEditingRate ? (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {isManualRate === 1 && (
                  <TouchableOpacity
                    style={styles.resetRateBtn}
                    onPress={handleResetToDailyRate}
                  >
                    <Text style={styles.resetRateBtnText}>Reset</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.overrideBtn}
                  onPress={handleStartRateOverride}
                >
                  <Text style={styles.overrideBtnText}>Override Rate</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.rateEditRow}>
                <TextInput
                  style={styles.rateInput}
                  value={manualRateInputRupees}
                  onChangeText={setManualRateInputRupees}
                  keyboardType="numeric"
                  placeholder={`${currencySymbol}/g`}
                />
                <TouchableOpacity onPress={handleApplyManualRate} style={styles.iconBtnCheck}>
                  <Check size={16} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setIsEditingRate(false)} style={styles.iconBtnCancel}>
                  <X size={16} color="#64748B" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {rateError && <Text style={styles.inlineWarning}>{rateError}</Text>}

          {/* Tax Group Selector */}
          <InvoiceGstSection
            firmId={firm?.id || ''}
            hasGstin={!!firm?.gstin}
            metalTaxGroupId={metalTaxGroupId || null}
            makingTaxGroupId={makingTaxGroupId || null}
            onSelectMetalTaxGroup={setMetalTaxGroupId}
            onSelectMakingTaxGroup={setMakingTaxGroupId}
          />

          {/* Serialized Item Search (FIX-ITEM-SEARCH-UI-1 v5.15) */}
          <ItemSearchSection
            firmId={firm?.id || ''}
            onSelectItem={handleAddSerializedItem}
          />

          {/* Loose Stock Entry Mode (FEAT-LOOSE-STOCK-SALE-1 v5.35) */}
          <LooseStockEntrySection
            firmId={firm?.id || ''}
            onAddLooseItem={handleAddLooseStockItem}
          />

          {itemsError && <Text style={styles.inlineWarning}>{itemsError}</Text>}

          {/* Line Items List */}
          <View style={styles.itemsTableCard}>
            <Text style={styles.itemsTableTitle}>Selected Invoice Items ({itemsCount})</Text>

            {itemsCount === 0 ? (
              <Text style={styles.noItemsText}>No items added yet. Search items or use loose stock mode.</Text>
            ) : (
              draft?.items.map((it, idx) => {
                const isLoose = it.lineType === 'LOOSE_LOT';
                const weightLabel = isLoose
                  ? `${it.qtySold} pcs (${((it.weightSoldMg || 0) / 1000).toFixed(3)} g)`
                  : `${((it.netWeightMg || it.grossWeightMg || 0) / 1000).toFixed(3)} g`;

                return (
                  <View key={it.id || idx} style={styles.tableRow}>
                    <View style={styles.rowDesc}>
                      <Text style={styles.rowItemName}>{it.itemName}</Text>
                      <Text style={styles.rowMeta}>
                        {weightLabel} | Metal: {formatPaiseToRupees(it.metalValuePaise)} | Making: {formatPaiseToRupees(it.makingChargesPaise)}
                      </Text>
                    </View>
                    <View style={styles.rowTotalCol}>
                      <Text style={styles.rowTotalText}>{formatPaiseToRupees(it.lineTotalPaise)}</Text>
                      <TouchableOpacity
                        onPress={() => handleRemoveItem(it.id)}
                        style={styles.deleteLineBtn}
                      >
                        <Trash2 size={15} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </View>

        {/* ========================================================================= */}
        {/* SECTION 3: OLD METAL (EXCHANGE) (LOCKED ORDER)                            */}
        {/* ========================================================================= */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Coins size={18} color={COLORS.bullionGold} />
            <Text style={styles.sectionTitle}>3. OLD METAL (EXCHANGE DEDUCTION)</Text>
          </View>

          <Text style={styles.subtext}>
            Customer old gold/silver exchanged against sale. Deduction applies strictly AFTER GST.
          </Text>

          <View style={styles.metalToggleRow}>
            <TouchableOpacity
              style={[styles.metalToggleBtn, oldMetalMetal === 'GOLD' && styles.metalToggleBtnActive]}
              onPress={() => setOldMetalMetal('GOLD')}
            >
              <Text style={[styles.metalToggleText, oldMetalMetal === 'GOLD' && styles.metalToggleTextActive]}>
                Gold Exchange
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.metalToggleBtn, oldMetalMetal === 'SILVER' && styles.metalToggleBtnActive]}
              onPress={() => setOldMetalMetal('SILVER')}
            >
              <Text style={[styles.metalToggleText, oldMetalMetal === 'SILVER' && styles.metalToggleTextActive]}>
                Silver Exchange
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.rowInputs}>
            <View style={styles.flex1}>
              <Text style={styles.inputLabel}>Gross Wt (g)</Text>
              <TextInput
                style={styles.simpleInput}
                placeholder="0.000"
                keyboardType="decimal-pad"
                value={oldMetalGramsText}
                onChangeText={setOldMetalGramsText}
              />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.inputLabel}>Purity (%)</Text>
              <TextInput
                style={styles.simpleInput}
                placeholder="91.6"
                keyboardType="decimal-pad"
                value={oldMetalPurityText}
                onChangeText={setOldMetalPurityText}
              />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.inputLabel}>Bhav Rate ({currencySymbol}/g)</Text>
              <TextInput
                style={styles.simpleInput}
                placeholder={currencySymbol}
                keyboardType="numeric"
                value={oldMetalBhavText}
                onChangeText={setOldMetalBhavText}
              />
            </View>
          </View>

          {oldMetalFineGrams > 0 && (
            <View style={styles.fineWeightRow}>
              <Text style={styles.fineWeightText}>
                Fine Weight ({oldMetalMetal}): {oldMetalFineGrams.toFixed(3)} g
              </Text>
            </View>
          )}

          {oldMetalDeductionPaise > 0 && (
            <View style={styles.deductionResultRow}>
              <Text style={styles.deductionText}>
                Old Metal Trade-in Value: - {formatPaiseToRupees(oldMetalDeductionPaise)}
              </Text>
            </View>
          )}

          <Text style={styles.inputLabel}>Old Metal Description / Notes</Text>
          <TextInput
            style={styles.simpleInput}
            placeholder="e.g. 22K Old Bangles tested 91%"
            value={oldMetalNotes}
            onChangeText={setOldMetalNotes}
          />
        </View>

        {/* ========================================================================= */}
        {/* SECTION 4: SUMMARY (LOCKED ORDER)                                         */}
        {/* ========================================================================= */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Receipt size={18} color={COLORS.bullionGold} />
            <Text style={styles.sectionTitle}>4. FINANCIAL SUMMARY</Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Taxable Metal Value</Text>
              <Text style={styles.summaryValue}>{formatPaiseToRupees(draft?.taxableMetalAmtPaise || 0)}</Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Taxable Making Charges</Text>
              <Text style={styles.summaryValue}>{formatPaiseToRupees(draft?.taxableMakingAmtPaise || 0)}</Text>
            </View>

            {firm?.gstin && (
              <>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>CGST</Text>
                  <Text style={styles.summaryValue}>{formatPaiseToRupees(draft?.cgstPaise || 0)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>SGST</Text>
                  <Text style={styles.summaryValue}>{formatPaiseToRupees(draft?.sgstPaise || 0)}</Text>
                </View>
              </>
            )}

            <View style={styles.summaryRow}>
              <Text style={styles.inputLabel}>Discount ({currencySymbol})</Text>
              <TextInput
                style={[styles.simpleInput, { width: 120, height: 36, textAlign: 'right' }]}
                placeholder="0"
                keyboardType="numeric"
                value={discountRupeesText}
                onChangeText={setDiscountRupeesText}
              />
            </View>

            {oldMetalDeductionPaise > 0 && (
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: '#059669' }]}>Old Metal Deduction</Text>
                <Text style={[styles.summaryValue, { color: '#059669' }]}>- {formatPaiseToRupees(oldMetalDeductionPaise)}</Text>
              </View>
            )}

            <View style={[styles.summaryRow, styles.summaryTotalRow]}>
              <Text style={styles.netPayableLabel}>NET PAYABLE</Text>
              <Text style={styles.netPayableValue}>{formatPaiseToRupees(draft?.netPayablePaise || 0)}</Text>
            </View>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* SECTION 5: PAYMENTS / EXCESS SETTLEMENT (LOCKED ORDER)                    */}
        {/* ========================================================================= */}
        {(draft?.netPayablePaise || 0) < 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <AlertCircle size={18} color="#DC2626" />
              <Text style={[styles.sectionTitle, { color: '#DC2626' }]}>
                5. EXCESS OLD METAL SETTLEMENT (REQUIRED)
              </Text>
            </View>

            <View style={styles.excessBox}>
              <Text style={styles.excessDesc}>
                Old metal trade-in value exceeds the invoice total. The shop owes the customer{' '}
                <Text style={{ fontWeight: '900', color: '#B91C1C' }}>
                  {formatPaiseToRupees(Math.abs(draft?.netPayablePaise || 0))}
                </Text>
                . Please select how this will be settled before posting (LOCKED UX):
              </Text>

              <View style={styles.settlementChoiceRow}>
                <TouchableOpacity
                  style={[styles.choiceBtn, excessChoice === 'PAY_NOW' && styles.choiceBtnActive]}
                  onPress={() => setExcessChoice('PAY_NOW')}
                >
                  <Text style={[styles.choiceBtnText, excessChoice === 'PAY_NOW' && styles.choiceBtnTextActive]}>
                    (●) Pay Now (Refund to Customer)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.choiceBtn, excessChoice === 'PAY_LATER' && styles.choiceBtnActive]}
                  onPress={() => setExcessChoice('PAY_LATER')}
                >
                  <Text style={[styles.choiceBtnText, excessChoice === 'PAY_LATER' && styles.choiceBtnTextActive]}>
                    (○) Pay Later (Show in Customer Ledger)
                  </Text>
                </TouchableOpacity>
              </View>

              {excessChoice === 'PAY_NOW' && (
                <View style={styles.payNowSection}>
                  <Text style={styles.inputLabel}>Refund Payment Mode</Text>
                  <View style={styles.chipsRow}>
                    {(['CASH', 'UPI', 'BANK'] as const).map((mode) => (
                      <TouchableOpacity
                        key={mode}
                        style={[styles.chip, excessPaymentMode === mode && styles.chipActive]}
                        onPress={() => setExcessPaymentMode(mode)}
                      >
                        <Text style={[styles.chipText, excessPaymentMode === mode && styles.chipTextActive]}>
                          {mode}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {(excessPaymentMode === 'BANK' || excessPaymentMode === 'UPI') && (
                    <View style={{ marginTop: 4 }}>
                      <Text style={styles.inputLabel}>Bank Account ID *</Text>
                      <TextInput
                        style={styles.simpleInput}
                        placeholder="Enter bank account identifier"
                        value={excessBankAccountId}
                        onChangeText={setExcessBankAccountId}
                      />
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <CreditCard size={18} color={COLORS.bullionGold} />
              <Text style={styles.sectionTitle}>5. PAYMENT RECEIPT</Text>
            </View>

            <Text style={styles.inputLabel}>Payment Mode</Text>
            <View style={styles.chipsRow}>
              {(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'MIXED'] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.chip, paymentMode === mode && styles.chipActive]}
                  onPress={() => setPaymentMode(mode)}
                >
                  <Text style={[styles.chipText, paymentMode === mode && styles.chipTextActive]}>
                    {mode}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.rowInputs}>
              <View style={styles.flex1}>
                <Text style={styles.inputLabel}>Amount Received ({currencySymbol})</Text>
                <TextInput
                  style={styles.simpleInput}
                  placeholder={`${currencySymbol} 0.00`}
                  keyboardType="numeric"
                  value={amountPaidRupeesText}
                  onChangeText={setAmountPaidRupeesText}
                />
              </View>
            </View>
          </View>
        )}

        {/* ========================================================================= */}
        {/* PREVIEW GATE ACTION (MANDATORY BEFORE POST)                               */}
        {/* ========================================================================= */}
        <TouchableOpacity
          style={styles.previewGateButton}
          onPress={handleOpenPreview}
          activeOpacity={0.8}
        >
          <Eye size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.previewGateButtonText}>Preview Invoice (Mandatory Before Save)</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Customer Selection Modal */}
      <CustomerSearchPickerModal
        visible={customerPickerVisible}
        firmId={firm?.id || ''}
        onSelectCustomer={(cust: Customer) => {
          setSelectedCustomer(cust);
          setCustomerPickerVisible(false);
          setCustomerError(null);
        }}
        onClose={() => setCustomerPickerVisible(false)}
      />

      {/* Mandatory Invoice Preview Modal */}
      <InvoicePreviewModal
        visible={previewVisible}
        invoice={draft}
        customerName={selectedCustomer?.name}
        customerMobile={selectedCustomer?.mobile || undefined}
        calculation={previewCalc}
        onClose={() => setPreviewVisible(false)}
        onConfirmPost={handleConfirmPost}
        isPosting={isPosting}
      />
    </TwoToneWrapper>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  backBtn: {
    padding: 6,
  },
  headerInfo: {
    flex: 1,
  },
  headerFirmText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.6,
  },
  subtext: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 10,
  },
  customerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 12,
  },
  customerCardMain: {
    flex: 1,
  },
  customerCardName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  customerCardMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  changeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
  },
  changeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  selectCustomerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 14,
    backgroundColor: '#F8FAFC',
  },
  selectCustomerBtnError: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  selectCustomerBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  rateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  rateInfo: {
    flex: 1,
  },
  rateTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  rateValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#78350F',
    marginVertical: 2,
  },
  manualBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  manualBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B45309',
  },
  dailyBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  dailyBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#15803D',
  },
  overrideBtn: {
    backgroundColor: '#D97706',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  overrideBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  resetRateBtn: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  resetRateBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  rateEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rateInput: {
    width: 80,
    height: 36,
    borderWidth: 1.5,
    borderColor: '#D97706',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    fontSize: 13,
    fontWeight: '700',
  },
  iconBtnCheck: {
    backgroundColor: '#16A34A',
    padding: 8,
    borderRadius: 8,
  },
  iconBtnCancel: {
    backgroundColor: '#E2E8F0',
    padding: 8,
    borderRadius: 8,
  },
  itemsTableCard: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  itemsTableTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 8,
  },
  noItemsText: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
    paddingVertical: 6,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  rowDesc: {
    flex: 1,
    paddingRight: 8,
  },
  rowItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  rowMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  rowTotalCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowTotalText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  deleteLineBtn: {
    padding: 4,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  flex1: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  simpleInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  deductionResultRow: {
    backgroundColor: '#ECFDF5',
    padding: 8,
    borderRadius: 8,
    marginVertical: 6,
  },
  deductionText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#047857',
  },
  summaryCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '700',
  },
  summaryTotalRow: {
    borderTopWidth: 2,
    borderTopColor: '#CBD5E1',
    marginTop: 8,
    paddingTop: 8,
  },
  netPayableLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  netPayableValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#D97706',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  chip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  chipActive: {
    backgroundColor: '#0F172A',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  previewGateButton: {
    flexDirection: 'row',
    backgroundColor: '#D97706',
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 40,
    shadowColor: '#D97706',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
  },
  previewGateButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  inlineWarning: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  successBanner: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    alignItems: 'center',
  },
  successBannerText: {
    color: '#15803D',
    fontSize: 13,
    fontWeight: '800',
  },
  metalToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  metalToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  metalToggleBtnActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  metalToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  metalToggleTextActive: {
    color: '#FFFFFF',
  },
  fineWeightRow: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  fineWeightText: {
    color: '#16A34A',
    fontSize: 12,
    fontWeight: '700',
  },
  excessBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    padding: 14,
  },
  excessDesc: {
    fontSize: 13,
    color: '#7F1D1D',
    lineHeight: 18,
    marginBottom: 12,
  },
  settlementChoiceRow: {
    gap: 8,
    marginBottom: 12,
  },
  choiceBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FFFFFF',
  },
  choiceBtnActive: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  choiceBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7F1D1D',
  },
  choiceBtnTextActive: {
    color: '#991B1B',
  },
  payNowSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#FECACA',
  },
});
