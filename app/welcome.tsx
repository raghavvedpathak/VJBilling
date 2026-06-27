import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { TwoToneWrapper } from '../components/TwoToneWrapper';
import { GlassCard, GlassButton } from '../components/ui/Glass';
import { restoreService } from '../services/restoreService';
import { useSession } from '../hooks/useSession';
import { ShieldCheck, HardDriveUpload, Plus, Search } from 'lucide-react-native';

export default function WelcomeScreen() {
  const router = useRouter();
  const { refreshSession } = useSession();
  const [isScanning, setIsScanning] = useState(true);
  const [hasBackup, setHasBackup] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // STEP 16: Scan for existing .vjb files on boot
  useEffect(() => {
    const scanForBackups = async () => {
      try {
        const dir = FileSystem.documentDirectory;
        if (dir) {
          const files = await FileSystem.readDirectoryAsync(dir);
          const vjbFiles = files.filter(f => f.endsWith('.vjb'));
          if (vjbFiles.length > 0) {
            setHasBackup(true);
            console.log("[Boot] Backups detected on device.");
          }
        }
      } catch (error) {
        console.error("Failed to scan for backups:", error);
      } finally {
        setIsScanning(false);
      }
    };
    scanForBackups();
  }, []);

  const handleRestore = async () => {
    try {
      setRestoring(true);
      const status = await restoreService.restoreFromFile();
      
      if (status === 'CANCELED') {
        setRestoring(false);
        return;
      }

      // Rehydrate global state
      await refreshSession();

      if (status === 'COMPLETED_WITH_ISSUES') {
        Alert.alert("Restored with Warnings", "Issues found. Safe Mode activated.");
        router.replace('/settings/verify');
      } else {
        Alert.alert("Welcome Back", "Database restored successfully.");
        router.replace('/dashboard');
      }
    } catch (error: any) {
      Alert.alert("Restore Failed", error.message);
      setRestoring(false);
    }
  };

  if (isScanning) {
    return (
      <TwoToneWrapper title="">
        <View className="flex-1 justify-center items-center gap-4 py-20">
          <ActivityIndicator size="large" color="#D4AF37" />
          <Text className="text-vj-text/50 font-bold text-xs uppercase tracking-widest">Scanning Device for Backups...</Text>
        </View>
      </TwoToneWrapper>
    );
  }

  // Inject Hero into the dark TwoTone Header
  const welcomeHeader = (
    <View className="items-center pb-6">
      <View className="bg-white/10 p-6 rounded-full mb-6 border border-white/20 shadow-sm">
        <ShieldCheck size={56} color="#FCFBF8" />
      </View>
      <Text className="text-vj-bg/80 font-bold text-xs uppercase tracking-widest mb-1">
        Welcome To
      </Text>
      <Text className="text-5xl font-extrabold text-vj-bg text-center tracking-tighter mb-3">
        VJ Billing
      </Text>
      <Text className="text-[#C8860A] text-center font-black tracking-widest text-[10px] uppercase">
        By Raghav Ramdas Vedpathak
      </Text>
    </View>
  );

  return (
    <TwoToneWrapper title="" headerContent={welcomeHeader}>
      <View className="flex-1 justify-center px-2 py-6">
        
        {/* STEP 16 DYNAMIC UI RENDERING */}
        {hasBackup ? (
          <View>
            <Text className="text-vj-success font-bold text-xs uppercase tracking-widest mb-3 ml-2 text-center">
              Existing Data Found
            </Text>
            <GlassCard style={{ backgroundColor: 'rgba(220, 252, 231, 0.4)', borderColor: 'rgba(22, 163, 74, 0.3)', marginBottom: 16 }}>
              <GlassButton 
                title={restoring ? "Restoring Data..." : "Restore from Backup"}
                icon={!restoring && <HardDriveUpload size={20} color="#FCFBF8" />}
                onPress={handleRestore}
                loading={restoring}
              />
            </GlassCard>
            
            <View className="mt-4">
              <GlassButton 
                title="Set Up New Firm Instead"
                icon={<Plus size={20} color="#FCFBF8" />}
                onPress={() => router.push('/create-firm')}
                disabled={restoring}
              />
            </View>
          </View>
        ) : (
          <View>
            <Text className="text-vj-text/60 font-bold text-xs uppercase tracking-widest mb-4 ml-2 text-center">
              Get Started
            </Text>
            <View className="mb-6">
              <GlassButton 
                title="Establish New Firm"
                icon={<Plus size={20} color="#FCFBF8" />}
                onPress={() => router.push('/create-firm')}
              />
            </View>
            
            <GlassCard style={{ opacity: 0.8, borderWidth: 0 }}>
              <View className="items-center py-2">
                <Text className="text-vj-text/60 text-xs text-center mb-4 px-4 font-medium">
                  Have a .vjb file from another device? You can manually restore it.
                </Text>
                <GlassButton 
                  title="Manual Restore"
                  icon={<Search size={18} color="#FCFBF8" />}
                  onPress={handleRestore}
                  disabled={restoring}
                />
              </View>
            </GlassCard>
          </View>
        )}

      </View>
    </TwoToneWrapper>
  );
}