import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, View } from 'react-native';
import { Colors, Typography, Radius, Spacing } from '../theme/theme';

/**
 * Types of visual toast modes supported by the component.
 */
type ToastType = 'success' | 'error' | 'info';

/**
 * Props for the Toast component.
 */
interface ToastProps {
  /** The message text to be rendered inside the toast alert */
  message: string;
  /** The design style type: success (green), error (red), or info (cyan/default) */
  type?: ToastType;
  /** Flag to mount and animate-in the toast component */
  visible: boolean;
  /** Callback triggered when the toast finishes its fade-out/hide animation */
  onHide: () => void;
}

/**
 * Toast Component
 * 
 * A sleek, animated status banner that slides up from the bottom of the screen
 * and fades in, then automatically auto-dismisses after 3 seconds with a reverse
 * slide-down and fade-out animation.
 */
export function Toast({ message, type = 'info', visible, onHide }: ToastProps) {
  // Translate the toast vertically from off-screen (100px down) to its natural position (0px)
  const translateY = useRef(new Animated.Value(100)).current;
  // Fade opacity from 0 (invisible) to 1 (opaque)
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // 1. Run fade-in and slide-up animations concurrently using the native driver for 60fps
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();

      // 2. Set an auto-dismiss timer for 3000ms
      const timer = setTimeout(() => {
        // 3. Slide back down and fade out when timer expires, then invoke the onHide callback
        Animated.parallel([
          Animated.timing(translateY, { toValue: 100, duration: 200, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(() => onHide());
      }, 3000);

      // Clean up the active timeout on component unmount or visibility toggles to prevent leaks
      return () => clearTimeout(timer);
    }
  }, [visible, translateY, opacity, onHide]);

  if (!visible) return null;

  const bgColor =
    type === 'success' ? Colors.primary :
    type === 'error' ? Colors.error :
    Colors.tertiary;

  const prefix = type === 'success' ? '✓ ' : type === 'error' ? '✕ ' : 'ℹ ';

  return (
    <Animated.View style={[styles.toast, { backgroundColor: bgColor, transform: [{ translateY }], opacity }]}>
      <Text style={styles.text}>{prefix}{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 96,
    left: Spacing.md,
    right: Spacing.md,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  text: {
    ...Typography.bodyMd,
    color: '#ffffff',
  },
});
