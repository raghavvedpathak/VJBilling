// components/PinGate.tsx
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Keyboard, Image, ScrollView } from 'react-native';
import { BlurView } from 'expo-blur';
import { Lock, ShieldAlert, CheckCircle2, Diamond, Eye, EyeOff } from 'lucide-react-native';
import { 
  isPinSet, 
  setPin, 
  verifyPin, 
  incrementFailedAttempts, 
  getFailedAttempts, 
  isLockedOut, 
  resetFailedAttempts,
  getPinLength,
  setPinSkipped
} from '../services/pinService';
import { storage } from '../utils/storage';

type PinMode = 'LOADING' | 'SETUP_STEP_1' | 'SETUP_STEP_2' | 'VERIFY' | 'LOCKED';

export function PinGate({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<PinMode>('LOADING');
  const [pin, setPinInput] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [targetLength, setTargetLength] = useState<4 | 6>(6); // v7.29 user selection
  const [error, setError] = useState<string | null>(null);
  const [lockoutSecs, setLockoutSecs] = useState(0);
  const [isPinVisible, setIsPinVisible] = useState(false);
  
  const inputRef = useRef<TextInput>(null);

  const checkInitialState = () => {
    if (isLockedOut()) {
      startLockoutTimer();
      return;
    }
    
    if (isPinSet()) {
      setTargetLength(getPinLength()); // Sync saved length constraint
      setMode('VERIFY');
    } else {
      setMode('SETUP_STEP_1');
    }
    
    setTimeout(() => inputRef.current?.focus(), 500);
  };

  useEffect(() => {
    checkInitialState();
  }, []);

  const startLockoutTimer = () => {
    setMode('LOCKED');
    const untilStr = storage.getString('vjbilling_pin_lockout_until');
    if (!untilStr) return;
    
    const until = new Date(untilStr).getTime();
    
    const tick = () => {
      const remaining = Math.ceil((until - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockoutSecs(0);
        setError(null);
        setPinInput('');
        setTargetLength(getPinLength());
        setMode('VERIFY');
        setTimeout(() => inputRef.current?.focus(), 500);
      } else {
        setLockoutSecs(remaining);
        setTimeout(tick, 1000);
      }
    };
    tick();
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
    if (mode === 'SETUP_STEP_1') {
      setFirstPin(completedPin);
      setPinInput('');
      setMode('SETUP_STEP_2');
      setTimeout(() => inputRef.current?.focus(), 500);
      
    } else if (mode === 'SETUP_STEP_2') {
      if (completedPin === firstPin) {
        await setPin(completedPin);
        onSuccess();
      } else {
        setError('PINs do not match. Try again.');
        setFirstPin('');
        setPinInput('');
        setMode('SETUP_STEP_1');
        setTimeout(() => inputRef.current?.focus(), 500);
      }
      
    } else if (mode === 'VERIFY') {
      const isValid = await verifyPin(completedPin);
      if (isValid) {
        resetFailedAttempts();
        onSuccess();
      } else {
        incrementFailedAttempts();
        if (isLockedOut()) {
          startLockoutTimer();
        } else {
          const attempts = getFailedAttempts();
          setError(`Incorrect PIN. ${3 - attempts > 0 ? 3 - attempts + ' attempts remaining.' : ''}`);
          setPinInput('');
          setTimeout(() => inputRef.current?.focus(), 500);
        }
      }
    }
  };

  const handleSkip = () => {
    setPinSkipped(); // Write v7.29 skipped preference
    onSuccess();
  };

  if (mode === 'LOADING') {
    return <View className="flex-1 bg-vj-bg" />;
  }

  return (
    <ScrollView 
      className="flex-1 bg-vj-bg"
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingVertical: 40 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View className="items-center mb-12 w-full" style={{ marginTop: -20 }}>
        <Text className="text-vj-text text-5xl font-black uppercase tracking-widest">VJ Billing</Text>
        <Text className="text-vj-text/60 text-xs font-bold mt-2 tracking-[0.2em] uppercase">By Raghav Ramdas Vedpathak</Text>
      </View>

      <View className="items-center mb-8">
        <View className="bg-white/50 p-4 rounded-full mb-4 border border-vj-text/10">
          {mode === 'LOCKED' ? (
            <ShieldAlert size={48} color="#ef4444" />
          ) : mode === 'SETUP_STEP_2' ? (
            <CheckCircle2 size={48} color="#D4AF37" />
          ) : (
            <Lock size={48} color="#5C1623" />
          )}
        </View>
        <Text className="text-vj-text text-2xl font-black tracking-widest text-center uppercase">
          {mode === 'LOCKED' ? 'System Locked' : 
           mode.startsWith('SETUP') ? 'Set Up Security PIN' : 
           'Enter Security PIN'}
        </Text>
        <Text className="text-vj-text/60 text-center mt-2 font-medium">
          {mode === 'LOCKED' ? `Too many failed attempts.` : 
           mode === 'SETUP_STEP_1' ? `Create a ${targetLength}-digit PIN to secure your data.` :
           mode === 'SETUP_STEP_2' ? 'Please confirm your security PIN.' :
           `Enter your ${targetLength}-digit PIN to access VJ Billing.`}
        </Text>

        {/* v7.29 Length Toggle Selection inside Setup Step 1 */}
        {mode === 'SETUP_STEP_1' && (
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

      {mode === 'LOCKED' ? (
        <View className="w-full bg-vj-danger/10 p-6 rounded-2xl border border-vj-danger/30 items-center">
          <Text className="text-vj-danger text-lg font-bold mb-1">Try again in</Text>
          <Text className="text-vj-danger text-4xl font-black font-mono">{lockoutSecs}s</Text>
        </View>
      ) : (
        <View className="w-full items-center" pointerEvents="box-none">
          <View className="flex-row gap-4 mb-4">
            {Array.from({ length: targetLength }).map((_, i) => {
              const hasDigit = pin.length > i;
              return (
                <View 
                  key={i} 
                  className={`w-10 h-12 rounded-xl justify-center items-center ${hasDigit ? 'bg-vj-text border-vj-text' : 'bg-white/50 border-vj-text/20'} border`} 
                >
                  {isPinVisible && hasDigit ? (
                    <Text className="text-white text-2xl font-black">{pin[i]}</Text>
                  ) : (
                    <View className={`w-3 h-3 rounded-full ${hasDigit ? 'bg-white' : 'bg-transparent'}`} />
                  )}
                </View>
              );
            })}
          </View>
          
          <TouchableOpacity 
            onPress={() => setIsPinVisible(!isPinVisible)}
            className="flex-row items-center gap-2 mb-8 bg-white/50 px-4 py-2 rounded-full border border-vj-text/10"
            activeOpacity={0.7}
            style={{ zIndex: 10 }}
          >
            {isPinVisible ? <EyeOff size={16} color="#5C1623" /> : <Eye size={16} color="#5C1623" />}
            <Text className="text-vj-text font-bold text-xs">{isPinVisible ? 'Hide PIN' : 'Show PIN'}</Text>
          </TouchableOpacity>
          
          <TextInput
            ref={inputRef}
            value={pin}
            onChangeText={handlePinChange}
            keyboardType="number-pad"
            maxLength={targetLength}
            secureTextEntry
            autoFocus
            className="absolute w-full h-full opacity-0"
            style={{ width: '100%', height: '100%', position: 'absolute', opacity: 0 }}
          />

          {error && (
            <Text className="text-vj-danger font-bold text-center mt-4 bg-vj-danger/10 px-4 py-2 rounded-lg overflow-hidden">
              {error}
            </Text>
          )}

          {/* v7.29 Skip Setup Action Moved Below */}
          {mode.startsWith('SETUP') && (
            <TouchableOpacity 
              onPress={handleSkip}
              className="mt-8 py-3 px-6 bg-white/60 border border-vj-text/10 rounded-full"
            >
              <Text className="text-vj-text font-black text-sm tracking-widest uppercase">Skip Setup for now</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </ScrollView>
  );
}