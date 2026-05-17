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
import { CactusLM, type CactusLMMessage, type CactusLMTool } from 'cactus-react-native';
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
import IncompatibleScreen from './src/screens/IncompatibleScreen';
import { getInsights } from './src/services/InsightsService';
import { streamAudioVoiceResponse } from './src/services/audio';
import { ModelService } from './src/services/ModelService';
import { getFormattedWeatherSummary } from './src/services/WeatherService';
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

const SYSTEM_PROMPT_DOUBTS_WEATHER = `You are a professional agricultural expert specializing in crop management and soil sustainability. Analyze the provided [Current Weather Context] and {WEATHER_DATA} meticulously. Your objective is to deliver precise, actionable advice tailored to these specific conditions. It is absolutely mandatory that your final response consists of exactly between fifty and seventy words. Ensure every single word adds significant value to the farmer's decision-making process.`;

const SYSTEM_PROMPT_DOUBTS_GENERAL = `As a senior agricultural advisor, your task is to provide comprehensive and practical guidance to farmers regarding their daily operations. Drawing from your vast knowledge of sustainable farming and pest control, outline the exact steps a farmer must take to succeed. Your response must be strictly limited to a length between fifty and seventy words. Focus on being direct, helpful, and technically accurate in your professional recommendation.`;

