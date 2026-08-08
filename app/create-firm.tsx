import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { TwoToneWrapper } from '../components/TwoToneWrapper';
import { GlassCard, GlassInput, GlassButton } from '../components/ui/Glass';
import { firmService } from '../services/firmService';
import { useFirmStore } from '../store/firmStore';
import { INDIAN_STATES } from '../utils/indianStates';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard'; // G69: REQUIRED
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
import { COLORS } from '../constants/theme';

// ============================================================================
// G58 SPEC CONSTANTS — DO NOT change these values.
// spec: max 1024×1024, max 2MB, quality 0.8, free crop (aspect: undefined),
// saved to DocumentDirectory/logos/firm_{firmId}.jpg (deterministic path).
// ============================================================================
const LOGO_MAX_DIMENSION = 1024;
const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2MB
const LOGO_QUALITY = 0.8;

// ============================================================================
// processAndSaveLogoToPath — G58 canonical implementation
// ============================================================================
async function processAndSaveLogoToPath(
  rawUri: string,
  firmId: string
): Promise<string | null> {
  try {
    const manipulated = await manipulateAsync(
      rawUri,
      [
        {
          resize: {
            width: LOGO_MAX_DIMENSION,
            height: LOGO_MAX_DIMENSION,
          },
        },
      ],
      {
        compress: LOGO_QUALITY,
        format: SaveFormat.JPEG,
      }
    );

    const fileInfo = await FileSystem.getInfoAsync(manipulated.uri);
    if (fileInfo.exists && 'size' in fileInfo && fileInfo.size > LOGO_MAX_BYTES) {
      Alert.alert(
        'Image Too Large',
        'Please choose a smaller image. Maximum size is 2MB after processing.'
      );
      return null;
    }

    const logosDir = `${FileSystem.documentDirectory}logos/`;
    await FileSystem.makeDirectoryAsync(logosDir, { intermediates: true });

    const targetPath = `${logosDir}firm_${firmId}.jpg`;
    await FileSystem.copyAsync({ from: manipulated.uri, to: targetPath });

    return targetPath;
  } catch (e: any) {
    console.error('[CreateFirmScreen] Logo processing failed:', e);
    Alert.alert('Logo Error', 'Failed to process the logo image. Please try again.');
    return null;
  }
}

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
        Alert.alert("Permission Required", "Camera access is needed.");
        return;
      }
      result = await ImagePicker.launchCameraAsync(options);
    } else {
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
        const savedLogoPath = await processAndSaveLogoToPath(form.firmLogoUri, newFirm.id);
        if (savedLogoPath) {
          await firmService.updateFirm(newFirm.id, { firmLogoRef: savedLogoPath });
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
  const headerLogoPicker = (
    <View className="items-center pb-3 pt-1">
      <TouchableOpacity
        onPress={() => pickImage('firmLogoUri')}
        activeOpacity={0.8}
        className="h-28 w-28 rounded-3xl justify-center items-center overflow-hidden border-2 border-white/40 shadow-sm mb-2 bg-vj-glass"
      >
        {form.firmLogoUri ? (
          <Image
            source={{ uri: form.firmLogoUri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
            onError={() => {
              console.warn('[CreateFirm] Failed to load logo preview thumbnail.');
              setForm(prev => ({ ...prev, firmLogoUri: null }));
            }}
          />
        ) : (
          <BlurView intensity={20} tint="light" className="w-full h-full justify-center items-center">
            <View className="items-center justify-center">
              <ImagePlus size={26} color="#FCFBF8" />
              <Text className="text-[9px] text-vj-bg font-black tracking-widest uppercase mt-1 text-center px-1">
                STORE LOGO
              </Text>
            </View>
          </BlurView>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => pickImage('firmLogoUri')} className="px-4 py-1.5 rounded-full border border-white/30">
        <Text className="text-[11px] text-white font-bold tracking-widest uppercase">
          {form.firmLogoUri ? "CHANGE LOGO" : "UPLOAD LOGO"}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <TwoToneWrapper title="New Firm" showBack headerContent={headerLogoPicker}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 350, paddingHorizontal: 14 }}
      >
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
            value={form.gstin}
            onChangeText={(t) => setForm({ ...form, gstin: t })}
            maxLength={15}
            autoCapitalize="characters"
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
            <View className="mt-2 p-3.5 bg-white/40 rounded-2xl border border-white/50">
              <Text className="text-vj-text font-bold text-xs mb-1">BIS Hallmark Logo</Text>
              <Text className="text-vj-text/60 text-[11px]">
                Enter BIS licence number above to unlock Hallmark logo upload.
              </Text>
            </View>
          ) : (
            <View className="mt-2 p-3.5 bg-white/60 rounded-2xl border border-white/60 flex-row items-center justify-between">
              <Text className="text-vj-text font-bold text-xs ml-1">BIS Hallmark Logo</Text>
              <TouchableOpacity
                onPress={() => pickImage('bisLogoUri')}
                className="bg-white px-4 py-2 rounded-full shadow-xs border border-white/80"
              >
                <Text className="text-xs font-bold text-vj-accent">
                  {form.bisLogoUri ? 'Change Logo' : 'Upload Logo'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {form.bisLogoUri && (
            <Image
              source={{ uri: form.bisLogoUri }}
              style={{ height: 64, width: 128, resizeMode: 'contain', marginTop: 12, alignSelf: 'center' }}
            />
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

        {/* SUBMIT BUTTON */}
        <View className="mt-2 mb-10">
          <GlassButton
            title="Establish Firm Identity"
            icon={<Save size={20} color="#FCFBF8" />}
            onPress={handleSave}
            loading={loading}
          />
        </View>
      </ScrollView>

      {/* STATE PICKER MODAL */}
      <Modal visible={showStatePicker} animationType="slide" transparent>
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