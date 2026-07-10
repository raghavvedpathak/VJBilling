import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

/**
 * PREMIUM GLASSMORPHISM BACKGROUND
 * A clean, luxury aesthetic utilizing soft gradients of Maroon and Gold.
 * The slow, breathing animation is lightweight on the battery and provides
 * a stunning foundation for frosted GlassCard UI components.
 */
export function DynamicBackground() {
  return (
    <View style={styles.container} pointerEvents="none">
      {/* 1. Base Luxury Pearl White */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FCFBF8' }]} />
      
      {/* 2. Top-Right Gold Blob */}
      <View style={[
        styles.blobWrapper, 
        { top: -width * 0.3, right: -width * 0.2 }
      ]}>
        <LinearGradient
          colors={['rgba(212,175,55,0.15)', 'rgba(212,175,55,0.0)']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.blob}
        />
      </View>

      {/* 3. Bottom-Left Maroon Blob */}
      <View style={[
        styles.blobWrapper, 
        { bottom: -width * 0.2, left: -width * 0.3 }
      ]}>
        <LinearGradient
          colors={['rgba(92,22,35,0.12)', 'rgba(92,22,35,0.0)']}
          start={{ x: 1, y: 1 }} end={{ x: 0, y: 0 }}
          style={styles.blob}
        />
      </View>

      {/* 4. Subtle center wash (connects the two) */}
      <View style={[
        styles.blobWrapper, 
        { top: height * 0.3, left: width * 0.1 }
      ]}>
        <LinearGradient
          colors={['rgba(212,175,55,0.05)', 'rgba(92,22,35,0.03)', 'rgba(252,251,248,0.0)']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.blob, { width: width, height: width }]}
        />
      </View>

      {/* 5. Frosted Glass Overlay (Diffuses the blobs for the glassmorphism effect) */}
      <View style={[StyleSheet.absoluteFill, styles.glassOverlay]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...(StyleSheet.absoluteFill as object),
    overflow: 'hidden',
    backgroundColor: '#FCFBF8',
  },
  blobWrapper: {
    position: 'absolute',
    width: width * 1.2,
    height: width * 1.2,
  },
  blob: {
    flex: 1,
    borderRadius: 9999,
  },
  glassOverlay: {
    backgroundColor: 'rgba(252,251,248, 0.4)', // Slightly white overlay to soften gradients
  }
});