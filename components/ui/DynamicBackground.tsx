import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export function DynamicBackground() {
  const { width, height } = useWindowDimensions();
  
  return (
    <View style={s.container} pointerEvents="none">
      
      {/* 1. Base Premium Ivory Gradient */}
      <LinearGradient
        colors={['#FCFBF8', '#F5EBE1', '#FCFBF8']}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* 2. Modern Abstract Geometry (Soft Gold Glow) */}
      <LinearGradient
        colors={['rgba(212,175,55,0.12)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          position: 'absolute',
          top: -height * 0.2,
          right: -width * 0.5,
          width: width * 1.8,
          height: width * 1.8,
          borderRadius: width * 0.9,
          transform: [{ scaleX: 1.2 }, { rotate: '15deg' }],
        }}
      />

      {/* 3. Modern Abstract Geometry (Soft Ruby Glow) */}
      <LinearGradient
        colors={['transparent', 'rgba(92,22,35,0.06)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          position: 'absolute',
          bottom: -height * 0.2,
          left: -width * 0.4,
          width: width * 1.6,
          height: width * 1.6,
          borderRadius: width * 0.8,
          transform: [{ scaleY: 1.4 }, { rotate: '-25deg' }],
        }}
      />

      {/* 4. Architectural Accent Lines */}
      <View style={[
        s.accentLine, 
        { top: '30%', left: '-15%', width: width * 1.5, transform: [{ rotate: '35deg' }] }
      ]} />
      <View style={[
        s.accentLine, 
        { bottom: '20%', right: '-25%', width: width * 1.8, transform: [{ rotate: '-15deg' }] }
      ]} />
      
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: '#FCFBF8',
  },
  accentLine: {
    position: 'absolute',
    height: 1,
    backgroundColor: 'rgba(212,175,55,0.25)', // True Gold 25% opacity
  }
});