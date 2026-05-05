import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, StatusBar,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors, Typography, Spacing, Radius } from '../theme/theme';

interface Language {
  flag: string;
  label: string;
  code: string;
}

const LANGUAGES: Language[] = [
  { flag: '🇮🇳', label: 'हिंदी',    code: 'hi' },
  { flag: '🇬🇧', label: 'English',   code: 'en' },
  { flag: '🇫🇷', label: 'Français',  code: 'fr' },
  { flag: '🇪🇸', label: 'Español',   code: 'es' },
];

interface LanguageScreenProps {
  onContinue: (langCode: string) => void;
}

export default function LanguageScreen({ onContinue }: LanguageScreenProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState('en');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      {/* Ambient decorations */}
      <View style={styles.blobTop} />
      <View style={styles.blobBottom} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoIcon}>🌱</Text>
          </View>
          <Text style={styles.headline}>{t('common.welcome')}</Text>
          <Text style={styles.subtext}>{t('common.choose_language')}</Text>
        </View>

        {/* Language grid */}
        <View style={styles.grid}>
          {LANGUAGES.map(lang => {
            const isSelected = lang.code === selected;
            return (
              <TouchableOpacity
                key={lang.code}
                style={[styles.langCard, isSelected && styles.langCardSelected]}
                onPress={() => setSelected(lang.code)}
                activeOpacity={0.85}
              >
                {isSelected && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
                <Text style={styles.langFlag}>{lang.flag}</Text>
                <Text style={[styles.langLabel, isSelected && styles.langLabelSelected]}>
                  {lang.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Continue button fixed at bottom */}
      <View style={styles.bottomArea}>
        <TouchableOpacity
          style={styles.continueBtn}
          onPress={() => onContinue(selected)}
          activeOpacity={0.9}
        >
          <Text style={styles.continueBtnText}>{t('common.continue')}</Text>
          <Text style={styles.continueArrow}>→</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  blobTop: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: Colors.primaryContainer,
    opacity: 0.15,
  },
  blobBottom: {
    position: 'absolute',
    bottom: -80,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: Colors.tertiaryContainer,
    opacity: 0.08,
  },
  scroll: {
    paddingBottom: 120,
    paddingHorizontal: Spacing.margin,
  },
  header: {
    alignItems: 'center',
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.lg,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  logoIcon: { fontSize: 36 },
  headline: {
    ...Typography.headlineLg,
    color: Colors.onSurface,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  subtext: {
    ...Typography.bodyLg,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  langCard: {
    width: '47%',
    backgroundColor: Colors.surfaceContainer,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  langCardSelected: {
    backgroundColor: Colors.primaryContainer + '33',
    borderColor: Colors.primary,
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 10,
    fontSize: 18,
    color: Colors.primary,
    fontWeight: '700',
  },
  langFlag: { fontSize: 40 },
  langLabel: {
    ...Typography.titleMd,
    color: Colors.onSurface,
  },
  langLabelSelected: {
    color: Colors.onPrimaryContainer,
    fontWeight: '700',
  },
  bottomArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.margin,
    paddingBottom: Spacing.lg,
    backgroundColor: 'transparent',
  },
  continueBtn: {
    height: 56,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  continueBtnText: {
    ...Typography.labelLg,
    color: Colors.onPrimary,
    fontWeight: '700',
    letterSpacing: 0.5,
    fontSize: 16,
  },
  continueArrow: { fontSize: 20, color: Colors.onPrimary },
});
