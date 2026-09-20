// app/billing/payments.tsx — Phase 3 Payment Recording Screen
// Implements STEP 11 — PAYMENT ENGINE & UI Obligation
// - "Link to bill" picker (searchable list of outstanding invoices for party)
// - Pre-fill when arriving from invoice screen
// - Remaining balance display on the invoice after saving
// - bankAccountId conditionally required for BANK/UPI and disallowed for CASH

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
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  CreditCard,
  User,
  Truck,
  Receipt,
  Check,
  AlertCircle,
  Link,
  Unlink,
  CheckCircle2,
  Building2,
  Phone,
  Banknote,
  Coins,
} from 'lucide-react-native';

import { useSession } from '@/hooks/useSession';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { CustomerSearchPickerModal } from '@/components/phase3/CustomerSearchPickerModal';
import { SupplierSearchPickerModal } from '@/components/phase3/SupplierSearchPickerModal';
import { paymentService } from '@/services/phase3/paymentService';
import { supplierPaymentService } from '@/services/phase3/supplierPaymentService';
import { accountingTruthService } from '@/services/phase3/accountingTruthService';
import { customerRepository } from '@/repositories/phase3/customerRepository';
import { supplierRepository } from '@/repositories/phase3/supplierRepository';
import { formatPaiseToRupees, rupeesToPaise, getCurrencySymbol } from '@/utils/currency';
import { getUserFriendlyErrorMessage } from '@/constants/errorMessageMap';
import { COLORS } from '@/constants/theme';
import type {
  Customer,
  Supplier,
  PaymentMode,
  PaymentPartyType,
  OutstandingInvoice,
  RecordPaymentResult,
  InvoicePaymentSummary,
} from '@/types/phase3/phase3.types';

