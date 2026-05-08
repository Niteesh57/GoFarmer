/**
 * GOFARMER — Multi-Screen React Native App
 *
 * Onboarding flow: Splash → Language → Main App (5-tab nav)
 * - Splash + Language shown only ONCE (saved to AsyncStorage)
 * - Tab 1: Weather Dashboard
 * - Tab 2: AI Eye (plant scan via gallery + LLM vision)
 * - Tab 3: Doubts (Voice Q&A using LLM + TTS)
 * - Tab 4: LLM Radio (podcast generation via LLM + TTS)
 * - Tab 5: Settings (model management, language, notifications)
 *
 * LLM Engine: CactusLM (Gemma 4 on-device)
 * Model: /data/local/tmp/gemma-4-e2b-it
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  Alert,
  NativeModules,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CactusLM, type CactusLMMessage } from 'cactus-react-native';
import i18n from 'i18next';

// ── Screens ──────────────────────────────────────────────────────────────────
import SplashScreen from './src/screens/SplashScreen';
import LanguageScreen from './src/screens/LanguageScreen';
import WeatherScreen from './src/screens/WeatherScreen';
import AIEyeScreen from './src/screens/AIEyeScreen';
import DoubtsScreen from './src/screens/DoubtsScreen';
import LLMRadioScreen from './src/screens/LLMRadioScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { getInsights } from './src/services/InsightsService';
import BottomTabBar, { TabName } from './src/navigation/BottomTabBar';
import { Colors } from './src/theme/theme';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';

// ── Constants ────────────────────────────────────────────────────────────────
const MODEL_NAME = 'gemma-4-e2b-it';
const FALLBACK_MODEL_PATH = Platform.select({
  ios: 'gemma-4-e2b-it', // On iOS, the path depends on how the model is bundled or sideloaded
  android: '/data/local/tmp/gemma-4-e2b-it',
  default: '/data/local/tmp/gemma-4-e2b-it'
});
const CORPUS_PATH = Platform.select({
  ios: 'GOFARMER-vector',
  android: '/data/local/tmp/GOFARMER-vector',
  default: '/data/local/tmp/GOFARMER-vector'
});
const ONBOARDING_KEY = '@GOFARMER_onboarding_done';
const LANGUAGE_KEY = '@GOFARMER_language';


const SYSTEM_PROMPT_WEATHER =
  'You are a professional weather consultant for Indian farmers. ' +
  'Provide highly accurate, direct agricultural advice based on weather context. ' +
  'STRICT RULES: Keep answers to exactly 3-4 clear sentences. DO NOT use any Markdown formatting (*, #, _, etc.). ' +
  'Use ONLY the NATIVE SCRIPT of the target language. No transliteration.';

const SYSTEM_PROMPT_DOUBTS =
  'You are a friendly farm consultant. Answer farmer questions clearly and simply. ' +
  'Provide actionable steps for soil health, fertilizers, and general plant care.';

const SYSTEM_PROMPT_RADIO =
  'You are a GOFARMER Radio host. Create engaging, informative agricultural podcast scripts. ' +
  'Keep it conversational but concise. Use ONLY the NATIVE SCRIPT of the target language. ' +
  'Use a warm, radio-like tone. Keep responses conversational and inspiring.';

const SYSTEM_PROMPT_VISION =
  'You are a professional Plant Pathologist. Analyze leaf images and provide a diagnosis immediately. ' +
  'Keep it VERY short. Use ONLY the NATIVE SCRIPT of the target language. ' +
  'Describe symptoms (color, spots, shape) and recommend treatments directly from your knowledge base. ' +
  'No preamble. No "thinking aloud".';



// ── Singleton LM instance ─────────────────────────────────────────────────────
import DeviceInfo from 'react-native-device-info';

// Global variable to hold the lm instance after dynamic creation
let lm: CactusLM;

// ── App Flow Type ─────────────────────────────────────────────────────────────
type AppFlow = 'splash' | 'language' | 'onboarding' | 'main';

// ─────────────────────────────────────────────────────────────────────────────
export default function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const { isDark, colors } = useTheme();

  // "?"? Onboarding state "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
  const [flow, setFlow] = useState<AppFlow>('splash');
  const [activeTab, setActiveTab] = useState<TabName>('weather');

  // "?"? Model state "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
  const [modelReady, setModelReady] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [weatherData, setWeatherData] = useState<any>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);
  // Restore language & Load weather data
  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_KEY).then(langCode => {
      if (langCode) i18n.changeLanguage(langCode);
    }).catch(() => { });

    loadWeatherData();
  }, []);

  const loadWeatherData = async (force = false) => {
    setIsWeatherLoading(true);
    try {
      const data = await getInsights(force);
      setWeatherData(data);
    } catch (e) {
      console.log('Failed to load global weather data:', e);
    } finally {
      setIsWeatherLoading(false);
    }
  };


  // ── Check if onboarding was already completed ──────────────────────────────
  const checkOnboarding = useCallback(async () => {
    try {
      const done = await AsyncStorage.getItem(ONBOARDING_KEY);
      if (done === 'true') {
        // Skip onboarding, go straight to main
        setFlow('main');
      }
      // else: flow stays on 'splash', splash auto-advances to 'language'
    } catch {
      // On error, show onboarding
    }
  }, []);

  // ── Initialize model ───────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setInitializing(true);
      try {
        // 1. Get Real Hardware Specs
        const totalRam = await DeviceInfo.getTotalMemory();
        const ramGB = totalRam / (1024 * 1024 * 1024);

        let cores = 8;
        if (Platform.OS === 'android') {
          const { HardwareModule } = NativeModules;
          if (HardwareModule) {
            const specs = await HardwareModule.getHardwareSpecs();
            cores = specs.cpuCores;
          }
        } else {
          // iOS fallback: react-native-device-info can provide cores if needed, 
          // but for now let's use a safe default or reasonable guess.
          // Note: DeviceInfo doesn't expose cores directly on iOS easily without native code,
          // but we can assume most modern iPhones have at least 6-8 cores.
          cores = 6; 
        }

        // 2. Dynamic LM Configuration (No faking)
        console.log(`[AI] Configuring for ${cores} cores and ${ramGB.toFixed(1)}GB RAM`);

        lm = new CactusLM({
          model: MODEL_NAME,
          corpusDir: CORPUS_PATH,
          options: { quantization: 'int4' },
          quantize: true,
          use_gpu: true,
          gpu_device: 0,
          offload_kqv: true,
          offload_all: ramGB > 6, // Only offload all if we have enough RAM
          flash_attn: true,
          n_threads: cores,
          n_cores_physical: cores,
          cpu_affinity: true,
          n_context: ramGB < 4 ? 128 : 256, // Smaller context for low-RAM devices
          kv_cache_quantize: true,
          kv_cache_type: 'int4',
          use_mmap: true,
          use_pinned_memory: ramGB > 4,
        });

        console.log('[AI] Initializing model:', MODEL_NAME);
        await lm.init();
        setModelReady(true);
        console.log('[AI] Model ready');
      } catch (e: any) {
        console.log('[AI] Init failed, trying fallback path:', FALLBACK_MODEL_PATH);
        try {
          if (lm) {
            (lm as any).model = FALLBACK_MODEL_PATH;
            await lm.init();
            setModelReady(true);
            console.log('[AI] Model ready (Fallback)');
          }
        } catch (fallbackErr: any) {
          console.warn('[AI] Model init failed completely:', fallbackErr?.message);
        }
      } finally {
        setInitializing(false);
      }
    })();

    return () => {
      if (lm) lm.destroy().catch(() => { });
    };
  }, []);

  // ── Handle splash done ─────────────────────────────────────────────────────
  const handleSplashDone = useCallback(async () => {
    try {
      const done = await AsyncStorage.getItem(ONBOARDING_KEY);
      if (done === 'true') {
        setFlow('main');
      } else {
        setFlow('language');
      }
    } catch {
      setFlow('language');
    }
  }, []);

  // ── Handle language continue ───────────────────────────────────────────────
  const handleLanguageContinue = useCallback((langCode: string) => {
    i18n.changeLanguage(langCode);
    AsyncStorage.setItem(LANGUAGE_KEY, langCode);
    setFlow('onboarding');
  }, [i18n]);

  // ── Weather specialized completion ───────────────────────────────────────
  const llmCompleteWeather = useCallback(async (prompt: string, onToken?: (tok: string) => void, audioData?: number[]): Promise<string> => {
    if (!modelReady) throw new Error('Model not ready');
    setIsGenerating(true);
    try {
      const result = await lm.complete({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_WEATHER },
          { role: 'user', content: prompt },
        ],
        audio: audioData,
        options: { temperature: 0.4, maxTokens: 512 },
        onToken,
      });
      return result.response;
    } finally {
      setIsGenerating(false);
    }
  }, [modelReady]);

  // ── Doubts specialized completion ────────────────────────────────────────
  const llmCompleteDoubts = useCallback(async (prompt: string, onToken?: (tok: string) => void, audioData?: number[]): Promise<string> => {
    if (!modelReady) throw new Error('Model not ready');
    setIsGenerating(true);
    try {
      const result = await lm.complete({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_DOUBTS },
          {
            role: 'user',
            content: prompt,
          },
        ],
        audio: audioData,
        options: { temperature: 0.4, maxTokens: 512 },
        onToken,
      });
      return result.response;
    } finally {
      setIsGenerating(false);
    }
  }, [modelReady]);

  // ── Radio specialized completion ─────────────────────────────────────────
  const [radioGen, setRadioGen] = useState({
    generating: false,
    step: '',
    pct: 0
  });

  const startRadioGeneration = useCallback(async (topic: string, lang: { label: string, code: string }, style: string, onDone: (podcast: any) => void, audioData?: number[]) => {
    if (!modelReady || radioGen.generating) return;

    setRadioGen({ generating: true, step: 'radio.creating_script', pct: 20 });

    // Simulate steps for UI feedback
    const steps = [
      { label: 'radio.analyzing_topic', pct: 45 },
      { label: 'radio.optimizing_content', pct: 70 },
      { label: 'radio.finalizing', pct: 90 },
    ];

    for (const step of steps) {
      await new Promise(r => setTimeout(r, 800));
      setRadioGen(prev => ({ ...prev, step: step.label, pct: step.pct }));
    }

    const prompt =
      `You are a professional agricultural podcast host. Generate a 5 min ${style.toLowerCase()} podcast script about "${topic}" for Indian farmers.\n` +
      `Language: ${lang.label}\n` +
      `CRITICAL REQUIREMENTS:\n` +
      `- USE ONLY PLAIN TEXT AND NUMBERS. NO MARKDOWN (no #, *, -, etc.).\n` +
      `- USE ONLY THE NATIVE SCRIPT of the language (e.g., Telugu script for Telugu). NO transliteration.\n` +
      `- Use practical examples to help the farmer understand the concepts clearly.\n` +
      `- Keep it concise and conversational.\n` +
      `- Start with a warm introduction.\n` +
      `- Provide actionable advice.\n` +
      `- End with a motivational close.\n` +
      `Generate the full script now (NATIVE SCRIPT ONLY, NO MARKDOWN):`;

    try {
      const response = await lm.complete({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_RADIO },
          {
            role: 'user',
            content: prompt,
          } as any,
        ],
        audio: audioData,
        options: { temperature: 0.7, maxTokens: 800 },
      });

      const cleanScript = response.response.replace(/[#*`]/g, '').trim();
      const sentences = cleanScript.split(/([.!?])\s+/).reduce((acc: string[], cur, i, arr) => {
        if (i % 2 === 0) {
          const punctuation = arr[i + 1] || '';
          acc.push(cur + punctuation);
        }
        return acc;
      }, []).filter(s => s.trim().length > 0);

      const midPoint = Math.floor(cleanScript.length / 2);
      const snippet = cleanScript.substring(midPoint, midPoint + 15).replace(/[.!?]/g, '').trim();
      const newPodcast = {
        id: Date.now().toString(),
        title: snippet || `${topic} — ${style}`,
        topic,
        language: lang.label,
        langCode: lang.code,
        status: 'ready',
        createdAt: new Date().toLocaleDateString(),
        script: cleanScript,
        sentences: sentences,
      };

      // Persist immediately in background
      try {
        const stored = await AsyncStorage.getItem('GOFARMER_podcasts');
        const list = stored ? JSON.parse(stored) : [];
        const newList = [newPodcast, ...list];
        await AsyncStorage.setItem('GOFARMER_podcasts', JSON.stringify(newList));
      } catch (e) {
        console.error('Failed to persist background podcast', e);
      }

      setRadioGen({ generating: false, step: 'radio.done', pct: 100 });
      if (onDone) onDone(newPodcast);
    } catch (e) {
      setRadioGen({ generating: false, step: '', pct: 0 });
      throw e;
    }
  }, [modelReady, radioGen.generating]);

  const llmCompleteRadio = useCallback(async (prompt: string, onToken?: (tok: string) => void): Promise<string> => {
    if (!modelReady) throw new Error('Model not ready');
    setIsGenerating(true);
    try {
      const result = await lm.complete({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_RADIO },
          { role: 'user', content: prompt },
        ],
        options: { temperature: 0.7, maxTokens: 800 },
        onToken,
      });
      return result.response;
    } finally {
      setIsGenerating(false);
    }
  }, [modelReady]);


  // ── LLM vision completion (for AI Eye) ────────────────────────────────────
  const llmCompleteVision = useCallback(async (
    prompt: string,
    imagePath: string,
    callbacks: {
      onToken?: (tok: string) => void,
    }
  ): Promise<{ response: string }> => {
    if (!modelReady) throw new Error('Model not ready');
    setIsGenerating(true);

    try {
      const messages: CactusLMMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT_VISION },
        { role: 'user', content: prompt, images: [imagePath] },
      ];

      const result = await lm.complete({
        messages,
        options: {
          temperature: 0.1,
          maxTokens: 512,
          enableThinking: false, 
          enableRag: true, 
        },
        onToken: callbacks.onToken,
      });

      return { response: result.response }; 
    } finally {
      setIsGenerating(false);
    }
  }, [modelReady]);


  // ── Render active tab ──────────────────────────────────────────────────────
  const renderScreen = () => {
    switch (activeTab) {
      case 'weather':
        return (
          <WeatherScreen 
            llmComplete={llmCompleteWeather} 
            isLlmReady={modelReady} 
            weatherDataProp={weatherData}
            isLoadingProp={isWeatherLoading}
            refreshWeather={() => loadWeatherData(true)}
          />
        );
      case 'aieye':
        return <AIEyeScreen llmComplete={llmCompleteVision} />;
      case 'doubts':
        return <DoubtsScreen llmComplete={llmCompleteDoubts} isLlmReady={modelReady} />;
      case 'radio':
        return (
          <LLMRadioScreen
            llmComplete={llmCompleteRadio}
            isLlmReady={modelReady}
            radioGen={radioGen}
            startRadioGeneration={startRadioGeneration}
          />
        );

      case 'settings':
        return <SettingsScreen isModelReady={modelReady} />;
      default:
        return <WeatherScreen />;
    }
  };

  // ── Onboarding flows ───────────────────────────────────────────────────────
  if (flow === 'splash') {
    return <SplashScreen onDone={handleSplashDone} />;
  }

  if (flow === 'language') {
    return <LanguageScreen onContinue={handleLanguageContinue} />;
  }

  if (flow === 'onboarding') {
    return <OnboardingScreen onComplete={() => setFlow('main')} />;
  }

  // ── Main App ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.surfaceContainerLowest}
      />

      <View style={styles.flex}>
        {renderScreen()}
      </View>

      <BottomTabBar active={activeTab} onChange={setActiveTab} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
});
