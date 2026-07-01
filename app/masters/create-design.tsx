import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, Modal, KeyboardAvoidingView, ScrollView, Platform, Keyboard, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { TwoToneWrapper } from '../../components/TwoToneWrapper';
import { GlassButton, GlassSmartSearch } from '../../components/ui/Glass';
import { Tag, CheckCircle } from 'lucide-react-native';
import { useFirmStore } from '../../store/firmStore';
import { db } from '../../db/client';
import { designs as designsTable, categories as categoriesTable, designCategoryMap as designCategoryMapTable } from '../../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { now } from '../../utils/now';
import * as Crypto from 'expo-crypto';

const COLORS = {
  vjText: '#5C1623',
  vjBg: '#FCFBF8',
  vjAccent: '#D4AF37',
  highlight: '#FDE047',
};

type Category = typeof categoriesTable.$inferSelect;

// --- Custom Component: Smart Text Highlighter ---
const HighlightText = ({ text, query, baseStyle }: { text: string, query: string, baseStyle: any }) => {
  if (!query) return <Text style={baseStyle}>{text}</Text>;

  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return (
    <Text style={baseStyle}>
      {parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <Text key={index} style={[baseStyle, { backgroundColor: COLORS.highlight, color: '#000' }]}>
            {part}
          </Text>
        ) : (
          <Text key={index} style={baseStyle}>{part}</Text>
        )
      )}
    </Text>
  );
};

