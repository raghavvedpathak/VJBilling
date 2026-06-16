import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { itemRepository } from '../repositories/itemRepository';
import { getCurrencySymbol } from '../utils/currency';

interface StockWeightSummary {
  goldNetWeightMg: number;
  goldPhantomDebtMg: number;
  goldBalanceMg: number;
  silverNetWeightMg: number;
  silverPhantomDebtMg: number;
  silverBalanceMg: number;
}

export interface InventoryStockSummaryProps {
  firmId: string;
  goldRatePerGramPaise?: number;
  silverRatePerGramPaise?: number;
}

export function InventoryStockSummary({ firmId, goldRatePerGramPaise, silverRatePerGramPaise }: InventoryStockSummaryProps) {
  const [summary, setSummary] = useState<StockWeightSummary>({
    goldNetWeightMg: 0,
    goldPhantomDebtMg: 0,
    goldBalanceMg: 0,
    silverNetWeightMg: 0,
    silverPhantomDebtMg: 0,
    silverBalanceMg: 0,
  });

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      
      const fetchSummary = async () => {
        try {
          const data = await itemRepository.getStockWeightSummary(firmId);
          if (isActive) {
            setSummary(data);
          }
        } catch (error) {
          console.error('Failed to fetch stock summary:', error);
        }
      };

      fetchSummary();

      return () => {
        isActive = false;
      };
    }, [firmId])
  );

  const formatWeight = (mg: number) => {
    return (mg / 1000).toFixed(3) + ' g';
  };

  const formatCurrency = (mg: number, ratePerGramPaise?: number) => {
    if (ratePerGramPaise === undefined || ratePerGramPaise === null) {
      return getCurrencySymbol() + ' —';
    }
    const totalValuePaise = Math.round((mg / 1000) * ratePerGramPaise);
    return getCurrencySymbol() + (totalValuePaise / 100).toFixed(2);
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>Gold Stock</Text>
        <View style={styles.values}>
          <Text style={styles.weight}>{formatWeight(summary.goldNetWeightMg)}</Text>
          <Text style={styles.currency}>{formatCurrency(summary.goldNetWeightMg, goldRatePerGramPaise)}</Text>
        </View>
      </View>
      
      <View style={styles.row}>
        <Text style={styles.label}>Silver Stock</Text>
        <View style={styles.values}>
          <Text style={styles.weight}>{formatWeight(summary.silverNetWeightMg)}</Text>
          <Text style={styles.currency}>{formatCurrency(summary.silverNetWeightMg, silverRatePerGramPaise)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  values: {
    alignItems: 'flex-end',
  },
  weight: {
    fontSize: 16,
    fontWeight: '500',
  },
  currency: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
});
