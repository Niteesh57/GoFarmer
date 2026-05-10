import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator, StatusBar, Modal, TextInput, PermissionsAndroid, Platform
} from 'react-native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AudioRecord from 'react-native-audio-record';
import Tts from 'react-native-tts';
import Markdown from 'react-native-markdown-display';
import TopAppBar from '../components/TopAppBar';
import { VoiceWaveform } from '../components/VoiceWaveform';
import { Colors, Typography, Spacing, Radius } from '../theme/theme';
import { getInsights } from '../services/InsightsService';
import { getLangCode } from '../utils/langHelper';

// Helper to map WMO weather codes to emojis
const getWeatherEmoji = (code: number) => {
  if (code <= 3) return '☀️'; // Clear/partly cloudy
  if (code <= 49) return '🌫️'; // Fog
  if (code <= 69) return '🌧️'; // Drizzle/Rain
  if (code <= 79) return '❄️'; // Snow
  if (code <= 99) return '⛈️'; // Thunderstorm
  return '☁️';
};

const getWeatherText = (code: number, t: any) => {
  if (code <= 3) return t('weather.condition.clear', 'Clear');
  if (code <= 49) return t('weather.condition.foggy', 'Foggy');
  if (code <= 69) return t('weather.condition.rainy', 'Rainy');
  if (code <= 79) return t('weather.condition.snowy', 'Snowy');
  if (code <= 99) return t('weather.condition.stormy', 'Stormy');
  return t('weather.condition.cloudy', 'Cloudy');
};

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

// ─── Constants ────────────────────────────────────────────────────────────────
const CROPS_KEY = '@user_crops';
const HISTORY_KEY = '@advisor_history_v2';
const ADVISORY_KEY = '@weather_advisory_v1';
const DEFAULT_CROPS: string[] = [];

interface WeatherScreenProps {
  llmComplete?: (prompt: string, onToken?: (tok: string) => void, audioData?: number[]) => Promise<string>;
  isLlmReady?: boolean;
  weatherDataProp?: any;
  isLoadingProp?: boolean;
  refreshWeather?: () => void;
}

