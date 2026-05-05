import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Typography } from '../theme/theme';

interface TopAppBarProps {
  title?: string;
  rightLabel?: string;
  onRightPress?: () => void;
  showMenu?: boolean;
}

export default function TopAppBar({ title = 'GoFarmer', rightLabel, onRightPress, showMenu = true }: TopAppBarProps) {
  return (
    <View style={styles.bar}>
      {showMenu ? (
        <TouchableOpacity style={styles.iconBtn}>
          <Text style={styles.icon}>☰</Text>
        </TouchableOpacity>
      ) : <View style={styles.iconBtn} />}

      <Text style={styles.title}>{title}</Text>

      {rightLabel ? (
        <TouchableOpacity style={styles.rightBtn} onPress={onRightPress}>
          <Text style={styles.rightLabel}>{rightLabel}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.iconBtn}>
          <Text style={styles.icon}>👤</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  icon: { fontSize: 20, color: Colors.primary },
  title: {
    ...Typography.titleLg,
    color: Colors.primary,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  rightBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rightLabel: {
    ...Typography.labelLg,
    color: Colors.primary,
  },
});
