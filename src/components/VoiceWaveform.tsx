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

interface VoiceWaveformProps {
  isSpeaking: boolean;
}

const BAR_COUNT = 6;
const MIN_HEIGHT = 8;
const MAX_HEIGHT = 32;

const WaveBar = ({ index, isSpeaking }: { index: number, isSpeaking: boolean }) => {
  const height = useSharedValue(MIN_HEIGHT);

  useEffect(() => {
    if (isSpeaking) {
      height.value = withRepeat(
        withDelay(
          index * 150,
          withTiming(MAX_HEIGHT, { 
            duration: 500, 
            easing: Easing.inOut(Easing.sin) 
          })
        ),
        -1,
        true
      );
    } else {
      height.value = withTiming(MIN_HEIGHT, { duration: 300 });
    }
  }, [isSpeaking]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return <Animated.View style={[styles.bar, animatedStyle]} />;
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
