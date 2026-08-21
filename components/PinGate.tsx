// components/PinGate.tsx — Phase 1 (v7.38) & Phase 2 Canonical Component (FIX-VSEC-3, FIX-V729-1, FIX-V729-2, FIX-V733-1)

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, Keyboard, ScrollView, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Lock, Eye, EyeOff } from 'lucide-react-native';
import { 
  isPinSet, 
  setPin, 
  verifyPin, 
  getPinLength,
  getFailedAttempts,
  incrementFailedAttempts,
  isLockedOut,
  resetFailedAttempts,
  isPinSkipped,
  setPinSkipped
} from '@/services/phase1/pinService';
import { TwoToneWrapper } from './TwoToneWrapper';
import { storage } from '@/utils/storage';
import { COLORS } from '@/constants/theme';

type PinMode = 'LOADING' | 'SETUP_STEP_1' | 'SETUP_STEP_2' | 'VERIFY' | 'LOCKED';

export function PinGate({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<PinMode>('LOADING');
  const [pin, setPinInput] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [targetLength, setTargetLength] = useState<4 | 6>(6);
  const [error, setError] = useState<string | null>(null);
  const [lockoutSecs, setLockoutSecs] = useState(0);
  const [isPinVisible, setIsPinVisible] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const lockoutTimerRef = useRef<NodeJS.Timeout | null>(null);

  const checkInitialState = () => {
    if (isLockedOut()) {
      startLockoutTimer();
      return;
    }

    if (isPinSet()) {
      setTargetLength(getPinLength());
      setMode('VERIFY');
    } else if (isPinSkipped()) {
      // FIX-V729-1: If PIN setup was skipped, immediately bypass gate
      onSuccess();
      return;
    } else {
      setMode('SETUP_STEP_1');
    }

    setTimeout(() => inputRef.current?.focus(), 500);
  };

  useEffect(() => {
    checkInitialState();
    return () => {
      if (lockoutTimerRef.current) clearTimeout(lockoutTimerRef.current);
    };
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
        lockoutTimerRef.current = setTimeout(tick, 1000);
      }
    };
    tick();
  };

  const handlePinChange = async (val: string) => {
    const cleanVal = val.replace(/[^0-9]/g, '');
    if (cleanVal.length > targetLength) return;

    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
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
      if (mode === 'SETUP_STEP_1') {
        setFirstPin(completedPin);
        setPinInput('');
        setMode('SETUP_STEP_2');
        setIsProcessing(false);
        setTimeout(() => inputRef.current?.focus(), 300);

      } else if (mode === 'SETUP_STEP_2') {
        if (completedPin === firstPin) {
          await setPin(completedPin);
          onSuccess();
        } else {
          setError('PINs do not match. Try again.');
          setFirstPin('');
          setPinInput('');
          setMode('SETUP_STEP_1');
          setIsProcessing(false);
          setTimeout(() => inputRef.current?.focus(), 300);
        }

      } else if (mode === 'VERIFY') {
        const isValid = await verifyPin(completedPin);
        if (isValid) {
          resetFailedAttempts();
          onSuccess();
        } else {
          incrementFailedAttempts();
          if (isLockedOut()) {
            setIsProcessing(false);
            startLockoutTimer();
          } else {
            const attempts = getFailedAttempts();
            setError(`Incorrect PIN. ${3 - attempts > 0 ? 3 - attempts + ' attempts remaining.' : ''}`);
            setPinInput('');
            setIsProcessing(false);
            setTimeout(() => inputRef.current?.focus(), 300);
          }
        }
      }
    } catch (e: any) {
      setError(e.message || 'Verification failed');
      setIsProcessing(false);
      setPinInput('');
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  };

  const handleSkip = () => {
    setPinSkipped();
    onSuccess();
  };

  if (mode === 'LOADING') {
    return <View className="flex-1 bg-vj-bg" />;
  }

  const headerContent = (
    <View style={{ alignItems: 'center', paddingVertical: 8 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', marginBottom: 10, borderWidth: 1.5, borderColor: 'rgba(212,175,55,0.4)' }}>
        <Lock size={28} color="#D4AF37" />
      </View>
      <Text style={{ color: '#FCFBF8', fontSize: 26, fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase', textAlign: 'center' }}>
        VJ BILLING
      </Text>
      <Text style={{ color: 'rgba(250,243,224,0.6)', fontSize: 11, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', marginTop: 4, textAlign: 'center' }}>
        By Raghav Ramdas Vedpathak
      </Text>
    </View>
  );

  return (
    <TwoToneWrapper headerContent={headerContent}>
      <ScrollView 
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-start', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center', marginBottom: 24, width: '100%' }}>
          <Text style={{ color: COLORS.vjText, fontSize: 20, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center', textTransform: 'uppercase' }}>
            {mode === 'LOCKED' ? 'System Locked' : 
             mode.startsWith('SETUP') ? 'Set Up Security PIN' : 
             'Enter Security PIN'}
          </Text>
          <Text style={{ color: 'rgba(92,22,35,0.6)', textAlign: 'center', marginTop: 4, fontWeight: '500', fontSize: 12 }}>
            {mode === 'LOCKED' ? `Too many failed attempts.` : 
             mode === 'SETUP_STEP_1' ? `Create a ${targetLength}-digit PIN to secure your data.` :
             mode === 'SETUP_STEP_2' ? 'Please confirm your security PIN.' :
             `Enter your ${targetLength}-digit PIN to access VJ Billing.`}
          </Text>

          {mode === 'SETUP_STEP_1' && (
            <View style={{ flexDirection: 'row', marginTop: 16, backgroundColor: 'rgba(255,255,255,0.4)', borderWidth: 1, borderColor: 'rgba(92,22,35,0.1)', borderRadius: 12, padding: 4 }}>
              <TouchableOpacity 
                onPress={() => { setTargetLength(4); setPinInput(''); }}
                style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8, backgroundColor: targetLength === 4 ? COLORS.vjText : 'transparent' }}
              >
                <Text style={{ fontWeight: '700', fontSize: 12, color: targetLength === 4 ? '#ffffff' : 'rgba(92,22,35,0.6)' }}>4 Digits</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => { setTargetLength(6); setPinInput(''); }}
                style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8, backgroundColor: targetLength === 6 ? COLORS.vjText : 'transparent' }}
              >
                <Text style={{ fontWeight: '700', fontSize: 12, color: targetLength === 6 ? '#ffffff' : 'rgba(92,22,35,0.6)' }}>6 Digits</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {mode === 'LOCKED' ? (
          <View style={{ width: '100%', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: 24, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)', alignItems: 'center' }}>
            <Text style={{ color: '#ef4444', fontSize: 18, fontWeight: '700', marginBottom: 4 }}>Try again in</Text>
            <Text style={{ color: '#ef4444', fontSize: 36, fontWeight: '900', fontFamily: 'monospace' }}>{lockoutSecs}s</Text>
          </View>
        ) : (
          <View style={{ width: '100%', alignItems: 'center' }}>
            <TouchableOpacity 
              activeOpacity={1}
              onPress={() => inputRef.current?.focus()}
              style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}
            >
              {Array.from({ length: targetLength }).map((_, i) => {
                const hasDigit = pin.length > i;
                return (
                  <View 
                    key={i} 
                    style={{
                      width: 40, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center',
                      backgroundColor: hasDigit ? COLORS.vjText : 'rgba(255,255,255,0.5)',
                      borderColor: hasDigit ? COLORS.vjText : 'rgba(92,22,35,0.2)',
                      borderWidth: 1
                    }}
                  >
                    {isPinVisible && hasDigit ? (
                      <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: '900' }}>{pin[i]}</Text>
                    ) : (
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: hasDigit ? '#ffffff' : 'transparent' }} />
                    )}
                  </View>
                );
              })}
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => setIsPinVisible(!isPinVisible)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24, backgroundColor: 'rgba(255,255,255,0.5)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(92,22,35,0.1)', zIndex: 10 }}
              activeOpacity={0.7}
            >
              {isPinVisible ? <EyeOff size={16} color={COLORS.vjText} /> : <Eye size={16} color={COLORS.vjText} />}
              <Text style={{ color: COLORS.vjText, fontWeight: '700', fontSize: 12 }}>{isPinVisible ? 'Hide PIN' : 'Show PIN'}</Text>
            </TouchableOpacity>

            {isProcessing && (
              <ActivityIndicator size="small" color={COLORS.vjAccent} style={{ marginBottom: 12 }} />
            )}

            <TextInput
              ref={inputRef}
              value={pin}
              onChangeText={handlePinChange}
              keyboardType="number-pad"
              maxLength={targetLength}
              secureTextEntry
              autoFocus
              style={{ width: 1, height: 1, opacity: 0, position: 'absolute' }}
            />

            {error && (
              <Text style={{ color: '#ef4444', fontWeight: '700', textAlign: 'center', marginTop: 12, backgroundColor: 'rgba(239, 68, 68, 0.1)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}>
                {error}
              </Text>
            )}

            {mode.startsWith('SETUP') && (
              <TouchableOpacity 
                onPress={handleSkip}
                style={{ marginTop: 24, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: 'rgba(92,22,35,0.1)', borderRadius: 999 }}
              >
                <Text style={{ color: COLORS.vjText, fontWeight: '900', fontSize: 13, letterSpacing: 1.5, textTransform: 'uppercase' }}>Skip Setup for now</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </TwoToneWrapper>
  );
}