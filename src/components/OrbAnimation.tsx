import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Defs, RadialGradient, Stop, G } from 'react-native-svg';
import Animated, { 
  useSharedValue, 
  useAnimatedProps, 
  withRepeat, 
  withTiming, 
  Easing,
  interpolate,
  useAnimatedStyle,
  withSpring,
  interpolateColor
} from 'react-native-reanimated';

const AnimatedPath = Animated.createAnimatedComponent(Path);

const { width } = Dimensions.get('window');
const ORB_SIZE = 280;

interface OrbAnimationProps {
  isListening?: boolean;
  isSpeaking?: boolean;
  isAnalyzing?: boolean;
}

export const OrbAnimation: React.FC<OrbAnimationProps> = ({ isListening, isSpeaking, isAnalyzing }) => {
  const breath = useSharedValue(0);
  const rotation = useSharedValue(0);
  const pulse = useSharedValue(0);
  
  // Animation state values
  const animSpeed = useSharedValue(1);
  const animIntensity = useSharedValue(1);

  useEffect(() => {
    // Breathing animation
    breath.value = withRepeat(
      withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    
    // Continuous rotation
    rotation.value = withRepeat(
      withTiming(1, { duration: 30000, easing: Easing.linear }),
      -1,
      false
    );

    // Pulse animation
    pulse.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  useEffect(() => {
    if (isListening) {
      animSpeed.value = withSpring(2.5);
      animIntensity.value = withSpring(1.4);
    } else if (isSpeaking) {
      animSpeed.value = withSpring(1.8);
      animIntensity.value = withSpring(1.2);
    } else if (isAnalyzing) {
      animSpeed.value = withSpring(0.5);
      animIntensity.value = withSpring(0.8);
    } else {
      animSpeed.value = withSpring(1);
      animIntensity.value = withSpring(1);
    }
  }, [isListening, isSpeaking, isAnalyzing]);

  const orbContainerStyle = useAnimatedStyle(() => {
    const scale = interpolate(breath.value, [0, 1], [1, 1.05 * animIntensity.value]);
    return {
      transform: [{ scale }],
      shadowRadius: interpolate(breath.value, [0, 1], [40, 60]),
      shadowOpacity: interpolate(breath.value, [0, 1], [0.2, 0.4]),
    };
  });

  const blobsRotationStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotation.value * 360 * animSpeed.value}deg` }],
    };
  });

  // SVG Morphing Logic
  const getMorphPath = (p: number, type: number) => {
    "worklet";
    const base = 600;
    const offset = 50 * Math.sin(p * Math.PI * 2) * animIntensity.value;
    
    // Approximating the blob morphing with quadratic curves
    if (type === 1) {
      return `M 100 ${base} Q 100 ${base - 500 - offset}, 600 ${base - 500 - offset} T 1100 ${base} T 600 ${base + 500 + offset} T 100 ${base} Z`;
    } else if (type === 2) {
      return `M 150 ${base} Q 150 ${base - 650 + offset}, 650 ${base - 500} T 1150 ${base + offset} T 650 ${base + 500} T 150 ${base} Z`;
    } else if (type === 3) {
      return `M 100 ${base} Q 120 ${base - 600 - offset}, 600 ${base - 500} T 1000 ${base} T 600 ${base + 500 + offset} T 100 ${base} Z`;
    } else {
      return `M 150 ${base} Q 150 ${base - 650 + offset}, 650 ${base - 500} T 1150 ${base + 550} T 650 ${base + 500} T 150 ${base} Z`;
    }
  };

  const blob1Props = useAnimatedProps(() => ({ d: getMorphPath(pulse.value, 1) }));
  const blob2Props = useAnimatedProps(() => ({ d: getMorphPath(pulse.value * 0.8, 2) }));
  const blob3Props = useAnimatedProps(() => ({ d: getMorphPath(pulse.value * 1.2, 3) }));
  const blob4Props = useAnimatedProps(() => ({ d: getMorphPath(pulse.value * 0.5, 4) }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.orbGlass, orbContainerStyle]}>
        <View style={styles.blobsContainer}>
          <Animated.View style={[styles.fullSize, blobsRotationStyle]}>
            <Svg viewBox="0 0 1200 1200" style={styles.svg}>
              <Defs>
                <RadialGradient id="grad1" cx="50%" cy="50%" rx="50%" ry="50%">
                  <Stop offset="0%" stopColor="#ff007b" stopOpacity="0.7" />
                  <Stop offset="100%" stopColor="#ff007b" stopOpacity="0" />
                </RadialGradient>
                <RadialGradient id="grad2" cx="50%" cy="50%" rx="50%" ry="50%">
                  <Stop offset="0%" stopColor="#00faff" stopOpacity="0.7" />
                  <Stop offset="100%" stopColor="#00faff" stopOpacity="0" />
                </RadialGradient>
                <RadialGradient id="grad3" cx="50%" cy="50%" rx="50%" ry="50%">
                  <Stop offset="0%" stopColor="#87CEEB" stopOpacity="0.7" />
                  <Stop offset="100%" stopColor="#87CEEB" stopOpacity="0" />
                </RadialGradient>
                <RadialGradient id="grad4" cx="50%" cy="50%" rx="50%" ry="50%">
                  <Stop offset="0%" stopColor="#00ff9d" stopOpacity="0.8" />
                  <Stop offset="100%" stopColor="#00ff9d" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              
              <G opacity={0.6} transform="scale(0.9) translate(60, 60)">
                <AnimatedPath animatedProps={blob1Props} fill="url(#grad1)" />
              </G>
              <G opacity={0.6} transform="scale(0.8) translate(120, 120)">
                <AnimatedPath animatedProps={blob2Props} fill="url(#grad2)" />
              </G>
              <G opacity={0.6} transform="scale(0.85) translate(90, 90)">
                <AnimatedPath animatedProps={blob3Props} fill="url(#grad3)" />
              </G>
              <G opacity={0.7} transform="scale(0.6) translate(240, 240)">
                <AnimatedPath animatedProps={blob4Props} fill="url(#grad4)" />
              </G>
            </Svg>
          </Animated.View>
        </View>

        {/* Glassmorphism Layers */}
        <View style={styles.innerGlow} />
        <View style={styles.glossOverlay} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbGlass: {
    width: '100%',
    height: '100%',
    borderRadius: ORB_SIZE / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    // Outer glow
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    elevation: 20,
  },
  blobsContainer: {
    width: '120%',
    height: '120%',
    position: 'absolute',
  },
  fullSize: {
    width: '100%',
    height: '100%',
  },
  svg: {
    width: '100%',
    height: '100%',
  },
  innerGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: ORB_SIZE / 2,
    borderWidth: 10,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  glossOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: ORB_SIZE / 2,
    // Simulate a highlight at the top left
  },
});
