import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { GlassCard } from '../components/ui/Glass'; // <--- Using Glass Factory
import { 
  ArrowRight, 
  ShieldCheck, 
  Store, 
  HardDriveDownload, 
  Gem
} from 'lucide-react-native';

export default function SetupScreen() {
  const router = useRouter();
  const [hasBackup, setHasBackup] = useState<boolean | null>(null);

  useEffect(() => {
    const checkBackups = async () => {
      try {
        // Fix for Expo SDK 52+ missing type definitions (Same as backupService)
        const fs = FileSystem as any;
        const dir = fs.documentDirectory || fs.cacheDirectory;
        
        if (!dir) {
          setHasBackup(false);
          return;
        }
        
        const files = await FileSystem.readDirectoryAsync(dir);
        const vjbExists = files.some((file: string) => file.endsWith('.vjb'));
        setHasBackup(vjbExists);
      } catch (e) {
        console.error("Failed to scan for backups:", e);
        setHasBackup(false);
      }
    };
    checkBackups();
  }, []);

  return (
    <ScreenWrapper>
      <View className="flex-1 justify-center px-2">
        
        {/* 1. HERO SECTION (Logo & Title) */}
        <View className="items-center mb-12">
          {/* Glowing Glass Logo Container */}
          <View className="h-24 w-24 bg-vj-glass rounded-full border border-white/50 justify-center items-center mb-6 shadow-sm">
            <View className="h-20 w-20 bg-white/60 rounded-full justify-center items-center shadow-inner">
              <Gem size={40} color="#D4AF37" />
            </View>
          </View>
          
          <Text className="text-vj-text font-bold text-4xl tracking-tighter text-center">
            VJ BILLING
          </Text>
          <Text className="text-vj-text/60 text-sm tracking-[0.2em] uppercase mt-2 text-center">
            Jewellery Management Suite
          </Text>
        </View>

        {/* 2. WELCOME TEXT */}
        <View className="mb-8">
          <Text className="text-vj-text text-2xl font-bold text-center">
            Welcome
          </Text>
          <Text className="text-vj-text/60 text-center mt-3 leading-6 px-4">
            Your secure, offline-first command center. To begin, please establish your firm's identity.
          </Text>
        </View>

        {/* 3. ACTION CARDS */}
        <View className="gap-4">
          
          {hasBackup === null ? (
            <ActivityIndicator size="large" color="#D4AF37" className="mt-4" />
          ) : (
            <>
              {/* STEP 16 SPEC: Show Restore FIRST if Backup Detected */}
              {hasBackup && (
                <TouchableOpacity 
                  activeOpacity={0.8}
                  onPress={() => alert("Restore logic is available in Settings after setup.")}
                >
                  <GlassCard style={{ padding: 20, marginBottom: 0, borderColor: '#D4AF37', borderWidth: 2 }}>
                    <View className="flex-row items-center gap-5">
                      <View className="bg-vj-bg p-4 rounded-2xl border border-vj-accent/30">
                        <HardDriveDownload size={28} color="#D4AF37" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-vj-text font-bold text-lg mb-0.5">
                          Restore Backup Detected
                        </Text>
                        <Text className="text-vj-text/60 text-xs">
                          Import your existing .vjb data file
                        </Text>
                      </View>
                    </View>
                  </GlassCard>
                </TouchableOpacity>
              )}

              {/* Create New Firm */}
              <TouchableOpacity 
                activeOpacity={0.8}
                onPress={() => router.push("/create-firm")}
              >
                <GlassCard style={{ padding: 20, marginBottom: 0 }}>
                  <View className="flex-row items-center gap-5">
                    <View className="bg-vj-text p-4 rounded-2xl shadow-sm">
                      <Store size={28} color="#FCFBF8" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-vj-text font-bold text-lg mb-0.5">
                        Set Up New Firm
                      </Text>
                      <Text className="text-vj-text/60 text-xs">
                        Start fresh. Establish shop details.
                      </Text>
                    </View>
                    <View className="bg-vj-glass p-2 rounded-full border border-white/20">
                      <ArrowRight size={20} color="#5C1623" />
                    </View>
                  </View>
                </GlassCard>
              </TouchableOpacity>
            </>
          )}

        </View>

        {/* 4. FOOTER BADGE */}
        <View className="mt-12 items-center flex-row justify-center gap-2 opacity-50">
          <ShieldCheck size={14} color="#5C1623" />
          <Text className="text-vj-text text-xs font-medium">
            100% Offline & Secure Storage
          </Text>
        </View>

      </View>
    </ScreenWrapper>
  );
}