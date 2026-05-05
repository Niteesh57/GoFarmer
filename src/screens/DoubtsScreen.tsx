import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Animated, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import Tts from 'react-native-tts';
import TopAppBar from '../components/TopAppBar';
import { Toast } from '../components/Toast';
import { Colors, Typography, Spacing, Radius } from '../theme/theme';
import { getLangCode } from '../utils/langHelper';

interface QAItem {
  id: string;
  question: string;
  answer: string;
  timestamp: string;
  audioAvailable: boolean;
}

interface DoubtsScreenProps {
  llmComplete: (prompt: string, onToken?: (tok: string) => void) => Promise<string>;
  isLlmReady: boolean;
}

const AGRI_SYSTEM_PROMPT =
  'You are an expert agricultural advisor AI assistant for Indian farmers. ' +
  'Provide clear, practical, and actionable farming advice in simple language. ' +
  'Focus on crops, weather, irrigation, pest management, fertilizers, and harvest timing. ' +
  'Keep answers concise but complete. Use bullet points when listing steps.';

const EXAMPLE_QA: QAItem[] = [
  {
    id: '1',
    question: 'Best fertilizer for corn?',
    answer: 'Based on soil analysis, nitrogen-rich fertilizer is recommended in the growing season. Apply urea (46-0-0) at 120 kg/ha during planting. Top-dress with 60 kg/ha after 30 days. Ensure soil pH is 6.0–7.0 for best uptake.',
    timestamp: '2h ago',
    audioAvailable: true,
  },
  {
    id: '2',
    question: 'When to plant tomato?',
    answer: 'In summer months, typically March to June in your region. Seedlings should be transplanted when they are 4–6 weeks old. Ensure last frost has passed and soil temperature is above 16°C.',
    timestamp: 'Yesterday',
    audioAvailable: true,
  },
  {
    id: '3',
    question: 'How to prevent pest damage?',
    answer: 'Integrated Pest Management (IPM):\n1. Regular field inspection 2× per week\n2. Use neem oil spray as organic deterrent\n3. Install pheromone traps\n4. Introduce beneficial insects (ladybugs)\n5. Rotate crops annually to break pest cycles',
    timestamp: '3 days ago',
    audioAvailable: true,
  },
];

