import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { COLORS } from '../../constants/theme';

const { width, height } = Dimensions.get('window');

/**
 * ULTRA-PERFORMANCE LUXURY JEWELLERY DYNAMIC VECTOR BACKGROUND
 * Wrapped in React.memo to eliminate re-render overhead during user input & scrolling.
 * Combines hardware-accelerated ambient gradients with subtle geometric jewelry vector art.
 */
export const DynamicBackground = React.memo(function DynamicBackground() {
  return (
    <View style={styles.container} pointerEvents="none">
      {/* 1. Base Luxury Pearl Ivory */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.vjBg }]} />
      
      {/* 2. Top-Right Ambient Rich Gold Glow */}
      <View style={[
        styles.blobWrapper, 
        { top: -width * 0.35, right: -width * 0.25 }
      ]}>
        <LinearGradient
          colors={['rgba(212,175,55,0.12)', 'rgba(212,175,55,0.02)', 'rgba(252,251,248,0.0)']}
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
          colors={['rgba(92,22,35,0.08)', 'rgba(92,22,35,0.01)', 'rgba(252,251,248,0.0)']}
          start={{ x: 0.2, y: 0.8 }} end={{ x: 1, y: 0 }}
          style={styles.blob}
        />
      </View>

      {/* 4. Luxury Vector Geometry Watermark (Top Right - Positioned safely inside rounded panel) */}
      <View style={{ position: 'absolute', top: 48, right: -25, opacity: 0.04 }}>
        <Svg width={220} height={220} viewBox="0 0 200 200" fill="none">
          <Circle cx="100" cy="100" r="80" stroke={COLORS.vjAccent} strokeWidth="1" strokeDasharray="4 4" />
          <Circle cx="100" cy="100" r="60" stroke={COLORS.vjAccent} strokeWidth="1" />
          <Circle cx="100" cy="100" r="40" stroke={COLORS.vjAccent} strokeWidth="0.8" />
          <Path d="M100 20 L100 180 M20 100 L180 100 M43.4 43.4 L156.6 156.6 M43.4 156.6 L156.6 43.4" stroke={COLORS.vjAccent} strokeWidth="0.5" />
          <Path d="M100 40 L140 100 L100 160 L60 100 Z" stroke={COLORS.vjAccent} strokeWidth="0.8" />
        </Svg>
      </View>

      {/* 5. Luxury Vector Geometry Watermark (Bottom Left) */}
      <View style={{ position: 'absolute', bottom: 60, left: -40, opacity: 0.035 }}>
        <Svg width={240} height={240} viewBox="0 0 200 200" fill="none">
          <Circle cx="100" cy="100" r="90" stroke={COLORS.vjText} strokeWidth="1" />
          <Circle cx="100" cy="100" r="70" stroke={COLORS.vjText} strokeWidth="0.8" strokeDasharray="6 3" />
          <Path d="M100 10 L190 100 L100 190 L10 100 Z" stroke={COLORS.vjText} strokeWidth="0.8" />
          <Path d="M100 30 L170 100 L100 170 L30 100 Z" stroke={COLORS.vjText} strokeWidth="0.5" />
        </Svg>
      </View>

      {/* 6. Frosted Diffusion Glass Layer */}
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