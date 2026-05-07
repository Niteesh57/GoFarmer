import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Animated, Alert, PermissionsAndroid, Platform, Modal, FlatList,
} from 'react-native';
import AudioRecord from 'react-native-audio-record';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import Tts from 'react-native-tts';
import Markdown from 'react-native-markdown-display';
import TopAppBar from '../components/TopAppBar';
import { Toast } from '../components/Toast';
import { Colors, Typography, Spacing, Radius } from '../theme/theme';
import { getLangCode } from '../utils/langHelper';
import { SessionService, ChatSession } from '../services/SessionService';
import { CactusLMMessage } from 'cactus-react-native';
import { OrbAnimation } from '../components/OrbAnimation';

interface DoubtsScreenProps {
  llmComplete: (prompt: string, onToken?: (tok: string) => void, audioData?: number[]) => Promise<string>;
  isLlmReady: boolean;
}

const AGRI_SYSTEM_PROMPT =
  'You are an expert agricultural advisor AI assistant for Indian farmers. ' +
  'Provide clear, practical, and actionable farming advice in simple language. ' +
  'Focus on crops, weather, irrigation, pest management, fertilizers, and harvest timing. ' +
  'Keep answers concise but complete.\n' +
  'STRICT RULE: Do NOT use any Markdown formatting like asterisks (*), hashes (#), or bolding. ' +
  'Use ONLY plain text (alphabets and numbers). Avoid all non-alphanumeric characters that interfere with voice reading.';

const base64ToPcm = (b64: string): number[] => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  let bufferLength = b64.length * 0.75;
  if (b64[b64.length - 1] === '=') bufferLength--;
  if (b64[b64.length - 2] === '=') bufferLength--;
  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < b64.length; i += 4) {
    const enc1 = lookup[b64.charCodeAt(i)];
    const enc2 = lookup[b64.charCodeAt(i + 1)];
    const enc3 = lookup[b64.charCodeAt(i + 2)];
    const enc4 = lookup[b64.charCodeAt(i + 3)];
    bytes[p++] = (enc1 << 2) | (enc2 >> 4);
    if (enc3 !== undefined && b64[i + 2] !== '=') bytes[p++] = ((enc2 & 15) << 4) | (enc3 >> 2);
    if (enc4 !== undefined && b64[i + 3] !== '=') bytes[p++] = ((enc3 & 3) << 6) | enc4;
  }
  return Array.from(bytes);
};

