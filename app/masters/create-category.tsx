import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, Modal, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { GlassButton } from '../../components/ui/Glass';
import { Layers, CheckCircle } from 'lucide-react-native';
import { useFirmStore } from '../../store/firmStore';
import { db } from '../../db/client';
import { categories as categoriesTable } from '../../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { now } from '../../utils/now';
import * as Crypto from 'expo-crypto';
import { TouchableOpacity } from 'react-native';

const COLORS = {
  vjText: '#5C1623',
  vjBg: '#FCFBF8',
  vjAccent: '#D4AF37',
};

export default function CreateCategoryScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  
  const [newName, setNewName] = useState('');
  const [newMetal, setNewMetal] = useState<'GOLD' | 'SILVER'>('GOLD');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!activeFirmId) return;
    if (!newName.trim()) {
      Alert.alert('Validation Error', 'Category name is required');
      return;
    }
    
    setIsSubmitting(true);
    try {
      // Restore soft-deleted if exists
      const existing = await db.select().from(categoriesTable)
        .where(and(eq(categoriesTable.firmId, activeFirmId), eq(categoriesTable.name, newName.trim())))
        .limit(1);
        
      if (existing.length > 0) {
        if (existing[0].isActive === 1) {
          Alert.alert('Duplicate', 'A category with this name already exists.');
          setIsSubmitting(false);
          return;
        } else {
          await db.update(categoriesTable)
            .set({ isActive: 1, metal: newMetal, updatedAt: now() })
            .where(eq(categoriesTable.id, existing[0].id));
            
          setSuccessMessage('Category restored successfully');
          setIsSubmitting(false);
          return;
        }
      }

      const countRes = await db.select({ count: sql<number>`count(*)` }).from(categoriesTable).where(and(eq(categoriesTable.firmId, activeFirmId), eq(categoriesTable.isActive, 1)));
      const codeStr = `CAT${String(Number(countRes[0]?.count || 0) + 1).padStart(4, '0')}`;

      await db.insert(categoriesTable).values({
        id: Crypto.randomUUID(),
        firmId: activeFirmId,
        name: newName.trim(),
        metal: newMetal,
        code: codeStr,
        isActive: 1,
        createdAt: now(),
        updatedAt: now(),
      });
      
      setSuccessMessage('Category added successfully');
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) {
        Alert.alert('Duplicate', 'A category with this name already exists.');
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuccessDone = () => {
    setSuccessMessage(null);
    router.back();
  };

  const headerContent = (
    <View>
      <View style={s.headerIconRow}>
        <View style={s.headerIconCircle}>
          <Layers size={28} color={COLORS.vjBg} />
        </View>
      </View>
      <Text style={s.headerTitle}>New Category</Text>
      <Text style={s.headerSubtitle}>Create a new master category</Text>
    </View>
  );

  return (
    <TwoToneWrapper title="" showBack headerContent={headerContent}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={s.container} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
          <View style={s.card}>
            <View style={s.formGroup}>
              <Text style={s.label}>Category Name</Text>
              <TextInput 
                style={s.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Gold Rings"
              />
            </View>

            <View style={s.formGroup}>
              <Text style={s.label}>Metal Type</Text>
              <View style={s.toggleRow}>
                <TouchableOpacity 
                  style={[s.toggleBtn, newMetal === 'GOLD' && s.toggleActiveGold]}
                  onPress={() => setNewMetal('GOLD')}
                >
                  <Text style={[s.toggleText, newMetal === 'GOLD' && s.toggleTextActive]}>GOLD</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[s.toggleBtn, newMetal === 'SILVER' && s.toggleActiveSilver]}
                  onPress={() => setNewMetal('SILVER')}
                >
                  <Text style={[s.toggleText, newMetal === 'SILVER' && s.toggleTextActive]}>SILVER</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ marginTop: 32 }}>
              <GlassButton 
                title={isSubmitting ? 'Saving...' : 'Save Category'} 
                onPress={handleAdd} 
                disabled={isSubmitting} 
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modern Success Modal */}
      <Modal visible={!!successMessage} transparent animationType="fade">
        <View style={s.modalOverlayCenter}>
          <View style={s.successModalContent}>
            <View style={s.successIconContainer}>
              <CheckCircle size={56} color="#10B981" />
            </View>
            <Text style={s.successTitle}>Success!</Text>
            <Text style={s.successSubtitle}>{successMessage}</Text>
            
            <View style={{ width: '100%', marginTop: 16 }}>
              <GlassButton 
                title="Done" 
                onPress={handleSuccessDone} 
              />
            </View>
          </View>
        </View>
      </Modal>
    </TwoToneWrapper>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, paddingTop: 16 },
  headerIconRow: { marginBottom: 12 },
  headerIconCircle: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerTitle: {
    color: COLORS.vjBg, fontSize: 28, fontWeight: '800',
    letterSpacing: -0.5, marginBottom: 4,
  },
  headerSubtitle: {
    color: 'rgba(252,251,248,0.55)', fontSize: 12, fontWeight: '600',
    letterSpacing: 0.3, textTransform: 'uppercase',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  formGroup: { marginBottom: 24 },
  label: { fontSize: 12, fontWeight: '700', color: 'rgba(92,22,35,0.6)', textTransform: 'uppercase', marginBottom: 8 },
  input: { backgroundColor: '#fff', borderRadius: 12, padding: 16, fontSize: 16, color: COLORS.vjText, borderWidth: 1, borderColor: 'rgba(92,22,35,0.3)' },
  toggleRow: { flexDirection: 'row', gap: 12 },
  toggleBtn: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(92,22,35,0.3)', alignItems: 'center', backgroundColor: '#fff' },
  toggleActiveGold: { backgroundColor: '#C8860A', borderColor: '#C8860A' },
  toggleActiveSilver: { backgroundColor: '#6B7280', borderColor: '#6B7280' },
  toggleText: { fontSize: 14, fontWeight: '700', color: 'rgba(92,22,35,0.6)' },
  toggleTextActive: { color: '#fff' },
  
  // Success Modal Styles
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successModalContent: {
    backgroundColor: COLORS.vjBg,
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  successIconContainer: {
    marginBottom: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    padding: 16,
    borderRadius: 50,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.vjText,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    color: 'rgba(92,22,35,0.6)',
    textAlign: 'center',
    marginBottom: 24,
  },
});
