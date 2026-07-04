import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

/**
 * THE "3D HOLOGRAPHIC DIAMOND" ENGINE
 * Designed to completely shock the user. 
 * This uses 3D perspective transforms to create a massive, glowing, counter-rotating 
 * geometric diamond floor in the background. It represents precision, luxury, and technology.
 */
export function DynamicBackground() {
  const spinAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    // The infinite, smooth rotation engine
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 35000, // Very slow, majestic spin
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // The glowing pulse engine for the core
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
      ])
    ).start();
  }, [spinAnim, pulseAnim]);

  // Map to rotations
  const spinZ = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const spinZReverse = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });
  const spinZFast = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '720deg'] });
  
  // Map to pulse opacity
  const coreGlow = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.8] });
  const ringGlow = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });

  return (
    <View style={styles.container} pointerEvents="none">
      {/* 1. Base Velvet Ivory */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FCFBF8' }]} />
      
      {/* 2. The 3D Holographic Perspective Chamber */}
      <View style={styles.perspectiveWrapper}>
        
        {/* Layer 1: Massive Maroon Geometric Base (Spins Forward) */}
        <Animated.View style={[
          styles.shardsLayer, 
          { 
            transform: [
              { rotateX: '72deg' }, 
              { rotateZ: spinZ },
              { scale: 1.8 }
            ] 
          }
        ]}>
           <View style={[styles.hollowDiamond, { borderColor: 'rgba(92,22,35,0.06)', borderWidth: 80 }]} />
           <View style={[styles.hollowDiamond, { borderColor: 'rgba(92,22,35,0.03)', borderWidth: 10, transform: [{ scale: 1.3 }] }]} />
           {/* Diagonal Crosshairs */}
           <View style={[styles.crosshair, { backgroundColor: 'rgba(92,22,35,0.02)' }]} />
           <View style={[styles.crosshair, { backgroundColor: 'rgba(92,22,35,0.02)', transform: [{ rotate: '90deg' }] }]} />
        </Animated.View>

        {/* Layer 2: Fine Gold Refraction Rings (Spins Reverse) */}
        <Animated.View style={[
          styles.shardsLayer, 
          { 
            transform: [
              { rotateX: '72deg' }, 
              { rotateZ: spinZReverse },
              { scale: 1.2 }
            ],
            opacity: ringGlow
          }
        ]}>
           <View style={[styles.hollowDiamond, { borderColor: 'rgba(212,175,55,0.25)', borderWidth: 1 }]} />
           <View style={[styles.hollowDiamond, { borderColor: 'rgba(212,175,55,0.15)', borderWidth: 4, transform: [{ scale: 0.8 }] }]} />
           <View style={[styles.hollowDiamond, { borderColor: 'rgba(212,175,55,0.08)', borderWidth: 40, transform: [{ scale: 1.4 }] }]} />
        </Animated.View>

        {/* Layer 3: Solid Gold Inner Glowing Diamond Core (Spins Fast) */}
        <Animated.View style={[
          styles.shardsLayer, 
          { 
            transform: [
              { rotateX: '72deg' }, 
              { rotateZ: spinZFast },
              { scale: 0.5 }
            ],
            opacity: coreGlow
          }
        ]}>
           <LinearGradient
              colors={['rgba(212,175,55,0.5)', 'rgba(212,175,55,0.0)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={[styles.hollowDiamond, { backgroundColor: 'rgba(212,175,55,0.1)', borderWidth: 2, borderColor: 'rgba(212,175,55,0.6)' }]}
           />
        </Animated.View>
      </View>

      {/* 3. Deep Vignette to blend the 3D floor into the void of the screen edges */}
      <View style={[StyleSheet.absoluteFill, styles.vignette]} />
      
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...(StyleSheet.absoluteFill as object),
    overflow: 'hidden',
    backgroundColor: '#FCFBF8', // Pearl White Base
  },
  perspectiveWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    // THIS IS THE SECRET TO JAW-DROPPING 3D
    transform: [{ perspective: 800 }], 
  },
  shardsLayer: {
    position: 'absolute',
    width: width * 2,
    height: width * 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hollowDiamond: {
    position: 'absolute',
    width: width * 1.3,
    height: width * 1.3,
  },
  crosshair: {
    position: 'absolute',
    width: width * 3,
    height: 2,
  },
  vignette: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: 32,
    backgroundColor: 'rgba(252,251,248, 0.2)', // Slight ambient wash over everything
  }
});