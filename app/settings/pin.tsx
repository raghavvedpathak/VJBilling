// app/settings/pin.tsx — Phase 1 v7.47 & Phase 2 Canonical Security PIN Screen
// Implements G71, FIX-V729-1, FIX-V729-2, FIX-V740-12 (D2=P1 banner), FIX-V744-3 (live tx audit log)

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Keyboard,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/common/TwoToneWrapper';
import { HeaderPill, GlassCard } from '@/components/ui/Glass';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import {
  KeyRound,
  CheckCircle2,
  Lock,
  LockOpen,
  X,
  ShieldCheck,
} from 'lucide-react-native';
import {
  isPinSet,
  isPinSkipped,
  setPin,
  changePin,
  verifyPin,
  getPinLength,
  logPinSet,
  logPinChanged,
} from '@/services/phase1/pinService';
import { getThemeColors } from '@/constants/theme';

type FlowState =
  | 'MENU'
  | 'TURN_ON_NEW'
  | 'TURN_ON_CONFIRM'
  | 'CHANGE_CURRENT'
  | 'CHANGE_NEW'
  | 'CHANGE_CONFIRM';

export default function PinSettingsScreen() {
  const [hasPin, setHasPin] = useState(false);
  const [pinSkipped, setPinSkippedState] = useState(false);
  const [flow, setFlow] = useState<FlowState>('MENU');

  const [targetLength, setTargetLength] = useState<4 | 6>(6);
  const [oldPinLen, setOldPinLen] = useState<4 | 6>(6);
  const [pinInput, setPinInput] = useState('');
  const [tempPin, setTempPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const inputRef = useRef<TextInput>(null);

  const activeTheme = appSettingsStore((s) => s.theme);
  const colors = getThemeColors(activeTheme);

  useEffect(() => {
    setHasPin(isPinSet());
    setPinSkippedState(isPinSkipped());
  }, []);

  const resetFlow = () => {
    setFlow('MENU');
    setPinInput('');
    setTempPin('');
    setCurrentPin('');
    setError(null);
    setHasPin(isPinSet());
    setPinSkippedState(isPinSkipped());
    Keyboard.dismiss();
  };

  const startFlow = (newFlow: FlowState) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setFlow(newFlow);
    setPinInput('');
    setError(null);
    if (newFlow === 'CHANGE_CURRENT') {
      const existingLen = getPinLength();
      setOldPinLen(existingLen);
      setTargetLength(existingLen);
    } else {
      setTargetLength(6); // Default to 6-digit segmented control per FIX-V729-2
    }
    setTimeout(() => inputRef.current?.focus(), 300);
  };

  const handlePinChange = async (val: string) => {
    const cleanVal = val.replace(/[^0-9]/g, '');
    if (cleanVal.length > targetLength) return;

    setPinInput(cleanVal);
    setError(null);

    if (cleanVal.length === targetLength) {
      Keyboard.dismiss();
      await processCompletedPin(cleanVal);
    }
  };

  const processCompletedPin = async (completedPin: string) => {
    setIsProcessing(true);
    try {
      if (flow === 'TURN_ON_NEW') {
        setTempPin(completedPin);
        setPinInput('');
        setFlow('TURN_ON_CONFIRM');
        setIsProcessing(false);
        setTimeout(() => inputRef.current?.focus(), 300);
      } else if (flow === 'TURN_ON_CONFIRM') {
        if (completedPin === tempPin) {
          await setPin(completedPin);
          // FIX-V744-3: Settings PIN_SET written via service layer
          logPinSet(targetLength);
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {}
          Alert.alert('Success', 'Security PIN has been set.');
          setHasPin(true);
          setPinSkippedState(false);
          resetFlow();
        } else {
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          } catch {}
          setError('PINs do not match. Try again.');
          setTempPin('');
          setPinInput('');
          setFlow('TURN_ON_NEW');
          setIsProcessing(false);
          setTimeout(() => inputRef.current?.focus(), 300);
        }
      } else if (flow === 'CHANGE_CURRENT') {
        const ok = await verifyPin(completedPin);
        if (!ok) {
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          } catch {}
          setError('Incorrect PIN.');
          setPinInput('');
          setIsProcessing(false);
          setTimeout(() => inputRef.current?.focus(), 300);
          return;
        }
        setCurrentPin(completedPin);
        setPinInput('');
        setTargetLength(6); // Default segmented control to 6 digits for new PIN
        setFlow('CHANGE_NEW');
        setIsProcessing(false);
        setTimeout(() => inputRef.current?.focus(), 300);
      } else if (flow === 'CHANGE_NEW') {
        setTempPin(completedPin);
        setPinInput('');
        setFlow('CHANGE_CONFIRM');
        setIsProcessing(false);
        setTimeout(() => inputRef.current?.focus(), 300);
      } else if (flow === 'CHANGE_CONFIRM') {
        if (completedPin === tempPin) {
          await changePin(currentPin, completedPin, true);
          // FIX-V729-2 & FIX-V744-3: PIN_CHANGED written via service layer
          logPinChanged(oldPinLen, targetLength);
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {}
          Alert.alert('Success', 'Security PIN has been changed.');
          resetFlow();
        } else {
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          } catch {}
          setError('PINs do not match. Try again.');
          setTempPin('');
          setPinInput('');
          setFlow('CHANGE_NEW');
          setIsProcessing(false);
          setTimeout(() => inputRef.current?.focus(), 300);
        }
      }
    } catch (e: any) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}
      setError(e.message);
      setPinInput('');
      setIsProcessing(false);
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  };

  if (flow !== 'MENU') {
    const isNewPinStep = flow === 'TURN_ON_NEW' || flow === 'CHANGE_NEW';
    const isConfirmStep =
      flow === 'TURN_ON_CONFIRM' || flow === 'CHANGE_CONFIRM';

    let title = 'Enter PIN';
    let subtitle = `Enter your ${targetLength}-digit PIN`;

    if (isNewPinStep) {
      title = 'Create New PIN';
      subtitle = `Create a ${targetLength}-digit PIN`;
    } else if (isConfirmStep) {
      title = 'Confirm New PIN';
      subtitle = 'Please re-enter your new PIN';
    } else if (flow === 'CHANGE_CURRENT') {
      title = 'Enter Current PIN';
      subtitle = 'Verify your identity';
    }

    const flowHeader = (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            flex: 1,
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: 'rgba(255,255,255,0.15)',
              justifyContent: 'center',
              alignItems: 'center',
              borderWidth: 1.5,
              borderColor: 'rgba(212,175,55,0.4)',
            }}
          >
            {isConfirmStep ? (
              <CheckCircle2 size={22} color="#D4AF37" />
            ) : (
              <Lock size={22} color="#D4AF37" />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#FCFBF8', fontSize: 20, fontWeight: '800' }}>
              {title}
            </Text>
            <Text
              style={{
                color: 'rgba(250,243,224,0.6)',
                fontSize: 11,
                fontWeight: '600',
              }}
            >
              {subtitle}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={resetFlow}
          className="p-2 rounded-full bg-white/10"
        >
          <X size={20} color="#FCFBF8" />
        </TouchableOpacity>
      </View>
    );

    return (
      <TwoToneWrapper title="" showBack={false} headerContent={flowHeader}>
        <View className="flex-1 items-center justify-center px-6">
          <View className="mb-6 items-center">
            {isNewPinStep && (
              <View className="flex-row bg-vj-text/5 p-1 rounded-xl mb-6 border border-vj-text/10">
                <TouchableOpacity
                  onPress={() => {
                    setTargetLength(4);
                    setPinInput('');
                  }}
                  className={`px-4 py-1.5 rounded-lg ${
                    targetLength === 4 ? 'bg-vj-text' : ''
                  }`}
                >
                  <Text
                    className={`font-bold text-xs ${
                      targetLength === 4 ? 'text-white' : 'text-vj-text/60'
                    }`}
                  >
                    4-digit PIN
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setTargetLength(6);
                    setPinInput('');
                  }}
                  className={`px-4 py-1.5 rounded-lg ${
                    targetLength === 6 ? 'bg-vj-text' : ''
                  }`}
                >
                  <Text
                    className={`font-bold text-xs ${
                      targetLength === 6 ? 'text-white' : 'text-vj-text/60'
                    }`}
                  >
                    6-digit PIN
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View className="w-full items-center" pointerEvents="box-none">
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => inputRef.current?.focus()}
              className="flex-row gap-4 mb-8"
            >
              {Array.from({ length: targetLength }).map((_, i) => (
                <View
                  key={i}
                  className={`w-5 h-5 rounded-full ${
                    pinInput.length > i
                      ? 'bg-vj-text'
                      : 'bg-vj-text/20 border border-vj-text/30'
                  }`}
                />
              ))}
            </TouchableOpacity>

            {isProcessing && (
              <ActivityIndicator
                size="small"
                color={colors.vjAccent}
                className="mb-4"
              />
            )}

            <TextInput
              ref={inputRef}
              value={pinInput}
              onChangeText={handlePinChange}
              keyboardType="number-pad"
              maxLength={targetLength}
              secureTextEntry
              autoFocus
              style={{ width: 1, height: 1, opacity: 0, position: 'absolute' }}
            />

            {error && (
              <Text className="text-vj-danger font-bold text-center mt-4 bg-vj-danger/10 px-4 py-2 rounded-lg overflow-hidden">
                {error}
              </Text>
            )}
          </View>
        </View>
      </TwoToneWrapper>
    );
  }

  const pinHeaderPills = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        marginTop: 4,
      }}
    >
      <HeaderPill
        icon={<ShieldCheck size={12} color={hasPin ? '#4ADE80' : '#FDBA74'} />}
        label={hasPin ? 'PIN Enabled' : 'PIN Not Set'}
        variant={hasPin ? 'success' : 'warning'}
      />
      <HeaderPill
        icon={<Lock size={12} color={colors.vjBg} />}
        label={`${hasPin ? getPinLength() : 6}-Digit PBKDF2 Lock`}
      />
    </View>
  );

  return (
    <TwoToneWrapper
      title="Security PIN"
      showBack
      headerContent={pinHeaderPills}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120, paddingTop: 24 }}
      >
        {/* FIX-V740-12 (D2 = P1): Non-dismissible banner while PIN is skipped and no PIN is set */}
        {!hasPin && pinSkipped && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => startFlow('TURN_ON_NEW')}
            className="bg-amber-100 border border-amber-500/60 rounded-2xl p-4 mb-5 flex-row items-center gap-3"
          >
            <View className="bg-amber-500/20 p-2.5 rounded-xl">
              <LockOpen size={20} color="#B45309" />
            </View>
            <Text className="text-amber-900 text-xs font-bold flex-1 leading-4">
              App lock is off. Anyone who opens this app can see your data. Set
              a PIN.
            </Text>
          </TouchableOpacity>
        )}

        <Text className="text-vj-text/60 text-xs font-bold uppercase tracking-widest mb-3 ml-1">
          App Security (G71)
        </Text>

        {!hasPin ? (
          <TouchableOpacity
            onPress={() => startFlow('TURN_ON_NEW')}
            activeOpacity={0.7}
            className="mb-2"
          >
            <GlassCard
              style={{
                padding: 16,
                borderWidth: 1,
                borderColor: 'rgba(92,22,35,0.2)',
              }}
            >
              <View className="flex-row items-center gap-4">
                <View className="bg-white/40 p-3 rounded-full border border-white/50">
                  <KeyRound size={24} color="#D4AF37" />
                </View>
                <View className="flex-1">
                  <Text className="text-vj-text font-bold text-base">
                    Set Up PIN
                  </Text>
                  <Text className="text-vj-text/60 text-xs">
                    Secure the app with a 4-digit or 6-digit PIN
                  </Text>
                </View>
              </View>
            </GlassCard>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => startFlow('CHANGE_CURRENT')}
            activeOpacity={0.7}
            className="mb-2"
          >
            <GlassCard
              style={{
                padding: 16,
                borderWidth: 1,
                borderColor: 'rgba(92,22,35,0.2)',
              }}
            >
              <View className="flex-row items-center gap-4">
                <View className="bg-white/40 p-3 rounded-full border border-white/50">
                  <KeyRound size={24} color="#D4AF37" />
                </View>
                <View className="flex-1">
                  <Text className="text-vj-text font-bold text-base">
                    Change PIN
                  </Text>
                  <Text className="text-vj-text/60 text-xs">
                    Switch or update your current {getPinLength()}-digit
                    security PIN
                  </Text>
                </View>
              </View>
            </GlassCard>
          </TouchableOpacity>
        )}
      </ScrollView>
    </TwoToneWrapper>
  );
}
