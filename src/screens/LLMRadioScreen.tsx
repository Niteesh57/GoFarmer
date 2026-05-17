/**
 * @file LLMRadioScreen.tsx
 * @description Local Agricultural Advisory Podcast Generator & Player.
 * 
 * Provides an offline podcast experience for farmers:
 * 1. AI Script Synthesis: Generates educational transcripts and agronomic advisory pieces using the local Gemma 4 model.
 * 2. Lyric-Style Audio Player: Features interactive, synced sentence-level text tracking (karaoke-style auto-scroll).
 * 3. Text-to-Speech (TTS) Integration: Automatically schedules and speaks synthesized sentences sequentially.
 * 4. Multi-language/Multi-voice support: Localizes vocal outputs with custom pitch and tempo adjustments.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Modal, TextInput, Animated, PermissionsAndroid, Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Tts from 'react-native-tts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TopAppBar from '../components/TopAppBar';
import { Toast } from '../components/Toast';
import { Colors, Typography, Spacing, Radius } from '../theme/theme';
import AudioRecord from 'react-native-audio-record';
import { OrbAnimation } from '../components/OrbAnimation';

// ─── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY = '@GOFARMER_podcasts';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PodcastItem {
  id: string;
  title: string;
  topic: string;
  language: string;
  langCode: string;
  status: 'ready' | 'generating' | 'downloaded';
  createdAt: string;
  script?: string;
  sentences?: string[];
}

interface LLMRadioScreenProps {
  /** Callback triggering LLM completion. */
  llmComplete: (prompt: string) => Promise<string>;
  
  /** True if the local gemma-4-e2b-it model binary has loaded successfully. */
  isLlmReady: boolean;
  
  /** Current state of podcast script generation process. Includes tokens count tracker. */
  radioGen: { generating: boolean; step: string; pct: number; tokens?: number };
  
  /** Triggers the asynchronous creation of a new podcast. */
  startRadioGeneration: (topic: string, lang: { label: string, code: string }, style: string, onDone: (p: PodcastItem) => void, audioData?: number[]) => Promise<void>;
}

/**
 * Translates Base64 audio recordings into raw 16kHz Mono PCM channels, conforming to
 * Offline CactusLM podcast generation inputs.
 * 
 * @param {string} b64 Input Base64 encoded audio string stream.
 * @returns {number[]} Output raw byte representation array.
 */
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

