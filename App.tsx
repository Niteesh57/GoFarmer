/**
 * GoFarmer — Multi-Screen React Native App
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
import { getInsights } from './src/services/InsightsService';
import BottomTabBar, { TabName } from './src/navigation/BottomTabBar';
import { Colors } from './src/theme/theme';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';

// ── Constants ────────────────────────────────────────────────────────────────
const MODEL_PATH = '/data/local/tmp/gemma-4-e2b-it';
const ONBOARDING_KEY = '@gofarmer_onboarding_done';
const LANGUAGE_KEY = '@gofarmer_language';

const SYSTEM_PROMPT =
  'You are a helpful AI assistant running privately on this device. ' +
  'When shown an image, respond with a structured analysis. ' +
  'For agricultural questions, provide practical farming advice.';

// ── Singleton LM instance ─────────────────────────────────────────────────────
const lm = new CactusLM({
  // Model config
  model: MODEL_PATH,
  dtype: 'int4',
  quantize: true,

  // GPU: Maximum offload to Adreno
  use_gpu: true,
  gpu_device: 0,
  offload_kqv: true,
  offload_all: true,        // All layers on GPU
  flash_attn: true,         // Fused attention
  flash_attn_v2: true,

  // CPU: Use all performance cores
  n_threads: 12,            // All P-cores of Snapdragon 8+
  n_cores_physical: 12,
  cpu_affinity: true,       // Bind to P-cores only

  // Context: MINIMAL (this is the key trade-off)
  n_context: 256,           // 256 tokens = ~1KB (NOT 2048)
  n_batch: 1,               // Decode batch = 1 (streaming)
  n_ubatch: 1,              // No unbatched

  // KV cache: Aggressive quantization
  kv_cache_quantize: true,
  kv_cache_type: 'int8',
  use_mmap: true,           // Memory-map weights (faster load)

  // Memory
  mlock: false,
  use_pinned_memory: true,

  // Sampling
  temperature_last: true,
  logit_bias: {},

  // Advanced
  rope_freq_base: 10000.0,
  rope_freq_scale: 1.0,
  tensor_split: '1.0',
  top_k_tokens: 40,
});

// ── App Flow Type ─────────────────────────────────────────────────────────────
type AppFlow = 'splash' | 'language' | 'main';

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

    // Auto-update insights daily & load language
    useEffect(() => {
      // Restore app language on boot
      AsyncStorage.getItem(LANGUAGE_KEY).then(langCode => {
        if (langCode) {
          i18n.changeLanguage(langCode);
        }
      }).catch(() => {});

      // Delay to ensure Activity is attached
      setTimeout(() => {
        getInsights(false).catch(e => {
          // completely swallow the error here so nothing bubbles up to the red box
        });
      }, 1000);
    }, []);


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
        await lm.init();
        setModelReady(true);
      } catch (e: any) {
        console.warn('Model init failed:', e?.message);
        // Don't block the UI — model may not be present yet
      } finally {
        setInitializing(false);
      }
    })();

    return () => {
      lm.destroy().catch(() => { });
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
  const handleLanguageContinue = useCallback(async (langCode: string) => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      await AsyncStorage.setItem(LANGUAGE_KEY, langCode);
      i18n.changeLanguage(langCode);
    } catch { }
    setFlow('main');
  }, []);

  // ── LLM text completion (shared) ───────────────────────────────────────────
  const llmCompleteText = useCallback(async (prompt: string, onToken?: (tok: string) => void): Promise<string> => {
    if (!modelReady) throw new Error('Model not ready');
    setIsGenerating(true);

    const messages: CactusLMMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    let acc = '';
    try {
      const result = await lm.complete({
        messages,
          options: {
            temperature: 0.3, // Lower temp for more deterministic language responses
            topP: 0.9,
            maxTokens: 512,
            telemetryEnabled: false,
          },
          onToken: tok => {
            acc += tok;
            if (onToken) onToken(tok);
          },
        });
      return result.response || acc;
    } finally {
      setIsGenerating(false);
    }
  }, [modelReady]);

  // ── LLM vision completion (for AI Eye) ────────────────────────────────────
  const llmCompleteVision = useCallback(async (prompt: string, imagePath: string, onToken?: (tok: string) => void): Promise<string> => {
    if (!modelReady) throw new Error('Model not ready');
    setIsGenerating(true);

    const messages: CactusLMMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt, images: [imagePath] },
    ];

    let acc = '';
    try {
      const result = await lm.complete({
        messages,
          options: {
            temperature: 0.3,
            topP: 0.9,
            maxTokens: 512,
            telemetryEnabled: false,
          },
          onToken: tok => {
            acc += tok;
            if (onToken) onToken(tok);
          },
        });
      return result.response || acc;
    } finally {
      setIsGenerating(false);
    }
  }, [modelReady]);

  // ── Render active tab ──────────────────────────────────────────────────────
  const renderScreen = () => {
    switch (activeTab) {
      case 'weather':
        return <WeatherScreen llmComplete={llmCompleteText} isLlmReady={modelReady} />;
      case 'aieye':
        return <AIEyeScreen llmComplete={llmCompleteVision} />;
      case 'doubts':
        return (
          <DoubtsScreen
            llmComplete={llmCompleteText}
            isLlmReady={modelReady}
          />
        );
      case 'radio':
        return (
          <LLMRadioScreen
            llmComplete={llmCompleteText}
            isLlmReady={modelReady}
          />
        );
      case 'settings':
        return <SettingsScreen />;
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
