import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
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
} from 'lucide-react-native';

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
//
// Takes a raw picker URI, enforces dimension + size constraints via
// expo-image-manipulator, saves to the deterministic path for a given firmId,
// and returns the saved local URI (or null on failure).
//
// Called AFTER firm creation (firmId is known only after createFirm() resolves).
// The flow is:
//   1. createFirm() — returns newFirm with id
//   2. processAndSaveLogoToPath(rawUri, newFirm.id) — saves to deterministic path
//   3. firmService.updateFirm(newFirm.id, { firmLogoRef: savedUri }) — persists ref
// ============================================================================
async function processAndSaveLogoToPath(
  rawUri: string,
  firmId: string
): Promise<string | null> {
  try {
    // Step 1: Downscale if needed. expo-image-manipulator resize is non-destructive —
    // it only shrinks, never upscales, when we use the fit strategy.
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

    // Step 2: Enforce 2MB size limit AFTER manipulator processing (spec G58).
    const fileInfo = await FileSystem.getInfoAsync(manipulated.uri);
    if (fileInfo.exists && 'size' in fileInfo && fileInfo.size > LOGO_MAX_BYTES) {
      Alert.alert(
        'Image Too Large',
        'Please choose a smaller image. Maximum size is 2MB after processing.'
      );
      return null;
    }

    // Step 3: Ensure deterministic target directory exists.
    const logosDir = `${FileSystem.documentDirectory}logos/`;
    await FileSystem.makeDirectoryAsync(logosDir, { intermediates: true });

    // Step 4: Copy to deterministic path. Overwrites on update — no orphan files.
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

  const [form, setForm] = useState({
    name: '',
    firmCode: '',
    proprietor: '',
    // firmLogoUri: raw picker URI — NOT the deterministic path.
    // The deterministic path is computed post-create in handleSave().
    // Spec G58: logo is a device-local file saved to logos/firm_{id}.jpg
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

  // G69: Track dirty state for useUnsavedChangesGuard. Applied to firm creation
  // screen as mandated by spec v6.2 G69 / Phase 1 constitutional requirement.
  const isDirty = useMemo(() => {
    return (
      form.name !== '' ||
      form.firmCode !== '' ||
      form.proprietor !== '' ||
      form.phone1 !== ''
    );
  }, [form]);

  // G69: ACTIVE — this hook shows a confirmation dialog if the user tries to
  // navigate away from a dirty form (when warnUnsavedChanges setting is ON).
  useUnsavedChangesGuard(isDirty);

  // -------------------------------------------------------------------------
  // G58: Image picker — allowsEditing: true, aspect: undefined (free crop),
  // quality: 0.8. Accepted types: images only.
  // Camera and gallery both permitted as picker source.
  // Post-processing (resize + size enforcement) happens in processAndSaveLogoToPath().
  // -------------------------------------------------------------------------
  const pickImage = async (field: 'firmLogoUri' | 'bisLogoUri') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      // aspect: undefined → free crop per G58. Do NOT set [1,1].
      quality: LOGO_QUALITY,
    });
    if (!result.canceled) {
      setForm((prev) => ({ ...prev, [field]: result.assets[0].uri }));
    }
  };

  const validateBis = (licence: string) => /^[A-Z0-9\/\-]{8,}$/.test(licence);

  // -------------------------------------------------------------------------
  // handleSave — 2-step logo flow per G58:
  //   Step A: createFirm() — firm created, id known
  //   Step B: processAndSaveLogoToPath() — logo copied to deterministic path
  //   Step C: firmService.updateFirm() — firmLogoRef persisted to DB
  // -------------------------------------------------------------------------
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
      Alert.alert('Missing Fields', 'Please fill all required fields.');
      return;
    }
    if (form.bisLicence && !validateBis(form.bisLicence)) {
      Alert.alert('Invalid BIS Licence', 'Please enter a valid BIS Licence Number.');
      return;
    }

    try {
      setLoading(true);

      // Step A: Create the firm. firmLogoRef is NOT passed here because the
      // deterministic path (logos/firm_{id}.jpg) requires the id, which we
      // only know after creation. BIS logo follows the normal bisLogoUri path.
      const newFirm = await firmService.createFirm({
        name: form.name,
        firmCode: form.firmCode.toUpperCase(),
        proprietor: form.proprietor,
        gstin: form.gstin || null,
        bisLicence: form.bisLicence || null,
        bisLogoUri: form.bisLogoUri,
        // firmLogoRef intentionally omitted here — set via updateFirm() after Step B
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

      // Step B + C: Process and persist the firm logo if one was selected.
      // This is non-blocking — if it fails, the firm is still created successfully.
      // The user can re-upload the logo from Firm Manager > Update Logos.
      if (form.firmLogoUri) {
        const savedLogoPath = await processAndSaveLogoToPath(form.firmLogoUri, newFirm.id);
        if (savedLogoPath) {
          // Persist the deterministic path to the DB via updateFirm().
          // This writes a FIRM_UPDATED audit event (spec G58).
          await firmService.updateFirm(newFirm.id, { firmLogoRef: savedLogoPath });
        }
        // If savedLogoPath is null, processAndSaveLogoToPath already showed the
        // user an Alert. The firm was created successfully — we proceed to success.
      }

      setActiveFirm(newFirm.id);
      setShowSuccessModal(true);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  // Firm logo picker rendered in the dark TwoTone header
  const headerLogoPicker = (
    <View className="items-center pb-4">
      <TouchableOpacity
        onPress={() => pickImage('firmLogoUri')}
        className="h-28 w-28 rounded-full justify-center items-center overflow-hidden border-4 border-vj-bg/20 shadow-lg bg-white/10"
      >
        {form.firmLogoUri ? (
          <Image
            source={{ uri: form.firmLogoUri }}
            style={{ width: '100%', height: '100%', resizeMode: 'contain' }}
          />
        ) : (
          <View className="items-center">
            <ImagePlus size={28} color="#FAF3E0" />
            <Text className="text-[10px] text-vj-bg/80 font-bold mt-2 tracking-widest">
              FIRM LOGO
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <TwoToneWrapper title="New Firm" showBack headerContent={headerLogoPicker}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100, paddingTop: 10 }}
        >
          <GlassCard style={{ borderWidth: 0 }}>
            <GlassInput
              label="Firm Name *"
              icon={<Building2 size={18} color="#B87333" />}
              value={form.name}
              onChangeText={(t) => setForm({ ...form, name: t })}
            />
            <GlassInput
              label="Firm Code *"
              icon={<Tag size={18} color="#B87333" />}
              value={form.firmCode}
              onChangeText={(t) => setForm({ ...form, firmCode: t })}
              maxLength={10}
              autoCapitalize="characters"
            />
            <GlassInput
              label="Proprietor *"
              icon={<User size={18} color="#B87333" />}
              value={form.proprietor}
              onChangeText={(t) => setForm({ ...form, proprietor: t })}
            />
          </GlassCard>

          <GlassCard style={{ borderWidth: 0 }}>
            <GlassInput
              label="GSTIN (Optional)"
              icon={<Hash size={18} color="#B87333" />}
              value={form.gstin}
              onChangeText={(t) => setForm({ ...form, gstin: t })}
              maxLength={15}
              autoCapitalize="characters"
            />
            <Text className="text-[10px] text-vj-danger/80 ml-2 mt-[-10px] mb-3 font-bold uppercase">
              * WARNING: GSTIN locks invoice type forever.
            </Text>

            <GlassInput
              label="BIS Licence (Optional)"
              icon={<ShieldCheck size={18} color="#B87333" />}
              value={form.bisLicence}
              onChangeText={(t) => setForm({ ...form, bisLicence: t })}
            />

            {!form.bisLicence ? (
              <View className="mt-4 p-4 bg-white/40 rounded-2xl border border-white/50">
                <Text className="text-vj-text font-bold text-xs mb-1">BIS Hallmark Logo</Text>
                <Text className="text-vj-text/60 text-[10px]">
                  Add BIS licence number first to enable BIS logo upload.
                </Text>
              </View>
            ) : (
              <View className="mt-4 p-3 bg-white/60 rounded-2xl border border-white/50 flex-row items-center justify-between">
                <Text className="text-vj-text font-bold text-xs ml-2">BIS Hallmark Logo</Text>
                <TouchableOpacity
                  onPress={() => pickImage('bisLogoUri')}
                  className="bg-white/80 px-4 py-2 rounded-full shadow-sm border border-white"
                >
                  <Text className="text-xs font-bold text-vj-accent">
                    {form.bisLogoUri ? 'Change' : 'Upload'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            {form.bisLogoUri && (
              <Image
                source={{ uri: form.bisLogoUri }}
                style={{ height: 64, width: 128, resizeMode: 'contain', marginTop: 8, alignSelf: 'center' }}
              />
            )}
          </GlassCard>

          <GlassCard style={{ borderWidth: 0 }}>
            <GlassInput
              label="Primary Mobile *"
              icon={<Phone size={18} color="#B87333" />}
              value={form.phone1}
              onChangeText={(t) => setForm({ ...form, phone1: t })}
              keyboardType="numeric"
              maxLength={10}
            />
            <View className="flex-row gap-4">
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
          </GlassCard>

          <GlassCard style={{ borderWidth: 0 }}>
            <GlassInput
              label="Address Line 1 *"
              icon={<MapPin size={18} color="#B87333" />}
              value={form.addressLine1}
              onChangeText={(t) => setForm({ ...form, addressLine1: t })}
            />
            <GlassInput
              label="Address Line 2"
              value={form.addressLine2}
              onChangeText={(t) => setForm({ ...form, addressLine2: t })}
            />

            <View className="mb-4">
              <Text className="text-vj-text/70 font-bold text-xs uppercase tracking-wider mb-2 ml-1">
                State / Jurisdiction *
              </Text>
              <TouchableOpacity
                onPress={() => setShowStatePicker(true)}
                className="flex-row items-center justify-between bg-white/40 rounded-2xl px-5 py-3 border border-white/50"
              >
                <Text className="text-vj-text text-base font-semibold">
                  {form.stateCode} - {form.stateName}
                </Text>
                <ChevronDown size={20} color="#B87333" />
              </TouchableOpacity>
            </View>

            <View className="flex-row gap-4">
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

          <View className="mt-4 mb-10">
            <GlassButton
              title="Establish Firm Identity"
              icon={<Save size={20} color="#FAF3E0" />}
              onPress={handleSave}
              loading={loading}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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
                <X size={20} color="#2E1D00" />
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
                icon={<ArrowRight size={20} color="#FAF3E0" />}
                onPress={() => {
                  setShowSuccessModal(false);
                  router.replace('/dashboard');
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </TwoToneWrapper>
  );
}