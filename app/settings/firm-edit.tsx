import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, Image, KeyboardAvoidingView, Platform, ActivityIndicator, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { firmService } from '../../services/firmService';
import { useFirmStore } from '../../store/firmStore';
import { INDIAN_STATES } from '../../utils/indianStates'; 
import { GlassCard, GlassInput, GlassButton } from '../../components/ui/Glass';
import { Save, Building2, User, MapPin, Hash, Phone, ShieldCheck, ImagePlus, Tag, CheckCircle2, ArrowLeft, ChevronDown, X } from 'lucide-react-native';
// ARCHITECT FIX: Import the mandatory G69 guard
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';

export default function EditFirmScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { firms } = useFirmStore();
  
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
    stateCode: '',
    stateName: '',
    pincode: ''
  });

  useEffect(() => {
    if (id && firms.length > 0) {
      const firmToEdit = firms.find(f => f.id === id);
      if (firmToEdit) {
        setOriginalFirm(firmToEdit);
        setForm({
          name: firmToEdit.name,
          firmCode: firmToEdit.firmCode,
          proprietor: firmToEdit.proprietor,
          logoUri: firmToEdit.firmLogoRef || null, // ARCHITECT FIX: Correctly read from firmLogoRef
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

  // ARCHITECT FIX: Expanded dirty check to catch logo/licence changes
  const isDirty = useMemo(() => {
    if (!originalFirm) return false;
    return form.name !== originalFirm.name || 
           form.proprietor !== originalFirm.proprietor || 
           form.phone1 !== originalFirm.phone1 ||
           form.phone2 !== (originalFirm.phone2 || '') ||
           form.phone3 !== (originalFirm.phone3 || '') ||
           form.addressLine1 !== originalFirm.addressLine1 ||
           form.city !== originalFirm.city ||
           form.pincode !== originalFirm.pincode ||
           form.logoUri !== (originalFirm.firmLogoRef || null) ||
           form.bisLogoUri !== (originalFirm.bisLogoRef || null) ||
           form.bisLicence !== (originalFirm.bisLicence || '');
  }, [form, originalFirm]);

  // ARCHITECT FIX: Apply the G69 Unsaved Changes Guard
  useUnsavedChangesGuard(isDirty);

  const pickImage = async (field: 'logoUri' | 'bisLogoUri') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], 
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      setForm(prev => ({ ...prev, [field]: result.assets[0].uri }));
    }
  };

  const validateBis = (licence: string) => /^[A-Z0-9\/\-]{8,}$/.test(licence);

  const handleUpdate = async () => {
    if (!form.name || !form.proprietor || !form.phone1 || !form.addressLine1 || !form.city || !form.pincode) {
      Alert.alert("Missing Fields", "Required fields cannot be empty.");
      return;
    }

    if (form.bisLicence && !validateBis(form.bisLicence)) {
      Alert.alert("Invalid BIS Licence", "Please enter a valid BIS Licence Number.");
      return;
    }

    const executeUpdate = async () => {
      try {
        setLoading(true);
        
        // ARCHITECT FIX: Assemble payload securely
        const updatePayload: any = {
          name: form.name,
          proprietor: form.proprietor,
          bisLicence: form.bisLicence || null,
          bisLogoRef: form.bisLogoUri !== originalFirm.bisLogoRef ? form.bisLogoUri : undefined, // FIX: bisLogoRef
          firmLogoRef: form.logoUri !== originalFirm.firmLogoRef ? form.logoUri : undefined,   // FIX: firmLogoRef
          phone1: form.phone1,
          phone2: form.phone2 || null,
          phone3: form.phone3 || null,
          addressLine1: form.addressLine1,
          addressLine2: form.addressLine2 || null,
          city: form.city,
          pincode: form.pincode,
        };

        // ARCHITECT FIX (v7.9 FIX-V79-5): Conditionally add state properties ONLY if no GSTIN exists
        if (!originalFirm.gstin) {
          updatePayload.stateCode = form.stateCode;
          updatePayload.stateName = form.stateName;
        }

        await firmService.updateFirm(id, updatePayload);
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

  if (initialLoad) return <ActivityIndicator size="large" className="mt-10" color="#B87333" />;

  const headerLogoPicker = (
    <View className="items-center pb-4">
      <TouchableOpacity onPress={() => pickImage('logoUri')} className="h-28 w-28 rounded-full justify-center items-center overflow-hidden border-4 border-vj-bg/20 shadow-lg bg-white/10">
        {form.logoUri ? (
          <Image source={{ uri: form.logoUri }} className="w-full h-full resize-mode-contain" />
        ) : (
          <View className="items-center">
            <ImagePlus size={24} color="#FAF3E0" />
            <Text className="text-[10px] text-vj-bg/80 font-bold mt-2 tracking-widest">CHANGE LOGO</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <TwoToneWrapper title="Edit Firm" showBack headerContent={headerLogoPicker}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100, paddingTop: 10 }}>
          
          <GlassCard style={{ borderWidth: 0 }}>
            <GlassInput label="Firm Name" value={form.name} onChangeText={(t) => setForm({...form, name: t})} icon={<Building2 size={18} color="#B87333" />} />
            <View className="mb-4">
              <Text className="text-vj-text/70 font-bold text-xs uppercase tracking-wider mb-2 ml-1">Firm Code (Locked)</Text>
              <View className="flex-row items-center bg-gray-100/50 rounded-2xl px-5 py-3 border border-gray-200">
                <View className="mr-3 opacity-50"><Tag size={18} color="#999" /></View>
                <Text className="text-gray-500 font-bold text-base">{form.firmCode}</Text>
              </View>
            </View>
            <GlassInput label="Proprietor" value={form.proprietor} onChangeText={(t) => setForm({...form, proprietor: t})} icon={<User size={18} color="#B87333" />} />
          </GlassCard>

          <GlassCard style={{ borderWidth: 0 }}>
            <View className="mb-4">
              <Text className="text-vj-text/70 font-bold text-xs uppercase tracking-wider mb-2 ml-1">GSTIN (Statutory Lock)</Text>
              <View className="flex-row items-center bg-gray-100/50 rounded-2xl px-5 py-3 border border-gray-200">
                <View className="mr-3 opacity-50"><Hash size={18} color="#999" /></View>
                <Text className="text-gray-500 font-bold text-base">{form.gstin || "Unregistered (Bill of Supply)"}</Text>
              </View>
            </View>

            <GlassInput label="BIS Licence" value={form.bisLicence} onChangeText={(t) => setForm({...form, bisLicence: t})} icon={<ShieldCheck size={18} color="#B87333" />} />
            
            {!form.bisLicence ? (
              <View className="mt-4 p-4 bg-white/40 rounded-2xl border border-white/50">
                <Text className="text-vj-text font-bold text-xs mb-1">BIS Hallmark Logo</Text>
                <Text className="text-vj-text/60 text-[10px]">Add BIS licence number first to enable BIS logo upload.</Text>
              </View>
            ) : (
              <View className="mt-4 p-3 bg-white/60 rounded-2xl border border-white/50 flex-row items-center justify-between">
                <Text className="text-vj-text font-bold text-xs ml-2">BIS Hallmark Logo</Text>
                <TouchableOpacity onPress={() => pickImage('bisLogoUri')} className="bg-white/80 px-4 py-2 rounded-full shadow-sm border border-white">
                  <Text className="text-xs font-bold text-vj-accent">{form.bisLogoUri ? "Change" : "Upload"}</Text>
                </TouchableOpacity>
              </View>
            )}
            {form.bisLogoUri && <Image source={{ uri: form.bisLogoUri }} className="h-16 w-32 resize-mode-contain mt-2 self-center" />}
          </GlassCard>

          <GlassCard style={{ borderWidth: 0 }}>
            <GlassInput label="Primary Mobile" value={form.phone1} onChangeText={(t) => setForm({...form, phone1: t})} icon={<Phone size={18} color="#B87333" />} keyboardType="numeric" maxLength={10} />
            <GlassInput label="Phone 2" value={form.phone2} onChangeText={(t) => setForm({...form, phone2: t})} placeholder="Optional" keyboardType="numeric" maxLength={10} />
            <GlassInput label="Phone 3" value={form.phone3} onChangeText={(t) => setForm({...form, phone3: t})} placeholder="Optional" keyboardType="numeric" maxLength={10} />
          </GlassCard>

          <GlassCard style={{ borderWidth: 0 }}>
            <GlassInput label="Line 1" value={form.addressLine1} onChangeText={(t) => setForm({...form, addressLine1: t})} icon={<MapPin size={18} color="#B87333" />} />
            <GlassInput label="Line 2" value={form.addressLine2} onChangeText={(t) => setForm({...form, addressLine2: t})} />
            
            <View className="mb-4">
              <Text className="text-vj-text/70 font-bold text-xs uppercase tracking-wider mb-2 ml-1">State / Jurisdiction</Text>
              <TouchableOpacity 
                onPress={() => { if (!form.gstin) setShowStatePicker(true); else Alert.alert("Locked", "State cannot be changed when GSTIN is registered."); }} 
                className={`flex-row items-center justify-between rounded-2xl px-5 py-3 border ${form.gstin ? 'bg-gray-100/50 border-gray-200' : 'bg-white/40 border-white/50'}`}
              >
                <Text className={form.gstin ? 'text-gray-500' : 'text-vj-text font-semibold'}>{form.stateCode} - {form.stateName}</Text>
                {!form.gstin && <ChevronDown size={20} color="#B87333" />}
              </TouchableOpacity>
            </View>

            <GlassInput label="City" value={form.city} onChangeText={(t) => setForm({...form, city: t})} />
            <GlassInput label="Pincode" value={form.pincode} onChangeText={(t) => setForm({...form, pincode: t})} keyboardType="numeric" maxLength={6} />
          </GlassCard>

          <View className="mt-4 mb-10">
            <GlassButton title="Save Changes" icon={<Save size={20} color="#FAF3E0" />} onPress={handleUpdate} loading={loading} />
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showStatePicker} animationType="slide" transparent={true}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-vj-bg rounded-t-3xl h-2/3 p-6 shadow-xl">
            <View className="flex-row justify-between items-center mb-4 border-b border-black/10 pb-4">
              <Text className="text-xl font-bold text-vj-text">Select Jurisdiction</Text>
              <TouchableOpacity onPress={() => setShowStatePicker(false)} className="p-1 bg-black/5 rounded-full">
                <X size={20} color="#2E1D00" />
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

      <Modal animationType="fade" transparent={true} visible={showSuccessModal}>
        <View className="flex-1 bg-black/50 justify-center items-center px-6">
          <View className="w-full bg-vj-bg rounded-3xl p-8 shadow-xl items-center border border-white/50">
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
                icon={<ArrowLeft size={20} color="#FAF3E0" />} 
                onPress={() => { setShowSuccessModal(false); router.back(); }} 
              />
            </View>
          </View>
        </View>
      </Modal>
    </TwoToneWrapper>
  );
}