export default function WeatherScreen({ 
  llmComplete, 
  isLlmReady, 
  weatherDataProp, 
  isLoadingProp, 
  refreshWeather 
}: WeatherScreenProps) {
  const { t, i18n } = useTranslation();
  const [crops, setCrops] = useState<string[]>(DEFAULT_CROPS);
  const [activeCrop, setActiveCrop] = useState('');
  const [detailModal, setDetailModal] = useState<string | null>(null);

  const [weatherData, setWeatherData] = useState<any>(weatherDataProp);
  const [isLoading, setIsLoading] = useState(isLoadingProp && !weatherDataProp);
  const [error, setError] = useState<string | null>(null);

  // Consultant state
  const [isAdvising, setIsAdvising] = useState(false);
  const [advisorResult, setAdvisorResult] = useState<string | null>(null);
  
  // Weekly/Long-term Advisory state
  const [advisoryPlan, setAdvisoryPlan] = useState<string | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  
  const scrollViewRef = useRef<ScrollView>(null);
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [advisorHistory, setAdvisorHistory] = useState<any[]>([]);
  const [searchCrop, setSearchCrop] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const audioChunksRef = useRef<string[]>([]);

  useEffect(() => {
    if (weatherDataProp) {
      setWeatherData(weatherDataProp);
    }
  }, [weatherDataProp]);

  useEffect(() => {
    setIsLoading(!!isLoadingProp && !weatherDataProp);
  }, [isLoadingProp, weatherDataProp]);

  const loadData = async (forceUpdate = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getInsights(forceUpdate);
      setWeatherData(data);
    } catch (err: any) {
      // Don't show red error screen if we have cached data, just ignore network error silently
      if (weatherData) {
        console.info('Silently failed to update weather:', err.message);
      } else {
        setError(err.message || 'Failed to fetch weather data.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    AsyncStorage.getItem('@GOFARMER_selected_voice').then(v => {
      if (v) setSelectedVoice(v);
    });
    
    loadCrops();
    loadAdvisory();

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

  const toggleRecording = async () => {
    if (isRecording) {
      setIsRecording(true); // Keep UI in recording state for a moment
      const audioFile = await AudioRecord.stop();
      setIsRecording(false);
      
      const fullB64 = audioChunksRef.current.join('');
      const pcmData = base64ToPcm(fullB64);
      audioChunksRef.current = [];

      if (pcmData.length < 100) {
        return;
      }

      setIsAdvising(true);
      setAdvisorResult('');
      Tts.stop();

      try {
        const timeseries = weatherData?.timeseries?.daily || {};
        const weatherSummary = timeseries.dates?.slice(0, 7).map((d: string, i: number) => 
          `${d}: Max ${timeseries.temp_max[i]}°C, Rain ${timeseries.rainfall[i]}mm, Wind ${timeseries.wind_speed[i]}km/h`
        ).join('; ');

        const savedLang = await AsyncStorage.getItem('@content_lang');
        let contentLangStr = 'English';
        if (savedLang) {
          contentLangStr = savedLang.replace(/[^\w\s]/g, '').trim();
        } else {
          contentLangStr = i18n.language === 'hi' ? 'Hindi' : 'English';
        }

        const prompt = `Context:
- Active Crop: ${activeCrop || 'General Farm'}
- 7-Day Weather: ${weatherSummary}

The farmer is asking for advice via voice. Answer in ${contentLangStr}.`;

        let ttsBuffer = '';
        let isFirstToken = true;

        const response = await llmComplete?.(prompt, (token) => {
          if (isFirstToken) {
            setIsAdvising(false);
            isFirstToken = false;
          }
          setAdvisorResult(prev => (prev || '') + token);
          ttsBuffer += token;
          if (/[.,!?\n]/.test(token) || ttsBuffer.length > 50) {
            const chunkToSpeak = ttsBuffer.trim().replace(/[*#_~]/g, '');
            if (chunkToSpeak.length > 1) {
              Tts.speak(chunkToSpeak);
            }
            ttsBuffer = '';
          }
        }, pcmData);
        
        if (ttsBuffer.trim().length > 1) Tts.speak(ttsBuffer.trim().replace(/[*#_~]/g, ''));

      } catch (err) {
        console.error('Advisor Error:', err);
      } finally {
        setIsAdvising(false);
      }
    } else {
      if (Platform.OS === 'android') {
        try {
          const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            console.log('Microphone permission denied');
            return;
          }
          // IMPORTANT: Give the OS a moment to register the permission grant
          // This prevents crashes on high-end devices like Snapdragon 8 Gen 2/3
          await new Promise(r => setTimeout(r, 400));
        } catch (err) {
          console.warn(err);
          return;
        }
      }
      
      audioChunksRef.current = [];
      try {
        // Always re-init right before starting to ensure we have a fresh, valid native object
        AudioRecord.init({ 
          sampleRate: 16000, 
          channels: 1, 
          bitsPerSample: 16, 
          audioSource: 1 
        });
        
        // Small additional delay to ensure hardware is ready after init
        await new Promise(r => setTimeout(r, 100));
        
        await AudioRecord.start();
        setIsRecording(true);
        AudioRecord.on('data', (data) => {
          audioChunksRef.current.push(data);
        });
      } catch (e) {
        console.error('Failed to start recording:', e);
      }
    }
  };

  const loadCrops = async () => {
    try {
      // 1. Try to load the specific active crop from settings
      const currentActive = await AsyncStorage.getItem('@active_crop');
      if (currentActive) {
        setActiveCrop(currentActive);
      }

      // 2. Load the crop list (legacy/advisor support)
      const stored = await AsyncStorage.getItem(CROPS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setCrops(parsed);
        if (!currentActive && parsed.length > 0) setActiveCrop(parsed[0]);
      }
    } catch (e) {}
  };

  const loadHistory = async () => {
    try {
      const history = await AsyncStorage.getItem(HISTORY_KEY);
      if (history) setAdvisorHistory(JSON.parse(history));
    } catch (e) {}
  };
  
  const loadAdvisory = async () => {
    try {
      const saved = await AsyncStorage.getItem(ADVISORY_KEY);
      if (saved) setAdvisoryPlan(saved);
    } catch (e) {}
  };

  const getNext7Days = () => {
    if (!weatherData?.timeseries?.daily?.dates) return [];
    return weatherData.timeseries.daily.dates.slice(0, 7);
  };

  const handleGenerateAdvisory = async () => {
    if (!llmComplete || !isLlmReady || !weatherData) return;
    
    setIsGeneratingPlan(true);
    setAdvisoryPlan(''); // Clear previous
    Tts.stop();

    try {
      const timeseries = weatherData?.timeseries?.daily || {};
      const weatherSummary = timeseries.dates?.slice(0, 7).map((d: string, i: number) => 
        `${d}: Max ${timeseries.temp_max[i]}°C, Rain ${timeseries.rainfall[i]}mm, Wind ${timeseries.wind_speed[i]}km/h (Gusts ${timeseries.wind_gusts[i]}km/h)`
      ).join('; ');

      const savedLang = await AsyncStorage.getItem('@content_lang');
      
      // Safe resolution of language name
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
      
      const prompt = `You are a professional agronomist. The user has a ${activeCrop || 'general'} farm. 
Here is the 7-day weather forecast: ${weatherSummary}.

Create a concise agricultural advisory plan for ONLY the next 7 days.
Focus on:
1. **Weekly Outlook**: What are the "good things" or opportunities this week?
2. **Specific Actions**: What should the farmer be doing each day?
3. **Risk Analysis for ${activeCrop || 'Crops'}**: If the farmer has ${activeCrop || 'crops'} (like tomatoes), what are the specific risks (e.g., wind, pests, rain)?
4. **Environmental Readiness**: Will the farmer be ready for upcoming changes? Analyze wind, drastic temperature shifts, or other hazards.
5. **Issues & Timeframe**: Identify any specific issues and exactly when they will occur.
6. Keep the response concise, actionable, and professional.

Respond ENTIRELY in ${contentLangStr}. Use Markdown for formatting.`;

      let fullResponse = '';
      const response = await llmComplete(prompt, (token) => {
        setAdvisoryPlan(prev => (prev || '') + token);
        fullResponse += token;
      });
      
      await AsyncStorage.setItem(ADVISORY_KEY, fullResponse);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const handleAskAdvisor = async () => {
    if (!llmComplete || !isLlmReady) {
      setAdvisorResult(t('advisor.not_ready'));
      return;
    }
    if (!searchCrop.trim()) {
      setAdvisorResult(t('advisor.enter_crop'));
      return;
    }
    if (!selectedDate) {
      setAdvisorResult(t('advisor.select_date_error'));
      return;
    }

    setIsAdvising(true);
    Tts.stop();

    try {
      const timeseries = weatherData?.timeseries?.daily || {};
      const weatherSummary = timeseries.dates?.slice(0, 7).map((d: string, i: number) => 
        `${d}: Max ${timeseries.temp_max[i]}°C, Rain ${timeseries.rainfall[i]}mm, Wind ${timeseries.wind_speed[i]}km/h`
      ).join('; ');

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

      const prompt = `You are an expert technical farmer adviser. The user wants to plant ${searchCrop} on ${selectedDate}. 
Here is the daily weather data for the region over the next 7 days:
${weatherSummary}

Is this crop suitable for this weather and region? If not, suggest a suitable plant which suits the situation.
CRITICAL RULES:
1. Provide a highly accurate, narrow, short, and direct answer. Do not use filler words.
2. You MUST answer ENTIRELY in the following language: ${contentLangStr}.`;

      let ttsBuffer = '';
      let isFirstChunk = true;

      const response = await llmComplete(prompt, (token) => {
        setAdvisorResult(prev => (prev || '') + token);
        ttsBuffer += token;
        if (/[.,!?\n]/.test(token) || ttsBuffer.length > 60) {
          const chunkToSpeak = ttsBuffer.trim();
          if (chunkToSpeak.length > 1) {
            Tts.speak(chunkToSpeak);
          }
          ttsBuffer = '';
        }
      });
      
      if (ttsBuffer.trim().length > 1) Tts.speak(ttsBuffer.trim());
      
      const newHistoryItem = {
        id: Date.now().toString(),
        crop: searchCrop,
        date: selectedDate,
        result: response
      };
      const updatedHistory = [newHistoryItem, ...advisorHistory].slice(0, 10);
      setAdvisorHistory(updatedHistory);
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));

      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 500);

    } catch (err) {
      console.error(err);
    } finally {
      setIsAdvising(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.flex, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ marginTop: 10, ...Typography.bodyMd, color: Colors.onBackground }}>{t('common.loading_insights')}</Text>
      </View>
    );
  }

  if (error && !weatherData) {
    // We only show error UI if we have absolutely no cache data to fall back on.
    // However, we want to allow users to use the rest of the app offline.
    // Render an offline state instead of blocking the whole screen.
    return (
      <View style={styles.flex}>
        <TopAppBar />
        <View style={[styles.flex, { justifyContent: 'center', alignItems: 'center', padding: Spacing.xl }]}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>📡</Text>
          <Text style={{ ...Typography.titleMd, color: Colors.onBackground, marginBottom: 10 }}>{t('weather.offline_title')}</Text>
          <Text style={{ ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center', marginBottom: 20 }}>
            {t('weather.offline_desc')}
          </Text>
          <TouchableOpacity style={{ paddingHorizontal: 20, paddingVertical: 12, backgroundColor: Colors.primary, borderRadius: Radius.full }} onPress={refreshWeather || (() => loadData(true))}>
            <Text style={{ color: Colors.onPrimary, fontWeight: 'bold' }}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const timeseries = weatherData?.timeseries?.daily || {};
  const insights = weatherData?.insights?.advanced_insights || {};

  const dates = timeseries.dates || [];
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  let todayIndex = dates.indexOf(todayStr);
  const isDataToday = todayIndex !== -1;
  
  // If today not found, try to find the latest available date or fallback to 0
  if (!isDataToday) {
    todayIndex = dates.length > 0 ? dates.length - 1 : 0;
  }

  // Build dynamic 7-day forecast starting from today if possible
  const forecastStart = isDataToday ? todayIndex : 0;
  const dynamicForecast = dates.slice(forecastStart, forecastStart + 7).map((dateStr: string, idx: number) => {
    const absoluteIdx = forecastStart + idx;
    const d = new Date(dateStr);
    const dayName = absoluteIdx === todayIndex && isDataToday ? t('common.today') : d.toLocaleDateString(i18n.language === 'hi' ? 'hi-IN' : 'en-US', { weekday: 'short' });
    return {
      day: dayName,
      icon: getWeatherEmoji(timeseries.weather_code[absoluteIdx]),
      high: Math.round(timeseries.temp_max[absoluteIdx]),
      low: Math.round(timeseries.temp_min[absoluteIdx]),
    };
  }) || [];

  // Build dynamic rainfall chart starting from today if possible
  const rainfallStart = isDataToday ? todayIndex : 0;
  const dynamicRainfall = dates.slice(rainfallStart, rainfallStart + 5).map((dateStr: string, idx: number) => {
    const absoluteIdx = rainfallStart + idx;
    const d = new Date(dateStr);
    const dayLabel = absoluteIdx === todayIndex && isDataToday ? t('common.today').substring(0,3) : d.toLocaleDateString(i18n.language === 'hi' ? 'hi-IN' : 'en-US', { weekday: 'short' });
    return {
      label: dayLabel,
      pct: Math.round(timeseries.precip_probability[absoluteIdx] || 0)
    };
  }) || [];

  // Build dynamic temp trend (7 days)
  const dynamicTempTrend = dates.slice(0, 7).map((dateStr: string, idx: number) => {
    const high = timeseries.temp_max[idx] || 0;
    const low = timeseries.temp_min[idx] || 0;
    const minRange = 10;
    const maxRange = 45;
    const range = maxRange - minRange;
    return {
      bottom: ((low - minRange) / range) * 100,
      height: ((high - low) / range) * 100,
      isToday: dateStr === todayStr
    };
  });

  // Build dynamic insights array using same styling scheme
  const dynamicInsights = [
    {
      icon: '💧', title: t('insights.irrigation'), value: insights.irrigation_scheduler?.next_irrigation_days === 0 ? t('insights.due_today') : t('insights.in_days', { count: insights.irrigation_scheduler?.next_irrigation_days }),
      bg: Colors.surfaceContainer, border: Colors.outlineVariant,
      valueBold: true, valueColor: Colors.primary,
      detail: `Irrigation Recommendation\n\nNext due in: ${insights.irrigation_scheduler?.next_irrigation_days} days\nRecommended: ${insights.irrigation_scheduler?.required_water_mm || 0} mm\nSoil moisture: ${insights.moisture?.status || 'Unknown'} (${insights.moisture?.value || 0}%)\n\nAction: Wait or irrigate based on schedule.`,
    },
    {
      icon: '🧪', title: t('insights.fertilizer_advisor'), value: insights.fertilizer_advisor?.status || 'Unknown',
      bg: '#E8F5E9', border: '#C8E6C9',
      valueBold: true, valueColor: '#2E7D32',
      detail: `${t('insights.fertilizer_advisor')}\n\n${t('insights.status')}: ${insights.fertilizer_advisor?.status}\n\n${t('insights.message')}: ${insights.fertilizer_advisor?.message}`,
    },
    {
      icon: '🌊', title: t('insights.spray_risk'), value: insights.spray_advisor?.status || 'Unknown',
      bg: Colors.errorContainer, border: Colors.error + '33',
      valueBold: true, valueColor: Colors.onErrorContainer,
      detail: `Spray Risk Alert\n\nCondition: ${insights.spray_advisor?.status || 'Unknown'}\nReason: ${insights.spray_advisor?.message || 'Check conditions.'}`,
    },
    {
      icon: '🐛', title: t('insights.pest_risk'), value: insights.pest_risk?.status || 'Unknown',
      bg: Colors.secondaryContainer, border: Colors.secondary + '33',
      valueBold: true, valueColor: Colors.onSecondaryContainer,
      detail: `Pest Risk Assessment\n\nRisk Level: ${insights.pest_risk?.status || 'Unknown'}\nReason: ${insights.pest_risk?.message || 'Check humidity & temp.'}`,
    },
    {
      icon: '🌱', title: t('insights.crop_advisory'), value: insights.crop_advisory?.germination || 'Unknown',
      bg: '#FFF3E0', border: '#FFE0B2',
      valueBold: true, valueColor: '#E65100',
      detail: `${t('insights.crop_advisory')}\n\n${t('insights.germination')}: ${insights.crop_advisory?.germination}\n${t('insights.flowering')}: ${insights.crop_advisory?.flowering}\n${t('insights.harvest')}: ${insights.crop_advisory?.harvest}`,
    },
    {
      icon: '📈', title: t('insights.yield_risk'), value: insights.yield_risk?.rating || 'Unknown',
      bg: Colors.surfaceContainerLow, border: Colors.primary + '44',
      valueBold: true, valueColor: Colors.primary,
      detail: `Yield Assessment\n\nStatus: ${insights.yield_risk?.rating || 'Unknown'} ✅\nYield Score: ${insights.yield_risk?.score || 0}/100\n\n${insights.dashboard?.action || 'Good window for farming actions.'}`,
    },
  ];

  const todayWeatherCode = timeseries.weather_code?.[todayIndex] || 0;
  const todayMaxTemp = timeseries.temp_max?.[todayIndex] || 0;
  const todayMinTemp = timeseries.temp_min?.[todayIndex] || 0;
  const todayAvgTemp = timeseries.temp_avg?.[todayIndex] || 0;
  const todayWindSpeed = timeseries.wind_speed?.[todayIndex] || 0;
  const todayWindGusts = timeseries.wind_gusts?.[todayIndex] || 0;
  const todayHumidity = insights.air_humidity?.value || 0;
  const humidityStatus = insights.air_humidity?.status || '';

  // Soil and environmental data
  const soilData = weatherData?.timeseries?.soil_and_temp || {};
  const todaySoilMoisture = soilData.soil_moisture_surface?.[todayIndex] || 0;
  const todayRootMoisture = soilData.soil_moisture_root?.[todayIndex] || 0;
  const todayRadiation = soilData.radiation?.[todayIndex] || 0;
  const todayET0 = timeseries.et0?.[todayIndex] || 0;
  const todayVPD = soilData.vpd?.[todayIndex] || 0;
  const todaySunshine = timeseries.sunshine_duration?.[todayIndex] || 0;

  return (
    <View style={styles.flex}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <TopAppBar />

      <ScrollView
        ref={scrollViewRef}
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Title row */}
        <View style={styles.titleRow}>
          <View style={styles.titleLeft}>
            <Text style={styles.pageTitle}>{t('weather.title')}</Text>
            <TouchableOpacity style={styles.refreshBtn} onPress={refreshWeather || (() => loadData(true))}>
              <Text style={{ fontSize: 16 }}>↻</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.locationChip}>
            <Text style={styles.locationPin}>📍</Text>
            <Text style={styles.locationText}>{t('common.my_farm')}</Text>
          </View>
        </View>

        {/* Crop chips */}
        {crops.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsContent}>
            {crops.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, c === activeCrop && styles.chipActive]}
                onPress={() => setActiveCrop(c)}
              >
                <Text style={[styles.chipText, c === activeCrop && styles.chipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* AI Advisory Plan Card (New) */}
        <View style={styles.advisoryActionCard}>
          <View style={styles.advisoryHeader}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: Spacing.sm}}>
              <Text style={styles.advisoryTitle}>{t('weather.ai_advisory')}</Text>
            </View>
            <TouchableOpacity 
              style={[styles.advisoryBtn, (!isLlmReady || isGeneratingPlan) && {opacity: 0.5}]} 
              onPress={handleGenerateAdvisory}
              disabled={!isLlmReady || isGeneratingPlan}
            >
              {isGeneratingPlan ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Text style={styles.advisoryBtnText}>{t('weather.generate_plan')}</Text>
              )}
            </TouchableOpacity>
          </View>
          
          {advisoryPlan ? (
            <View style={styles.advisoryContent}>
              <Markdown style={markdownStyles}>
                {advisoryPlan}
              </Markdown>
            </View>
          ) : (
            <Text style={styles.advisoryPlaceholder}>
              {t('weather.advisory_placeholder')}
            </Text>
          )}
        </View>

        {/* Main weather card */}
        <View style={styles.mainCard}>
          <View style={styles.mainCardOverlay} />
          <View style={styles.mainCardContent}>
            <View style={styles.mainCardLeft}>
              <Text style={styles.weatherDate}>{t('common.today')}, {new Date().toLocaleDateString(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', { month: 'short', day: 'numeric' })}</Text>
              <Text style={styles.temperature}>{Math.round(todayAvgTemp)}<Text style={styles.tempUnit}>°C</Text></Text>
            </View>
            <View style={styles.mainCardRight}>
              <Text style={styles.weatherEmoji}>{getWeatherEmoji(todayWeatherCode)}</Text>
              <Text style={styles.weatherCondition}>{getWeatherText(todayWeatherCode, t)}</Text>
            </View>
          </View>
          <View style={styles.weatherStats}>
            <View style={styles.statItem}>
              <Text style={styles.statIcon}>💧</Text>
              <Text style={styles.statText} numberOfLines={1} adjustsFontSizeToFit>{todayHumidity}% {t('weather.humidity')} ({humidityStatus})</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statIcon}>💨</Text>
              <Text style={styles.statText} numberOfLines={1} adjustsFontSizeToFit>{todayWindSpeed} km/h {t('weather.wind')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statIcon}>🌡</Text>
              <Text style={styles.statText} numberOfLines={1} adjustsFontSizeToFit>{t('weather.high')} {Math.round(todayMaxTemp)}°  {t('weather.low')} {Math.round(todayMinTemp)}°</Text>
            </View>
          </View>
        </View>

        {/* 7-day forecast */}
        <View>
          <Text style={styles.sectionTitle}>{t('weather.next_7_days')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.forecastRow}>
            {dynamicForecast.map((f: any, i: number) => (
              <View key={i} style={[styles.forecastCard, i === 0 && styles.forecastCardToday]}>
                <Text style={[styles.forecastDay, i === 0 && styles.forecastDayToday]}>{f.day}</Text>
                <Text style={styles.forecastIcon}>{f.icon}</Text>
                <Text style={styles.forecastTemp}>
                  <Text style={{ fontWeight: '700' }}>{f.high}°</Text>
                  <Text style={{ color: Colors.onSurfaceVariant }}> {f.low}°</Text>
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Insights */}
        <View>
          <View style={styles.insightHeader}>
            <Text style={styles.sectionTitle}>{t('weather.farm_insights')}</Text>
            {activeCrop ? <Text style={styles.insightCropLabel}>📌 {activeCrop}</Text> : null}
          </View>
          <View style={styles.insightGrid}>
            {dynamicInsights.map((ins, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.insightCard, { backgroundColor: ins.bg, borderColor: ins.border }]}
                onPress={() => setDetailModal(ins.detail)}
                activeOpacity={0.85}
              >
                <View style={styles.insightTop}>
                  <Text style={styles.insightIcon}>{ins.icon}</Text>
                  <Text style={styles.insightTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{ins.title}</Text>
                </View>
                <Text style={[styles.insightValue, { color: ins.valueColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{ins.value}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Soil & Environment Detailed Card */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>{t('weather.soil_conditions')}</Text>
            {!isDataToday && (
              <TouchableOpacity style={styles.updateInlineBtn} onPress={refreshWeather || (() => loadData(true))}>
                <Text style={styles.updateInlineText}>⚠️ {t('common.retry')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {isDataToday ? (
            <View style={styles.soilGrid}>
              <View style={styles.soilItem}>
                <Text style={styles.soilIcon}>🪴</Text>
                <View style={styles.flexShrink}>
                  <Text style={styles.soilLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{t('weather.soil_moisture')}</Text>
                  <Text style={styles.soilValue} numberOfLines={1}>{(todaySoilMoisture * 100).toFixed(1)}%</Text>
                </View>
              </View>
              <View style={styles.soilItem}>
                <Text style={styles.soilIcon}>🌳</Text>
                <View style={styles.flexShrink}>
                  <Text style={styles.soilLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{t('weather.root_moisture')}</Text>
                  <Text style={styles.soilValue} numberOfLines={1}>{(todayRootMoisture * 100).toFixed(1)}%</Text>
                </View>
              </View>
              <View style={styles.soilItem}>
                <Text style={styles.soilIcon}>☀️</Text>
                <View style={styles.flexShrink}>
                  <Text style={styles.soilLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{t('weather.radiation')}</Text>
                  <Text style={styles.soilValue} numberOfLines={1} adjustsFontSizeToFit>{Math.round(todayRadiation)} {t('weather.wm2')}</Text>
                </View>
              </View>
              <View style={styles.soilItem}>
                <Text style={styles.soilIcon}></Text>
                <View style={styles.flexShrink}>
                  <Text style={styles.soilLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{t('weather.evapotranspiration')}</Text>
                  <Text style={styles.soilValue} numberOfLines={1} adjustsFontSizeToFit>{todayET0.toFixed(2)} {t('weather.mm')}</Text>
                </View>
              </View>
              <View style={styles.soilItem}>
                <Text style={styles.soilIcon}>⚡️</Text>
                <View style={styles.flexShrink}>
                  <Text style={styles.soilLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{t('weather.vpd')}</Text>
                  <Text style={styles.soilValue} numberOfLines={1} adjustsFontSizeToFit>{todayVPD.toFixed(2)} {t('weather.kpa')}</Text>
                </View>
              </View>
              <View style={styles.soilItem}>
                <Text style={styles.soilIcon}>⏳</Text>
                <View style={styles.flexShrink}>
                  <Text style={styles.soilLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{t('weather.sunshine')}</Text>
                  <Text style={styles.soilValue} numberOfLines={1} adjustsFontSizeToFit>{todaySunshine.toFixed(1)} {t('weather.hours')}</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.staleContainer}>
              <Text style={styles.staleText}>{t('weather.stale_soil_data')}</Text>
              <TouchableOpacity style={styles.bigUpdateBtn} onPress={() => loadData(true)}>
                <Text style={styles.bigUpdateBtnText}>{t('settings.update')}</Text>
              </TouchableOpacity>
            </View>
          )}
          
          <View style={[styles.statItem, { marginTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.outlineVariant, paddingTop: Spacing.sm }]}>
            <Text style={styles.statIcon}>🌪</Text>
            <Text style={styles.statText}>{t('weather.wind_gusts')}: {todayWindGusts} km/h</Text>
          </View>
        </View>

        {/* Rainfall bar chart */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>{t('weather.rainfall_probability')}</Text>
            <Text style={styles.chartSubtitle}>{t('weather.next_5_days')}</Text>
          </View>
          <View style={styles.barsContainer}>
            {dynamicRainfall.map((r: any, i: number) => (
              <View key={i} style={styles.barCol}>
                <Text style={styles.barValueText}>{r.pct}%</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, {
                    height: `${Math.max(r.pct, 8)}%`,
                    backgroundColor: r.pct > 70 ? Colors.tertiary : r.pct > 15 ? Colors.tertiaryContainer : Colors.surfaceVariant,
                  }]} />
                </View>
                <Text style={styles.barLabel}>{r.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 7-day temp trend */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>{t('weather.temp_trend', {defaultValue: '7-Day Temp Trend'})}</Text>
            <Text style={{ fontSize: 16 }}>📉</Text>
          </View>
          <View style={styles.trendChart}>
            <View style={styles.trendBarsContainer}>
              {dynamicTempTrend.map((t, i) => {
                const high = Math.round(timeseries.temp_max[i]);
                const low = Math.round(timeseries.temp_min[i]);
                return (
                  <View key={i} style={styles.trendBarTrack}>
                    <View style={[styles.trendBarFill, {
                      bottom: `${t.bottom}%`,
                      height: `${t.height}%`,
                      backgroundColor: t.isToday ? Colors.primary : 'rgba(0,0,0,0.1)',
                    }]} />
                    <Text style={[styles.trendValueLabel, { bottom: `${t.bottom + t.height + 2}%`, fontSize: 9 }]}>{high}°</Text>
                    <Text style={[styles.trendValueLabel, { bottom: `${t.bottom - 12}%`, fontSize: 9 }]}>{low}°</Text>
                  </View>
                );
              })}
            </View>
            <View style={styles.trendOverlay}>
              <Text style={styles.trendLabel}>{t('weather.historical_view')}</Text>
            </View>
          </View>
          <View style={styles.trendLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.primary }]} />
              <Text style={styles.legendText}>{t('common.today')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 2 }]} />
              <Text style={styles.legendText}>{t('weather.historical_range')}</Text>
            </View>
          </View>
        </View>

        {/* Weather Consultant Section */}
        <View style={styles.advisorCard}>
          <View style={styles.advisorHeader}>
            <View>
              <Text style={styles.sectionTitle}>{t('advisor.consultant_title', 'Weather Consultant')}</Text>
              <Text style={styles.advisorDesc}>{t('advisor.consultant_desc', 'Ask about planting or spraying based on weather.')}</Text>
            </View>
          </View>

          <View style={styles.consultantActionRow}>
            <TouchableOpacity 
              style={[styles.voiceBtn, isRecording && styles.voiceBtnActive]} 
              onPress={toggleRecording}
              disabled={!isLlmReady || isAdvising}
            >
              <Text style={styles.voiceBtnIcon}>{isRecording ? '⏹' : '🎙'}</Text>
            </TouchableOpacity>
            
            <View style={styles.statusInfo}>
              <Text style={styles.statusLabel}>
                {isRecording ? t('doubts.listening') : isAdvising ? t('doubts.analyzing') : isSpeaking ? t('doubts.speaking') : t('doubts.voice_desc')}
              </Text>
              {isAdvising && <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 4, alignSelf: 'flex-start' }} />}
              {isSpeaking && <VoiceWaveform isSpeaking={isSpeaking} />}
            </View>
          </View>

          {advisorResult ? (
            <View style={styles.resultBox}>
              <Text style={styles.advisorResultText}>
                {advisorResult.replace(/[*#_~]/g, '')}
              </Text>
            </View>
          ) : !isRecording && !isAdvising && !isSpeaking && (
             <Text style={styles.placeholderText}>
               {t('advisor.voice_placeholder', 'Tap the mic and ask: "Is it a good time to spray pesticides today?"')}
             </Text>
          )}

          {!isLlmReady && (
            <Text style={styles.warningText}>{t('advisor.loading')}</Text>
          )}
        </View>
      </ScrollView>

      {/* Detail modal */}
      <Modal visible={!!detailModal} transparent animationType="slide" onRequestClose={() => setDetailModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <ScrollView>
              <Text style={styles.modalText}>{detailModal}</Text>
            </ScrollView>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setDetailModal(null)}>
              <Text style={styles.modalBtnText}>{t('common.got_it')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  flexShrink: { flexShrink: 1 },
  content: { padding: Spacing.margin, paddingBottom: 100, gap: Spacing.lg },

  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  pageTitle: { ...Typography.headlineSm, color: Colors.onBackground, fontWeight: '700' },
  refreshBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.surfaceContainerHighest,
    alignItems: 'center', justifyContent: 'center',
  },
  locationChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surfaceContainerHigh,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.outlineVariant,
  },
  locationPin: { fontSize: 14 },
  locationText: { ...Typography.labelMd, color: Colors.onSurface },

  chipsScroll: { marginHorizontal: -Spacing.margin },
  chipsContent: { paddingHorizontal: Spacing.margin, gap: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1, borderColor: Colors.outlineVariant,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: 'transparent' },
  chipText: { ...Typography.labelLg, color: Colors.onSurface },
  chipTextActive: { color: Colors.onPrimary },

  mainCard: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.tertiaryContainer,
    borderWidth: 1,
    borderColor: Colors.tertiaryFixedDim,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  mainCardOverlay: {
    position: 'absolute', inset: 0,
    backgroundColor: 'rgba(0,95,175,0.15)',
  } as any,
  mainCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  mainCardLeft: {},
  weatherDate: { ...Typography.titleMd, color: Colors.onTertiaryContainer, opacity: 0.9 },
  temperature: { fontSize: 64, fontWeight: '700', color: Colors.onTertiaryContainer, lineHeight: 70 },
  tempUnit: { fontSize: 28, fontWeight: '400' },
  mainCardRight: { alignItems: 'flex-end' },
  weatherEmoji: { fontSize: 56 },
  weatherCondition: { ...Typography.titleMd, color: Colors.onTertiaryContainer, fontWeight: '600' },
  weatherStats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statIcon: { fontSize: 14 },
  statText: { ...Typography.labelMd, color: Colors.onTertiaryContainer },

  sectionTitle: { ...Typography.titleMd, color: Colors.onSurface, marginBottom: Spacing.sm },

  forecastRow: { gap: Spacing.sm, paddingBottom: 4 },
  forecastCard: {
    minWidth: 72,
    borderRadius: Radius.DEFAULT,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  forecastCardToday: { backgroundColor: Colors.surfaceContainerHigh },
  forecastDay: { ...Typography.labelSm, color: Colors.onSurfaceVariant, marginBottom: 4 },
  forecastDayToday: { color: Colors.primary, fontWeight: '700' },
  forecastIcon: { fontSize: 26, marginVertical: 4 },
  forecastTemp: { ...Typography.labelMd, color: Colors.onSurface },

  insightHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  insightCropLabel: { ...Typography.labelMd, color: Colors.onSurfaceVariant },
  insightGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.gutter },
  insightCard: {
    width: '47%',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    gap: Spacing.sm,
  },
  insightTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  insightIcon: { fontSize: 18 },
  insightTitle: { ...Typography.labelMd, color: Colors.onSurface, fontWeight: '700', flex: 1 },
  insightValue: { ...Typography.titleSm, fontWeight: '700' },

  chartCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  chartTitle: { ...Typography.titleSm, color: Colors.onSurface },
  chartSubtitle: { ...Typography.labelSm, color: Colors.onSurfaceVariant },

  barsContainer: { flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 8, paddingTop: 20 },
  
  // Advisory Plan Styles
  advisoryActionCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary + '33',
    elevation: 2, shadowColor: '#000',
    shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.1, shadowRadius: 4,
  },
  advisoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  advisoryTitle: { ...Typography.titleMd, color: Colors.onSurface, fontWeight: '700' },
  advisoryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  advisoryBtnText: { ...Typography.labelLg, color: Colors.primary, fontWeight: '700' },
  advisoryContent: {
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.md,
  },
  advisoryPlaceholder: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center', marginVertical: Spacing.md },

  barCol: { flex: 1, alignItems: 'center' },
  barValueText: { ...Typography.labelSmall, color: Colors.onSurfaceVariant, marginBottom: 4, fontSize: 10 },
  barTrack: {
    height: 80, width: 28,
    backgroundColor: Colors.surfaceContainerHighest,
    borderRadius: 4, overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barFill: { width: '100%', borderRadius: 4 },
  barLabel: { ...Typography.labelSm, color: Colors.onSurfaceVariant, marginTop: 4 },
  
  soilGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  soilItem: { width: '47%', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surfaceContainerLow, padding: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.outlineVariant },
  soilIcon: { fontSize: 24 },
  soilLabel: { ...Typography.labelSm, color: Colors.onSurfaceVariant },
  soilValue: { ...Typography.titleSm, color: Colors.onSurface, fontWeight: '700' },

  updateInlineBtn: { backgroundColor: Colors.errorContainer, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  updateInlineText: { ...Typography.labelSmall, color: Colors.onErrorContainer, fontWeight: '700' },
  staleContainer: { padding: Spacing.lg, alignItems: 'center', gap: Spacing.md },
  staleText: { ...Typography.bodyMedium, color: Colors.onSurfaceVariant, textAlign: 'center' },
  bigUpdateBtn: { backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: Radius.full },
  bigUpdateBtnText: { ...Typography.labelLarge, color: Colors.onPrimary, fontWeight: '700' },

  trendChart: {
    height: 120,
    backgroundColor: Colors.surfaceContainer,
    borderRadius: Radius.md,
    marginTop: Spacing.md,
    position: 'relative',
    overflow: 'visible',
  },
  trendLine: {
    position: 'absolute',
    left: 0, right: 0,
    height: 2,
    opacity: 0.7,
  },
  trendBarsContainer: { flexDirection: 'row', alignItems: 'flex-end', height: '100%', gap: 2, paddingHorizontal: 4, paddingVertical: 20 },
  trendBarTrack: { flex: 1, height: '100%', justifyContent: 'flex-end', position: 'relative' },
  trendBarFill: { width: '100%', borderRadius: 1, position: 'absolute' },
  trendValueLabel: { position: 'absolute', width: '100%', left: 0, textAlign: 'center', fontSize: 9, fontWeight: '600', color: Colors.onSurfaceVariant },
  trendOverlay: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },
  trendLabel: { ...Typography.labelMd, color: Colors.onSurfaceVariant, backgroundColor: 'rgba(255,255,255,0.7)', paddingHorizontal: 8, borderRadius: 4 },
  trendLegend: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { ...Typography.labelSm, color: Colors.onSurfaceVariant },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: Spacing.lg,
    maxHeight: '70%',
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.outlineVariant,
    alignSelf: 'center', marginBottom: Spacing.md,
  },
  modalText: { ...Typography.bodyLg, color: Colors.onSurface, lineHeight: 26 },
  modalBtn: {
    marginTop: Spacing.lg,
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: { ...Typography.labelLg, color: Colors.onPrimary, fontWeight: '700', fontSize: 16 },

  advisorCard: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.primaryContainer,
    marginTop: Spacing.md,
  },
  advisorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  advisorDesc: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, marginBottom: Spacing.md },
  
  consultantActionRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: Spacing.md,
    backgroundColor: Colors.surfaceContainerLowest,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  voiceBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  voiceBtnActive: {
    backgroundColor: Colors.error,
    transform: [{ scale: 1.1 }],
  },
  voiceBtnIcon: {
    fontSize: 28,
    color: Colors.onPrimary,
  },
  statusInfo: {
    flex: 1,
  },
  statusLabel: {
    ...Typography.labelLg,
    color: Colors.onSurface,
    fontWeight: '600',
  },
  placeholderText: {
    ...Typography.bodySm,
    color: Colors.onSurfaceVariant,
    fontStyle: 'italic',
    marginTop: Spacing.md,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  warningText: { ...Typography.labelSm, color: Colors.error, marginTop: Spacing.sm, textAlign: 'center' },
  resultBox: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  advisorResultText: {
    ...Typography.bodyMd,
    color: Colors.onSurface,
    lineHeight: 24,
  },
});

const markdownStyles = StyleSheet.create({
  body: {
    color: Colors.onSurfaceVariant,
    ...Typography.bodyMd,
    lineHeight: 22,
  },
  bullet_list: {
    marginTop: 8,
  },
  list_item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  strong: {
    fontWeight: '700',
    color: Colors.onSurface,
  },
  heading1: {
    ...Typography.titleMd,
    color: Colors.onSurface,
    marginTop: 12,
    marginBottom: 8,
  },
  heading2: {
    ...Typography.titleSm,
    color: Colors.onSurface,
    marginTop: 8,
    marginBottom: 4,
  },
});