export default function DoubtsScreen({ llmComplete, isLlmReady }: DoubtsScreenProps) {
  const { t, i18n } = useTranslation();
  const [qaHistory, setQaHistory] = useState<QAItem[]>(EXAMPLE_QA);
  const [inputText, setInputText] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [streamingAnswer, setStreamingAnswer] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as 'success' | 'error' | 'info' });

  // Waveform animation
  const waveRefs = useRef(Array.from({ length: 10 }, () => new Animated.Value(0.2))).current;
  const waveAnim = useRef<Animated.CompositeAnimation | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ visible: true, message, type });
  };

  // TTS init
  useEffect(() => {
    const lang = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';
    Tts.setDefaultLanguage(lang).catch(() => {});
    Tts.setDefaultRate(0.5);
    Tts.setDefaultPitch(1.0);

    const startListener = Tts.addEventListener('tts-start', () => setIsSpeaking(true));
    const finishListener = Tts.addEventListener('tts-finish', () => { setIsSpeaking(false); setSpeakingId(null); });
    const cancelListener = Tts.addEventListener('tts-cancel', () => { setIsSpeaking(false); setSpeakingId(null); });

    return () => {
      startListener.remove();
      finishListener.remove();
      cancelListener.remove();
      Tts.stop();
    };
  }, []);

  const startWaveAnim = useCallback(() => {
    const anims = waveRefs.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 80),
          Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.2, duration: 300, useNativeDriver: true }),
        ])
      )
    );
    waveAnim.current = Animated.parallel(anims);
    waveAnim.current.start();
  }, [waveRefs]);

  const stopWaveAnim = useCallback(() => {
    waveAnim.current?.stop();
    waveRefs.forEach(v => v.setValue(0.2));
  }, [waveRefs]);

  const handleAsk = useCallback(async () => {
    const question = inputText.trim();
    if (!question || isAsking) return;
    if (!isLlmReady) {
      showToast(t('doubts.loading_answers'), 'info');
      return;
    }

    setInputText('');
    setCurrentQuestion(question);
    setStreamingAnswer('');
    setIsAsking(true);
    startWaveAnim();

    Tts.stop(); // Stop any existing TTS

    try {
      const contentLangStr = await AsyncStorage.getItem('@content_lang') || 'English';
      const ttsCode = getLangCode(contentLangStr);
      await Tts.setDefaultLanguage(ttsCode);

      const dynamicPrompt = `${AGRI_SYSTEM_PROMPT}
CRITICAL RULES:
1. Provide a highly accurate, narrow, short, and direct answer to the user's question. Do not use filler words.
2. You MUST answer ENTIRELY in the following language: ${contentLangStr}.

User question: ${question}

Provide a helpful farming answer:`;

      let ttsBuffer = '';
      let isFirstChunk = true;

      const answer = await llmComplete(dynamicPrompt, (tok) => {
        setStreamingAnswer(prev => prev + tok);

        ttsBuffer += tok;
        if (/[.,!?\n]/.test(tok) || ttsBuffer.length > 60) {
          const chunkToSpeak = ttsBuffer.trim();
          if (chunkToSpeak.length > 1) {
            if (isFirstChunk) {
              Tts.speak(chunkToSpeak);
              isFirstChunk = false;
            } else {
              Tts.speak(chunkToSpeak);
            }
          }
          ttsBuffer = ''; // reset buffer
        }
      });
      
      // Flush any remaining text in the buffer
      if (ttsBuffer.trim().length > 1) {
        Tts.speak(ttsBuffer.trim());
      }
      
      const finalAnswer = answer.trim() || t('doubts.no_answer');
      
      const newItem: QAItem = {
        id: Date.now().toString(),
        question,
        answer: finalAnswer,
        timestamp: 'Just now',
        audioAvailable: true,
      };
      setQaHistory(prev => [newItem, ...prev]);
      setStreamingAnswer('');
      setCurrentQuestion('');
      showToast(t('doubts.answer_ready'), 'success');

      setSpeakingId(newItem.id);
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? 'Failed to get answer');
    } finally {
      setIsAsking(false);
      stopWaveAnim();
    }
  }, [inputText, isAsking, isLlmReady, llmComplete, startWaveAnim, stopWaveAnim]);

  const handleSpeak = useCallback((item: QAItem) => {
    if (isSpeaking && speakingId === item.id) {
      Tts.stop();
    } else {
      Tts.stop();
      setSpeakingId(item.id);
      Tts.speak(item.answer);
    }
  }, [isSpeaking, speakingId]);

  return (
    <View style={styles.flex}>
      <TopAppBar title="GoFarmer" rightLabel={t('common.history')} />

      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Voice Input Area */}
        <View style={styles.voiceArea}>
          <Text style={styles.voiceTitle}>{isAsking ? `🎙 ${t('common.processing')}` : `🎙 ${t('doubts.voice_input')}`}</Text>

          {/* Waveform */}
          <View style={styles.waveform}>
            {waveRefs.map((v, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.waveBar,
                  {
                    transform: [{ scaleY: v }],
                    backgroundColor: isAsking ? Colors.primary : Colors.outlineVariant,
                  },
                ]}
              />
            ))}
          </View>

          <Text style={styles.voiceSubtext}>
            {isAsking ? t('doubts.generating') : t('doubts.voice_desc')}
          </Text>

          {isAsking && <ActivityIndicator color={Colors.primary} style={{ marginTop: 8 }} />}
        </View>

        {/* Ask FAB */}
        <View style={styles.fabArea}>
          <TouchableOpacity
            style={[styles.askFab, (!isLlmReady || isAsking) && styles.askFabDisabled]}
            onPress={handleAsk}
            disabled={!isLlmReady || isAsking || !inputText.trim()}
            activeOpacity={0.85}
          >
            <Text style={styles.askFabIcon}>{isAsking ? '⏳' : '🎤'}</Text>
            <Text style={styles.askFabText}>{isAsking ? t('common.thinking') : t('doubts.ask_now')}</Text>
          </TouchableOpacity>
        </View>

        {/* Text Input */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>{t('doubts.or_type')}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              placeholder={t('doubts.placeholder')}
              placeholderTextColor={Colors.onSurfaceVariant + '99'}
              value={inputText}
              onChangeText={setInputText}
              multiline
              editable={!isAsking}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!inputText.trim() || isAsking) && styles.sendBtnDisabled]}
              onPress={handleAsk}
              disabled={!inputText.trim() || isAsking}
            >
              <Text style={styles.sendBtnIcon}>{isAsking ? '⏳' : '→'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Live Generation */}
        {isAsking && (streamingAnswer.length > 0) && (
          <View style={[styles.qaCard, { borderColor: Colors.primary, borderWidth: 1.5 }]}>
            <View style={[styles.questionBubble, { backgroundColor: Colors.primary + '11' }]}>
              <Text style={styles.questionLabel}>Q</Text>
              <Text style={styles.questionText}>{currentQuestion}</Text>
            </View>
            <View style={styles.answerBubble}>
              <Text style={styles.answerText}>
                {streamingAnswer}
                <Text style={{ color: Colors.primary, fontWeight: 'bold' }}> ▊</Text>
              </Text>
            </View>
          </View>
        )}

        {/* Q&A History */}
        <View>
          <Text style={styles.sectionTitle}>{t('doubts.qa_history')}</Text>
          {!isLlmReady && (
            <View style={styles.loadingBanner}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.loadingBannerText}>{t('doubts.loading_answers')}</Text>
            </View>
          )}
          {qaHistory.map(item => (
            <View key={item.id} style={styles.qaCard}>
              <View style={styles.questionBubble}>
                <Text style={styles.questionLabel}>Q</Text>
                <Text style={styles.questionText}>{item.question}</Text>
              </View>
              <View style={styles.answerBubble}>
                <Text style={styles.answerText}>{item.answer}</Text>
              </View>
              <View style={styles.qaFooter}>
                <Text style={styles.qaTime}>{item.timestamp}</Text>
                <TouchableOpacity
                  style={[styles.speakBtn, speakingId === item.id && styles.speakBtnActive]}
                  onPress={() => handleSpeak(item)}
                >
                  <Text style={styles.speakBtnText}>
                    {speakingId === item.id && isSpeaking ? `⏹ ${t('common.stop')}` : `🔊 ${t('common.play')}`}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast(t => ({ ...t, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.margin, paddingBottom: 100, gap: Spacing.lg },

  voiceArea: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  voiceTitle: { ...Typography.titleMd, color: Colors.onSurface },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    gap: 5,
    paddingVertical: 8,
  },
  waveBar: {
    width: 5,
    height: 40,
    borderRadius: 3,
    transformOrigin: 'center',
  } as any,
  voiceSubtext: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center' },

  fabArea: { alignItems: 'center' },
  askFab: {
    height: 56,
    paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  askFabDisabled: { opacity: 0.5 },
  askFabIcon: { fontSize: 20 },
  askFabText: { ...Typography.labelLg, color: Colors.onPrimary, fontWeight: '700', letterSpacing: 1, fontSize: 15 },

  inputSection: { gap: Spacing.sm },
  inputLabel: { ...Typography.labelSm, color: Colors.onSurfaceVariant, letterSpacing: 1.5 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.outlineVariant,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  textInput: {
    flex: 1, ...Typography.bodyLg, color: Colors.onSurface,
    minHeight: 44, maxHeight: 100,
    paddingHorizontal: Spacing.sm,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.38 },
  sendBtnIcon: { fontSize: 20, color: '#ffffff', fontWeight: '700' },

  sectionTitle: { ...Typography.titleMd, color: Colors.onSurface, marginBottom: 4 },
  loadingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surfaceContainer,
    borderRadius: Radius.DEFAULT,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  loadingBannerText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, flex: 1 },

  qaCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  questionBubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.primaryContainer + '22',
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  questionLabel: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.primary,
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '700',
    fontSize: 12,
  },
  questionText: { ...Typography.bodyMd, color: Colors.onSurface, flex: 1, fontWeight: '600' },
  answerBubble: { padding: Spacing.md },
  answerText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, lineHeight: 22 },
  qaFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
  },
  qaTime: { ...Typography.labelSm, color: Colors.onSurfaceVariant },
  speakBtn: {
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.outlineVariant,
  },
  speakBtnActive: { backgroundColor: Colors.primary + '22', borderColor: Colors.primary },
  speakBtnText: { ...Typography.labelMd, color: Colors.primary },
});
