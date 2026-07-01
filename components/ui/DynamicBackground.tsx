import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

/**
 * FINAL PROFESSIONAL BACKGROUND
 * 
 * A hyper-clean, zero-lag, static background perfectly suited for a premium fintech/billing app.
 * Utilizes subtle, soft corner glows in the brand colors (Gold and Maroon) over a pearl white 
 * canvas to create a high-end, distraction-free aesthetic.
 */
export function DynamicBackground() {
  return (
    <View style={styles.container} pointerEvents="none">
      
      {/* 1. Clean Pearl White Base - Maximum contrast for billing data */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FCFBF8' }]} />
      
      {/* 2. Extremely subtle, elegant top glows to give depth without distraction */}
      {/* Faint Gold Glow (Top Left) */}
      <View style={[
        styles.glow, 
        { top: -width * 0.4, left: -width * 0.2, backgroundColor: 'rgba(212,175,55,0.06)' }
      ]} />
      
      {/* Faint Maroon Glow (Top Right) */}
      <View style={[
        styles.glow, 
        { top: -width * 0.3, right: -width * 0.3, backgroundColor: 'rgba(139,37,56,0.04)' }
      ]} />
      
      {/* 3. Fine frosted vignette to frame the interface perfectly */}
      <View style={[StyleSheet.absoluteFill, styles.vignette]} />
      
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...(StyleSheet.absoluteFill as object),
    overflow: 'hidden',
    backgroundColor: '#FCFBF8',
  },
  glow: {
    position: 'absolute',
    width: width,
    height: width,
    borderRadius: width / 2,
  },
  vignette: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: 32,
  }
});