export default function DoubtsScreen({ llmComplete, isLlmReady }: DoubtsScreenProps) {
  const { t, i18n } = useTranslation();

  // -- State --
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [streamingAnswer, setStreamingAnswer] = useState('');
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as 'success' | 'error' | 'info' });
  const [viewMode, setViewMode] = useState<'voice' | 'chat'>('voice');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isVoiceSelectorOpen, setIsVoiceSelectorOpen] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<any[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);

  const audioChunksRef = useRef<string[]>([]);

  // -- Initialization --
  useEffect(() => {
    loadInitialData();
    const startListener = Tts.addEventListener('tts-start', () => setIsSpeaking(true));
    const finishListener = Tts.addEventListener('tts-finish', () => setIsSpeaking(false));
    const cancelListener = Tts.addEventListener('tts-cancel', () => setIsSpeaking(false));

    return () => {
      startListener.remove();
      finishListener.remove();
      cancelListener.remove();
      Tts.stop();
      AudioRecord.stop().catch(() => { });
    };
  }, []);

  const loadInitialData = async () => {
    const loadedSessions = await SessionService.getAllSessions();
    setSessions(loadedSessions);

    const savedVoice = await AsyncStorage.getItem('@gofarmer_selected_voice');
    if (savedVoice) {
      setSelectedVoice(savedVoice);
      Tts.setDefaultVoice(savedVoice);
    }

    try {
      const voices = await Tts.voices();
      setAvailableVoices(voices);
    } catch (e) {
      console.log('TTS voices error:', e);
    }

    const options = { sampleRate: 16000, channels: 1, bitsPerSample: 16, audioSource: 1 };
    AudioRecord.init(options);
  };

  // -- Voice Transcription --
  const toggleRecording = async () => {
    if (isRecording) {
      setIsRecording(false);
      try {
        await AudioRecord.stop();
        const fullBase64 = audioChunksRef.current.join('');
        const pcmAudio = base64ToPcm(fullBase64);
        audioChunksRef.current = [];
        handleNewMessage(undefined, pcmAudio);
      } catch (e) {
        console.warn('AudioRecord stop error:', e);
      }
    } else {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
      }
      audioChunksRef.current = [];
      try {
        AudioRecord.init({ sampleRate: 16000, channels: 1, bitsPerSample: 16, audioSource: 1 });
        await new Promise(r => setTimeout(r, 100));
        await AudioRecord.start();
        setIsRecording(true);
        AudioRecord.on('data', data => audioChunksRef.current.push(data));
      } catch (e) {
        showToast('Failed to start recording', 'error');
      }
    }
  };

  // -- AI Logic --
  const handleNewMessage = async (text?: string, audioData?: number[]) => {
    if (!text && !audioData) return;
    if (!isLlmReady) {
      showToast(t('doubts.loading_answers'), 'info');
      return;
    }

    setIsAnalyzing(true);
    setStreamingAnswer('');
    Tts.stop();

    const userMsg: CactusLMMessage = { role: 'user', content: text || 'Voice Question' };

    try {
      const savedLang = await AsyncStorage.getItem('@content_lang');
      let contentLangStr = 'English';
      if (savedLang) {
        contentLangStr = savedLang.replace(/[^\w\s]/g, '').trim();
      } else {
        try {
          if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
            contentLangStr = new Intl.DisplayNames(['en'], { type: 'language' }).of(i18n.language) || 'English';
          } else {
            contentLangStr = i18n.language === 'hi' ? 'Hindi' : 'English';
          }
        } catch (e) {
          contentLangStr = i18n.language === 'hi' ? 'Hindi' : 'English';
        }
      }

      const ttsCode = getLangCode(contentLangStr);
      if (selectedVoice) {
        await Tts.setDefaultVoice(selectedVoice);
      } else {
        await Tts.setDefaultLanguage(ttsCode);
      }

      const systemPrompt = `${AGRI_SYSTEM_PROMPT}\n\nSTRICT RULE: You MUST answer ENTIRELY in the following language: ${contentLangStr}.`;

      // Get history from active session if exists
      const history = activeSession ? activeSession.messages : [];
      const updatedMessagesWithUser = [...history, userMsg];

      const fullPrompt = `${systemPrompt}\n\n${updatedMessagesWithUser.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')}\nAssistant:`;

      let ttsBuffer = '';
      const aiResponse = await llmComplete(fullPrompt, (tok) => {
        setIsAnalyzing(false);
        setStreamingAnswer(prev => prev + tok);

        ttsBuffer += tok;
        if (/[.,!?\n]/.test(tok) || ttsBuffer.length > 50) {
          const chunk = ttsBuffer.trim().replace(/[*#_~]/g, '');
          if (chunk.length > 1) Tts.speak(chunk);
          ttsBuffer = '';
        }
      }, audioData);

      if (ttsBuffer.trim().length > 1) Tts.speak(ttsBuffer.trim().replace(/[*#_~]/g, ''));

      const finalAIResponse = aiResponse.trim();

      // ONLY SAVE IF WE GOT A RESPONSE
      if (finalAIResponse.length > 0) {
        const assistantMsg: CactusLMMessage = { role: 'assistant', content: finalAIResponse };

        let session = activeSession;
        if (!session) {
          // New session creation - use short title
          const rawTitle = text || finalAIResponse;
          const sessionTitle = rawTitle.substring(0, 15).trim() || 'Session';

          session = {
            id: Date.now().toString(),
            title: sessionTitle,
            messages: [userMsg, assistantMsg],
            timestamp: Date.now()
          };
        } else {
          session = {
            ...session,
            messages: [...session.messages, userMsg, assistantMsg]
          };
        }

        setActiveSession(session);
        await SessionService.saveSession(session);

        // Refresh session list
        const all = await SessionService.getAllSessions();
        setSessions(all);
      }

    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? 'Failed to get answer');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startNewSession = () => {
    setActiveSession(null);
    setStreamingAnswer('');
    setViewMode('voice');
    Tts.stop();
  };

  const selectSession = (s: ChatSession) => {
    setActiveSession(s);
    setStreamingAnswer('');
    setIsHistoryOpen(false);
    setViewMode('chat');
    Tts.stop();
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ visible: true, message, type });
  };

  // -- Sub-components --
  const renderOrb = () => (
    <View style={styles.animationContainer}>
      <OrbAnimation
        isListening={isRecording}
        isSpeaking={isSpeaking}
        isAnalyzing={isAnalyzing}
      />
      <Text style={styles.statusText}>
        {isRecording ? t('doubts.listening') : isAnalyzing ? t('doubts.analyzing') : isSpeaking ? 'GoFarmer is Speaking...' : t('doubts.voice_desc')}
      </Text>
    </View>
  );

  return (
    <View style={styles.flex}>
      <TopAppBar
        title={t('doubts.title')}
        leftIcon="≡"
        onLeftPress={() => setIsHistoryOpen(true)}
        rightIcon="🗣️"
        onRightPress={() => setIsVoiceSelectorOpen(true)}
      />

      <View style={styles.flex}>
        {viewMode === 'voice' ? (
          <View style={styles.voiceContainer}>
            <View style={styles.animationWrapper}>
              {renderOrb()}
            </View>

            <View style={styles.voiceControls}>
              <TouchableOpacity style={styles.chatToggle} onPress={() => setViewMode('chat')}>
                <Text style={styles.chatToggleIcon}>💬</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.recordBtn, isRecording && styles.recordBtnActive]}
                onPress={toggleRecording}
              >
                <Text style={styles.recordBtnIcon}>{isRecording ? '⏹' : '🎙'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.newBtn} onPress={startNewSession}>
                <Text style={styles.newBtnIcon}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <ScrollView style={styles.flex} contentContainerStyle={styles.chatContent}>
            {activeSession?.messages.map((m, idx) => (
              <View key={idx} style={[styles.messageRow, m.role === 'user' ? styles.userRow : styles.aiRow]}>
                <View style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.aiBubble]}>
                  {m.role === 'assistant' ? (
                    <Markdown style={aiMarkdownStyles}>{m.content}</Markdown>
                  ) : (
                    <Text style={styles.userMsgText}>{m.content}</Text>
                  )}
                </View>
              </View>
            ))}
            {isAnalyzing && (
              <View style={[styles.messageRow, styles.aiRow]}>
                <View style={[styles.bubble, styles.aiBubble]}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                </View>
              </View>
            )}
            <View style={{ height: 100 }} />
          </ScrollView>
        )}
      </View>

      {/* Floating Action Buttons for Chat Mode */}
      {viewMode === 'chat' && (
        <View style={styles.chatFabContainer}>
          <TouchableOpacity style={styles.voiceSwitchFab} onPress={() => setViewMode('voice')}>
            <Text style={styles.fabIcon}>🎙</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Session History Modal */}
      <Modal visible={isHistoryOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.historyPanel}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('doubts.qa_history')}</Text>
              <TouchableOpacity onPress={() => setIsHistoryOpen(false)}>
                <Text style={styles.closeBtn}>×</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.newSessionListBtn} onPress={() => { startNewSession(); setIsHistoryOpen(false); }}>
              <Text style={styles.newSessionListText}>+ {t('doubts.new_session')}</Text>
            </TouchableOpacity>
            <FlatList
              data={sessions}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.sessionItem} onPress={() => selectSession(item)}>
                  <Text style={styles.sessionItemTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.sessionItemDate}>{new Date(item.timestamp).toLocaleDateString()}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Voice Selector Modal */}
      <Modal visible={isVoiceSelectorOpen} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.voicePanel}>
            <Text style={styles.modalTitle}>{t('doubts.choose_voice')}</Text>
            <FlatList
              data={availableVoices}
              keyExtractor={(item, idx) => idx.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.voiceItem, selectedVoice === item.id && styles.voiceItemActive]}
                  onPress={async () => {
                    setSelectedVoice(item.id);
                    await AsyncStorage.setItem('@gofarmer_voice', item.id);
                    Tts.speak("This is a sample of " + item.name);
                  }}
                >
                  <Text style={[styles.voiceItemName, selectedVoice === item.id && { color: Colors.primary }]}>{item.name}</Text>
                  <Text style={styles.voiceItemLang}>{item.language}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.doneBtn} onPress={() => setIsVoiceSelectorOpen(false)}>
              <Text style={styles.doneBtnText}>{t('common.done')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={() => setToast(t => ({ ...t, visible: false }))} />
    </View>
  );
}