const SYSTEM_PROMPT_RADIO =
  'You are a professional Agricultural Advisor. Create practical, step-by-step farming guides. ' +
  'Provide clear instructions for field activities. Use ONLY the NATIVE SCRIPT of the target language. ' +
  'Maintain a helpful, educational tone. Avoid radio-style intros, music cues, or dramatic hosting.';

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
type AppFlow = 'splash' | 'language' | 'onboarding' | 'main' | 'incompatible';

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

  // --- App Flow & Navigation State ---
  const [flow, setFlow] = useState<AppFlow>('splash');
  const [activeTab, setActiveTab] = useState<TabName>('weather');

  // --- LLM Engine & Hardware State ---
  const [modelReady, setModelReady] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [weatherData, setWeatherData] = useState<any>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);
  const [deviceSpecs, setDeviceSpecs] = useState({ ram: '0', cores: 0, processor: '' });
  const [incompatibleReason, setIncompatibleReason] = useState('');

  // --- Application Initialization ---
  // Restore language preference and load initial weather data on mount
  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_KEY).then(langCode => {
      if (langCode) i18n.changeLanguage(langCode);
    }).catch(() => { });

    loadWeatherData();
  }, []);

  /**
   * Fetches global weather insight data from the backend.
   *
   * Handles loading states and silently logs network errors to ensure
   * continuous offline capability using cached metrics.
   *
   * @param {boolean} [force=false] Set to true to bypass cache and force a network update.
   * @return {Promise<void>} Resolves when data fetching completes.
   */
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
  /**
   * Core initialization for the local CactusLM engine.
   * 1. Profiles device hardware (RAM, Cores)
   * 2. Calculates safe memory allocations
   * 3. Instantiates the LLM engine with dynamic configuration
   */
  useEffect(() => {
    (async () => {
      setInitializing(true);
      try {
        // 1. Get Real Hardware Specs
        const totalRam = await DeviceInfo.getTotalMemory();
        const usedRam = await DeviceInfo.getUsedMemory();
        const freeRamGB = (totalRam - usedRam) / (1024 * 1024 * 1024);

        let cores = 8;
        if (Platform.OS === 'android') {
          const { HardwareModule } = NativeModules;
          if (HardwareModule) {
            const specs = await HardwareModule.getHardwareSpecs();
            cores = specs.cpuCores;
          }
        } else {
          cores = 4;
        }

        const specs = {
          ram: freeRamGB.toFixed(1),
          cores: cores,
          processor: Platform.OS === 'android' ? 'Android ARM64' : 'Apple Silicon'
        };
        setDeviceSpecs(specs);

        // 2. Hardware Compatibility Check
        if (freeRamGB < 3) {
          console.warn('[AI] Device incompatible: Insufficient free RAM', freeRamGB.toFixed(1));
          setIncompatibleReason(`Your device has ${freeRamGB.toFixed(1)}GB free RAM available. GOFARMER requires at least 3GB of free RAM to run the local AI model safely.`);
          setFlow('incompatible');
          setInitializing(false);
          return;
        }

        // 3. Dynamic LM Configuration (No faking)
        console.log(`[AI] Configuring for ${cores} cores and ${freeRamGB.toFixed(1)}GB free RAM`);

        lm = new CactusLM({
          model: MODEL_NAME,
          corpusDir: CORPUS_PATH,
          options: { quantization: 'int4' },
          quantize: true,
          use_gpu: true,
          gpu_device: 0,
          offload_kqv: true,
          offload_all: freeRamGB > 6,
          flash_attn: true,
          n_threads: freeRamGB > 10 ? 8 : Math.min(5, cores),
          n_cores_physical: freeRamGB > 10 ? 8 : Math.min(5, cores),
          cpu_affinity: freeRamGB > 10 ? false : true,
          n_context: freeRamGB >= 8 ? 2000 : (freeRamGB >= 5 ? 1024 : 512),
          kv_cache_quantize: true,
          kv_cache_type: 'int4',
          use_mmap: true,
          use_pinned_memory: true,
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

          // Check if the model exists but is corrupted
          const exists = await ModelService.modelExists(MODEL_NAME);
          if (exists) {
            console.log('[AI] Model exists but failed to init. Marking as corrupted.');
            Alert.alert(
              'Model Corrupted',
              'The AI model file seems to be corrupted or incomplete. Would you like to delete it and re-download?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Repair & Re-download',
                  onPress: async () => {
                    await ModelService.deleteModel(MODEL_NAME);
                    setFlow('onboarding'); // Redirect to onboarding to trigger download
                  }
                }
              ]
            );
          }
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
    if (flow === 'incompatible') return;
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
  }, [flow]);

  // ── Handle language continue ───────────────────────────────────────────────
  const handleLanguageContinue = useCallback(async (langCode: string) => {
    // Mapping for interlinking app language and preferred content language
    const languageMappings: Record<string, { appLabel: string; contentLabel: string }> = {
      en: { appLabel: '🇬🇧 English', contentLabel: '🇬🇧 English' },
      hi: { appLabel: '🇮🇳 हिंदी', contentLabel: '🇮🇳 Hindi' },
      es: { appLabel: '🇪🇸 Español', contentLabel: '🇪🇸 Español' },
      fr: { appLabel: '🇫🇷 Français', contentLabel: '🇫🇷 Français' },
      zh: { appLabel: '🇨🇳 中文', contentLabel: '🇨🇳 Chinese' },
      ja: { appLabel: '🇯🇵 日本語', contentLabel: '🇯🇵 Japanese' },
      te: { appLabel: '🇮🇳 తెలుగు', contentLabel: '🇮🇳 Telugu' },
      kn: { appLabel: '🇮🇳 ಕನ್ನಡ', contentLabel: '🇮🇳 Kannada' },
      sv: { appLabel: '🇸🇪 Svenska', contentLabel: '🇸🇪 Swedish' },
      de: { appLabel: '🇩🇪 Deutsch', contentLabel: '🇩🇪 German' },
    };

    const mapping = languageMappings[langCode] || languageMappings.en;

    await i18n.changeLanguage(langCode);
    await AsyncStorage.setItem(LANGUAGE_KEY, langCode);

    // Auto-set labels for Settings synchronization
    await AsyncStorage.setItem('@GOFARMER_app_lang_label', mapping.appLabel);
    await AsyncStorage.setItem('@content_lang', mapping.contentLabel);

    setFlow('onboarding');
  }, [i18n]);

  /**
   * Checks the available free RAM before executing LLM inference.
   *
   * Verifies that the device currently has at least 2.5 GB of available memory
   * to ensure stable model execution without triggering thermal throttling,
   * excessive battery drain, or out-of-memory crashes. Alerts the user if RAM is low.
   *
   * @return {Promise<boolean>} True if sufficient memory is available or if the check fails; false otherwise.
   */
  const checkFreeRamBeforeInference = async (): Promise<boolean> => {
    try {
      const usedMem = await DeviceInfo.getUsedMemory();
      const totalMem = await DeviceInfo.getTotalMemory();
      const freeRamGB = (totalMem - usedMem) / (1024 * 1024 * 1024);
      if (freeRamGB < 2.5) {
        Alert.alert(
          'Limited RAM',
          'Sorry, I cannot find enough free RAM to fit this model (requires at least 2.5GB free to avoid heating and draining issues). Please close other apps and try again.'
        );
        return false;
      }
      return true;
    } catch (e) {
      return true;
    }
  };

  // ── Weather specialized completion ───────────────────────────────────────
  /**
   * Executes specialized LLM completion for weather-based agricultural consulting.
   *
   * Enforces specific contextual prompt boundaries, short response length, and
   * native script localization. Checks available memory prior to inference.
   *
   * @param {string} prompt The user query or weather report summary.
   * @param {function(string): void} [onToken] Streaming callback for output tokens.
   * @param {number[]} [audioData] Optional PCM audio samples for voice interaction.
   * @param {string} [systemPrompt] Optional customized system instruction overriding default.
   * @return {Promise<string>} The complete plain-text response string.
   */
  const llmCompleteWeather = useCallback(async (prompt: string, onToken?: (tok: string) => void, audioData?: number[], systemPrompt?: string): Promise<string> => {
    if (!modelReady || !lm) throw new Error('Model not ready');
    if (!(await checkFreeRamBeforeInference())) return '';
    setIsGenerating(true);
    try {
      const result = await lm.complete({
        messages: [
          { role: 'system', content: systemPrompt || SYSTEM_PROMPT_WEATHER },
          { role: 'user', content: prompt },
        ],
        audio: audioData,
        options: { temperature: 0.4, maxTokens: 512, enableThinking: false },
        onToken,
      });
      return result.response;
    } finally {
      setIsGenerating(false);
    }
  }, [modelReady]);

  // ── Doubts specialized completion ────────────────────────────────────────
  /**
   * Executes specialized LLM completion for farmer doubt resolution and general consulting.
   *
   * Optimizes parameters for highly deterministic advice on soil health, plant care,
   * and fertilizers. Supports multimodal context via leaf/plant images.
   *
   * @param {string} prompt The specific question or problem description.
   * @param {function(string): void} [onToken] Streaming callback for text tokens.
   * @param {number[]} [audioData] Optional raw audio bytes for voice input.
   * @param {string} [imagePath] Optional local filesystem path to an attached image.
   * @return {Promise<string>} The structured guidance generated by the engine.
   */
  const llmCompleteDoubts = useCallback(async (prompt: string, onToken?: (tok: string) => void, audioData?: number[], imagePath?: string, aiMode: 'general' | 'weather' = 'general'): Promise<string> => {
    if (!modelReady) throw new Error('Model not ready');
    if (!(await checkFreeRamBeforeInference())) return '';
    setIsGenerating(true);
    try {
      let systemPrompt = '';
      if (aiMode === 'general') {
        systemPrompt = SYSTEM_PROMPT_DOUBTS_GENERAL;
      } else {
        // Proactively fetch weather and inject it into the prompt instead of relying on tool calling
        const weatherData = await getFormattedWeatherSummary();
        systemPrompt = SYSTEM_PROMPT_DOUBTS_WEATHER.replace('{WEATHER_DATA}', weatherData);
      }

      const messages: CactusLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ];

      if (imagePath) {
        (messages[1] as any).images = [imagePath];
      }

      const result = await lm.complete({
        messages,
        audio: audioData,
        options: { temperature: 0.1, maxTokens: 512, topP: 0.9, topK: 40 },
        onToken,
      });

      return (result.response || '').trim();
    } finally {
      setIsGenerating(false);
    }
  }, [modelReady]);


  // ── Radio specialized completion ─────────────────────────────────────────
  const [radioGen, setRadioGen] = useState({
    generating: false,
    step: '',
    pct: 0,
    tokens: 0
  });

  /**
   * Orchestrates the multi-step background script generation for Expert Guides.
   *
   * Drives UI processing feedback through sequential state progression while forcing
   * the LLM to output native script plain-text devoid of markdown symbols.
   *
   * @param {string} topic The target agricultural topic for the guide.
   * @param {{label: string, code: string}} lang Target language metadata object.
   * @param {string} style Desired presentation style (e.g., educational, narrative).
   * @param {function(object): void} onDone Callback invoked with the persisted podcast object upon completion.
   * @param {number[]} [audioData] Optional base input audio data.
   * @return {Promise<void>} Resolves when generation and background serialization complete.
   */
  const startRadioGeneration = useCallback(async (topic: string, lang: { label: string, code: string }, style: string, onDone: (podcast: any) => void, audioData?: number[]) => {
    if (!modelReady || radioGen.generating) return;
    if (!(await checkFreeRamBeforeInference())) return;

    setRadioGen({ generating: true, step: 'radio.creating_script', pct: 20, tokens: 0 });

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

    try {
      const targetLangStr = lang.label.replace(/[^\w\s]/g, '').trim();

      let rawResponseText = '';
      let tokenCount = 0;
      const handleRadioToken = (tok: string) => {
        tokenCount++;
        if (tokenCount % 2 === 0 || tokenCount < 10) {
          setRadioGen(prev => ({ ...prev, tokens: tokenCount }));
        }
      };

      if (audioData) {
        const baseSystemPrompt = `You are an Expert Agricultural Advisor. Generate an educational, highly practical, and helpful advisory podcast script in a ${style.toLowerCase()} style answering the farmer's audio query.`;
        const fullSystemPrompt = `${baseSystemPrompt}\n\nSTRICT RULE: You MUST answer ENTIRELY in the following language: ${targetLangStr}, generating ONLY native ${targetLangStr} words written strictly in the native script of ${targetLangStr} (e.g., Telugu script for Telugu). NO English alphabet transliteration. DO NOT use markdown symbols.`;

        rawResponseText = await streamAudioVoiceResponse(
          fullSystemPrompt,
          audioData,
          handleRadioToken,
          lm
        );
      } else {
        const prompt =
          `You are a professional agricultural advisor. Generate a practical ${style.toLowerCase()} farming guide about "${topic}" for Indian farmers.\n` +
          `Language: ${targetLangStr}\n` +
          `CRITICAL REQUIREMENTS:\n` +
          `- USE ONLY PLAIN TEXT AND NUMBERS. NO MARKDOWN (no #, *, -, etc.).\n` +
          `- USE ONLY THE NATIVE SCRIPT of the language (${targetLangStr} script for ${targetLangStr}). NO transliteration.\n` +
          `- Use practical examples to help the farmer understand the concepts clearly.\n` +
          `- Keep it concise and conversational.\n` +
          `- Start with a warm introduction.\n` +
          `- Provide actionable advice.\n` +
          `- End with a motivational close.\n` +
          `Generate the full script now (NATIVE SCRIPT ONLY, NO MARKDOWN):`;

        const response = await lm.complete({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT_RADIO },
            { role: 'user', content: prompt } as any,
          ],
          options: { temperature: 0.7, maxTokens: 600, topP: 0.9, topK: 40 },
          onToken: handleRadioToken,
        });
        rawResponseText = response.response;
      }

      const cleanScript = rawResponseText.replace(/[#*`]/g, '').trim();
      const sentences = cleanScript.split(/([.!?])\s+/).reduce((acc: string[], cur, i, arr) => {
        if (i % 2 === 0) {
          const punctuation = arr[i + 1] || '';
          acc.push(cur + punctuation);
        }
        return acc;
      }, []).filter(s => s.trim().length > 0);

      // Extract most repetitive, unique content words to create a meaningful title
      const stopWords = new Set(['the', 'and', 'for', 'with', 'you', 'this', 'that', 'from', 'your', 'have', 'what', 'some', 'very', 'also', 'will', 'can', 'are', 'not', 'but', 'how', 'when', 'who', 'out', 'into', 'about', 'they', 'them', 'their', 'has', 'was', 'were', 'been', 'much', 'more', 'upon', 'only', 'should', 'could', 'would']);
      const allWords = cleanScript.split(/[\s.,!?()\[\]{}:;"'—`*#]+/).filter(w => w.length >= 4 && !stopWords.has(w.toLowerCase()));

      const counts: { [key: string]: number } = {};
      allWords.forEach(w => { counts[w] = (counts[w] || 0) + 1; });

      const sortedDistinctWords = Object.keys(counts).sort((a, b) => {
        if (counts[b] !== counts[a]) return counts[b] - counts[a];
        return b.length - a.length;
      });

      const topWords = sortedDistinctWords.slice(0, 4);
      let snippet = topWords.join(' ');
      if (!snippet || snippet.length < 4) {
        snippet = `${topic} — ${style}`;
      } else {
        snippet = snippet.replace(/\b\w/g, c => c.toUpperCase());
      }

      const newPodcast = {
        id: Date.now().toString(),
        title: snippet,
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

      setRadioGen({ generating: false, step: 'radio.done', pct: 100, tokens: tokenCount });
      if (onDone) onDone(newPodcast);
    } catch (e) {
      setRadioGen({ generating: false, step: '', pct: 0, tokens: 0 });
      throw e;
    }
  }, [modelReady, radioGen.generating]);

  /**
   * Executes direct text generation for the Expert Guides engine.
   *
   * Configures long-form generation parameters tailored for scripting workflows.
   *
   * @param {string} prompt The complete, structured script generation instruction set.
   * @param {function(string): void} [onToken] Token-by-token update callback.
   * @return {Promise<string>} The generated plain-text script.
   */
  const llmCompleteRadio = useCallback(async (prompt: string, onToken?: (tok: string) => void): Promise<string> => {
    if (!modelReady) throw new Error('Model not ready');
    if (!(await checkFreeRamBeforeInference())) return '';
    setIsGenerating(true);
    try {
      const result = await lm.complete({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_RADIO },
          { role: 'user', content: prompt },
        ],
        options: { temperature: 0.7, maxTokens: 600, topP: 0.9, topK: 40 },
        onToken,
      });
      return result.response;
    } finally {
      setIsGenerating(false);
    }
  }, [modelReady]);


  // ── LLM vision completion (for AI Eye) ────────────────────────────────────
  /**
   * Executes multimodal plant pathology analysis via the LLM Vision pipeline.
   *
   * Processes leaf images alongside textual symptoms to provide rapid diagnoses
   * and actionable RAG-assisted remedies directly in the user's selected language.
   *
   * @param {string} prompt Supplemental prompt or symptom description.
   * @param {string} imagePath Absolute path to the captured or selected plant image.
   * @param {{onToken?: function(string): void}} callbacks Container for execution lifecycle callbacks.
   * @return {Promise<{response: string}>} Object containing the final diagnosis response string.
   */
  const llmCompleteVision = useCallback(async (
    prompt: string,
    imagePath: string,
    callbacks: {
      onToken?: (tok: string) => void,
    }
  ): Promise<{ response: string }> => {
    if (!modelReady) throw new Error('Model not ready');
    if (!(await checkFreeRamBeforeInference())) return { response: '' };
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
          topP: 0.9,
          topK: 40,
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
        return <DoubtsScreen llmComplete={llmCompleteDoubts} isLlmReady={modelReady} lm={lm} />;
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

  if (flow === 'incompatible') {
    return <IncompatibleScreen reason={incompatibleReason} specs={deviceSpecs} />;
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
