import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

/**
 * ULTRA-PERFORMANCE LUXURY JEWELLERY DYNAMIC BACKGROUND
 * Wrapped in React.memo to eliminate re-render overhead during user input & scrolling.
 * Uses hardware-accelerated linear gradients with soft Gold & Royal Ruby tones.
 */
export const DynamicBackground = React.memo(function DynamicBackground() {
  return (
    <View style={styles.container} pointerEvents="none">
      {/* 1. Base Luxury Pearl Ivory */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FCFBF8' }]} />
      
      {/* 2. Top-Right Ambient Rich Gold Glow */}
      <View style={[
        styles.blobWrapper, 
        { top: -width * 0.35, right: -width * 0.25 }
      ]}>
        <LinearGradient
          colors={['rgba(212,175,55,0.14)', 'rgba(212,175,55,0.02)', 'rgba(252,251,248,0.0)']}
          start={{ x: 0.8, y: 0.2 }} end={{ x: 0, y: 1 }}
          style={styles.blob}
        />
      </View>

      {/* 3. Bottom-Left Royal Ruby Maroon Glow */}
      <View style={[
        styles.blobWrapper, 
        { bottom: -width * 0.25, left: -width * 0.3 }
      ]}>
        <LinearGradient
          colors={['rgba(92,22,35,0.10)', 'rgba(92,22,35,0.01)', 'rgba(252,251,248,0.0)']}
          start={{ x: 0.2, y: 0.8 }} end={{ x: 1, y: 0 }}
          style={styles.blob}
        />
      </View>

      {/* 4. Subtle Center Gold-Rose Wash */}
      <View style={[
        styles.blobWrapper, 
        { top: height * 0.32, left: width * 0.05 }
      ]}>
        <LinearGradient
          colors={['rgba(212,175,55,0.04)', 'rgba(92,22,35,0.02)', 'rgba(252,251,248,0.0)']}
          start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }}
          style={[styles.blob, { width: width * 1.1, height: width * 1.1 }]}
        />
      </View>

      {/* 5. Frosted Diffusion Glass Layer */}
      <View style={[StyleSheet.absoluteFill, styles.glassOverlay]} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    ...(StyleSheet.absoluteFill as object),
    overflow: 'hidden',
    backgroundColor: '#FCFBF8',
  },
  blobWrapper: {
    position: 'absolute',
    width: width * 1.3,
    height: width * 1.3,
  },
  blob: {
    flex: 1,
    borderRadius: 9999,
  },
  glassOverlay: {
    backgroundColor: 'rgba(252,251,248, 0.45)', // Soft diffusion overdraw protection
  }
});