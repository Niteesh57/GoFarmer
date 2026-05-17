import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  withDelay,
  Easing 
} from 'react-native-reanimated';
import { Colors } from '../theme/theme';

const AnyAnimatedView = Animated.View as any;

/**
 * Props for the VoiceWaveform component.
 */
interface VoiceWaveformProps {
  /** Flag showing if the AI is currently talking (drives the wave movement) */
  isSpeaking: boolean;
}

// Configurable constants for waveform visualization
const BAR_COUNT = 6;     // Total number of vertical bars in the waveform
const MIN_HEIGHT = 8;    // The resting height (px) of the bars when silent/idle
const MAX_HEIGHT = 32;   // The peak height (px) reached during active wave pulses

/**
 * WaveBar Subcomponent
 * 
 * Renders an individual vertical line in the audio waveform. 
 * If active, it pulsates up and down based on its unique index.
 */
const WaveBar = ({ index, isSpeaking }: { index: number, isSpeaking: boolean }) => {
  // Shared height value initialized to standard idle/resting height
  const height = useSharedValue(MIN_HEIGHT);

  useEffect(() => {
    if (isSpeaking) {
      // Create a repeating fluid loop that oscillates between MIN_HEIGHT and MAX_HEIGHT.
      // We stagger the delay based on the bar's horizontal index (index * 150ms) to
      // produce a beautiful, synchronized ripple effect across the bars rather than
      // having all of them bounce in unified unison.
      height.value = withRepeat(
        withDelay(
          index * 150,
          withTiming(MAX_HEIGHT, { 
            duration: 500, 
            easing: Easing.inOut(Easing.sin) // Sine ease-in-out ensures smooth deceleration at peaks
          })
        ),
        -1, // Loop infinitely while isSpeaking is true
        true // Reverse direction (shrink back down) on each cycle
      );
    } else {
      // Gently return to the quiet resting state when speaking stops
      height.value = withTiming(MIN_HEIGHT, { duration: 300 });
    }
  }, [isSpeaking]);

  // Animated styles linked to the Reanimated UI-thread height value
  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return <AnyAnimatedView style={[styles.bar, animatedStyle]} />;
};

export const VoiceWaveform: React.FC<VoiceWaveformProps> = ({ isSpeaking }) => {
  return (
    <View style={styles.container}>
      {[...Array(BAR_COUNT)].map((_, i) => (
        <WaveBar key={i} index={i} isSpeaking={isSpeaking} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 40,
    paddingHorizontal: 12,
  },
  bar: {
    width: 4,
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
});
