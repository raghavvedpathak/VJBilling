import React, { useEffect } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  withSequence, 
  Easing
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

export function DynamicBackground() {
  const { width, height } = useWindowDimensions();
  
  // Animation values
  const sheenTranslate = useSharedValue(-width * 2);
  const ringRotation1 = useSharedValue(0);
  const ringRotation2 = useSharedValue(0);

  useEffect(() => {
    // 1. The Polish: A sharp, angled light sweep every 8 seconds
    sheenTranslate.value = withRepeat(
      withSequence(
        withTiming(width * 2, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        withTiming(-width * 2, { duration: 0 }), // Instant reset
        withTiming(-width * 2, { duration: 5000 }) // 5-second pause of pure stillness
      ),
      -1,
      false
    );

    // 2. The Motif: Glacial, premium rotation of the background rings
    ringRotation1.value = withRepeat(
      withTiming(360, { duration: 60000, easing: Easing.linear }), // 60 seconds for one turn
      -1,
      false
    );
    
    ringRotation2.value = withRepeat(
      withTiming(-360, { duration: 80000, easing: Easing.linear }), // 80 seconds, opposite direction
      -1,
      false
    );
  }, [width]);

  const sheenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sheenTranslate.value }, { rotate: '25deg' }],
  }));

  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${ringRotation1.value}deg` }],
  }));

  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${ringRotation2.value}deg` }],
  }));

  // Sizing for the motif rings
  const ringSize = width * 1.2;

  return (
    <View style={s.container} pointerEvents="none">
      
      {/* 1. THE DISPLAY PAD: Ivory to Champagne subtle gradient */}
      <LinearGradient
        colors={['#FFFFFF', '#FDFBF7', '#F4EBE0']}
        locations={[0, 0.5, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* 2. THE HERITAGE MOTIF: Glacial rotating gold rings */}
      <View style={s.motifContainer}>
        <Animated.View style={[
          s.goldRing, 
          { width: ringSize, height: ringSize, borderRadius: ringSize / 2 },
          ring1Style
        ]}>
          {/* Inner offset to create a varying thickness effect */}
          <View style={[s.goldRingInner, { width: ringSize * 0.98, height: ringSize * 0.98, borderRadius: ringSize / 2 }]} />
        </Animated.View>
        
        <Animated.View style={[
          s.goldRing, 
          { width: ringSize * 0.85, height: ringSize * 0.85, borderRadius: ringSize / 2, opacity: 0.6 },
          ring2Style
        ]}>
           <View style={[s.goldRingInner, { width: ringSize * 0.83, height: ringSize * 0.83, borderRadius: ringSize / 2 }]} />
        </Animated.View>
      </View>

      {/* 3. THE POLISH: A sharp light reflection passing over the UI */}
      <Animated.View style={[StyleSheet.absoluteFillObject, sheenStyle, s.sheenWrapper]}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255, 255, 255, 0.8)', 'rgba(255,255,255,0)']}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={s.sheenGradient}
        />
      </Animated.View>
      
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: '#FDFBF7',
  },
  motifContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.15, // Extremely subtle so it never competes with your text/data
  },
  goldRing: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: '#D4AF37', // True Metallic Gold
    justifyContent: 'center',
    alignItems: 'center',
  },
  goldRingInner: {
    borderWidth: 0.5,
    borderColor: '#B5952F', // Darker gold for depth
    transform: [{ translateX: 2 }, { translateY: 2 }], // Off-center for an organic, hand-crafted feel
  },
  sheenWrapper: {
    width: '300%',
    height: '300%',
    top: '-100%',
    left: '-100%',
  },
  sheenGradient: {
    width: '15%', // Keeps the light band sharp and focused, not washed out
    height: '100%',
  }
});