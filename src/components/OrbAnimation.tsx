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
const AnyAnimatedPath = AnimatedPath as any;
const AnyAnimatedView = Animated.View as any;

const { width } = Dimensions.get('window');
const ORB_SIZE = 280;

/**
 * Props for the OrbAnimation component.
 */
interface OrbAnimationProps {
  /** Indicates whether the AI is currently listening to user voice input */
  isListening?: boolean;
  /** Indicates whether the AI is currently speaking/synthesizing audio */
  isSpeaking?: boolean;
  /** Indicates whether the AI is currently processing/analyzing data */
  isAnalyzing?: boolean;
}

/**
 * OrbAnimation Component
 * 
 * Renders a visually immersive, multi-layered "breathing" and "morphing" glassmorphic orb
 * that dynamically reflects the current AI state (listening, speaking, analyzing, or idle).
 * Uses React Native Reanimated for high-performance fluid 60fps animations and 
 * React Native SVG to dynamically morph four distinct overlapping organic blobs.
 */
export const OrbAnimation: React.FC<OrbAnimationProps> = ({ isListening, isSpeaking, isAnalyzing }) => {
  // Shared values driving the base physics/animation vectors
  const breath = useSharedValue(0); // Periodic scale/shadow breathing loop [0, 1]
  const rotation = useSharedValue(0); // Constant circular spin factor [0, 1]
  const pulse = useSharedValue(0); // Morphing amplitude pulse loop [0, 1]
  
  // Multipliers that scale anim speed & morph intensiveness dynamically based on active AI state
  const animSpeed = useSharedValue(1);
  const animIntensity = useSharedValue(1);

  // Initialize continuous loop animations on mount
  useEffect(() => {
    // 1. Gentle background breathing: scales the whole orb container slightly over 4s
    breath.value = withRepeat(
      withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
      -1, // Loop indefinitely
      true // Reverse direction on repeat (breath-in then breath-out)
    );
    
    // 2. Continuous rotation: spins the container holding the SVG blobs
    rotation.value = withRepeat(
      withTiming(1, { duration: 30000, easing: Easing.linear }),
      -1, // Loop indefinitely
      false // Do not reverse, keep rotating in the same direction
    );

    // 3. Fluid morphing pulse: drives the organic oscillation of the SVG paths
    pulse.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1, // Loop indefinitely
      true // Reverse direction to create a smooth back-and-forth morphing rhythm
    );
  }, []);

  // Synchronize state multipliers when active AI modes shift
  // Uses spring physics to smoothly transition speed/intensity changes without sudden visual jumps
  useEffect(() => {
    if (isListening) {
      // High speed, high amplitude for real-time auditory attention
      animSpeed.value = withSpring(2.5);
      animIntensity.value = withSpring(1.4);
    } else if (isSpeaking) {
      // Medium-fast rhythmic pulses mimicking voice generation
      animSpeed.value = withSpring(1.8);
      animIntensity.value = withSpring(1.2);
    } else if (isAnalyzing) {
      // Slow, hypnotic, deep-processing motion
      animSpeed.value = withSpring(0.5);
      animIntensity.value = withSpring(0.8);
    } else {
      // Return to peaceful standard idle configuration
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

  /**
   * SVG Morphing Logic (UI Thread Worklet)
   * 
   * Dynamically constructs SVG path definitions (`d`) to render morphing blob structures.
   * Employs quadratic Bezier curve commands (`Q` control-point x y, end-point x y) and shorthand
   * reflection curves (`T` end-point x y) to form a closed, fluid path.
   * 
   * @param p - The primary normalized pulse parameter [0, 1]
   * @param type - Which blob design formula to return (1-4)
   * @returns A string valid for an SVG Path 'd' attribute
   */
  const getMorphPath = (p: number, type: number) => {
    "worklet";
    const base = 600; // Center coordinate within the 1200x1200px local SVG viewBox
    
    // Calculate a dynamic amplitude offset using a sine-wave frequency mapped over time
    // and scaled by our state-driven animIntensity value.
    const offset = 50 * Math.sin(p * Math.PI * 2) * animIntensity.value;
    
    // Each type defines a slightly unique geometric configuration of quadratic curves,
    // ensuring the blobs overlap and morph asynchronously rather than moving in lock-step.
    if (type === 1) {
      // Top/bottom dominant expansion
      return `M 100 ${base} Q 100 ${base - 500 - offset}, 600 ${base - 500 - offset} T 1100 ${base} T 600 ${base + 500 + offset} T 100 ${base} Z`;
    } else if (type === 2) {
      // Right-shifted horizontal sweep
      return `M 150 ${base} Q 150 ${base - 650 + offset}, 650 ${base - 500} T 1150 ${base + offset} T 650 ${base + 500} T 150 ${base} Z`;
    } else if (type === 3) {
      // Highly irregular vertical stretch
      return `M 100 ${base} Q 120 ${base - 600 - offset}, 600 ${base - 500} T 1000 ${base} T 600 ${base + 500 + offset} T 100 ${base} Z`;
    } else {
      // Small dense core blob
      return `M 150 ${base} Q 150 ${base - 650 + offset}, 650 ${base - 500} T 1150 ${base + 550} T 650 ${base + 500} T 150 ${base} Z`;
    }
  };

  const blob1Props = useAnimatedProps(() => ({ d: getMorphPath(pulse.value, 1) }));
  const blob2Props = useAnimatedProps(() => ({ d: getMorphPath(pulse.value * 0.8, 2) }));
  const blob3Props = useAnimatedProps(() => ({ d: getMorphPath(pulse.value * 1.2, 3) }));
  const blob4Props = useAnimatedProps(() => ({ d: getMorphPath(pulse.value * 0.5, 4) }));

  return (
    <View style={styles.container}>
      <AnyAnimatedView style={[styles.orbGlass, orbContainerStyle]}>
        <View style={styles.blobsContainer}>
          <AnyAnimatedView style={[styles.fullSize, blobsRotationStyle]}>
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
                <AnyAnimatedPath animatedProps={blob1Props} fill="url(#grad1)" />
              </G>
              <G opacity={0.6} transform="scale(0.8) translate(120, 120)">
                <AnyAnimatedPath animatedProps={blob2Props} fill="url(#grad2)" />
              </G>
              <G opacity={0.6} transform="scale(0.85) translate(90, 90)">
                <AnyAnimatedPath animatedProps={blob3Props} fill="url(#grad3)" />
              </G>
              <G opacity={0.7} transform="scale(0.6) translate(240, 240)">
                <AnyAnimatedPath animatedProps={blob4Props} fill="url(#grad4)" />
              </G>
            </Svg>
          </AnyAnimatedView>
        </View>

        {/* Glassmorphism Layers */}
        <View style={styles.innerGlow} />
        <View style={styles.glossOverlay} />
      </AnyAnimatedView>
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