const aiMarkdownStyles = {
  body: { ...Typography.bodyMd, color: '#fff' },
  paragraph: { marginVertical: 4 },
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  voiceContainer: { flex: 1, alignItems: 'center', justifyContent: 'space-between' },
  animationWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  animationContainer: { alignItems: 'center', gap: 24, paddingBottom: 40 },
  pulseCircle: {
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: Colors.primaryContainer + '44',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.primary + '88',
  },
  farmerInner: {
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10,
  },
  farmerEmoji: { fontSize: 80 },
  statusText: { ...Typography.titleMd, color: Colors.onSurface, textAlign: 'center', paddingHorizontal: 40 },

  streamingCard: {
    marginHorizontal: 30, padding: 16,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.outlineVariant,
    maxHeight: 150, width: '85%'
  },
  streamingText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, lineHeight: 22 },

  voiceControls: { flexDirection: 'row', alignItems: 'center', gap: 30, marginBottom: 20 },
  recordBtn: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    elevation: 4,
  },
  recordBtnActive: { backgroundColor: '#f44336' },
  recordBtnIcon: { fontSize: 32, color: '#fff' },
  chatToggle: { width: 50, height: 50, borderRadius: 25, backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  chatToggleIcon: { fontSize: 24 },
  newBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  newBtnIcon: { fontSize: 30, color: Colors.onSurfaceVariant },

  chatContent: { padding: 16 },
  messageRow: { marginBottom: 16, flexDirection: 'row' },
  userRow: { justifyContent: 'flex-start' },
  aiRow: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '85%', padding: 12, borderRadius: Radius.lg },
  userBubble: { backgroundColor: Colors.surfaceContainerHigh, borderBottomLeftRadius: 2, borderWidth: 1, borderColor: Colors.outlineVariant },
  aiBubble: { backgroundColor: Colors.primary, borderBottomRightRadius: 2 },
  userMsgText: { ...Typography.bodyLg, color: Colors.onSurface },
  aiMsgText: { ...Typography.bodyLg, color: '#fff' },

  chatFabContainer: { position: 'absolute', bottom: 30, right: 20 },
  voiceSwitchFab: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  fabIcon: { fontSize: 24, color: '#fff' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  historyPanel: { backgroundColor: Colors.background, height: '80%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  voicePanel: { backgroundColor: Colors.background, padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { ...Typography.titleLg, color: Colors.onSurface },
  closeBtn: { fontSize: 32, color: Colors.onSurfaceVariant },
  newSessionListBtn: { padding: 16, backgroundColor: Colors.primaryContainer + '44', borderRadius: Radius.md, marginBottom: 16, alignItems: 'center' },
  newSessionListText: { color: Colors.primary, fontWeight: '700' },
  sessionItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant },
  sessionItemTitle: { ...Typography.bodyLg, color: Colors.onSurface },
  sessionItemDate: { ...Typography.labelSm, color: Colors.onSurfaceVariant, marginTop: 4 },

  voiceItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  voiceItemActive: { backgroundColor: Colors.primaryContainer + '22' },
  voiceItemName: { ...Typography.bodyLg, color: Colors.onSurface },
  voiceItemLang: { ...Typography.labelSm, color: Colors.onSurfaceVariant },
  doneBtn: { marginTop: 20, padding: 16, backgroundColor: Colors.primary, borderRadius: Radius.md, alignItems: 'center' },
  doneBtnText: { color: '#fff', fontWeight: '700' },
});
