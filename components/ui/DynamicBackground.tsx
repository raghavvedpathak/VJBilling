import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

/**
 * PREMIUM MESH GRADIENT BACKGROUND
 * 
 * An ultra-modern, luxury aesthetic using soft, intersecting gradients.
 * Designed specifically for a high-end jewelry billing application.
 * Utilizes the brand colors (Gold and Maroon) bleeding softly into a Pearl White canvas.
 * Zero animation overhead, completely fluid and distraction-free, enhancing Glassmorphism UI.
 */
export function DynamicBackground() {
  return (
    <View style={styles.container} pointerEvents="none">
      
      {/* 1. Base Luxury Pearl White */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FCFBF8' }]} />
      
      {/* 2. Soft Ambient Gold Sweep (Top Left to Center) */}
      <LinearGradient
        colors={['rgba(212,175,55,0.18)', 'rgba(212,175,55,0.03)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cornerGradientTopLeft}
      />

      {/* 3. Deep Maroon Accent Sweep (Bottom Right to Center) */}
      <LinearGradient
        colors={['transparent', 'rgba(92,22,35,0.02)', 'rgba(92,22,35,0.12)']}
        start={{ x: 0.2, y: 0.2 }}
        end={{ x: 1, y: 1 }}
        style={styles.cornerGradientBottomRight}
      />

      {/* 4. Central Soft Gold Orb for Depth */}
      <View style={[styles.orb, { backgroundColor: 'rgba(212,175,55,0.04)' }]} />

      {/* 5. Delicate Glass Vignette Overlay */}
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
  cornerGradientTopLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width * 1.5,
    height: height * 0.7,
    borderBottomRightRadius: width,
    transform: [{ translateX: -width * 0.2 }, { translateY: -height * 0.1 }],
  },
  cornerGradientBottomRight: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: width * 1.5,
    height: height * 0.7,
    borderTopLeftRadius: width,
    transform: [{ translateX: width * 0.2 }, { translateY: height * 0.1 }],
  },
  orb: {
    position: 'absolute',
    width: width,
    height: width,
    borderRadius: width / 2,
    top: height / 2 - width / 2,
    left: -width * 0.3,
  },
  vignette: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: 32,
  }
});