export default function PaymentsScreen() {
  const router = useRouter();
  const currencySymbol = getCurrencySymbol();
  const searchParams = useLocalSearchParams<{
    partyType?: string;
    partyId?: string;
    invoiceId?: string;
    invoiceNumber?: string;
    amount?: string;
  }>();

  const { firm, activeFY, isLoading: sessionLoading } = useSession();

  // Party state
  const [partyType, setPartyType] = useState<PaymentPartyType>(
    (searchParams.partyType as PaymentPartyType) || 'CUSTOMER'
  );
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [customerPickerVisible, setCustomerPickerVisible] = useState(false);
  const [supplierPickerVisible, setSupplierPickerVisible] = useState(false);
  const [partyBalancePaise, setPartyBalancePaise] = useState<number | null>(null);

  // Invoices & Bill Linkage state
  const [outstandingInvoices, setOutstandingInvoices] = useState<OutstandingInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [linkedInvoiceId, setLinkedInvoiceId] = useState<string | null>(
    searchParams.invoiceId || null
  );
  const [billPickerVisible, setBillPickerVisible] = useState(false);
  const [billSearchQuery, setBillSearchQuery] = useState('');

  // Payment form state
  const [mode, setMode] = useState<PaymentMode>('CASH');
  const [bankAccountId, setBankAccountId] = useState('');
  const [amountRupees, setAmountRupees] = useState(searchParams.amount || '');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');

  // Step 11A Supplier Metal Payment state
  const [supplierPayType, setSupplierPayType] = useState<'MONEY' | 'METAL_OR_MIXED'>('MONEY');
  const [metalWeightGrams, setMetalWeightGrams] = useState('');
  const [metalPurityPct, setMetalPurityPct] = useState('91.6');
  const [metalRateRupeesPerGram, setMetalRateRupeesPerGram] = useState('');

  // Calculated metal values
  const calculatedMetal = useMemo(() => {
    const weightGrams = parseFloat(metalWeightGrams || '0');
    const purity = parseFloat(metalPurityPct || '0');
    const rateRupees = parseFloat(metalRateRupeesPerGram || '0');
    if (isNaN(weightGrams) || weightGrams <= 0 || isNaN(purity) || purity <= 0 || isNaN(rateRupees) || rateRupees <= 0) {
      return { metalWeightMg: 0, metalFineWeightMg: 0, metalValuePaise: 0 };
    }
    const metalWeightMg = Math.round(weightGrams * 1000);
    const metalFineWeightMg = Math.round((metalWeightMg * purity) / 100);
    const metalRatePaisePerGram = rupeesToPaise(rateRupees) || 0;
    const metalValuePaise = Math.round((metalFineWeightMg / 1000) * metalRatePaisePerGram);
    return { metalWeightMg, metalFineWeightMg, metalValuePaise };
  }, [metalWeightGrams, metalPurityPct, metalRateRupeesPerGram]);

  // Submission & Post-save state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successResult, setSuccessResult] = useState<{
    result: RecordPaymentResult;
    invoiceSummary: InvoicePaymentSummary | null;
  } | null>(null);

  const firmId = firm?.id;

  // Load initial party if route params provided
  useEffect(() => {
    if (!firmId) return;

    if (searchParams.partyId) {
      if (searchParams.partyType === 'SUPPLIER') {
        const sup = supplierRepository.findById(firmId, searchParams.partyId);
        if (sup) setSupplier(sup);
      } else {
        const cust = customerRepository.findById(firmId, searchParams.partyId);
        if (cust) setCustomer(cust);
      }
    }
  }, [firmId, searchParams.partyId, searchParams.partyType]);

  // Derive party balance and outstanding invoices when party changes
  const activePartyId = partyType === 'CUSTOMER' ? customer?.id : supplier?.id;

  const refreshPartyData = useCallback(async () => {
    if (!firmId || !activePartyId) {
      setPartyBalancePaise(null);
      setOutstandingInvoices([]);
      return;
    }

    try {
      if (partyType === 'CUSTOMER') {
        const bal = await accountingTruthService.deriveCustomerBalance(activePartyId, firmId);
        setPartyBalancePaise(bal);
      } else {
        const bal = await accountingTruthService.deriveSupplierBalance(activePartyId, firmId);
        setPartyBalancePaise(bal);
      }

      setLoadingInvoices(true);
      const invoices = await paymentService.getOutstandingInvoicesForParty(
        firmId,
        activePartyId,
        partyType
      );
      setOutstandingInvoices(invoices);
    } catch (e) {
      console.warn('[PaymentsScreen] Error refreshing party data:', e);
    } finally {
      setLoadingInvoices(false);
    }
  }, [firmId, activePartyId, partyType]);

  useEffect(() => {
    refreshPartyData();
  }, [refreshPartyData]);

  // Active linked invoice details
  const selectedInvoice = useMemo(() => {
    if (!linkedInvoiceId) return null;
    return outstandingInvoices.find((inv) => inv.invoiceId === linkedInvoiceId) || null;
  }, [linkedInvoiceId, outstandingInvoices]);

  // Handle Mode Change (v4.9 rule: bankAccountId must be null for cash)
  const handleModeChange = (newMode: PaymentMode) => {
    setMode(newMode);
    if (newMode === 'CASH') {
      setBankAccountId('');
    }
  };

  // Filtered invoices for the picker modal
  const filteredInvoices = useMemo(() => {
    const q = billSearchQuery.toLowerCase().trim();
    if (!q) return outstandingInvoices;
    return outstandingInvoices.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.invoiceDate.includes(q)
    );
  }, [outstandingInvoices, billSearchQuery]);

  // Submit payment
  const handleSubmit = async () => {
    if (!firmId) {
      Alert.alert('Error', 'No active firm selected.');
      return;
    }

    if (!activePartyId) {
      Alert.alert('Validation Error', `Please select a ${partyType.toLowerCase()} first.`);
      return;
    }

    if (partyType === 'SUPPLIER' && supplierPayType === 'METAL_OR_MIXED') {
      const moneyRupees = parseFloat(amountRupees || '0');
      const moneyPaise = !isNaN(moneyRupees) && moneyRupees > 0 ? rupeesToPaise(moneyRupees) || 0 : 0;

      if (calculatedMetal.metalWeightMg === 0 && moneyPaise === 0) {
        Alert.alert('Validation Error', 'Please enter a metal amount, money amount, or both.');
        return;
      }

      if (calculatedMetal.metalWeightMg > 0) {
        if (!metalPurityPct || parseFloat(metalPurityPct) <= 0 || !metalRateRupeesPerGram || parseFloat(metalRateRupeesPerGram) <= 0) {
          Alert.alert('Validation Error', 'Please enter valid metal purity and rate per gram.');
          return;
        }
      }

      if (moneyPaise > 0 && (mode === 'BANK' || mode === 'UPI') && !bankAccountId.trim()) {
        Alert.alert('Bank Account Required', 'Please select a bank account for Bank/UPI payments.');
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await supplierPaymentService.recordSupplierPayment({
          firmId,
          supplierId: activePartyId,
          paymentDate,
          metalWeightMg: calculatedMetal.metalWeightMg,
          metalPurityPct: parseFloat(metalPurityPct || '0'),
          metalRatePaisePerGram: rupeesToPaise(parseFloat(metalRateRupeesPerGram || '0')) || 0,
          moneyAmountPaise: moneyPaise,
          moneyMode: moneyPaise > 0 ? mode : undefined,
          bankAccountId: moneyPaise > 0 && mode !== 'CASH' ? bankAccountId.trim() : null,
          linkedPurchaseInvoiceId: linkedInvoiceId || null,
          notes: notes.trim() || null,
        });

        setSuccessResult({
          result: {
            payment: {
              ...res.payment,
              type: 'MONEY_OUT',
              amountPaise: res.payment.totalValuePaise,
              partyType: 'SUPPLIER',
              partyId: res.payment.supplierId,
              mode: res.payment.moneyMode || 'CASH',
              status: 'PAID',
              reason: null,
              linkedInvoiceId: res.payment.linkedPurchaseInvoiceId,
            } as any,
            ledgerEntry: res.ledgerEntry,
          },
          invoiceSummary: null,
        });
        await refreshPartyData();
      } catch (err) {
        Alert.alert('Payment Failed', getUserFriendlyErrorMessage(err));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const rupees = parseFloat(amountRupees);
    if (isNaN(rupees) || rupees <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid amount greater than zero.');
      return;
    }

    const amountPaise = rupeesToPaise(rupees);
    if (!amountPaise || amountPaise <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid amount greater than zero.');
      return;
    }

    // v4.9 Bank account validation
    if ((mode === 'BANK' || mode === 'UPI') && !bankAccountId.trim()) {
      Alert.alert(
        'Bank Account Required',
        'Please provide or select a bank account for Bank/UPI payments.'
      );
      return;
    }

    // Overpayment warning on linked bill (allowed, non-blocking)
    if (selectedInvoice && amountPaise > selectedInvoice.remainingPaise) {
      Alert.alert(
        'Overpayment Warning',
        `The payment amount (${currencySymbol}${rupees.toFixed(2)}) exceeds the remaining balance on invoice ${
          selectedInvoice.invoiceNumber
        } (${currencySymbol}${(selectedInvoice.remainingPaise / 100).toFixed(2)}). Excess amount will be credited to the party balance. Do you want to proceed?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Proceed', onPress: () => processPayment(amountPaise) },
        ]
      );
      return;
    }

    await processPayment(amountPaise);
  };

  const processPayment = async (amountPaise: number) => {
    if (!firmId || !activePartyId) return;

    setIsSubmitting(true);
    try {
      const result = await paymentService.recordPayment({
        firmId,
        partyId: activePartyId,
        partyType,
        amountPaise,
        mode,
        bankAccountId: mode === 'CASH' ? null : bankAccountId.trim() || null,
        paymentDate,
        linkedInvoiceId: linkedInvoiceId || null,
        notes: notes.trim() || null,
        reason: reason.trim() || null,
      });

      // Fetch updated invoice remaining balance if linked
      let invoiceSummary: InvoicePaymentSummary | null = null;
      if (linkedInvoiceId) {
        invoiceSummary = await paymentService.getInvoicePaymentSummary(
          firmId,
          linkedInvoiceId
        );
      }

      setSuccessResult({ result, invoiceSummary });
      await refreshPartyData();
    } catch (error) {
      const msg = getUserFriendlyErrorMessage(error);
      Alert.alert('Payment Failed', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSuccessResult(null);
    setAmountRupees('');
    setNotes('');
    setReason('');
    setLinkedInvoiceId(null);
    if (mode !== 'CASH') {
      setBankAccountId('');
    }
  };

  return (
    <TwoToneWrapper
      title="Record Payment"
      showBack={true}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* PARTY TYPE TOGGLE */}
        <View style={styles.partyTypeContainer}>
          <TouchableOpacity
            style={[
              styles.partyTypeTab,
              partyType === 'CUSTOMER' && styles.partyTypeTabActive,
            ]}
            onPress={() => {
              setPartyType('CUSTOMER');
              setCustomer(null);
              setSupplier(null);
              setLinkedInvoiceId(null);
            }}
          >
            <User
              size={16}
              color={partyType === 'CUSTOMER' ? '#1E293B' : '#94A3B8'}
            />
            <Text
              style={[
                styles.partyTypeTabText,
                partyType === 'CUSTOMER' && styles.partyTypeTabTextActive,
              ]}
            >
              Customer
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.partyTypeTab,
              partyType === 'SUPPLIER' && styles.partyTypeTabActive,
            ]}
            onPress={() => {
              setPartyType('SUPPLIER');
              setCustomer(null);
              setSupplier(null);
              setLinkedInvoiceId(null);
            }}
          >
            <Truck
              size={16}
              color={partyType === 'SUPPLIER' ? '#1E293B' : '#94A3B8'}
            />
            <Text
              style={[
                styles.partyTypeTabText,
                partyType === 'SUPPLIER' && styles.partyTypeTabTextActive,
              ]}
            >
              Supplier
            </Text>
          </TouchableOpacity>
        </View>

        {/* PARTY SELECTOR CARD */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {partyType === 'CUSTOMER' ? 'Customer Details' : 'Supplier Details'}
          </Text>

          {activePartyId ? (
            <View style={styles.selectedPartyBox}>
              <View style={styles.partyInfo}>
                <Text style={styles.partyName}>
                  {partyType === 'CUSTOMER' ? customer?.name : supplier?.name}
                </Text>
                <Text style={styles.partySubtext}>
                  📱 {(partyType === 'CUSTOMER' ? customer?.mobile : supplier?.mobile) || 'No Mobile'}
                  {(partyType === 'CUSTOMER' ? customer?.gstin : supplier?.gstin) ? ` • GSTIN: ${(partyType === 'CUSTOMER' ? customer?.gstin : supplier?.gstin)}` : ''}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.changePartyBtn}
                onPress={() => {
                  if (partyType === 'CUSTOMER') setCustomerPickerVisible(true);
                  else setSupplierPickerVisible(true);
                }}
              >
                <Text style={styles.changePartyText}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.selectPartyButton}
              onPress={() => {
                if (partyType === 'CUSTOMER') setCustomerPickerVisible(true);
                else setSupplierPickerVisible(true);
              }}
            >
              <User size={18} color="#D97706" />
              <Text style={styles.selectPartyText}>
                Select {partyType === 'CUSTOMER' ? 'Customer' : 'Supplier'}
              </Text>
            </TouchableOpacity>
          )}

          {partyBalancePaise !== null && (
            <View style={styles.balanceBadge}>
              <Text style={styles.balanceLabel}>Current Ledger Balance:</Text>
              <Text
                style={[
                  styles.balanceAmount,
                  partyBalancePaise > 0
                    ? styles.balancePositive
                    : partyBalancePaise < 0
                    ? styles.balanceNegative
                    : styles.balanceZero,
                ]}
              >
                {partyBalancePaise >= 0
                  ? `${currencySymbol}${(partyBalancePaise / 100).toFixed(2)} (${partyType === 'CUSTOMER' ? 'Receivable' : 'Payable'})`
                  : `${currencySymbol}${(Math.abs(partyBalancePaise) / 100).toFixed(2)} (Advance)`}
              </Text>
            </View>
          )}
        </View>

        {/* BILL LINKAGE SECTION */}
        {activePartyId && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.rowCentered}>
                <Receipt size={18} color="#2563EB" style={{ marginRight: 8 }} />
                <Text style={styles.cardTitle}>Link to Bill (Optional)</Text>
              </View>

              {linkedInvoiceId && (
                <TouchableOpacity
                  onPress={() => setLinkedInvoiceId(null)}
                  style={styles.unlinkBtn}
                >
                  <Unlink size={14} color="#EF4444" />
                  <Text style={styles.unlinkText}>Unlink</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.cardHint}>
              Payments settle against party aggregate balance by default. Link to a bill to match payments to specific invoices.
            </Text>

            {selectedInvoice ? (
              <View style={styles.linkedInvoiceBox}>
                <View style={styles.linkedInvoiceDetails}>
                  <Text style={styles.linkedInvoiceNumber}>
                    Bill: {selectedInvoice.invoiceNumber}
                  </Text>
                  <Text style={styles.linkedInvoiceDate}>
                    Dated: {selectedInvoice.invoiceDate} • Total: {currencySymbol}{(selectedInvoice.netPayablePaise / 100).toFixed(2)}
                  </Text>
                  <Text style={styles.linkedInvoiceRemaining}>
                    Remaining Balance: {currencySymbol}{(selectedInvoice.remainingPaise / 100).toFixed(2)}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.autoFillBtn}
                  onPress={() => {
                    setAmountRupees((selectedInvoice.remainingPaise / 100).toString());
                  }}
                >
                  <Text style={styles.autoFillText}>Pay Full</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.linkBillButton}
                onPress={() => setBillPickerVisible(true)}
              >
                <Link size={16} color="#2563EB" />
                <Text style={styles.linkBillButtonText}>
                  {loadingInvoices
                    ? 'Loading bills...'
                    : outstandingInvoices.length > 0
                    ? `Select Bill (${outstandingInvoices.length} outstanding)`
                    : 'Select Bill (No outstanding bills found)'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* PAYMENT DETAILS FORM */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payment Details</Text>

          {/* Supplier Payment Type Switcher (Money Only vs Metal / Mixed) */}
          {partyType === 'SUPPLIER' && (
            <View style={styles.supplierTypeContainer}>
              <TouchableOpacity
                style={[
                  styles.supplierTypeTab,
                  supplierPayType === 'MONEY' && styles.supplierTypeTabActive,
                ]}
                onPress={() => setSupplierPayType('MONEY')}
              >
                <Banknote size={14} color={supplierPayType === 'MONEY' ? '#1E293B' : '#64748B'} />
                <Text
                  style={[
                    styles.supplierTypeTabText,
                    supplierPayType === 'MONEY' && styles.supplierTypeTabTextActive,
                  ]}
                >
                  Money Only
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.supplierTypeTab,
                  supplierPayType === 'METAL_OR_MIXED' && styles.supplierTypeTabActive,
                ]}
                onPress={() => setSupplierPayType('METAL_OR_MIXED')}
              >
                <Coins size={14} color={supplierPayType === 'METAL_OR_MIXED' ? '#1E293B' : '#64748B'} />
                <Text
                  style={[
                    styles.supplierTypeTabText,
                    supplierPayType === 'METAL_OR_MIXED' && styles.supplierTypeTabTextActive,
                  ]}
                >
                  Metal / Mixed
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Metal Portion (When supplierPayType === 'METAL_OR_MIXED') */}
          {partyType === 'SUPPLIER' && supplierPayType === 'METAL_OR_MIXED' && (
            <View style={styles.metalPortionBox}>
              <Text style={styles.portionTitle}>Metal Portion</Text>
              <View style={styles.metalRow}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.inputLabel}>
                    Gross Wt (g) <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="0.000"
                    placeholderTextColor="#94A3B8"
                    keyboardType="decimal-pad"
                    value={metalWeightGrams}
                    onChangeText={setMetalWeightGrams}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>
                    Purity (%) <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="91.6"
                    placeholderTextColor="#94A3B8"
                    keyboardType="decimal-pad"
                    value={metalPurityPct}
                    onChangeText={setMetalPurityPct}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  Bhav Rate ({currencySymbol} / gram fine) <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 7500"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  value={metalRateRupeesPerGram}
                  onChangeText={setMetalRateRupeesPerGram}
                />
              </View>

              <View style={styles.metalCalculatedBadge}>
                <View style={styles.metalBadgeRow}>
                  <Text style={styles.badgeLabel}>Fine Wt:</Text>
                  <Text style={styles.badgeValue}>
                    {(calculatedMetal.metalFineWeightMg / 1000).toFixed(3)}g
                  </Text>
                </View>
                <View style={styles.metalBadgeRow}>
                  <Text style={styles.badgeLabel}>Metal Value:</Text>
                  <Text style={styles.badgeValueBold}>
                    {currencySymbol}{(calculatedMetal.metalValuePaise / 100).toFixed(2)}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Amount Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>
              {partyType === 'SUPPLIER' && supplierPayType === 'METAL_OR_MIXED'
                ? `Additional Money (${currencySymbol}) (Optional)`
                : `Amount (${currencySymbol}) *`}
            </Text>
            <TextInput
              style={styles.amountInput}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#94A3B8"
              value={amountRupees}
              onChangeText={setAmountRupees}
            />
          </View>

          {/* Payment Mode Selector */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>
              Payment Mode <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.modeToggleContainer}>
              {(['CASH', 'BANK', 'UPI'] as PaymentMode[]).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.modeTab, mode === m && styles.modeTabActive]}
                  onPress={() => handleModeChange(m)}
                >
                  {m === 'CASH' && <Banknote size={16} color={mode === m ? '#FFFFFF' : '#64748B'} />}
                  {m === 'BANK' && <Building2 size={16} color={mode === m ? '#FFFFFF' : '#64748B'} />}
                  {m === 'UPI' && <CreditCard size={16} color={mode === m ? '#FFFFFF' : '#64748B'} />}
                  <Text style={[styles.modeTabText, mode === m && styles.modeTabTextActive]}>
                    {m}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Bank Account Selection (Conditional - v4.9 Rule) */}
          {mode !== 'CASH' ? (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                Bank Account <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder="Bank Account Name or A/C Number"
                placeholderTextColor="#94A3B8"
                value={bankAccountId}
                onChangeText={setBankAccountId}
              />
              <Text style={styles.fieldNote}>
                Required for Bank and UPI payments.
              </Text>
            </View>
          ) : (
            <View style={styles.cashNoticeBox}>
              <Text style={styles.cashNoticeText}>
                Cash payment selected. Bank account details are not applicable.
              </Text>
            </View>
          )}

          {/* Payment Date */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Payment Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.textInput}
              value={paymentDate}
              onChangeText={setPaymentDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94A3B8"
            />
          </View>

          {/* Reason / Reference */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Reason / Reference (Optional)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Advance, Part payment on Bill #102, UPI Ref ID"
              placeholderTextColor="#94A3B8"
              value={reason}
              onChangeText={setReason}
            />
          </View>

          {/* Notes */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Notes (Optional)</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="Additional internal notes..."
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={2}
              value={notes}
              onChangeText={setNotes}
            />
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            disabled={isSubmitting}
            onPress={handleSubmit}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Check size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.submitButtonText}>
                  Record {partyType === 'CUSTOMER' ? 'Receipt' : 'Payment'} ({currencySymbol}
                  {amountRupees ? parseFloat(amountRupees || '0').toFixed(2) : '0.00'})
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* BILL PICKER MODAL */}
      <Modal
        visible={billPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBillPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Outstanding Bill</Text>
              <TouchableOpacity onPress={() => setBillPickerVisible(false)}>
                <Text style={styles.closeModalText}>Close</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.billSearchInput}
              placeholder="Search by invoice number or date..."
              placeholderTextColor="#94A3B8"
              value={billSearchQuery}
              onChangeText={setBillSearchQuery}
            />

            <ScrollView style={styles.billList}>
              {filteredInvoices.length > 0 ? (
                filteredInvoices.map((inv) => (
                  <TouchableOpacity
                    key={inv.invoiceId}
                    style={styles.billItem}
                    onPress={() => {
                      setLinkedInvoiceId(inv.invoiceId);
                      setBillPickerVisible(false);
                      if (!amountRupees && inv.remainingPaise > 0) {
                        setAmountRupees((inv.remainingPaise / 100).toString());
                      }
                    }}
                  >
                    <View style={styles.billItemLeft}>
                      <Text style={styles.billItemNumber}>{inv.invoiceNumber}</Text>
                      <Text style={styles.billItemDate}>Date: {inv.invoiceDate}</Text>
                      <Text style={styles.billItemTotal}>
                        Bill Total: {currencySymbol}{(inv.netPayablePaise / 100).toFixed(2)}
                      </Text>
                    </View>

                    <View style={styles.billItemRight}>
                      <Text style={styles.remainingTag}>Remaining</Text>
                      <Text style={styles.remainingAmount}>
                        {currencySymbol}{(inv.remainingPaise / 100).toFixed(2)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyBills}>
                  <Receipt size={32} color="#94A3B8" />
                  <Text style={styles.emptyBillsText}>
                    No outstanding bills found for this {partyType.toLowerCase()}.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* SUCCESS CONFIRMATION MODAL */}
      <Modal
        visible={!!successResult}
        transparent
        animationType="fade"
        onRequestClose={resetForm}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.successModalContent}>
            <CheckCircle2 size={48} color="#10B981" style={{ marginBottom: 12 }} />
            <Text style={styles.successTitle}>Payment Recorded Successfully</Text>

            {successResult && (
              <View style={styles.receiptBreakdown}>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Amount Paid:</Text>
                  <Text style={styles.receiptValueBold}>
                    {currencySymbol}{(successResult.result.payment.amountPaise / 100).toFixed(2)}
                  </Text>
                </View>

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Mode:</Text>
                  <Text style={styles.receiptValue}>
                    {successResult.result.payment.mode}
                    {successResult.result.payment.bankAccountId
                      ? ` (${successResult.result.payment.bankAccountId})`
                      : ''}
                  </Text>
                </View>

                {successResult.invoiceSummary && (
                  <View style={styles.linkedSummaryBox}>
                    <Text style={styles.linkedSummaryTitle}>
                      Bill Linkage ({successResult.invoiceSummary.invoiceNumber})
                    </Text>
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptLabel}>Bill Total:</Text>
                      <Text style={styles.receiptValue}>
                        {currencySymbol}{(successResult.invoiceSummary.invoiceTotalPaise / 100).toFixed(2)}
                      </Text>
                    </View>
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptLabel}>Total Paid:</Text>
                      <Text style={styles.receiptValue}>
                        {currencySymbol}{(successResult.invoiceSummary.paidPaise / 100).toFixed(2)}
                      </Text>
                    </View>
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptLabel}>Remaining Balance on Bill:</Text>
                      <Text style={styles.remainingBold}>
                        {currencySymbol}{(successResult.invoiceSummary.remainingPaise / 100).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            <View style={styles.successActions}>
              <TouchableOpacity
                style={styles.doneBtn}
                onPress={() => router.back()}
              >
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.anotherBtn}
                onPress={resetForm}
              >
                <Text style={styles.anotherBtnText}>Record Another</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* CUSTOMER PICKER MODAL */}
      {firmId && (
        <CustomerSearchPickerModal
          visible={customerPickerVisible}
          firmId={firmId}
          onClose={() => setCustomerPickerVisible(false)}
          onSelectCustomer={(cust) => {
            setCustomer(cust);
            setCustomerPickerVisible(false);
          }}
        />
      )}

      {/* SUPPLIER PICKER MODAL */}
      {firmId && (
        <SupplierSearchPickerModal
          visible={supplierPickerVisible}
          firmId={firmId}
          onClose={() => setSupplierPickerVisible(false)}
          onSelectSupplier={(sup) => {
            setSupplier(sup);
            setSupplierPickerVisible(false);
          }}
        />
      )}
    </TwoToneWrapper>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  backBtn: {
    padding: 8,
  },
  partyTypeContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  partyTypeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  partyTypeTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  partyTypeTabText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  partyTypeTabTextActive: {
    color: '#0F172A',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  rowCentered: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHint: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 12,
    lineHeight: 16,
  },
  selectPartyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingVertical: 14,
    backgroundColor: '#F8FAFC',
  },
  selectPartyText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  selectedPartyBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  partyInfo: {
    flex: 1,
  },
  partyName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  partySubtext: {
    fontSize: 12,
    color: '#64748B',
  },
  changePartyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
  },
  changePartyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  balanceBadge: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    padding: 10,
    borderRadius: 8,
  },
  balanceLabel: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  balanceAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  balancePositive: {
    color: '#DC2626',
  },
  balanceNegative: {
    color: '#16A34A',
  },
  balanceZero: {
    color: '#64748B',
  },
  unlinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  unlinkText: {
    fontSize: 12,
    color: '#EF4444',
    marginLeft: 4,
    fontWeight: '500',
  },
  linkBillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    paddingVertical: 12,
  },
  linkBillButtonText: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  linkedInvoiceBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#93C5FD',
    borderRadius: 12,
    padding: 12,
  },
  linkedInvoiceDetails: {
    flex: 1,
  },
  linkedInvoiceNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  linkedInvoiceDate: {
    fontSize: 12,
    color: '#3B82F6',
    marginTop: 2,
  },
  linkedInvoiceRemaining: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
    marginTop: 4,
  },
  autoFillBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  autoFillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  required: {
    color: '#EF4444',
  },
  amountInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  modeToggleContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  modeTabActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  modeTabTextActive: {
    color: '#FFFFFF',
  },
  cashNoticeBox: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  cashNoticeText: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
  },
  fieldNote: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  closeModalText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
  },
  billSearchInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 12,
  },
  billList: {
    maxHeight: 350,
  },
  billItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  billItemLeft: {
    flex: 1,
  },
  billItemNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  billItemDate: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  billItemTotal: {
    fontSize: 12,
    color: '#475569',
    marginTop: 1,
  },
  billItemRight: {
    alignItems: 'flex-end',
  },
  remainingTag: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563EB',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 2,
  },
  remainingAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptyBills: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyBillsText: {
    marginTop: 8,
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
  },
  successModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    alignItems: 'center',
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 16,
    textAlign: 'center',
  },
  receiptBreakdown: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  receiptLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  receiptValue: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
  },
  receiptValueBold: {
    fontSize: 15,
    color: '#10B981',
    fontWeight: '800',
  },
  linkedSummaryBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  linkedSummaryTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
    marginBottom: 4,
  },
  remainingBold: {
    fontSize: 14,
    color: '#2563EB',
    fontWeight: '700',
  },
  successActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  doneBtn: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  anotherBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  anotherBtnText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 14,
  },
  supplierTypeContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 3,
    marginBottom: 14,
  },
  supplierTypeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6,
  },
  supplierTypeTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  supplierTypeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  supplierTypeTabTextActive: {
    color: '#0F172A',
  },
  metalPortionBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  portionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 10,
  },
  metalRow: {
    flexDirection: 'row',
  },
  metalCalculatedBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    gap: 4,
  },
  metalBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeLabel: {
    fontSize: 12,
    color: '#92400E',
  },
  badgeValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#78350F',
  },
  badgeValueBold: {
    fontSize: 14,
    fontWeight: '800',
    color: '#B45309',
  },
});
