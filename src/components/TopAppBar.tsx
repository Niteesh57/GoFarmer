import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { Colors, Typography } from '../theme/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Global flag to track if animation has played in this session
let hasPlayedTractorAnimation = false;

interface TopAppBarProps {
  title?: string;
  rightLabel?: string;
  onRightPress?: () => void;
  showMenu?: boolean;
}

export default function TopAppBar({ title = 'GOFARMER', rightLabel, onRightPress, showMenu = true }: TopAppBarProps) {
  // We enforce the requested title "GOFARMER"
  const displayTitle = "GOFARMER";

  // Animation values
  // animX moves the text from left to center
  const animX = useRef(new Animated.Value(hasPlayedTractorAnimation ? 0 : -SCREEN_WIDTH)).current;
  // tractorExitX moves the tractor away after reaching center
  const tractorExitX = useRef(new Animated.Value(0)).current;
  // tractorOpacity fades out the tractor
  const tractorOpacity = useRef(new Animated.Value(hasPlayedTractorAnimation ? 0 : 1)).current;

  useEffect(() => {
    if (!hasPlayedTractorAnimation) {
      Animated.sequence([
        // 1. Pull the text to center
        Animated.spring(animX, {
          toValue: 0,
          friction: 8,
          tension: 35,
          useNativeDriver: true,
        }),
        // 2. Delay slightly
        Animated.delay(200),
        // 3. Tractor "disconnects" and drives away to the right
        Animated.parallel([
          Animated.timing(tractorExitX, {
            toValue: SCREEN_WIDTH,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(tractorOpacity, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        hasPlayedTractorAnimation = true;
      });
    }
  }, [animX, tractorExitX, tractorOpacity]);

  return (
    <View style={styles.bar}>
      <View style={styles.centerWrapper}>
        {/* The text itself */}
        <Animated.Text style={[styles.title, { transform: [{ translateX: animX }] }]}>
          {displayTitle}
        </Animated.Text>

        {/* The tractor overlay - only rendered if not played yet or during animation */}
        <Animated.View style={[
          styles.tractorOverlay, 
          { 
            opacity: tractorOpacity,
            transform: [
              { translateX: animX },
              { translateX: tractorExitX }
            ] 
          }
        ]}>
          <Text style={styles.tractorEmoji}>🚜</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 64,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  centerWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    position: 'relative',
    width: '100%',
  },
  title: {
    ...Typography.titleLarge,
    color: '#1B5E20',
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  tractorOverlay: {
    position: 'absolute',
    left: '50%',
    marginLeft: 60, // Offset to the right of the centered text
  },
  tractorEmoji: {
    fontSize: 28,
  },
});