export default function CreateDesignScreen() {
  const router = useRouter();
  const { activeFirmId } = useFirmStore();
  
  const [categories, setCategories] = useState<Category[]>([]);
  
  const [newName, setNewName] = useState('');
  const [newMetal, setNewMetal] = useState<'GOLD' | 'SILVER'>('GOLD');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    if (!activeFirmId) return;
    try {
      const results = await db
        .select({
          category: categoriesTable,
          linkCount: sql<number>`(SELECT COUNT(*) FROM design_category_map WHERE category_id = categories.id)`,
          linkedDesigns: sql<string>`(
            SELECT GROUP_CONCAT(d.name, ', ') 
            FROM design_category_map m 
            JOIN designs d ON m.design_id = d.id 
            WHERE m.category_id = categories.id AND d.is_active = 1
          )`
        })
        .from(categoriesTable)
        .where(and(eq(categoriesTable.firmId, activeFirmId), eq(categoriesTable.isActive, 1)));
      setCategories(results.map(r => ({ ...r.category, linkCount: r.linkCount, linkedDesigns: r.linkedDesigns })) as any);
    } catch (e) {
      console.error(e);
    }
  }, [activeFirmId]);

  useFocusEffect(
    useCallback(() => {
      loadCategories();
    }, [loadCategories])
  );

  const handleAdd = async () => {
    if (!activeFirmId) return;
    if (!newName.trim() || !selectedCategoryId) {
      Alert.alert('Validation Error', 'Name and Category are required');
      return;
    }
    
    setIsSubmitting(true);
    try {
      // Check for soft-deleted design to restore
      const existing = await db.select().from(designsTable)
        .where(and(
          eq(designsTable.firmId, activeFirmId), 
          eq(designsTable.name, newName.trim()),
          eq(designsTable.metal, newMetal)
        ))
        .limit(1);
        
      if (existing.length > 0) {
        if (existing[0].isActive === 1) {
          Alert.alert('Duplicate', 'A design with this name and metal already exists.');
          setIsSubmitting(false);
          return;
        } else {
          await db.transaction(async (tx) => {
            // Restore design
            await tx.update(designsTable)
              .set({ isActive: 1, updatedAt: now() })
              .where(eq(designsTable.id, existing[0].id));
            
            // Delete old mappings to prevent unique constraint on designCategoryMap
            await tx.delete(designCategoryMapTable)
              .where(eq(designCategoryMapTable.designId, existing[0].id));
              
            // Create new mapping
            await tx.insert(designCategoryMapTable).values({
              id: Crypto.randomUUID(),
              designId: existing[0].id,
              categoryId: selectedCategoryId,
              firmId: activeFirmId,
              createdAt: now(),
            });
          });
          
          setSuccessMessage('Design restored successfully');
          setIsSubmitting(false);
          return;
        }
      }

      const countRes = await db.select({ count: sql<number>`count(*)` }).from(designsTable).where(and(eq(designsTable.firmId, activeFirmId), eq(designsTable.isActive, 1)));
      const codeStr = `DES${String(Number(countRes[0]?.count || 0) + 1).padStart(4, '0')}`;

      const designId = Crypto.randomUUID();

      await db.transaction(async (tx) => {
        await tx.insert(designsTable).values({
          id: designId,
          firmId: activeFirmId,
          name: newName.trim(),
          metal: newMetal,
          code: codeStr,
          isActive: 1,
          createdAt: now(),
          updatedAt: now(),
        });

        await tx.insert(designCategoryMapTable).values({
          id: Crypto.randomUUID(),
          designId,
          categoryId: selectedCategoryId,
          firmId: activeFirmId,
          createdAt: now(),
        });
      });
      
      setSuccessMessage('Design added successfully');
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) {
        Alert.alert('Duplicate', 'A design with this name/metal already exists.');
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCategorySelect = (catId: string, catName: string) => {
    setSelectedCategoryId(catId);
    setCategorySearchQuery(catName);
    setShowDropdown(false);
    Keyboard.dismiss();
  };

  const handleSuccessDone = () => {
    setSuccessMessage(null);
    router.back();
  };

  const headerContent = (
    <View>
      <View style={s.headerIconRow}>
        <View style={s.headerIconCircle}>
          <Tag size={28} color={COLORS.vjBg} />
        </View>
      </View>
      <Text style={s.headerTitle}>New Design</Text>
      <Text style={s.headerSubtitle}>Create a new master design</Text>
    </View>
  );

  return (
    <TwoToneWrapper title="" showBack headerContent={headerContent}>
      <View style={{ flex: 1 }}>
        <ScrollView style={s.container} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 32, paddingBottom: 350 }} keyboardShouldPersistTaps="handled">
          <View style={s.card}>
            <View style={s.formGroup}>
              <Text style={s.label}>Design Name</Text>
              <TextInput 
                style={s.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Classic Band"
              />
            </View>

            <View style={s.formGroup}>
              <Text style={s.label}>Metal Type</Text>
              <View style={s.toggleRow}>
                <TouchableOpacity 
                  style={[s.toggleBtn, newMetal === 'GOLD' && s.toggleActiveGold]}
                  onPress={() => {
                    setNewMetal('GOLD');
                    setSelectedCategoryId('');
                    setCategorySearchQuery('');
                  }}
                >
                  <Text style={[s.toggleText, newMetal === 'GOLD' && s.toggleTextActive]}>GOLD</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[s.toggleBtn, newMetal === 'SILVER' && s.toggleActiveSilver]}
                  onPress={() => {
                    setNewMetal('SILVER');
                    setSelectedCategoryId('');
                    setCategorySearchQuery('');
                  }}
                >
                  <Text style={[s.toggleText, newMetal === 'SILVER' && s.toggleTextActive]}>SILVER</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={[s.formGroup, { zIndex: 50 }]}>
              <GlassSmartSearch
                label="Link to Category"
                placeholder="Search categories..."
                options={categories
                  .filter(c => c.metal === newMetal)
                  .map(c => ({
                    id: c.id,
                    label: c.name,
                    sublabel: (c as any).linkedDesigns 
                      ? `Linked: ${(c as any).linkedDesigns}`
                      : ((c as any).linkCount > 0 ? `${(c as any).linkCount} Linked` : undefined),
                  }))
                }
                selectedId={selectedCategoryId}
                onSelect={(option) => {
                  if (option) {
                    handleCategorySelect(option.id, option.label);
                  } else {
                    setSelectedCategoryId('');
                    setCategorySearchQuery('');
                  }
                }}
              />
            </View>

          </View>
        </ScrollView>
        <View style={{ paddingHorizontal: 16, paddingBottom: 32, paddingTop: 16 }}>
          <GlassButton 
            title={isSubmitting ? 'Saving...' : 'Save Design'} 
            onPress={handleAdd} 
            disabled={isSubmitting || !selectedCategoryId} 
          />
        </View>
      </View>

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
  
  categoryDropdownWrapper: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 5,
  },
  categoryDropdown: { backgroundColor: '#fff', borderBottomLeftRadius: 12, borderBottomRightRadius: 12, borderWidth: 1, borderTopWidth: 0, borderColor: 'rgba(92,22,35,0.3)', overflow: 'hidden' },
  dropdownItem: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(92,22,35,0.05)' },
  dropdownItemActive: { backgroundColor: 'rgba(184,115,51,0.08)' },
  dropdownItemText: { fontSize: 15, fontWeight: '600', color: COLORS.vjText },
  dropdownItemTextActive: { color: COLORS.vjAccent, fontWeight: '800' },
  emptyDropdownMsg: { fontSize: 14, color: 'rgba(92,22,35,0.5)', fontStyle: 'italic', padding: 16, textAlign: 'center' },
  
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
  linkBadge: {
    backgroundColor: 'rgba(212, 175, 55, 0.2)', // Accent color with low opacity
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  linkBadgeText: {
    color: '#D4AF37',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
