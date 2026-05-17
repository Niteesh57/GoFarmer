import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { Colors, Typography } from '../theme/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Global flag to track if animation has played in this session
/**
 * Global flag tracking whether the introductory tractor animation has played
 * during the current app session. This avoids annoying repeating of the
 * animation when navigating back/forth between different screens.
 */
let hasPlayedTractorAnimation = false;

/**
 * Props for the TopAppBar component.
 */
interface TopAppBarProps {
  /** The fallback title (overridden to ensure consistency of 'GOFARMER') */
  title?: string;
  /** Optional label for the right button action */
  rightLabel?: string;
  /** Optional icon string for the left button action */
  leftIcon?: string;
  /** Optional icon string for the right button action */
  rightIcon?: string;
  /** Callback fired when the left action label is pressed */
  onLeftPress?: () => void;
  /** Callback fired when the right action label is pressed */
  onRightPress?: () => void;
  /** Flag to determine whether to render navigation / menu icons */
  showMenu?: boolean;
}

/**
 * TopAppBar Component
 * 
 * Renders the top navigation header containing the 'GOFARMER' brand title.
 * Features a playful intro animation: a tractor (🚜) appears to "pull" the brand
 * title into center-focus from offscreen left, pauses briefly, and then
 * disconnects to drive offscreen right while fading out.
 */
export default function TopAppBar({ title = 'GOFARMER', rightLabel, onRightPress, showMenu = true }: TopAppBarProps) {
  // Enforce consistent corporate branding across all screens
  const displayTitle = "GOFARMER";

  // Animation vector configuration:
  // 1. animX: Tracks horizontal offset of the title. Starts off-screen left (-SCREEN_WIDTH) unless already animated.
  const animX = useRef(new Animated.Value(hasPlayedTractorAnimation ? 0 : -SCREEN_WIDTH)).current;
  // 2. tractorExitX: Offset parameter to drive the tractor away once the title is centered.
  const tractorExitX = useRef(new Animated.Value(0)).current;
  // 3. tractorOpacity: Handles fading out the tractor after it finishes towing.
  const tractorOpacity = useRef(new Animated.Value(hasPlayedTractorAnimation ? 0 : 1)).current;

  useEffect(() => {
    // Only perform the intro sequence once per app runtime session
    if (!hasPlayedTractorAnimation) {
      Animated.sequence([
        // Phase 1: Pull the title text into the center using spring-loaded physics
        Animated.spring(animX, {
          toValue: 0,
          friction: 8,
          tension: 35,
          useNativeDriver: true,
        }),
        // Phase 2: Dwell at the center briefly to align the user's attention
        Animated.delay(200),
        // Phase 3: Tractor unlinks from the title, accelerating offscreen right while fading
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
        // Mark the session-level flag so subsequent mounts load the title instantly without animating
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
    ...Typography.titleLg,
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