// ─── Options ──────────────────────────────────────────────────────────────────
const LANGUAGES = [
  { label: '🇬🇧 English', code: 'en-US' },
  { label: '🇮🇳 हिंदी', code: 'hi-IN' },
  { label: '🇪🇸 Español', code: 'es-ES' },
  { label: '🇫🇷 Français', code: 'fr-FR' },
  { label: '🇨🇳 中文', code: 'zh-CN' },
  { label: '🇯🇵 日本語', code: 'ja-JP' },
  { label: '🇮🇳 తెలుగు', code: 'te-IN' },
  { label: '🇮🇳 ಕನ್ನಡ', code: 'kn-IN' },
  { label: '🇸🇪 Svenska', code: 'sv-SE' },
  { label: '🇩🇪 Deutsch', code: 'de-DE' }
];
const STYLES = ['Educational', 'Quick Tips', 'Story Format', 'Interview (Q&A)'];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LLMRadioScreen({ llmComplete, isLlmReady, radioGen, startRadioGeneration }: LLMRadioScreenProps) {
  const { t, i18n } = useTranslation();
  const [podcasts, setPodcasts] = useState<PodcastItem[]>([]);
  const [featured, setFeatured] = useState<PodcastItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [speed, setSpeed] = useState('0.5x');
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(-1);

  // Form state
  const [topic, setTopic] = useState('');
  const [language, setLanguage] = useState(LANGUAGES[0]); // Default to English
  const [style, setStyle] = useState(STYLES[0]);

  // Voices
  const [voices, setVoices] = useState<any[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);
  const transcriptRef = useRef<ScrollView>(null);
  const sentenceLayouts = useRef<{ [key: number]: { y: number, height: number } }>({});
  
  // Picker modal state
  const [pickerModal, setPickerModal] = useState<{ type: string; options: string[] } | null>(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as 'success' | 'error' | 'info' });
  const [isPaused, setIsPaused] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');
  const audioChunksRef = useRef<string[]>([]);
  
  // Waveform animation values
  const waveAnimValues = useRef(Array.from({ length: 30 }, () => new Animated.Value(0.3))).current;
  const waveAnims = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isRecording) {
      const anims = waveAnimValues.map((v, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 30),
            Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(v, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          ])
        )
      );
      waveAnims.current = Animated.parallel(anims);
      waveAnims.current.start();
    } else {
      waveAnims.current?.stop();
      waveAnimValues.forEach(v => v.setValue(0.2));
    }
  }, [isRecording]);

  useEffect(() => {
    const init = async () => {
      try {
        const vs = await Tts.voices();
        setVoices(vs);
        
        const savedVoice = await AsyncStorage.getItem('@GOFARMER_selected_voice');
        if (savedVoice) {
          setSelectedVoice(savedVoice);
          Tts.setDefaultVoice(savedVoice);
        } else if (vs.length > 0) {
          setSelectedVoice(vs[0].id);
        }
        
        // Language init: Pre-select based on saved preference or app locale
        const savedLang = await AsyncStorage.getItem('@content_lang');
        if (savedLang) {
          const cleanSaved = savedLang.replace(/[^\w\s]/g, '').trim().toLowerCase();
          const found = LANGUAGES.find(l => 
            l.label.toLowerCase().includes(cleanSaved) || 
            cleanSaved.includes(l.label.toLowerCase().replace(/[^\w\s]/g, '').trim())
          );
          if (found) setLanguage(found);
        } else {
          const appLangCode = i18n.language;
          const found = LANGUAGES.find(l => l.code.startsWith(appLangCode));
          if (found) setLanguage(found);
        }
      } catch (e) {
        console.log('Init error:', e);
      }
    };
    init();
  }, []);

  const toggleRecording = async () => {
    if (isRecording) {
      setIsRecording(false);
      const audioFile = await AudioRecord.stop();
      
      const fullB64 = audioChunksRef.current.join('');
      const pcmData = base64ToPcm(fullB64);
      audioChunksRef.current = [];

      if (pcmData.length < 100) {
        showToast('Audio too short, try again', 'error');
        return;
      }

      showToast('Generating podcast from voice...', 'info');
      
      try {
        await startRadioGeneration(
          topic || 'Podcast from Voice Input', 
          language, 
          style, 
          async (newPodcast) => {
            const newList = [newPodcast, ...podcasts];
            setPodcasts(newList);
            await savePodcasts(newList);
            setFeatured(newPodcast);
            showToast('Voice Podcast Ready!', 'success');
          },
          pcmData
        );
      } catch (err: any) {
        Alert.alert('Generation Failed', err.message);
      }
    } else {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          showToast('Microphone permission denied', 'error');
          return;
        }
        // Delay to let OS register permission grant
        await new Promise(r => setTimeout(r, 400));
      }
      
      audioChunksRef.current = [];
      
      // Always re-init right before starting
      AudioRecord.init({
        sampleRate: 16000,
        channels: 1,
        bitsPerSample: 16,
        audioSource: 6, // VOICE_RECOGNITION
        wavFile: 'radio_input.wav'
      });

      await new Promise(r => setTimeout(r, 100));
      setIsRecording(true);
      AudioRecord.start();
      AudioRecord.on('data', data => {
        audioChunksRef.current.push(data);
      });
    }
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ visible: true, message, type });
  };

  // Persistence logic
  const loadPodcasts = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setPodcasts(parsed);
      }
    } catch (e) {
      console.error('Failed to load podcasts', e);
    }
  };

  const savePodcasts = async (list: PodcastItem[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('Failed to save podcasts', e);
    }
  };

  // Initial load
  useEffect(() => {
    loadPodcasts();
  }, []);

  // Poll for new podcasts if we're not the one who started it (or just on mount)
  // But better: update state when radioGen finishes
  useEffect(() => {
    if (!radioGen.generating && radioGen.pct === 100) {
      loadPodcasts();
    }
  }, [radioGen.generating, radioGen.pct]);

  // TTS init
  useEffect(() => {
    Tts.getInitStatus().then(() => {
      Tts.voices().then(v => {
        setVoices(v);
      });
    });

    Tts.setDefaultRate(parseFloat(speed.replace('x', '')));

    const startL = Tts.addEventListener('tts-start', () => {
      setIsPlaying(true);
      setIsPaused(false);
    });

    const finishL = Tts.addEventListener('tts-finish', () => {
      // Logic handled in separate useEffect for chaining
    });

    return () => {
      Tts.stop();
    };
  }, [speed]);

  // Default voice when language changes
  useEffect(() => {
    if (voices.length > 0 && language) {
      const langPrefix = language.code.split('-')[0];
      const langVoices = voices.filter(v => 
        v.language.toLowerCase().includes(langPrefix.toLowerCase())
      );
      if (langVoices.length > 0) {
        setSelectedVoice(langVoices[0].id);
        Tts.setDefaultVoice(langVoices[0].id).catch(() => {});
        AsyncStorage.setItem('@GOFARMER_selected_voice', langVoices[0].id);
      }
    }
  }, [language, voices]);

  // Voice selection effect (Instant update)
  useEffect(() => {
    if (selectedVoice && featured) {
      Tts.setDefaultLanguage(featured.langCode).catch(() => {});
      Tts.setDefaultVoice(selectedVoice).catch(() => {});
      // If already playing, restart current sentence with new voice
      if (isPlaying && !isPaused && currentSentenceIndex !== -1) {
        Tts.stop();
        setTimeout(() => {
          if (featured?.sentences && currentSentenceIndex !== -1) {
            Tts.speak(featured.sentences[currentSentenceIndex]);
          }
        }, 50);
      }
    }
  }, [selectedVoice]);

  // Handle current sentence index changes (Auto-scroll & Chaining)
  useEffect(() => {
    if (currentSentenceIndex >= 0 && featured?.sentences && isPlaying && !isPaused) {
      // Precise centering using tracked layout data
      const layout = sentenceLayouts.current[currentSentenceIndex];
      if (layout) {
        const containerHeight = 220;
        const scrollY = Math.max(0, layout.y - (containerHeight / 2) + (layout.height / 2));
        transcriptRef.current?.scrollTo({ y: scrollY, animated: true });
      }

      // Speak current sentence
      Tts.stop();
      Tts.speak(featured.sentences[currentSentenceIndex]);
    }
  }, [currentSentenceIndex, isPlaying, isPaused]);

  // Handle TTS finish for chaining
  useEffect(() => {
    const l = Tts.addEventListener('tts-finish', () => {
      if (isPlaying && !isPaused && featured?.sentences) {
        if (currentSentenceIndex < featured.sentences.length - 1) {
          setCurrentSentenceIndex(prev => prev + 1);
        } else {
          setIsPlaying(false);
          setPlayingId(null);
          setCurrentSentenceIndex(-1);
        }
      }
    });
    return () => l.remove();
  }, [isPlaying, isPaused, featured, currentSentenceIndex]);

  const splitIntoSentences = (text: string) => {
    return text.split(/([.!?])\s+/).reduce((acc: string[], cur, i, arr) => {
      if (i % 2 === 0) {
        const punctuation = arr[i + 1] || '';
        acc.push(cur + punctuation);
      }
      return acc;
    }, []).filter(s => s.trim().length > 0);
  };

  const handlePlay = (podcast: PodcastItem, startIndex?: number) => {
    if (startIndex !== undefined) {
      Tts.stop();
      setPlayingId(podcast.id);
      setFeatured(podcast);
      setIsPaused(false);
      setIsPlaying(true);
      setCurrentSentenceIndex(startIndex);
      Tts.setDefaultLanguage(podcast.langCode).catch(() => {});
      return;
    }

    if (playingId === podcast.id) {
      if (isPlaying && !isPaused) {
        Tts.stop();
        setIsPaused(true);
      } else {
        setIsPaused(false);
        setIsPlaying(true);
        if (currentSentenceIndex === -1) setCurrentSentenceIndex(0);
      }
      return;
    }

    Tts.stop();
    setPlayingId(podcast.id);
    setFeatured(podcast);
    setIsPaused(false);
    setIsPlaying(true);
    setCurrentSentenceIndex(0);
    Tts.setDefaultLanguage(podcast.langCode).catch(() => {});
    
    const langVoices = voices.filter(v => v.language.includes(podcast.langCode.split('-')[0]));
    if (langVoices.length > 0) setSelectedVoice(langVoices[0].id);
  };

  const handleNext = () => {
    if (!featured) return;
    const idx = podcasts.findIndex(p => p.id === featured.id);
    if (idx > 0) {
      const next = podcasts[idx - 1];
      handlePlay(next);
    }
  };

  const handlePrev = () => {
    if (!featured) return;
    const idx = podcasts.findIndex(p => p.id === featured.id);
    if (idx < podcasts.length - 1) {
      const prev = podcasts[idx + 1];
      handlePlay(prev);
    }
  };

  const handleGenerate = async () => {
    if (!isLlmReady) { showToast(t('advisor.loading'), 'info'); return; }
    if (radioGen.generating) return;

    try {
      await startRadioGeneration(topic, language, style, async (newP) => {
        const newList = [newP, ...podcasts];
        setPodcasts(newList);
        await savePodcasts(newList);
        setFeatured(newP);
        showToast(t('radio.gen_success'), 'success');
      });
    } catch (e: any) {
      Alert.alert(t('radio.gen_failed'), e?.message ?? 'Try again');
    }
  };

  const openPicker = (type: string, options: string[]) => {
    setPickerModal({ type, options });
  };

  const selectOption = (value: string) => {
    if (!pickerModal) return;
    switch (pickerModal.type) {
      case 'topic': setTopic(value); break;
      case 'style': setStyle(value); break;
      case 'language':
        const newLang = LANGUAGES.find(l => l.label === value) || LANGUAGES[1];
        setLanguage(newLang);
        break;
      case 'voice':
        const v = voices.find(x => x.name === value || x.id === value);
        if (v) setSelectedVoice(v.id);
        break;
    }
    setPickerModal(null);
  };

  const speedOptions = ['0.5x', '0.75x', '1.0x', '1.25x'];

  const handleDelete = (id: string) => {
    Tts.stop();
    const newList = podcasts.filter(x => x.id !== id);
    setPodcasts(newList);
    savePodcasts(newList);
    if (featured?.id === id) setFeatured(null);
  };

  return (
    <View style={styles.flex}>
      <TopAppBar title="GOFARMER" />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* Featured player (only if podcast exists) */}
        {featured ? (
          <View style={styles.playerCard}>
            <View style={styles.playerHeader}>
              <Text style={styles.playerLabel}>🧑‍🏫 {t('radio.now_playing')}</Text>
              <View style={[styles.statusBadge, { backgroundColor: Colors.primaryContainer }]}>
                <Text style={styles.statusText}>{featured.language}</Text>
              </View>
            </View>

            <Text style={styles.playerTitle}>{featured.title}</Text>
            
            {/* Transcript (Lyrics style) */}
            <View style={styles.transcriptContainer}>
              <ScrollView 
                ref={transcriptRef}
                style={styles.transcriptScroll} 
                nestedScrollEnabled 
                showsVerticalScrollIndicator={false}
              >
                {featured.sentences?.map((s, i) => (
                  <TouchableOpacity 
                    key={i} 
                    onPress={() => handlePlay(featured, i)}
                    onLayout={(e) => {
                      const { y, height } = e.nativeEvent.layout;
                      sentenceLayouts.current[i] = { y, height };
                    }}
                    style={[
                      styles.transcriptItem,
                      i === currentSentenceIndex && styles.transcriptItemActive
                    ]}
                  >
                    <Text style={[
                      styles.transcriptText,
                      i === currentSentenceIndex && styles.transcriptTextActive
                    ]}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Controls */}
            <View style={styles.playerControls}>
              <TouchableOpacity 
                style={[styles.controlBtn, podcasts.indexOf(featured) === podcasts.length - 1 && styles.disabledBtn]} 
                onPress={handlePrev}
                disabled={podcasts.indexOf(featured) === podcasts.length - 1}
              >
                <Text style={styles.controlIcon}>⏮</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.playBtn}
                onPress={() => handlePlay(featured)}
              >
                <Text style={styles.playBtnIcon}>
                  {(isPlaying && !isPaused && playingId === featured.id) ? '⏸' : '▶️'}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.controlBtn, podcasts.indexOf(featured) === 0 && styles.disabledBtn]} 
                onPress={handleNext}
                disabled={podcasts.indexOf(featured) === 0}
              >
                <Text style={styles.controlIcon}>⏭</Text>
              </TouchableOpacity>
            </View>

            {/* Speed & Voice */}
            <View style={styles.metaRow}>
              <View style={styles.speedRow}>
                <Text style={styles.speedLabel}>{t('radio.speed')}:</Text>
                {speedOptions.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.speedBtn, s === speed && styles.speedBtnActive]}
                    onPress={() => { setSpeed(s); Tts.setDefaultRate(parseFloat(s.replace('x', ''))); }}
                  >
                    <Text style={[styles.speedBtnText, s === speed && styles.speedBtnTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {voices.filter(v => v.language.includes((featured?.langCode || language.code).split('-')[0])).length > 0 && (
                <TouchableOpacity style={styles.voiceBtn} onPress={() => openPicker('voice', voices.filter(v => v.language.includes((featured?.langCode || language.code).split('-')[0])).map(v => v.name || v.id))}>
                  <Text style={styles.voiceBtnText}>🗣 {voices.find(v => v.id === selectedVoice)?.name || t('radio.voice_mode')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {podcasts.length > 0 ? `📖 ${t('radio.select_to_play')}` : `📖 ${t('radio.no_script')}`}
            </Text>
            <Text style={styles.emptySubText}>
              {podcasts.length > 0 ? t('radio.tap_recent') : t('radio.create_new')}
            </Text>
          </View>
        )}

        {/* Generate section */}
        <View style={[styles.sectionCard, radioGen.generating && { opacity: 0.8 }]}>
          <View style={styles.genHeader}>
            <Text style={styles.sectionTitle}>{t('radio.create_new')}</Text>
            <View style={styles.modeToggle}>
              <TouchableOpacity 
                style={[styles.modeBtn, inputMode === 'voice' && styles.modeBtnActive]} 
                onPress={() => setInputMode('voice')}
              >
                <Text style={[styles.modeBtnText, inputMode === 'voice' && styles.modeBtnTextActive]}>{t('radio.voice_mode')}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modeBtn, inputMode === 'text' && styles.modeBtnActive]} 
                onPress={() => setInputMode('text')}
              >
                <Text style={[styles.modeBtnText, inputMode === 'text' && styles.modeBtnTextActive]}>{t('radio.text_mode')}</Text>
              </TouchableOpacity>
            </View>
          </View>
          
          {inputMode === 'voice' ? (
            <View style={styles.voiceInputArea}>
              <View style={styles.waveformRow}>
                {waveAnimValues.map((v, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.waveBar,
                      {
                        transform: [{ scaleY: v }],
                        backgroundColor: isRecording ? Colors.primary : Colors.outlineVariant,
                      },
                    ]}
                  />
                ))}
              </View>
              
              <TouchableOpacity 
                style={[styles.minimalMicBtn, isRecording && styles.minimalMicBtnActive]} 
                onPress={toggleRecording}
                disabled={radioGen.generating}
              >
                <View style={styles.whiteCircle} />
              </TouchableOpacity>
              
              {isRecording && <Text style={styles.recordingStatus}>{t('doubts.listening')}</Text>}
            </View>
          ) : (
            <View style={[styles.selectGroup, radioGen.generating && styles.disabledForm]}>
              <Text style={styles.selectLabel}>{t('radio.topic')}</Text>
              <View style={styles.customTopicContainer}>
                <TextInput
                  style={styles.customTopicInput}
                  placeholder={t('doubts.placeholder')}
                  placeholderTextColor={Colors.onSurfaceVariant}
                  value={topic}
                  onChangeText={setTopic}
                  multiline
                  editable={!radioGen.generating}
                />
              </View>
            </View>
          )}

          <View style={styles.row}>
            <View style={[styles.selectGroup, { flex: 1 }, radioGen.generating && styles.disabledForm]}>
              <Text style={styles.selectLabel}>{t('radio.language')}</Text>
              <TouchableOpacity 
                style={styles.compactSelect} 
                onPress={() => !radioGen.generating && openPicker('language', LANGUAGES.map(l => l.label))}
                disabled={radioGen.generating}
              >
                <Text style={[styles.selectValue, { flex: 1 }]} numberOfLines={1}>{language.label}</Text>
                <Text style={styles.selectArrow}>▼</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.selectGroup, { flex: 1 }, radioGen.generating && styles.disabledForm]}>
              <Text style={styles.selectLabel}>{t('radio.style')}</Text>
              <TouchableOpacity 
                style={styles.compactSelect} 
                onPress={() => !radioGen.generating && openPicker('style', STYLES)}
                disabled={radioGen.generating}
              >
                <Text style={[styles.selectValue, { flex: 1 }]} numberOfLines={1}>{style}</Text>
                <Text style={styles.selectArrow}>▼</Text>
              </TouchableOpacity>
            </View>
          </View>

          {radioGen.generating && (
            <View style={styles.genProgress}>
              <View style={styles.progressHeaderRow}>
                <Text style={styles.genStep}>{t(radioGen.step)}</Text>
                {(radioGen.tokens ?? 0) > 0 && (
                  <View style={styles.tokenBadgeContainer}>
                    <Text style={styles.tokenBadgeText}>⚡ {radioGen.tokens} Tokens</Text>
                  </View>
                )}
              </View>
              <View style={styles.genTrack}>
                <View style={[styles.genFill, { width: `${radioGen.pct}%` }]} />
              </View>
              <Text style={styles.genPct}>{radioGen.pct}%</Text>
            </View>
          )}

          {inputMode === 'text' && (
            <TouchableOpacity
              style={[styles.generateBtn, (!isLlmReady || radioGen.generating || !topic.trim()) && styles.generateBtnDisabled]}
              onPress={handleGenerate}
              disabled={!isLlmReady || radioGen.generating || !topic.trim()}
              activeOpacity={0.85}
            >
              {radioGen.generating ? <ActivityIndicator color={Colors.onPrimary} size="small" /> : null}
              <Text style={styles.generateBtnText}>
                {radioGen.generating ? t('radio.generating') : `✨ ${t('radio.generate')} ✨`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Recent podcasts */}
        {podcasts.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>{t('radio.recent_podcasts')}</Text>
            {podcasts.map(p => (
              <View key={p.id} style={styles.podcastCard}>
                <View style={styles.podcastLeft}>
                  <Text style={styles.podcastIcon}>📄</Text>
                  <View style={styles.podcastInfo}>
                    <Text style={styles.podcastTitle} numberOfLines={1}>{p.title}</Text>
                    <Text style={styles.podcastMeta}>{p.language}  ·  {p.createdAt}</Text>
                  </View>
                </View>
                <View style={styles.podcastActions}>
                  <TouchableOpacity style={styles.podcastActionBtn} onPress={() => handlePlay(p)}>
                    <Text style={styles.podcastActionIcon}>
                      {(isPlaying && !isPaused && playingId === p.id) ? '⏸' : '▶️'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.podcastActionBtn}
                    onPress={() => handleDelete(p.id)}
                  >
                    <Text style={[styles.podcastActionIcon, { color: Colors.error }]}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Picker modal */}
      <Modal visible={!!pickerModal} transparent animationType="slide" onRequestClose={() => setPickerModal(null)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.pickerTitle}>{t('common.select')} {t(`radio.${pickerModal?.type}`)}</Text>
            <ScrollView>
              {pickerModal?.options.map(opt => (
                <TouchableOpacity key={opt} style={styles.pickerOption} onPress={() => selectOption(opt)}>
                  <Text style={[styles.pickerOptionText, { flex: 1 }]} numberOfLines={1}>{opt}</Text>
                  {(pickerModal.type === 'topic' ? opt === topic :
                    pickerModal.type === 'style' ? opt === style :
                    pickerModal.type === 'language' ? opt === language.label :
                    opt === selectedVoice || opt === voices.find(v => v.id === selectedVoice)?.name) && (
                    <Text style={{ color: Colors.primary, fontWeight: '700', marginLeft: 8 }}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

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

  playerCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    gap: Spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4,
  },
  playerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  playerLabel: { ...Typography.labelMd, color: Colors.onSurfaceVariant, letterSpacing: 1.2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.full },
  statusText: { ...Typography.labelSm, color: Colors.onSurface },
  playerTitle: { ...Typography.titleLg, color: Colors.onSurface, fontWeight: '700' },

  transcriptContainer: { 
    height: 220, 
    backgroundColor: Colors.surfaceContainerLow, 
    borderRadius: Radius.md, 
    marginVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    overflow: 'hidden',
  },
  transcriptScroll: { flex: 1 },
  transcriptItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radius.sm,
    marginHorizontal: 4,
  },
  transcriptItemActive: {
    backgroundColor: Colors.primaryContainer + '30',
  },
  transcriptText: { 
    ...Typography.bodyMedium, 
    color: Colors.onSurfaceVariant, 
    lineHeight: 24, 
    fontSize: 16,
    opacity: 0.6,
    textAlign: 'center',
  },
  transcriptTextActive: { 
    color: Colors.primary, 
    fontWeight: '700', 
    fontSize: 18,
    opacity: 1,
  },

  playerControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xl, marginVertical: Spacing.sm },
  controlBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  controlIcon: { fontSize: 32, color: Colors.onSurface },
  disabledBtn: { opacity: 0.3 },
  playBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  playBtnIcon: { fontSize: 36 },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.md },
  speedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  speedLabel: { ...Typography.labelMd, color: Colors.onSurfaceVariant },
  speedBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.outlineVariant },
  speedBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  speedBtnText: { ...Typography.labelSm, color: Colors.onSurface },
  speedBtnTextActive: { color: Colors.onPrimary },
  voiceBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.secondaryContainer },
  voiceBtnText: { ...Typography.labelMd, color: Colors.onSecondaryContainer },

  emptyState: { alignItems: 'center', justifyContent: 'center', padding: 40, backgroundColor: Colors.surfaceContainerLowest, borderRadius: Radius.lg, borderStyle: 'dashed', borderWidth: 2, borderColor: Colors.outlineVariant },
  emptyText: { ...Typography.titleLarge, color: Colors.onSurfaceVariant, marginBottom: 8 },
  emptySubText: { ...Typography.bodyMedium, color: Colors.outline },

  sectionCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    gap: Spacing.md,
    elevation: 2,
  },
  sectionTitle: { ...Typography.titleMedium, color: Colors.onSurface, fontWeight: '700', marginBottom: 4 },

  selectGroup: { gap: 4 },
  selectLabel: { ...Typography.labelMedium, color: Colors.onSurfaceVariant },
  selectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: Colors.outlineVariant,
    borderRadius: Radius.DEFAULT,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    backgroundColor: Colors.surfaceContainerLow,
  },
  selectValue: { ...Typography.bodyLarge, color: Colors.onSurface },
  selectArrow: { ...Typography.labelSmall, color: Colors.onSurfaceVariant },

  disabledForm: { opacity: 0.5 },

  genProgress: { gap: Spacing.sm, alignItems: 'center', width: '100%' },
  progressHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
  tokenBadgeContainer: { backgroundColor: Colors.primaryContainer, paddingHorizontal: 10, paddingVertical: 2, borderRadius: Radius.full },
  tokenBadgeText: { ...Typography.labelSmall, color: Colors.onPrimaryContainer, fontWeight: 'bold' },
  genStep: { ...Typography.bodyMedium, color: Colors.onSurfaceVariant },
  genTrack: { width: '100%', height: 8, backgroundColor: Colors.surfaceContainerHighest, borderRadius: Radius.full, overflow: 'hidden' },
  genFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: Radius.full },
  genPct: { ...Typography.titleMedium, color: Colors.primary, fontWeight: '700' },

  generateBtn: {
    height: 56, backgroundColor: Colors.primary, borderRadius: Radius.lg,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: Spacing.sm,
    elevation: 4,
  },
  generateBtnDisabled: { opacity: 0.5 },
  generateBtnText: { ...Typography.labelLarge, color: Colors.onPrimary, fontWeight: '700', fontSize: 16 },

  podcastCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.outlineVariant,
  },
  podcastLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  podcastIcon: { fontSize: 28 },
  podcastInfo: { flex: 1 },
  podcastTitle: { ...Typography.labelMedium, color: Colors.onSurface, fontWeight: '700' },
  podcastMeta: { ...Typography.labelSmall, color: Colors.onSurfaceVariant, marginTop: 2 },
  podcastActions: { flexDirection: 'row', gap: 4 },
  podcastActionBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  podcastActionIcon: { fontSize: 18 },
  
  genHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modeToggle: { flexDirection: 'row', backgroundColor: Colors.surfaceContainerHigh, borderRadius: 20, padding: 2 },
  modeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 18 },
  modeBtnActive: { backgroundColor: '#fff', elevation: 2 },
  modeBtnText: { ...Typography.labelSmall, color: Colors.onSurfaceVariant },
  modeBtnTextActive: { color: Colors.primary, fontWeight: '700' },

  voiceInputArea: { alignItems: 'center', gap: 16, marginVertical: 10 },
  waveformRow: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 50, width: '100%', justifyContent: 'center' },
  waveBar: { width: 3, height: '80%', borderRadius: 1.5, backgroundColor: Colors.primary + '88' },
  minimalMicBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.outlineVariant },
  minimalMicBtnActive: { backgroundColor: Colors.error + '22', borderColor: Colors.error },
  whiteCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3 },
  recordingStatus: { ...Typography.labelSmall, color: Colors.error, fontWeight: '900', letterSpacing: 1 },
  
  customTopicContainer: { marginTop: 4 },
  customTopicInput: {
    backgroundColor: Colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    ...Typography.bodyLarge,
    color: Colors.onSurface,
    minHeight: 48,
    textAlignVertical: 'top',
  },
  row: { flexDirection: 'row', gap: Spacing.md },
  compactSelect: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: Colors.outlineVariant,
    borderRadius: Radius.DEFAULT,
    paddingHorizontal: Spacing.sm, paddingVertical: 8,
    backgroundColor: Colors.surfaceContainerLow,
  },


  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg,
    padding: Spacing.lg, maxHeight: '60%',
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.outlineVariant, alignSelf: 'center', marginBottom: Spacing.md },
  pickerTitle: { ...Typography.titleMedium, color: Colors.onSurface, marginBottom: Spacing.md, textTransform: 'capitalize' },
  pickerOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant,
  },
  pickerOptionText: { ...Typography.bodyLarge, color: Colors.onSurface },
});
