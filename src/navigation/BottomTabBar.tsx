import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet, Animated } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors, Typography, Spacing, Radius } from '../theme/theme';

export type TabName = 'weather' | 'aieye' | 'doubts' | 'radio' | 'settings';

interface Tab {
  key: TabName;
  label: string;
  icon: string;
  activeIcon: string;
}

const TABS: Tab[] = [
  { key: 'weather',  label: 'Weather',   icon: '🌤',  activeIcon: '⛅' },
  { key: 'aieye',   label: 'AI Eye',    icon: '👁',  activeIcon: '👁' },
  { key: 'doubts',  label: 'Doubts',    icon: '🤔',  activeIcon: '💬' },
  { key: 'radio',   label: 'LLM Radio', icon: '📻',  activeIcon: '🎙' },
  { key: 'settings',label: 'Settings',  icon: '⚙️',  activeIcon: '⚙️' },
];

interface BottomTabBarProps {
  active: TabName;
  onChange: (tab: TabName) => void;
}

export default function BottomTabBar({ active, onChange }: BottomTabBarProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.bar}>
      {TABS.map(tab => {
        const isActive = tab.key === active;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabItem, isActive && styles.tabItemActive]}
            onPress={() => onChange(tab.key)}
            activeOpacity={0.75}
          >
            <Text style={styles.tabIcon}>{isActive ? tab.activeIcon : tab.icon}</Text>
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {t(`tabs.${tab.key}`)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: 80,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: Radius.md,
    gap: 2,
  },
  tabItemActive: {
    backgroundColor: '#e8f5e9',
  },
  tabIcon: {
    fontSize: 22,
    lineHeight: 26,
  },
  tabLabel: {
    ...Typography.labelSm,
    color: '#78909c',
  },
  tabLabelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
});
