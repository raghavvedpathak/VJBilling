// app/settings/edit-firm.tsx — Phase 2 v2.11 Canonical Screen

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, Image, ActivityIndicator, Modal } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { firmService } from '@/services/phase1/firmService';
import { useFirmStore } from '@/store/phase1/useFirmStore';
import { INDIAN_STATES } from '@/utils/indianStates'; 
import { GlassCard, GlassInput, GlassButton, FixedGlassBar, fixedBarStyles } from '@/components/ui/Glass';
import { Save, Building2, User, MapPin, Hash, Phone, ShieldCheck, ImagePlus, Tag, CheckCircle2, ArrowLeft, ChevronDown, X, Lock } from 'lucide-react-native';
import { validateGSTIN, formatGSTINInput, getGSTINKeyboardType } from '@/utils/validateGSTIN';
import { validatePincode } from '@/utils/validatePincode';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { processAndSaveFirmImage } from '@/utils/processFirmImage';
import { COLORS } from '@/constants/theme';

export default function EditFirmScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { firms, switchFirm } = useFirmStore();
  
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [originalFirm, setOriginalFirm] = useState<any>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showStatePicker, setShowStatePicker] = useState(false);

  const [form, setForm] = useState({
    name: '',
    firmCode: '',
    proprietor: '',
    logoUri: null as string | null,
    gstin: '',
    bisLicence: '',
    bisLogoUri: null as string | null,
    phone1: '',
    phone2: '',
    phone3: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    pincode: '',
    stateCode: '',
    stateName: '',
  });

  const handleGstinChange = (text: string) => {
    const formatted = formatGSTINInput(text);
    let updatedStateCode = form.stateCode;
    let updatedStateName = form.stateName;

    if (!originalFirm?.gstin && formatted.length >= 2) {
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

  useEffect(() => {
    if (id && firms.length > 0) {
      const firmToEdit = firms.find((f: any) => f.id === id);
      if (firmToEdit) {
        setOriginalFirm(firmToEdit);
        setForm({
          name: firmToEdit.name,
          firmCode: firmToEdit.firmCode,
          proprietor: firmToEdit.proprietor,
          logoUri: firmToEdit.firmLogoRef || null, 
          gstin: firmToEdit.gstin || '',
          bisLicence: firmToEdit.bisLicence || '',
          bisLogoUri: firmToEdit.bisLogoRef || null, 
          phone1: firmToEdit.phone1,
          phone2: firmToEdit.phone2 || '',
          phone3: firmToEdit.phone3 || '',
          addressLine1: firmToEdit.addressLine1,
          addressLine2: firmToEdit.addressLine2 || '',
          city: firmToEdit.city,
          stateCode: firmToEdit.stateCode || '',
          stateName: firmToEdit.stateName || '',
          pincode: firmToEdit.pincode
        });
      }
      setInitialLoad(false);
    }
  }, [id, firms]);

  const isDirty = useMemo(() => {
    if (!originalFirm) return false;
    return form.name !== originalFirm.name || 
           form.proprietor !== originalFirm.proprietor || 
           form.phone1 !== originalFirm.phone1 ||
           form.phone2 !== (originalFirm.phone2 || '') ||
           form.phone3 !== (originalFirm.phone3 || '') ||
           form.addressLine1 !== originalFirm.addressLine1 ||
           form.addressLine2 !== (originalFirm.addressLine2 || '') ||
           form.city !== originalFirm.city ||
           form.pincode !== originalFirm.pincode ||
           form.logoUri !== (originalFirm.firmLogoRef || null) ||
           form.bisLogoUri !== (originalFirm.bisLogoRef || null) ||
           form.bisLicence !== (originalFirm.bisLicence || '') ||
           form.gstin !== (originalFirm.gstin || '') ||
           form.stateCode !== (originalFirm.stateCode || '');
  }, [form, originalFirm]);

  const { UnsavedModal } = useUnsavedChangesGuard(isDirty);

  const pickImage = async (field: 'logoUri' | 'bisLogoUri') => {
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

  const handleImageSelection = async (field: 'logoUri' | 'bisLogoUri', source: 'camera' | 'gallery') => {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'], 
      allowsEditing: true,
      quality: 0.8,
    };

    let result;
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
      setForm(prev => ({ ...prev, [field]: result.assets[0].uri }));
    }
  };

  const validateBis = (licence: string) => /^[A-Z0-9\/\-]{8,}$/.test(licence.trim().toUpperCase());

  const handleUpdate = async () => {
    if (!form.name.trim() || !form.proprietor.trim() || !form.phone1.trim() || !form.addressLine1.trim() || !form.city.trim() || !form.pincode.trim()) {
      Alert.alert("Missing Fields", "Required fields cannot be empty.");
      return;
    }

    if (!/^[0-9]{10}$/.test(form.phone1.trim())) {
      Alert.alert("Invalid Phone", "Primary Mobile must be exactly 10 digits.");
      return;
    }

    if (form.phone2 && !/^[0-9]{10}$/.test(form.phone2.trim())) {
      Alert.alert("Invalid Phone", "Phone 2 must be exactly 10 digits.");
      return;
    }

    if (form.phone3 && !/^[0-9]{10}$/.test(form.phone3.trim())) {
      Alert.alert("Invalid Phone", "Phone 3 must be exactly 10 digits.");
      return;
    }

    try {
      validatePincode(form.pincode);
    } catch (err: any) {
      Alert.alert("Invalid Pincode", err.message || "Please enter a valid 6-digit pincode.");
      return;
    }

    if (form.bisLicence && !validateBis(form.bisLicence)) {
      Alert.alert("Invalid BIS Licence", "Please enter a valid BIS Licence Number.");
      return;
    }

    if (!originalFirm?.gstin && form.gstin) {
      try {
        validateGSTIN(form.gstin);
        const gstinStatePrefix = form.gstin.trim().slice(0, 2);
        if (gstinStatePrefix !== form.stateCode) {
          Alert.alert(
            "State Mismatch",
            `GSTIN state prefix (${gstinStatePrefix}) must match chosen jurisdiction state code (${form.stateCode}).`
          );
          return;
        }
      } catch (err: any) {
        Alert.alert("Invalid GSTIN", err.message || "Please enter a valid 15-character GSTIN.");
        return;
      }
    }

    const executeUpdate = async () => {
      try {
        setLoading(true);
        if (!id) return;
        
        const updatePayload: any = {
          name: form.name.trim(),
          proprietor: form.proprietor.trim(),
          bisLicence: form.bisLicence ? form.bisLicence.trim().toUpperCase() : null,
          phone1: form.phone1.trim(),
          phone2: form.phone2 ? form.phone2.trim() : null,
          phone3: form.phone3 ? form.phone3.trim() : null,
          addressLine1: form.addressLine1.trim(),
          addressLine2: form.addressLine2 ? form.addressLine2.trim() : null,
          city: form.city.trim(),
          pincode: form.pincode.trim(),
        };

        // Process new images if changed
        if (form.logoUri !== (originalFirm?.firmLogoRef || null)) {
          if (form.logoUri) {
            const savedLogoPath = await processAndSaveFirmImage(form.logoUri, 'firm', id);
            if (savedLogoPath) updatePayload.firmLogoRef = savedLogoPath;
          } else {
            updatePayload.firmLogoRef = null;
          }
        }

        if (form.bisLogoUri !== (originalFirm?.bisLogoRef || null)) {
          if (form.bisLogoUri) {
            const savedBisLogoPath = await processAndSaveFirmImage(form.bisLogoUri, 'bis_firm', id);
            if (savedBisLogoPath) updatePayload.bisLogoRef = savedBisLogoPath;
          } else {
            updatePayload.bisLogoRef = null;
          }
        }

        if (!originalFirm?.gstin) {
          updatePayload.stateCode = form.stateCode;
          updatePayload.stateName = form.stateName;
          if (form.gstin) {
            updatePayload.gstin = form.gstin.trim().toUpperCase();
          }
        }

        await firmService.updateFirm(id, updatePayload);

        // Safe cleanup of obsolete files
        if (form.logoUri !== (originalFirm?.firmLogoRef || null) && originalFirm?.firmLogoRef) {
          try { await FileSystem.deleteAsync(originalFirm.firmLogoRef, { idempotent: true }); } catch {}
        }
        if (form.bisLogoUri !== (originalFirm?.bisLogoRef || null) && originalFirm?.bisLogoRef) {
          try { await FileSystem.deleteAsync(originalFirm.bisLogoRef, { idempotent: true }); } catch {}
        }

        await switchFirm(id);
        setShowSuccessModal(true);
      } catch (error: any) {
        Alert.alert("Update Failed", error.message);
      } finally {
        setLoading(false);
      }
    };

    if (originalFirm?.bisLogoRef && !form.bisLicence) {
      Alert.alert(
        "Archive BIS Logo?",
        "Removing the BIS Licence will automatically archive your BIS Logo. Proceed?",
        [{ text: "Cancel", style: "cancel" }, { text: "Yes, Archive", style: "destructive", onPress: executeUpdate }]
      );
      return;
    }

    await executeUpdate();
  };

  if (initialLoad) return <ActivityIndicator size="large" className="mt-10" color={COLORS.vjAccent} />;

  const hasBisLicence = Boolean(form.bisLicence && form.bisLicence.trim());

  return (
    <TwoToneWrapper title="Edit Firm" showBack>
      <View style={{ flex: 1 }}>
        <KeyboardAwareScrollView 
          showsVerticalScrollIndicator={false} 
          keyboardShouldPersistTaps="handled" 
          keyboardDismissMode="on-drag"
          enableOnAndroid={true}
          enableAutomaticScroll={true}
          extraScrollHeight={120}
          extraHeight={140}
          contentContainerStyle={{ paddingBottom: 190, paddingTop: 16, paddingHorizontal: 14 }}
        >
          {/* CARD 0: STORE LOGO & BIS CERTIFICATION */}
          <GlassCard>
            <View className="flex-row items-center gap-2 mb-4 pb-2.5 border-b border-vj-text/10">
              <View className="bg-amber-500/15 p-2 rounded-xl border border-amber-500/25">
                <ImagePlus size={18} color={COLORS.vjAccent} />
              </View>
              <Text className="text-vj-text font-black text-sm uppercase tracking-wider">
                Store Emblems & Logos
              </Text>
            </View>

            <View className="flex-row items-center justify-around gap-4 py-2">
              {/* 1. FIRM BRAND LOGO */}
              <View className="items-center">
                <TouchableOpacity
                  onPress={() => pickImage('logoUri')}
                  activeOpacity={0.8}
                  className="h-24 w-24 rounded-2xl justify-center items-center overflow-hidden border-2 border-amber-500/30 mb-2 bg-black/5"
                >
                  {form.logoUri ? (
                    <Image 
                      source={{ uri: form.logoUri }} 
                      style={{ width: '100%', height: '100%' }} 
                      resizeMode="cover"
                      onError={() => {
                        console.warn('[FirmEdit] Failed to load firm logo thumbnail.');
                        setForm((prev) => ({ ...prev, logoUri: null }));
                      }} 
                    />
                  ) : (
                    <View className="w-full h-full justify-center items-center bg-black/5">
                      <View className="items-center justify-center">
                        <ImagePlus size={22} color={COLORS.vjAccent} />
                        <Text className="text-[9px] text-vj-text/70 font-black tracking-widest uppercase mt-1 text-center px-1">
                          NO LOGO
                        </Text>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
                
                <TouchableOpacity 
                  onPress={() => pickImage('logoUri')} 
                  className="px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30"
                >
                  <Text className="text-[10px] text-vj-text font-bold tracking-widest uppercase">
                    {form.logoUri ? "CHANGE LOGO" : "UPLOAD LOGO"}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 2. BIS HALLMARK LOGO */}
              {hasBisLicence && (
                <View className="items-center">
                  <TouchableOpacity
                    onPress={() => pickImage('bisLogoUri')}
                    activeOpacity={0.8}
                    className="h-24 w-24 rounded-2xl justify-center items-center overflow-hidden border-2 border-amber-400/50 mb-2 bg-black/5 p-2"
                  >
                    {form.bisLogoUri ? (
                      <Image 
                        source={{ uri: form.bisLogoUri }} 
                        style={{ width: '100%', height: '100%' }} 
                        resizeMode="contain"
                        onError={() => {
                          console.warn('[FirmEdit] Failed to load BIS logo thumbnail.');
                          setForm((prev) => ({ ...prev, bisLogoUri: null }));
                        }} 
                      />
                    ) : (
                      <View className="items-center justify-center">
                        <ShieldCheck size={24} color={COLORS.vjAccent} />
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

          {/* CARD 1: STORE PROFILE */}
          <GlassCard>
            <View className="flex-row items-center gap-2 mb-4 pb-2.5 border-b border-vj-text/10">
              <View className="bg-amber-500/15 p-2 rounded-xl border border-amber-500/25">
                <Building2 size={18} color={COLORS.vjAccent} />
              </View>
              <Text className="text-vj-text font-black text-sm uppercase tracking-wider">
                Store Profile
              </Text>
            </View>

            <GlassInput label="Firm Name *" value={form.name} onChangeText={(t) => setForm({...form, name: t})} icon={<Building2 size={18} color={COLORS.vjAccent} />} />
            
            <View className="mb-4">
              <Text className="text-vj-text/70 font-bold text-xs uppercase tracking-wider mb-2 ml-1">Firm Code (Locked)</Text>
              <View className="flex-row items-center justify-between bg-gray-100/60 rounded-2xl px-4 py-3.5 border border-gray-300">
                <View className="flex-row items-center gap-2.5">
                  <Tag size={18} color="#6B7280" />
                  <Text className="text-gray-700 font-bold text-base">{form.firmCode}</Text>
                </View>
                <Lock size={16} color="#9CA3AF" />
              </View>
            </View>

            <GlassInput label="Proprietor *" value={form.proprietor} onChangeText={(t) => setForm({...form, proprietor: t})} icon={<User size={18} color={COLORS.vjAccent} />} />
          </GlassCard>

          {/* CARD 2: COMPLIANCE & TAX */}
          <GlassCard>
            <View className="flex-row items-center gap-2 mb-4 pb-2.5 border-b border-vj-text/10">
              <View className="bg-amber-500/15 p-2 rounded-xl border border-amber-500/25">
                <ShieldCheck size={18} color={COLORS.vjAccent} />
              </View>
              <Text className="text-vj-text font-black text-sm uppercase tracking-wider">
                Compliance & Tax
              </Text>
            </View>

            {!originalFirm?.gstin ? (
              <GlassInput 
                label="GSTIN (Optional)" 
                value={form.gstin} 
                onChangeText={handleGstinChange} 
                keyboardType={getGSTINKeyboardType(form.gstin.length)}
                placeholder="15-digit GSTIN" 
                maxLength={15} 
                icon={<Hash size={18} color={COLORS.vjAccent} />} 
                autoCapitalize="characters"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
              />
            ) : (
              <View className="mb-4">
                <Text className="text-vj-text/70 font-bold text-xs uppercase tracking-wider mb-2 ml-1">GSTIN (Statutory Lock)</Text>
                <View className="flex-row items-center justify-between bg-gray-100/60 rounded-2xl px-4 py-3.5 border border-gray-300">
                  <View className="flex-row items-center gap-2.5">
                    <Hash size={18} color="#6B7280" />
                    <Text className="text-gray-700 font-bold text-base">{form.gstin}</Text>
                  </View>
                  <Lock size={16} color="#9CA3AF" />
                </View>
              </View>
            )}

            <GlassInput label="BIS Licence" value={form.bisLicence} onChangeText={(t) => setForm({...form, bisLicence: t})} icon={<ShieldCheck size={18} color={COLORS.vjAccent} />} autoCapitalize="characters" />
            
            {!form.bisLicence ? (
              <View className="mt-1 px-1">
                <Text className="text-[11px] text-vj-text/50 font-medium italic">
                  Enter BIS Licence to enable BIS Hallmark logo upload in header.
                </Text>
              </View>
            ) : (
              <View className="mt-1 px-1 flex-row items-center gap-1.5">
                <ShieldCheck size={14} color={COLORS.vjAccent} />
                <Text className="text-[11px] text-amber-800 font-bold">
                  BIS Hallmark Logo upload unlocked in header above ↑
                </Text>
              </View>
            )}
          </GlassCard>

          {/* CARD 3: CONTACT NUMBERS */}
          <GlassCard>
            <View className="flex-row items-center gap-2 mb-4 pb-2.5 border-b border-vj-text/10">
              <View className="bg-amber-500/15 p-2 rounded-xl border border-amber-500/25">
                <Phone size={18} color={COLORS.vjAccent} />
              </View>
              <Text className="text-vj-text font-black text-sm uppercase tracking-wider">
                Contact Numbers
              </Text>
            </View>

            <GlassInput label="Primary Mobile *" value={form.phone1} onChangeText={(t) => setForm({...form, phone1: t})} icon={<Phone size={18} color={COLORS.vjAccent} />} keyboardType="numeric" maxLength={10} />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <GlassInput label="Phone 2" value={form.phone2} onChangeText={(t) => setForm({...form, phone2: t})} placeholder="Optional" keyboardType="numeric" maxLength={10} />
              </View>
              <View className="flex-1">
                <GlassInput label="Phone 3" value={form.phone3} onChangeText={(t) => setForm({...form, phone3: t})} placeholder="Optional" keyboardType="numeric" maxLength={10} />
              </View>
            </View>
          </GlassCard>

          {/* CARD 4: LOCATION ADDRESS */}
          <GlassCard>
            <View className="flex-row items-center gap-2 mb-4 pb-2.5 border-b border-vj-text/10">
              <View className="bg-amber-500/15 p-2 rounded-xl border border-amber-500/25">
                <MapPin size={18} color={COLORS.vjAccent} />
              </View>
              <Text className="text-vj-text font-black text-sm uppercase tracking-wider">
                Store Address
              </Text>
            </View>

            <GlassInput label="Line 1 *" value={form.addressLine1} onChangeText={(t) => setForm({...form, addressLine1: t})} icon={<MapPin size={18} color={COLORS.vjAccent} />} />
            <GlassInput label="Line 2" value={form.addressLine2} onChangeText={(t) => setForm({...form, addressLine2: t})} />
            
            <View className="mb-4">
              <Text className="text-vj-text/70 font-bold text-xs uppercase tracking-wider mb-2 ml-1">State / Jurisdiction</Text>
              <TouchableOpacity 
                onPress={() => { if (!originalFirm?.gstin) setShowStatePicker(true); else Alert.alert("Locked", "State cannot be changed when GSTIN is registered."); }} 
                activeOpacity={0.8}
                className={`flex-row items-center justify-between rounded-2xl px-4 py-4 border ${originalFirm?.gstin ? 'bg-gray-100/60 border-gray-300' : 'bg-white border-vj-text/30'}`}
              >
                <View className="flex-row items-center gap-2">
                  <View className="px-2.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/25">
                    <Text className="text-amber-900 font-extrabold text-xs">
                      {form.stateCode}
                    </Text>
                  </View>
                  <Text className={originalFirm?.gstin ? 'text-gray-500 font-semibold text-base' : 'text-vj-text font-semibold text-base'}>
                    {form.stateName}
                  </Text>
                </View>
                {originalFirm?.gstin ? <Lock size={16} color="#9CA3AF" /> : <ChevronDown size={20} color={COLORS.vjAccent} />}
              </TouchableOpacity>
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <GlassInput label="City *" value={form.city} onChangeText={(t) => setForm({...form, city: t})} />
              </View>
              <View className="flex-1">
                <GlassInput label="Pincode *" value={form.pincode} onChangeText={(t) => setForm({...form, pincode: t})} keyboardType="numeric" maxLength={6} />
              </View>
            </View>
          </GlassCard>
        </KeyboardAwareScrollView>

        {/* FIXED STICKY ACTION BAR */}
        <FixedGlassBar>
          <TouchableOpacity
            style={fixedBarStyles.pillPrimaryBtn}
            onPress={handleUpdate}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Save size={18} color="#fff" />
                <Text style={fixedBarStyles.pillPrimaryText}>Save Firm Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </FixedGlassBar>
      </View>

      {/* STATE PICKER MODAL */}
      <Modal
        visible={showStatePicker}
        animationType="fade"
        transparent={true}
        statusBarTranslucent
        onRequestClose={() => setShowStatePicker(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-vj-bg rounded-t-3xl h-2/3 p-6 border-t border-white/50">
            <View className="flex-row justify-between items-center mb-4 border-b border-black/10 pb-4">
              <Text className="text-xl font-bold text-vj-text">Select Jurisdiction</Text>
              <TouchableOpacity onPress={() => setShowStatePicker(false)} className="p-1 bg-black/5 rounded-full">
                <X size={20} color={COLORS.vjText} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {INDIAN_STATES.map((s) => (
                <TouchableOpacity 
                  key={s.code} 
                  className="py-4 border-b border-black/5 flex-row justify-between items-center"
                  onPress={() => { setForm({...form, stateCode: s.code, stateName: s.name}); setShowStatePicker(false); }}
                >
                  <Text className="text-base font-medium text-vj-text">{s.code} - {s.name}</Text>
                  {form.stateCode === s.code && <CheckCircle2 size={18} color="#15803d" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* SUCCESS MODAL */}
      <Modal animationType="fade" transparent={true} visible={showSuccessModal}>
        <View className="flex-1 bg-black/50 justify-center items-center px-6">
          <View className="w-full bg-vj-bg rounded-3xl p-8 items-center border border-white/50">
            <View className="bg-vj-success/20 p-6 rounded-full mb-6 border border-vj-success/30">
              <CheckCircle2 size={48} color="#15803d" />
            </View>
            <Text className="text-2xl font-bold text-vj-text mb-2 text-center tracking-tight">Update Successful</Text>
            <Text className="text-vj-text/60 text-center mb-8 font-medium">
              The firm details have been updated securely.
            </Text>
            <View className="w-full">
              <GlassButton 
                title="Return to List" 
                icon={<ArrowLeft size={20} color="#FCFBF8" />} 
                onPress={() => { setShowSuccessModal(false); router.back(); }} 
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* UNSAVED CHANGES MODAL */}
      {UnsavedModal}

    </TwoToneWrapper>
  );
}