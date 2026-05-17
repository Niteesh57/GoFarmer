import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, 
  ScrollView, ActivityIndicator, Platform, Alert, Dimensions, BackHandler
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import NetInfo from '@react-native-community/netinfo';
// @ts-ignore
import { ModelService } from '../services/ModelService';
import { Colors, Typography, Spacing, Radius } from '../theme/theme';
import { CROP_CATEGORIES } from '../utils/cropData';

const { width } = Dimensions.get('window');

interface OnboardingScreenProps {
  onComplete: () => void;
}

type Step = 'download' | 'setup' | 'finish';

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('download');
  
  // Download state
  const [modelProgress, setModelProgress] = useState(0);
  const [ragProgress, setRagProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(true);
  
  // Setup state
  const [hasPlanted, setHasPlanted] = useState<boolean | null>(null);
  const [selectedCrop, setSelectedCrop] = useState<string | null>(null);
  
  // Animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected);
    });

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();

    // Check if model already exists
    const checkExisting = async () => {
      const modelExists = await ModelService.modelExists('gemma-4-e2b-it');
      const ragExists = await ModelService.ragExists();
      if (modelExists) setModelProgress(100);
      if (ragExists) setRagProgress(100);
      if (modelExists && ragExists) {
        setDownloadComplete(true);
        // If everything is already here, we still want the user to see the "Download Complete" status
        // but we could also auto-advance after a small delay if we wanted to.
      }
    };
    checkExisting();

    return () => unsubscribe();
  }, [step]);

  const startDownload = async () => {
    setIsDownloading(true);
    setModelProgress(0);
    setRagProgress(0);
    
    try {
      // 1. Download Model using shared service
      await ModelService.downloadModel('gemma-4-e2b-it', (p) => {
        setModelProgress(p);
      });
      setModelProgress(100);
      
      // 2. Download RAG using shared service
      await ModelService.downloadRag((p) => {
        setRagProgress(p);
      });
      setRagProgress(100);
      
      setDownloadComplete(true);
      setTimeout(() => setStep('setup'), 1000);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
      setIsDownloading(false);
    }
  };

  const handleFinish = async () => {
    if (selectedCrop) {
      await AsyncStorage.setItem('@active_crop', selectedCrop);
    }
    await AsyncStorage.setItem('@GOFARMER_onboarding_done', 'true');
    setStep('finish');
  };

  const renderDownload = () => (
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <Text style={styles.icon}>📥</Text>
      <Text style={styles.title}>{t('onboarding.download_title')}</Text>
      <Text style={styles.description}>{t('onboarding.download_desc')}</Text>
      
      {!isConnected && (
        <View style={styles.alertCard}>
          <Text style={styles.alertText}>🌐 {t('weather.offline_desc', 'Check your internet connection to continue.')}</Text>
        </View>
      )}
      
      <View style={styles.progressContainer}>
        <View style={styles.progressRow}>
          <Text style={styles.progressLabel}>{t('settings.ai_models')}</Text>
          <Text style={styles.progressPct}>{modelProgress}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${modelProgress}%` }]} />
        </View>

        <View style={styles.progressRow}>
          <Text style={styles.progressLabel}>{t('settings.knowledge_base')}</Text>
          <Text style={styles.progressPct}>{ragProgress}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${ragProgress}%`, backgroundColor: Colors.tertiary }]} />
        </View>
      </View>

      {!isDownloading ? (
        downloadComplete ? (
          <TouchableOpacity 
            style={styles.primaryBtn} 
            onPress={() => setStep('setup')}
          >
            <Text style={styles.primaryBtnText}>{t('common.continue', 'Continue')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={[styles.primaryBtn, !isConnected && styles.primaryBtnDisabled]} 
            onPress={startDownload}
            disabled={!isConnected}
          >
            <Text style={styles.primaryBtnText}>{t('onboarding.start_download')}</Text>
          </TouchableOpacity>
        )
      ) : !downloadComplete ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.loadingText}>{t('onboarding.downloading')}</Text>
        </View>
      ) : (
        <View style={styles.loadingRow}>
          <Text style={[styles.loadingText, { color: Colors.primary, fontWeight: '700' }]}>✅ {t('onboarding.complete')}</Text>
        </View>
      )}
      
    </Animated.View>
  );

  const renderSetup = () => (
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <Text style={styles.icon}>🚜</Text>
      <Text style={styles.title}>{t('onboarding.setup_title')}</Text>
      <Text style={styles.description}>{t('onboarding.setup_desc')}</Text>

      <View style={styles.questionCard}>
        <Text style={styles.questionText}>{t('onboarding.already_planted')}</Text>
        <View style={styles.choiceRow}>
          <TouchableOpacity 
            style={[styles.choiceBtn, hasPlanted === true && styles.choiceBtnActive]}
            onPress={() => setHasPlanted(true)}
          >
            <Text style={[styles.choiceBtnText, hasPlanted === true && styles.choiceBtnTextActive]}>{t('common.yes')}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.choiceBtn, hasPlanted === false && styles.choiceBtnActive]}
            onPress={() => { setHasPlanted(false); setSelectedCrop(null); }}
          >
            <Text style={[styles.choiceBtnText, hasPlanted === false && styles.choiceBtnTextActive]}>{t('common.no')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {hasPlanted && (
        <View style={styles.cropSelector}>
          <Text style={styles.subLabel}>{t('onboarding.select_crop')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cropChips}>
            {Object.values(CROP_CATEGORIES).flat().slice(0, 15).map(crop => (
              <TouchableOpacity 
                key={crop} 
                style={[styles.cropChip, selectedCrop === crop && styles.cropChipActive]}
                onPress={() => setSelectedCrop(crop)}
              >
                <Text style={[styles.cropChipText, selectedCrop === crop && styles.cropChipTextActive]}>{crop}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <TouchableOpacity 
        style={[styles.primaryBtn, hasPlanted === null && styles.primaryBtnDisabled]} 
        onPress={handleFinish}
        disabled={hasPlanted === null}
      >
        <Text style={styles.primaryBtnText}>{t('common.continue')}</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  const renderFinish = () => (
    <Animated.View style={[styles.stepContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <Text style={styles.icon}>🎉</Text>
      <Text style={styles.title}>{t('onboarding.finish_title')}</Text>
      <Text style={styles.description}>{t('onboarding.finish_desc')}</Text>
      
      <View style={styles.alertCard}>
        <Text style={styles.alertText}>⚠️ {t('onboarding.restart_msg')}</Text>
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={async () => {
        await AsyncStorage.setItem('@GOFARMER_onboarding_done', 'true');
        onComplete();
        setTimeout(() => BackHandler.exitApp(), 100);
      }}>
        <Text style={styles.primaryBtnText}>{t('onboarding.restart_btn', 'Restart App')}</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.stepIndicator}>
          <View style={[styles.stepDot, step === 'download' && styles.stepDotActive]} />
          <View style={[styles.stepDot, step === 'setup' && styles.stepDotActive]} />
          <View style={[styles.stepDot, step === 'finish' && styles.stepDotActive]} />
        </View>
        
        {step !== 'finish' && (
          <TouchableOpacity style={styles.headerSkipBtn} onPress={() => setStep(step === 'download' ? 'setup' : 'finish')}>
            <Text style={styles.headerSkipText}>{t('common.skip')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.content}>
          {step === 'download' && renderDownload()}
          {step === 'setup' && renderSetup()}
          {step === 'finish' && renderFinish()}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { 
    paddingTop: Platform.OS === 'ios' ? 60 : 40, 
    paddingHorizontal: Spacing.xl,
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center',
    position: 'relative',
    height: 100,
  },
  headerSkipBtn: {
    position: 'absolute',
    right: Spacing.xl,
    top: Platform.OS === 'ios' ? 55 : 35,
    padding: 8,
  },
  headerSkipText: {
    ...Typography.labelLg,
    color: Colors.primary,
    fontWeight: '700',
  },
  stepIndicator: { flexDirection: 'row', gap: 8 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.outlineVariant },
  stepDotActive: { width: 24, backgroundColor: Colors.primary },
  
  scrollContent: { flexGrow: 1 },
  content: { padding: Spacing.xl, paddingBottom: 40 },
  stepContainer: { alignItems: 'center', gap: Spacing.lg, width: '100%' },
  icon: { fontSize: 80, marginBottom: Spacing.md },
  title: { ...Typography.headlineMd, color: Colors.onSurface, textAlign: 'center', fontWeight: '700' },
  description: { ...Typography.bodyLg, color: Colors.onSurfaceVariant, textAlign: 'center', paddingHorizontal: 10 },
  
  progressContainer: { width: '100%', gap: Spacing.md, marginVertical: Spacing.lg },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  progressLabel: { ...Typography.labelLg, color: Colors.onSurface },
  progressPct: { ...Typography.labelLg, color: Colors.primary, fontWeight: '700' },
  progressTrack: { height: 10, backgroundColor: Colors.surfaceContainerHighest, borderRadius: Radius.full, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: Radius.full },
  
  primaryBtn: { width: '100%', height: 56, backgroundColor: Colors.primary, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', elevation: 4, marginTop: Spacing.md },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { ...Typography.titleMd, color: Colors.onPrimary, fontWeight: '700' },
  
  skipBtn: { padding: 12, marginTop: Spacing.sm },
  skipBtnText: { ...Typography.labelLg, color: Colors.onSurfaceVariant },
  
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: Spacing.md },
  loadingText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },

  questionCard: { width: '100%', padding: Spacing.lg, backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, gap: Spacing.md, marginTop: Spacing.md },
  questionText: { ...Typography.titleMd, color: Colors.onSurface, fontWeight: '600' },
  choiceRow: { flexDirection: 'row', gap: Spacing.md },
  choiceBtn: { flex: 1, height: 48, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.outline, alignItems: 'center', justifyContent: 'center' },
  choiceBtnActive: { backgroundColor: Colors.primaryContainer, borderColor: Colors.primary },
  choiceBtnText: { ...Typography.titleSm, color: Colors.onSurface },
  choiceBtnTextActive: { color: Colors.onPrimaryContainer, fontWeight: '700' },

  cropSelector: { width: '100%', gap: Spacing.sm, marginTop: Spacing.md },
  subLabel: { ...Typography.labelMd, color: Colors.onSurfaceVariant },
  cropChips: { gap: Spacing.sm },
  cropChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.surfaceContainerHigh },
  cropChipActive: { backgroundColor: Colors.primary },
  cropChipText: { ...Typography.labelLg, color: Colors.onSurface },
  cropChipTextActive: { color: Colors.onPrimary, fontWeight: '700' },

  alertCard: { width: '100%', padding: Spacing.lg, backgroundColor: Colors.errorContainer + '22', borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.error + '44', marginVertical: Spacing.md },
  alertText: { ...Typography.bodyMd, color: Colors.error, textAlign: 'center', lineHeight: 22 },
  finishBtn: { backgroundColor: Colors.primary },
});
