import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { verifyService, VerifyFinding } from '../../services/verifyService';
import { useVerifyStore } from '../../store/verifyStore';
import { GlassCard, GlassButton } from '../../components/ui/Glass'; 
import { ShieldCheck, AlertTriangle, CheckCircle, XCircle, Activity } from 'lucide-react-native';

export default function VerifyDataScreen() {
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<VerifyFinding[] | null>(null);
  const [status, setStatus] = useState<'IDLE' | 'CLEAN' | 'ISSUES'>('IDLE');

  const { lastScanIssues, markWarningsViewed } = useVerifyStore();

  useEffect(() => {
    if (lastScanIssues && lastScanIssues.length > 0) {
      setResults(lastScanIssues);
      setStatus('ISSUES');
    }
    if (markWarningsViewed) {
      markWarningsViewed();
    }
  }, []);

  const runScan = async () => {
    setScanning(true);
    setResults(null);
    setStatus('IDLE');

    try {
      const { status: scanStatus, findings } = await verifyService.runVerify();
      setResults(findings);
      setStatus(findings.length > 0 ? 'ISSUES' : 'CLEAN');
    } catch (e) {
      alert("Scan Failed: " + (e as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const headerContent = (
    <View className="items-center pb-6">
      <View className="bg-white/10 p-6 rounded-full mb-4 border border-white/20 shadow-sm">
        <ShieldCheck size={48} color="#FAF3E0" />
      </View>
      <Text className="text-vj-bg font-bold text-2xl text-center">
        System Integrity
      </Text>
      <Text className="text-vj-bg/60 text-center mt-2 px-4 leading-5 font-medium">
        Scan your database for corruption, orphan records, and time boundary violations.
      </Text>
    </View>
  );

  return (
    <TwoToneWrapper title="" showBack headerContent={headerContent}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100, paddingTop: 20 }}>
        
        <View className="mb-8">
          <GlassButton 
            title={scanning ? "Scanning Deep Layers..." : "Run Deep Scan"}
            onPress={runScan}
            loading={scanning}
            icon={!scanning && <Activity size={20} color="#FAF3E0" />}
          />
        </View>

        {status === 'CLEAN' && (
          <GlassCard style={{ backgroundColor: 'rgba(220, 252, 231, 0.4)', borderColor: 'rgba(22, 163, 74, 0.3)' }}>
            <View className="items-center py-4">
              {/* FIX: Removed className from CheckCircle icon, wrapped in View */}
              <View className="mb-4"><CheckCircle size={48} color="#15803d" /></View>
              <Text className="text-vj-success font-bold text-xl">All Systems Healthy</Text>
              <Text className="text-vj-success/80 text-center mt-2">
                No corruption, orphans, or boundary violations found in the database.
              </Text>
            </View>
          </GlassCard>
        )}

        {status === 'ISSUES' && results && (
          <View>
             <Text className="text-vj-danger font-bold mb-4 uppercase tracking-widest text-xs ml-1">
               Issues Found ({results.length})
             </Text>
             
             {results.map((issue, idx) => (
               <GlassCard 
                 key={idx} 
                 style={{ 
                   backgroundColor: issue.severity === 'CRITICAL' ? 'rgba(254, 226, 226, 0.5)' : 'rgba(255, 237, 213, 0.5)',
                   borderColor: issue.severity === 'CRITICAL' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(249, 115, 22, 0.3)',
                   marginBottom: 12
                 }}
               >
                 <View className="flex-row gap-4">
                   <View className="mt-1 bg-white/40 p-2 rounded-full self-start border border-white/50">
                     {issue.severity === 'CRITICAL' ? (
                       <XCircle size={24} color="#b91c1c" />
                     ) : (
                       <AlertTriangle size={24} color="#c2410c" />
                     )}
                   </View>
                   
                   <View className="flex-1">
                     <Text className={`font-bold text-lg ${issue.severity === 'CRITICAL' ? 'text-vj-danger' : 'text-orange-900'}`}>
                       {issue.check}
                     </Text>
                     <Text className={`${issue.severity === 'CRITICAL' ? 'text-vj-danger/80' : 'text-orange-800'} mt-1 font-medium leading-5`}>
                       {issue.detail}
                     </Text>
                     
                     {issue.severity === 'CRITICAL' && (
                       <View className="bg-red-500/10 border border-red-500/20 self-start px-3 py-1.5 rounded-lg mt-3">
                         <Text className="text-vj-danger text-[10px] font-bold">SAFE MODE TRIGGERED</Text>
                       </View>
                     )}
                   </View>
                 </View>
               </GlassCard>
             ))}
          </View>
        )}

      </ScrollView>
    </TwoToneWrapper>
  );
}