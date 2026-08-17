// app/create-firm.tsx — Phase 2 v2.11 Canonical Firm Creation Screen

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { GlassCard, GlassInput, GlassButton, FixedGlassBar, fixedBarStyles } from '@/components/ui/Glass';
import { firmService } from '@/services/phase1/firmService';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { INDIAN_STATES } from '@/utils/indianStates';
import { formatGSTINInput, getGSTINKeyboardType, validateGSTIN } from '@/utils/validateGSTIN';
import { processAndSaveFirmImage } from '@/utils/processFirmImage';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import {
  Save,
  Building2,
  User,
  MapPin,
  Hash,
  Phone,
  ShieldCheck,
  ImagePlus,
  Tag,
  CheckCircle2,
  ArrowRight,
  ChevronDown,
  X,
  AlertTriangle,
} from 'lucide-react-native';
import { COLORS } from '@/constants/theme';

// ============================================================================
// G58 SPEC CONSTANTS — DO NOT change these values.
// max 1024x1024, max 2MB, quality 0.8
// saved to DocumentDirectory/logos/firm_{firmId}.png
// ============================================================================
const LOGO_QUALITY = 0.8;

export default function CreateFirmScreen() {
  const router = useRouter();
  const { setActiveFirm } = useFirmStore();
  const [loading, setLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showStatePicker, setShowStatePicker] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    firmCode: '',
    proprietor: '',
    firmLogoUri: null as string | null,
    gstin: '',
    bisLicence: '',
    bisLogoUri: null as string | null,
    phone1: '',
    phone2: '',
    phone3: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    stateCode: '27',
    stateName: 'Maharashtra',
    pincode: '',
  });

  const handleGstinChange = (text: string) => {
    const formatted = formatGSTINInput(text);
    let updatedStateCode = form.stateCode;
    let updatedStateName = form.stateName;

    // Auto-detect and sync state if 2 valid state digits are typed
    if (formatted.length >= 2) {
      const stateCodePrefix = formatted.slice(0, 2);
      const matchedState = INDIAN_STATES.find(s => s.code === stateCodePrefix);
      if (matchedState) {
        updatedStateCode = matchedState.code;
        updatedStateName = matchedState.name;
      }
    }

    setForm(prev => ({
      ...prev,
      gstin: formatted,
      stateCode: updatedStateCode,
      stateName: updatedStateName,
    }));
  };

  const isDirty = useMemo(() => {
    return (
      form.name !== '' ||
      form.firmCode !== '' ||
      form.proprietor !== '' ||
      form.phone1 !== ''
    );
  }, [form]);

  useUnsavedChangesGuard(isDirty);

  const pickImage = async (field: 'firmLogoUri' | 'bisLogoUri') => {
    Alert.alert(
      "Select Image Source",
      "Choose where to pick the image from:",
      [
        { text: "Camera", onPress: () => handleImageSelection(field, 'camera') },
        { text: "Gallery", onPress: () => handleImageSelection(field, 'gallery') },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  const handleImageSelection = async (field: 'firmLogoUri' | 'bisLogoUri', source: 'camera' | 'gallery') => {
    let result;
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: LOGO_QUALITY,
    };

    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Camera access is needed to capture store / BIS hallmark logos.");
        return;
      }
      result = await ImagePicker.launchCameraAsync(options);
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Photo library access is needed to select store / BIS hallmark logos.");
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync(options);
    }

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setForm((prev) => ({ ...prev, [field]: result.assets[0].uri }));
    }
  };

  const validateBis = (licence: string) => /^[A-Z0-9\/\-]{8,}$/.test(licence);

  const handleSave = async () => {
    if (
      !form.name ||
      !form.firmCode ||
      !form.proprietor ||
      !form.phone1 ||
      !form.addressLine1 ||
      !form.city ||
      !form.pincode
    ) {
      setErrorMessage('Please fill all required fields.');
      return;
    }
    if (form.bisLicence && !validateBis(form.bisLicence)) {
      setErrorMessage('Please enter a valid BIS Licence Number.');
      return;
    }

    if (form.gstin) {
      try {
        validateGSTIN(form.gstin);
        const gstinStatePrefix = form.gstin.trim().slice(0, 2);
        if (gstinStatePrefix !== form.stateCode) {
          setErrorMessage(`GSTIN state prefix (${gstinStatePrefix}) must match chosen jurisdiction state code (${form.stateCode}).`);
          return;
        }
      } catch (err: any) {
        setErrorMessage(err.message || "Please enter a valid 15-character GSTIN.");
        return;
      }
    }

    try {
      setLoading(true);

      const newFirm = await firmService.createFirm({
        name: form.name,
        firmCode: form.firmCode.toUpperCase(),
        proprietor: form.proprietor,
        gstin: form.gstin || null,
        bisLicence: form.bisLicence || null,
        bisLogoUri: form.bisLogoUri,
        phone1: form.phone1,
        phone2: form.phone2 || null,
        phone3: form.phone3 || null,
        addressLine1: form.addressLine1,
        addressLine2: form.addressLine2 || null,
        city: form.city,
        stateCode: form.stateCode,
        stateName: form.stateName,
        pincode: form.pincode,
      });

      if (form.firmLogoUri) {
        const savedLogoPath = await processAndSaveFirmImage(form.firmLogoUri, 'firm', newFirm.id);
        if (savedLogoPath) {
          await firmService.updateFirm(newFirm.id, { firmLogoRef: savedLogoPath });
        }
      }

      if (form.bisLogoUri && form.bisLicence) {
        const savedBisLogoPath = await processAndSaveFirmImage(form.bisLogoUri, 'bis_firm', newFirm.id);
        if (savedBisLogoPath) {
          await firmService.updateFirm(newFirm.id, { bisLogoUri: savedBisLogoPath, bisLicence: form.bisLicence });
        }
      }

      setActiveFirm(newFirm.id);
      setShowSuccessModal(true);
    } catch (error: any) {
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Transparent Glass Logo Picker
  const hasBisLicence = Boolean(form.bisLicence && form.bisLicence.trim());

  return (
    <TwoToneWrapper title="New Firm" showBack>
      <View style={{ flex: 1 }}>
        <KeyboardAwareScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          enableOnAndroid={true}
          enableAutomaticScroll={true}
          extraScrollHeight={120}
          extraHeight={140}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 190, paddingHorizontal: 14 }}
        >
          {/* CARD 0: STORE LOGO & BIS CERTIFICATION */}
          <GlassCard>
            <View className="flex-row items-center gap-2 mb-4 pb-2.5 border-b border-vj-text/10">
              <View className="bg-amber-500/15 p-2 rounded-xl border border-amber-500/25">
                <ImagePlus size={18} color="#D4AF37" />
              </View>
              <Text className="text-vj-text font-black text-sm uppercase tracking-wider">
                Store Emblems & Logos
              </Text>
            </View>

            <View className="flex-row items-center justify-around gap-4 py-2">
              {/* 1. FIRM BRAND LOGO */}
              <View className="items-center">
                <TouchableOpacity
                  onPress={() => pickImage('firmLogoUri')}
                  activeOpacity={0.8}
                  className="h-24 w-24 rounded-2xl justify-center items-center overflow-hidden border-2 border-amber-500/30 shadow-xs mb-2 bg-black/5"
                >
                  {form.firmLogoUri ? (
                    <Image
                      source={{ uri: form.firmLogoUri }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                      onError={() => {
                        console.warn('[CreateFirm] Failed to load logo preview thumbnail.');
                        setForm((prev: typeof form) => ({ ...prev, firmLogoUri: null }));
                      }}
                    />
                  ) : (
                    <View className="w-full h-full justify-center items-center bg-black/5">
                      <View className="items-center justify-center">
                        <ImagePlus size={22} color="#D4AF37" />
                        <Text className="text-[9px] text-vj-text/70 font-black tracking-widest uppercase mt-1 text-center px-1">
                          STORE LOGO
                        </Text>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity 
                  onPress={() => pickImage('firmLogoUri')} 
                  className="px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30"
                >
                  <Text className="text-[10px] text-vj-text font-bold tracking-widest uppercase">
                    {form.firmLogoUri ? "CHANGE LOGO" : "UPLOAD LOGO"}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 2. BIS HALLMARK LOGO (APPEARS ONLY WHEN BIS LICENCE NO IS ADDED) */}
              {hasBisLicence && (
                <View className="items-center">
                  <TouchableOpacity
                    onPress={() => pickImage('bisLogoUri')}
                    activeOpacity={0.8}
                    className="h-24 w-24 rounded-2xl justify-center items-center overflow-hidden border-2 border-amber-400/50 shadow-xs mb-2 bg-black/5 p-2"
                  >
                    {form.bisLogoUri ? (
                      <Image
                        source={{ uri: form.bisLogoUri }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="contain"
                        onError={() => {
                          console.warn('[CreateFirm] Failed to load BIS logo thumbnail.');
                          setForm((prev: typeof form) => ({ ...prev, bisLogoUri: null }));
                        }}
                      />
                    ) : (
                      <View className="items-center justify-center">
                        <ShieldCheck size={24} color="#D4AF37" />
                        <Text className="text-[9px] text-amber-700 font-bold uppercase mt-1 text-center">
                          BIS LOGO
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity 
                    onPress={() => pickImage('bisLogoUri')} 
                    className="px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-400/40"
                  >
                    <Text className="text-[10px] text-vj-text font-bold tracking-widest uppercase">
                      {form.bisLogoUri ? "CHANGE BIS" : "UPLOAD BIS"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </GlassCard>
          {/* CARD 1: STORE IDENTITY */}
          <GlassCard>
          <View className="flex-row items-center gap-2 mb-4 pb-2.5 border-b border-vj-text/10">
            <View className="bg-amber-500/15 p-2 rounded-xl border border-amber-500/25">
              <Building2 size={18} color="#D4AF37" />
            </View>
            <Text className="text-vj-text font-black text-sm uppercase tracking-wider">
              Store Profile
            </Text>
          </View>

          <GlassInput
            label="Firm Name *"
            icon={<Building2 size={18} color="#D4AF37" />}
            value={form.name}
            onChangeText={(t) => setForm({ ...form, name: t })}
          />
          <GlassInput
            label="Firm Code *"
            icon={<Tag size={18} color="#D4AF37" />}
            value={form.firmCode}
            onChangeText={(t) => setForm({ ...form, firmCode: t })}
            maxLength={10}
            autoCapitalize="characters"
          />
          <GlassInput
            label="Proprietor *"
            icon={<User size={18} color="#D4AF37" />}
            value={form.proprietor}
            onChangeText={(t) => setForm({ ...form, proprietor: t })}
          />
        </GlassCard>

        {/* CARD 2: COMPLIANCE & TAX */}
        <GlassCard>
          <View className="flex-row items-center gap-2 mb-4 pb-2.5 border-b border-vj-text/10">
            <View className="bg-amber-500/15 p-2 rounded-xl border border-amber-500/25">
              <ShieldCheck size={18} color="#D4AF37" />
            </View>
            <Text className="text-vj-text font-black text-sm uppercase tracking-wider">
              Compliance & Tax
            </Text>
          </View>

          <GlassInput
            label="GSTIN (Optional)"
            icon={<Hash size={18} color="#D4AF37" />}
            placeholder="e.g. 27ASDFG1234A1Z5"
            value={form.gstin}
            onChangeText={handleGstinChange}
            keyboardType={getGSTINKeyboardType(form.gstin.length)}
            maxLength={15}
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
          />
          
          {/* Glass Alert Caution Banner */}
          <View className="mb-4 p-3.5 bg-amber-500/10 rounded-2xl border border-amber-500/25 flex-row items-center gap-2.5">
            <AlertTriangle size={18} color="#D97706" />
            <Text className="text-[11px] text-amber-900 font-extrabold flex-1 leading-tight uppercase tracking-wide">
              GSTIN locks invoice tax mode permanently once registered.
            </Text>
          </View>

          <GlassInput
            label="BIS Licence (Optional)"
            icon={<ShieldCheck size={18} color="#D4AF37" />}
            value={form.bisLicence}
            onChangeText={(t) => setForm({ ...form, bisLicence: t })}
          />

          {!form.bisLicence ? (
            <View className="mt-1 px-1">
              <Text className="text-[11px] text-vj-text/50 font-medium italic">
                Enter BIS Licence to enable BIS Hallmark logo upload in header.
              </Text>
            </View>
          ) : (
            <View className="mt-1 px-1 flex-row items-center gap-1.5">
              <ShieldCheck size={14} color="#D4AF37" />
              <Text className="text-[11px] text-amber-800 font-bold">
                BIS Hallmark Logo upload unlocked in header above ↑
              </Text>
            </View>
          )}
        </GlassCard>

        {/* CARD 3: LOCATION & CONTACT */}
        <GlassCard>
          <View className="flex-row items-center gap-2 mb-4 pb-2.5 border-b border-vj-text/10">
            <View className="bg-amber-500/15 p-2 rounded-xl border border-amber-500/25">
              <MapPin size={18} color="#D4AF37" />
            </View>
            <Text className="text-vj-text font-black text-sm uppercase tracking-wider">
              Location & Contact
            </Text>
          </View>

          <GlassInput
            label="Primary Mobile *"
            icon={<Phone size={18} color="#D4AF37" />}
            value={form.phone1}
            onChangeText={(t) => setForm({ ...form, phone1: t })}
            keyboardType="numeric"
            maxLength={10}
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <GlassInput
                label="Phone 2"
                value={form.phone2}
                onChangeText={(t) => setForm({ ...form, phone2: t })}
                keyboardType="numeric"
                maxLength={10}
              />
            </View>
            <View className="flex-1">
              <GlassInput
                label="Phone 3"
                value={form.phone3}
                onChangeText={(t) => setForm({ ...form, phone3: t })}
                keyboardType="numeric"
                maxLength={10}
              />
            </View>
          </View>

          <GlassInput
            label="Address Line 1 *"
            icon={<MapPin size={18} color="#D4AF37" />}
            value={form.addressLine1}
            onChangeText={(t) => setForm({ ...form, addressLine1: t })}
          />
          <GlassInput
            label="Address Line 2"
            value={form.addressLine2}
            onChangeText={(t) => setForm({ ...form, addressLine2: t })}
          />

          {/* State Selector Trigger */}
          <View className="mb-4">
            <Text className="text-vj-text/70 font-bold text-xs uppercase tracking-wider mb-2 ml-1">
              State / Jurisdiction *
            </Text>
            <TouchableOpacity
              onPress={() => setShowStatePicker(true)}
              activeOpacity={0.8}
              className="flex-row items-center justify-between bg-white rounded-2xl px-4 py-4 border border-vj-text/30"
            >
              <View className="flex-row items-center gap-2">
                <View className="px-2.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/25">
                  <Text className="text-amber-900 font-extrabold text-xs">
                    {form.stateCode}
                  </Text>
                </View>
                <Text className="text-vj-text font-semibold text-base">
                  {form.stateName}
                </Text>
              </View>
              <ChevronDown size={20} color="#D4AF37" />
            </TouchableOpacity>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <GlassInput
                label="City *"
                value={form.city}
                onChangeText={(t) => setForm({ ...form, city: t })}
              />
            </View>
            <View className="flex-1">
              <GlassInput
                label="Pincode *"
                value={form.pincode}
                onChangeText={(t) => setForm({ ...form, pincode: t })}
                keyboardType="numeric"
                maxLength={6}
              />
            </View>
          </View>
        </GlassCard>
      </KeyboardAwareScrollView>

        {/* === FIXED STICKY PILL-SHAPED GLASS ACTION BAR === */}
        <FixedGlassBar>
          <TouchableOpacity
            style={fixedBarStyles.pillPrimaryBtn}
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Save size={18} color="#fff" />
                <Text style={fixedBarStyles.pillPrimaryText}>Establish Firm Identity</Text>
              </>
            )}
          </TouchableOpacity>
        </FixedGlassBar>
      </View>

      {/* STATE PICKER MODAL */}
      <Modal
        visible={showStatePicker}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setShowStatePicker(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-vj-bg rounded-t-3xl h-2/3 p-6 shadow-xl">
            <View className="flex-row justify-between items-center mb-4 border-b border-black/10 pb-4">
              <Text className="text-xl font-bold text-vj-text">Select Jurisdiction</Text>
              <TouchableOpacity
                onPress={() => setShowStatePicker(false)}
                className="p-1 bg-black/5 rounded-full"
              >
                <X size={20} color={COLORS.vjText} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {INDIAN_STATES.map((s) => (
                <TouchableOpacity
                  key={s.code}
                  className="py-4 border-b border-black/5 flex-row justify-between items-center"
                  onPress={() => {
                    setForm({ ...form, stateCode: s.code, stateName: s.name });
                    setShowStatePicker(false);
                  }}
                >
                  <Text className="text-base font-medium text-vj-text">
                    {s.code} - {s.name}
                  </Text>
                  {form.stateCode === s.code && <CheckCircle2 size={18} color="#15803d" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* SUCCESS MODAL */}
      <Modal animationType="fade" transparent visible={showSuccessModal}>
        <View className="flex-1 bg-black/50 justify-center items-center px-6">
          <View className="w-full bg-vj-bg rounded-3xl p-8 shadow-xl items-center border border-white/50">
            <View className="bg-vj-success/20 p-6 rounded-full mb-6 border border-vj-success/30">
              <CheckCircle2 size={48} color="#15803d" />
            </View>
            <Text className="text-2xl font-bold text-vj-text mb-2 text-center tracking-tight">
              Identity Established
            </Text>
            <Text className="text-vj-text/60 text-center mb-8 font-medium">
              Your firm{' '}
              <Text className="font-bold text-vj-text">{form.name}</Text> has been
              successfully registered on this device.
            </Text>
            <View className="w-full">
              <GlassButton
                title="Enter Dashboard"
                icon={<ArrowRight size={20} color="#FCFBF8" />}
                onPress={() => {
                  setShowSuccessModal(false);
                  try { router.dismissAll(); } catch {}
                  router.replace('/dashboard');
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ERROR MODAL */}
      <Modal animationType="fade" transparent visible={!!errorMessage}>
        <View className="flex-1 bg-black/50 justify-center items-center px-6">
          <View className="w-full bg-vj-bg rounded-3xl p-8 shadow-xl items-center border border-white/50">
            <View className="bg-red-500/20 p-6 rounded-full mb-6 border border-red-500/30">
              <AlertTriangle size={48} color="#ef4444" />
            </View>
            <Text className="text-2xl font-bold text-vj-text mb-2 text-center tracking-tight">
              Action Required
            </Text>
            <Text className="text-vj-text/60 text-center mb-8 font-medium">
              {errorMessage}
            </Text>
            <View className="w-full">
              <GlassButton
                title="Dismiss"
                variant="danger"
                onPress={() => setErrorMessage(null)}
              />
            </View>
          </View>
        </View>
      </Modal>

    </TwoToneWrapper>
  );
}