import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, SafeAreaView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors, Typography, Spacing, Radius } from '../theme/theme';

interface IncompatibleScreenProps {
  reason: string;
  specs: {
    ram: string;
    cores: number;
    processor: string;
  };
}

export default function IncompatibleScreen({ reason, specs }: IncompatibleScreenProps) {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Text style={styles.icon}>⚠️</Text>
        </View>

        <Text style={styles.title}>{t('common.incompatible_title', 'Incompatible Device')}</Text>
        <Text style={styles.description}>
          {t('common.incompatible_desc', 'We are sorry, but GOFARMER requires a more powerful device to run the local AI models.')}
        </Text>

        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>{t('common.device_specs', 'Your Device Specs:')}</Text>
          <View style={styles.specRow}>
            <Text style={styles.specLabel}>RAM:</Text>
            <Text style={styles.specValue}>{specs.ram} GB</Text>
          </View>
          <View style={styles.specRow}>
            <Text style={styles.specLabel}>CPU Cores:</Text>
            <Text style={styles.specValue}>{specs.cores}</Text>
          </View>
          <View style={styles.specRow}>
            <Text style={styles.specLabel}>Processor:</Text>
            <Text style={styles.specValue}>{specs.processor}</Text>
          </View>
        </View>

        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{reason}</Text>
        </View>

        <Text style={styles.footerText}>
          {t('common.incompatible_footer', 'Try using a device with at least 4GB of RAM for the best experience.')}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1, padding: Spacing.xl, alignItems: 'center', justifyContent: 'center' },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.errorContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  icon: { fontSize: 50 },
  title: {
    ...Typography.headlineMd,
    color: Colors.onSurface,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  description: {
    ...Typography.bodyLg,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: Spacing.xxl,
  },
  detailsCard: {
    width: '100%',
    padding: Spacing.lg,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    marginBottom: Spacing.xl,
  },
  detailsTitle: {
    ...Typography.titleSm,
    color: Colors.onSurface,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  specLabel: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
  specValue: { ...Typography.bodyMd, color: Colors.onSurface, fontWeight: '600' },
  errorBox: {
    padding: Spacing.md,
    backgroundColor: Colors.errorContainer + '33',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.error,
    marginBottom: Spacing.xl,
    width: '100%',
  },
  errorText: {
    ...Typography.bodySm,
    color: Colors.error,
    textAlign: 'center',
    fontWeight: '600',
  },
  footerText: {
    ...Typography.bodyMd,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
