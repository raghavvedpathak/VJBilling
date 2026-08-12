// app/settings/pin.tsx — Phase 2 v2.11 Canonical Screen

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Keyboard, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TwoToneWrapper } from '@/components/TwoToneWrapper';
import { HeaderPill, GlassCard } from '@/components/ui/Glass';
import { appSettingsStore } from '@/store/phase1/appSettingsStore';
import { KeyRound, ShieldAlert, CheckCircle2, Lock, X, ShieldCheck } from 'lucide-react-native';
import {
  isPinSet,
  setPin,
  changePin,
  removePin,
  verifyPin,
  getPinLength
} from '@/services/phase1/pinService';
import { COLORS, getThemeColors } from '@/constants/theme';

type FlowState = 'MENU' | 'TURN_ON_NEW' | 'TURN_ON_CONFIRM' | 'TURN_OFF_CURRENT' | 'CHANGE_CURRENT' | 'CHANGE_NEW' | 'CHANGE_CONFIRM';

export default function PinSettingsScreen() {
  const router = useRouter();
  
  const [hasPin, setHasPin] = useState(false);
  const [flow, setFlow] = useState<FlowState>('MENU');
  
  const [targetLength, setTargetLength] = useState<4 | 6>(6);
  const [pinInput, setPinInput] = useState('');
  const [tempPin, setTempPin] = useState(''); // Used to hold new PIN between New and Confirm steps
  const [currentPin, setCurrentPin] = useState(''); // Used to hold current PIN when changing
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<TextInput>(null);

  const activeTheme = appSettingsStore((s) => s.theme);
  const colors = getThemeColors(activeTheme);

  useEffect(() => {
    setHasPin(isPinSet());
  }, []);

  const resetFlow = () => {
    setFlow('MENU');
    setPinInput('');
    setTempPin('');
    setCurrentPin('');
    setError(null);
    Keyboard.dismiss();
  };

  const startFlow = (newFlow: FlowState) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    setFlow(newFlow);
    setPinInput('');
    setError(null);
    if (newFlow === 'TURN_OFF_CURRENT' || newFlow === 'CHANGE_CURRENT') {
       setTargetLength(getPinLength()); // Need to enter current PIN, so use current length
    } else {
       setTargetLength(6); // Default for new PIN
    }
    setTimeout(() => inputRef.current?.focus(), 300);
  };

  const handlePinChange = async (val: string) => {
    const cleanVal = val.replace(/[^0-9]/g, '');
    if (cleanVal.length > targetLength) return;
    
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}

    setPinInput(cleanVal);
    setError(null);

    if (cleanVal.length === targetLength) {
      Keyboard.dismiss();
      await processCompletedPin(cleanVal);
    }
  };

  const processCompletedPin = async (completedPin: string) => {
    try {
      if (flow === 'TURN_ON_NEW') {
        setTempPin(completedPin);
        setPinInput('');
        setFlow('TURN_ON_CONFIRM');
        setTimeout(() => inputRef.current?.focus(), 300);
      } else if (flow === 'TURN_ON_CONFIRM') {
        if (completedPin === tempPin) {
          await setPin(completedPin);
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
          Alert.alert("Success", "Security PIN has been turned on.");
          setHasPin(true);
          resetFlow();
        } else {
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch (e) {}
          setError('PINs do not match. Try again.');
          setTempPin('');
          setPinInput('');
          setFlow('TURN_ON_NEW');
          setTimeout(() => inputRef.current?.focus(), 300);
        }
      } else if (flow === 'TURN_OFF_CURRENT') {
        const ok = await verifyPin(completedPin);
        if (!ok) {
           try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch (e) {}
           setError('Incorrect PIN.');
           setPinInput('');
           setTimeout(() => inputRef.current?.focus(), 300);
           return;
        }
        await removePin(completedPin);
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
        Alert.alert("Success", "Security PIN has been turned off.");
        setHasPin(false);
        resetFlow();
      } else if (flow === 'CHANGE_CURRENT') {
        const ok = await verifyPin(completedPin);
        if (!ok) {
           try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch (e) {}
           setError('Incorrect PIN.');
           setPinInput('');
           setTimeout(() => inputRef.current?.focus(), 300);
           return;
        }
        setCurrentPin(completedPin);
        setPinInput('');
        setTargetLength(6); // Reset to default 6 for new PIN
        setFlow('CHANGE_NEW');
        setTimeout(() => inputRef.current?.focus(), 300);
      } else if (flow === 'CHANGE_NEW') {
        setTempPin(completedPin);
        setPinInput('');
        setFlow('CHANGE_CONFIRM');
        setTimeout(() => inputRef.current?.focus(), 300);
      } else if (flow === 'CHANGE_CONFIRM') {
        if (completedPin === tempPin) {
          await changePin(currentPin, completedPin);
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e) {}
          Alert.alert("Success", "Security PIN has been changed.");
          resetFlow();
        } else {
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch (e) {}
          setError('PINs do not match. Try again.');
          setTempPin('');
          setPinInput('');
          setFlow('CHANGE_NEW');
          setTimeout(() => inputRef.current?.focus(), 300);
        }
      }
    } catch (e: any) {
       try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch (err) {}
       setError(e.message);
       setPinInput('');
       setTimeout(() => inputRef.current?.focus(), 300);
    }
  };

  if (flow !== 'MENU') {
     const isNewPinStep = flow === 'TURN_ON_NEW' || flow === 'CHANGE_NEW';
     const isConfirmStep = flow === 'TURN_ON_CONFIRM' || flow === 'CHANGE_CONFIRM';
     
     let title = 'Enter PIN';
     let subtitle = `Enter your ${targetLength}-digit PIN`;
     
     if (isNewPinStep) {
        title = 'Create New PIN';
        subtitle = `Create a ${targetLength}-digit PIN`;
     } else if (isConfirmStep) {
        title = 'Confirm New PIN';
        subtitle = 'Please re-enter your new PIN';
     } else if (flow === 'TURN_OFF_CURRENT' || flow === 'CHANGE_CURRENT') {
        title = 'Enter Current PIN';
        subtitle = 'Verify your identity';
     }

     const flowHeader = (
       <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
         <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
           <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(212,175,55,0.4)' }}>
             {isConfirmStep ? <CheckCircle2 size={22} color="#D4AF37" /> : <Lock size={22} color="#D4AF37" />}
           </View>
           <View style={{ flex: 1 }}>
             <Text style={{ color: '#FCFBF8', fontSize: 20, fontWeight: '800' }}>{title}</Text>
             <Text style={{ color: 'rgba(250,243,224,0.6)', fontSize: 11, fontWeight: '600' }}>{subtitle}</Text>
           </View>
         </View>
         <TouchableOpacity onPress={resetFlow} style={{ padding: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}>
           <X size={18} color="#FCFBF8" />
         </TouchableOpacity>
       </View>
     );

     return (
       <TwoToneWrapper headerContent={flowHeader}>
         <View className="flex-1 items-center pt-6 px-8">

            <View className="items-center mb-6">
              <Text className="text-vj-text text-2xl font-black tracking-widest text-center uppercase">
                {title}
              </Text>
              <Text className="text-vj-text/60 text-center mt-2 font-medium">
                {subtitle}
              </Text>

              {/* Length Toggle for New PIN Steps */}
              {isNewPinStep && (
                <View className="flex-row mt-4 bg-white/40 border border-vj-text/10 rounded-xl p-1">
                  <TouchableOpacity 
                    onPress={() => { setTargetLength(4); setPinInput(''); }}
                    className={`px-4 py-1.5 rounded-lg ${targetLength === 4 ? 'bg-vj-text' : ''}`}
                  >
                    <Text className={`font-bold text-xs ${targetLength === 4 ? 'text-white' : 'text-vj-text/60'}`}>4 Digits</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => { setTargetLength(6); setPinInput(''); }}
                    className={`px-4 py-1.5 rounded-lg ${targetLength === 6 ? 'bg-vj-text' : ''}`}
                  >
                    <Text className={`font-bold text-xs ${targetLength === 6 ? 'text-white' : 'text-vj-text/60'}`}>6 Digits</Text>
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
                    className={`w-5 h-5 rounded-full ${pinInput.length > i ? 'bg-vj-text' : 'bg-vj-text/20 border border-vj-text/30'}`} 
                  />
                ))}
              </TouchableOpacity>
              
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <HeaderPill icon={<ShieldCheck size={12} color={hasPin ? "#4ADE80" : "#FDBA74"} />} label={hasPin ? 'PIN Enabled' : 'PIN Disabled'} variant={hasPin ? 'success' : 'warning'} />
      <HeaderPill icon={<Lock size={12} color={colors.vjBg} />} label={`${hasPin ? getPinLength() : 6}-Digit Hash Lock`} />
    </View>
  );

  return (
    <TwoToneWrapper title="Security PIN" showBack headerContent={pinHeaderPills}>
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{paddingBottom: 120, paddingTop: 32}}
      >
        <Text className="text-vj-text/60 text-xs font-bold uppercase tracking-widest mb-3 ml-1">
          App Security
        </Text>
        
        {!hasPin ? (
          <TouchableOpacity onPress={() => startFlow('TURN_ON_NEW')} activeOpacity={0.7} className="mb-2">
            <GlassCard style={{ padding: 16, borderWidth: 1, borderColor: 'rgba(92,22,35,0.2)' }}>
              <View className="flex-row items-center gap-4">
                <View className="bg-white/40 p-3 rounded-full border border-white/50">
                  <KeyRound size={24} color="#D4AF37" />
                </View>
                <View className="flex-1">
                  <Text className="text-vj-text font-bold text-base">Turn On PIN</Text>
                  <Text className="text-vj-text/60 text-xs">Secure the app with a 4 or 6 digit PIN</Text>
                </View>
              </View>
            </GlassCard>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity onPress={() => startFlow('CHANGE_CURRENT')} activeOpacity={0.7} className="mb-2">
              <GlassCard style={{ padding: 16, borderWidth: 1, borderColor: 'rgba(92,22,35,0.2)' }}>
                <View className="flex-row items-center gap-4">
                  <View className="bg-white/40 p-3 rounded-full border border-white/50">
                    <KeyRound size={24} color="#D4AF37" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-vj-text font-bold text-base">Change PIN</Text>
                    <Text className="text-vj-text/60 text-xs">Update your current security PIN</Text>
                  </View>
                </View>
              </GlassCard>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => startFlow('TURN_OFF_CURRENT')} activeOpacity={0.7} className="mb-2">
              <GlassCard style={{ padding: 16, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.2)', backgroundColor: 'rgba(239, 68, 68, 0.05)' }}>
                <View className="flex-row items-center gap-4">
                  <View className="bg-vj-danger/10 p-3 rounded-full border border-vj-danger/20">
                    <ShieldAlert size={24} color="#ef4444" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-vj-danger font-bold text-base">Turn Off PIN</Text>
                    <Text className="text-vj-danger/80 text-xs">Remove security lock</Text>
                  </View>
                </View>
              </GlassCard>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </TwoToneWrapper>
  );
}
