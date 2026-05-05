import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Modal,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Tts from 'react-native-tts';
import TopAppBar from '../components/TopAppBar';
import { Toast } from '../components/Toast';
import { Colors, Typography, Spacing, Radius } from '../theme/theme';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PodcastItem {
  id: string;
  title: string;
  topic: string;
  duration: string;
  language: string;
  status: 'ready' | 'generating' | 'downloaded';
  createdAt: string;
  script?: string;
}

interface LLMRadioScreenProps {
  llmComplete: (prompt: string) => Promise<string>;
  isLlmReady: boolean;
}

// ─── Options ──────────────────────────────────────────────────────────────────
const TOPICS = ['Soil Management', 'Irrigation Techniques', 'Pest Control', 'Fertilizer Guide', 'Crop Rotation', 'Harvest Tips'];
const DURATIONS = ['5 min', '10 min', '15 min', '20 min', '30 min'];
const LANGUAGES = [{ label: '🇮🇳 Hindi', code: 'hi-IN' }, { label: '🇬🇧 English', code: 'en-IN' }, { label: '🇫🇷 Français', code: 'fr-FR' }, { label: '🇪🇸 Español', code: 'es-ES' }];
const STYLES = ['Educational', 'Quick Tips', 'Story Format', 'Interview (Q&A)'];

// ─── Initial podcasts ─────────────────────────────────────────────────────────
const INITIAL_PODCASTS: PodcastItem[] = [
  { id: '1', title: 'Complete Wheat Farming Guide', topic: 'Soil Management', duration: '15:45', language: '🇮🇳 Hindi', status: 'downloaded', createdAt: '2 days ago' },
  { id: '2', title: 'Organic Farming Secrets', topic: 'Fertilizer Guide', duration: '12:00', language: '🇬🇧 English', status: 'downloaded', createdAt: '5 days ago' },
  { id: '3', title: 'Soil Health Tips', topic: 'Soil Management', duration: '10:00', language: '🇮🇳 Hindi', status: 'ready', createdAt: 'Yesterday' },
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LLMRadioScreen({ llmComplete, isLlmReady }: LLMRadioScreenProps) {
  const { t } = useTranslation();
  const [podcasts, setPodcasts] = useState<PodcastItem[]>(INITIAL_PODCASTS);
  const [featured, setFeatured] = useState<PodcastItem>(INITIAL_PODCASTS[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [speed, setSpeed] = useState('1.0x');

  // Form state
  const [topic, setTopic] = useState(TOPICS[2]);
  const [duration, setDuration] = useState(DURATIONS[2]);
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [style, setStyle] = useState(STYLES[0]);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState('');
  const [genPct, setGenPct] = useState(0);

  // Picker modal state
  const [pickerModal, setPickerModal] = useState<{ type: string; options: string[] } | null>(null);

  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as 'success' | 'error' | 'info' });

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ visible: true, message, type });
  };

  // TTS init
  useEffect(() => {
    Tts.setDefaultRate(parseFloat(speed.replace('x', '')));
    const startL = Tts.addEventListener('tts-start', () => setIsPlaying(true));
    const finishL = Tts.addEventListener('tts-finish', () => { setIsPlaying(false); setPlayingId(null); });
    const cancelL = Tts.addEventListener('tts-cancel', () => { setIsPlaying(false); setPlayingId(null); });
    return () => { startL.remove(); finishL.remove(); cancelL.remove(); Tts.stop(); };
  }, [speed]);

  const handlePlay = (podcast: PodcastItem) => {
    if (isPlaying && playingId === podcast.id) {
      Tts.stop();
      return;
    }
    Tts.stop();
    if (!podcast.script) {
      showToast(t('radio.no_script'), 'info');
      return;
    }
    setPlayingId(podcast.id);
    Tts.setDefaultLanguage(language.code).catch(() => {});
    Tts.speak(podcast.script);
  };

  const handleGenerate = async () => {
    if (!isLlmReady) { showToast(t('advisor.loading'), 'info'); return; }
    if (generating) return;

    setGenerating(true);

    const steps = [
      { label: t('radio.creating_script'), pct: 20 },
      { label: t('radio.analyzing_topic'), pct: 45 },
      { label: t('radio.optimizing_content'), pct: 70 },
      { label: t('radio.finalizing'), pct: 90 },
    ];

    for (const step of steps) {
      setGenStep(step.label);
      setGenPct(step.pct);
      await new Promise(r => setTimeout(r, 700));
    }

    const prompt =
      `You are a professional agricultural podcast host. Generate a ${duration} ${style.toLowerCase()} podcast script about "${topic}" for Indian farmers.\n` +
      `Language: ${language.label}\n` +
      `Requirements:\n- Start with a warm introduction\n- Provide practical, actionable advice\n- Use simple language a farmer can understand\n- Include specific tips, numbers, and examples\n- End with a motivational close\n` +
      `Generate the full podcast script now:`;

    try {
      const script = await llmComplete(prompt);
      setGenPct(100);
      setGenStep(t('radio.done'));
      await new Promise(r => setTimeout(r, 400));

      const newPodcast: PodcastItem = {
        id: Date.now().toString(),
        title: `${topic} — ${style}`,
        topic,
        duration: duration,
        language: language.label,
        status: 'ready',
        createdAt: 'Just now',
        script: script.trim(),
      };

      setPodcasts(prev => [newPodcast, ...prev]);
      setFeatured(newPodcast);
      showToast(t('radio.gen_success'), 'success');
    } catch (e: any) {
      Alert.alert(t('radio.gen_failed'), e?.message ?? 'Try again');
    } finally {
      setGenerating(false);
      setGenPct(0);
      setGenStep('');
    }
  };

  // Picker
  const openPicker = (type: string, options: string[]) => {
    setPickerModal({ type, options });
  };

  const selectOption = (value: string) => {
    if (!pickerModal) return;
    switch (pickerModal.type) {
      case 'topic': setTopic(value); break;
      case 'duration': setDuration(value); break;
      case 'style': setStyle(value); break;
      case 'language':
        setLanguage(LANGUAGES.find(l => l.label === value) || LANGUAGES[0]); break;
    }
    setPickerModal(null);
  };

  const speedOptions = ['0.5x', '0.75x', '1.0x', '1.25x', '1.5x', '2.0x'];

  return (
    <View style={styles.flex}>
      <TopAppBar title="GoFarmer" rightLabel={t('common.downloads')} />

      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Featured player */}
        <View style={styles.playerCard}>
          <View style={styles.playerHeader}>
            <Text style={styles.playerLabel}>🎧 {t('radio.now_playing')}</Text>
            <View style={[styles.statusBadge, { backgroundColor: featured.status === 'downloaded' ? Colors.primaryContainer : Colors.surfaceContainerHigh }]}>
              <Text style={styles.statusText}>{featured.status === 'downloaded' ? `📥 ${t('radio.downloaded')}` : `📡 ${t('radio.ready')}`}</Text>
            </View>
          </View>

          <Text style={styles.playerTitle}>{featured.title}</Text>
          <Text style={styles.playerMeta}>
            {featured.duration}  ·  {featured.language}  ·  {featured.createdAt}
          </Text>

          {/* Progress */}
          <View style={styles.progressTrack}>
            <View style={styles.progressFill} />
          </View>
          <View style={styles.progressTimes}>
            <Text style={styles.progressTime}>00:00</Text>
            <Text style={styles.progressTime}>{featured.duration}</Text>
          </View>

          {/* Controls */}
          <View style={styles.playerControls}>
            <TouchableOpacity style={styles.controlBtn}><Text style={styles.controlIcon}>⏮</Text></TouchableOpacity>
            <TouchableOpacity
              style={styles.playBtn}
              onPress={() => handlePlay(featured)}
            >
              <Text style={styles.playBtnIcon}>
                {isPlaying && playingId === featured.id ? '⏸' : '▶️'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlBtn}><Text style={styles.controlIcon}>⏭</Text></TouchableOpacity>
            <TouchableOpacity style={styles.controlBtn}><Text style={styles.controlIcon}>🔊</Text></TouchableOpacity>
          </View>

          {/* Speed selector */}
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
        </View>

        {/* Generate section */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>✨ {t('radio.create_new')}</Text>

          <View style={styles.selectGroup}>
            <Text style={styles.selectLabel}>{t('radio.topic')}</Text>
            <TouchableOpacity style={styles.selectBtn} onPress={() => openPicker('topic', TOPICS)}>
              <Text style={styles.selectValue}>{topic}</Text>
              <Text style={styles.selectArrow}>▼</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.selectGroup}>
            <Text style={styles.selectLabel}>{t('radio.duration')}</Text>
            <TouchableOpacity style={styles.selectBtn} onPress={() => openPicker('duration', DURATIONS)}>
              <Text style={styles.selectValue}>{duration}</Text>
              <Text style={styles.selectArrow}>▼</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.selectGroup}>
            <Text style={styles.selectLabel}>{t('radio.language')}</Text>
            <TouchableOpacity style={styles.selectBtn} onPress={() => openPicker('language', LANGUAGES.map(l => l.label))}>
              <Text style={styles.selectValue}>{language.label}</Text>
              <Text style={styles.selectArrow}>▼</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.selectGroup}>
            <Text style={styles.selectLabel}>{t('radio.style')}</Text>
            <TouchableOpacity style={styles.selectBtn} onPress={() => openPicker('style', STYLES)}>
              <Text style={styles.selectValue}>{style}</Text>
              <Text style={styles.selectArrow}>▼</Text>
            </TouchableOpacity>
          </View>

          {/* Generation progress */}
          {generating && (
            <View style={styles.genProgress}>
              <Text style={styles.genStep}>{genStep}</Text>
              <View style={styles.genTrack}>
                <View style={[styles.genFill, { width: `${genPct}%` }]} />
              </View>
              <Text style={styles.genPct}>{genPct}%</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.generateBtn, (!isLlmReady || generating) && styles.generateBtnDisabled]}
            onPress={handleGenerate}
            disabled={!isLlmReady || generating}
            activeOpacity={0.85}
          >
            {generating ? <ActivityIndicator color={Colors.onPrimary} size="small" /> : null}
            <Text style={styles.generateBtnText}>
              {generating ? t('radio.generating') : `✨ ${t('radio.generate')} ✨`}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Recent podcasts */}
        <View>
          <Text style={styles.sectionTitle}>{t('radio.recent_podcasts')}</Text>
          {podcasts.map(p => (
            <View key={p.id} style={styles.podcastCard}>
              <View style={styles.podcastLeft}>
                <Text style={styles.podcastIcon}>🎙</Text>
                <View style={styles.podcastInfo}>
                  <Text style={styles.podcastTitle} numberOfLines={1}>{p.title}</Text>
                  <Text style={styles.podcastMeta}>{p.duration}  ·  {p.language}</Text>
                  <Text style={styles.podcastTime}>{p.createdAt}</Text>
                </View>
              </View>
              <View style={styles.podcastActions}>
                <TouchableOpacity style={styles.podcastActionBtn} onPress={() => { setFeatured(p); handlePlay(p); }}>
                  <Text style={styles.podcastActionIcon}>{isPlaying && playingId === p.id ? '⏸' : '▶️'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.podcastActionBtn}>
                  <Text style={styles.podcastActionIcon}>⬇</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.podcastActionBtn}
                  onPress={() => { Tts.stop(); setPodcasts(prev => prev.filter(x => x.id !== p.id)); }}
                >
                  <Text style={[styles.podcastActionIcon, { color: Colors.error }]}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
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
                  <Text style={styles.pickerOptionText}>{opt}</Text>
                  {(pickerModal.type === 'topic' ? opt === topic :
                    pickerModal.type === 'duration' ? opt === duration :
                    pickerModal.type === 'style' ? opt === style :
                    opt === language.label) && (
                    <Text style={{ color: Colors.primary, fontWeight: '700' }}>✓</Text>
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

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.margin, paddingBottom: 100, gap: Spacing.lg },

  playerCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  playerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  playerLabel: { ...Typography.labelMd, color: Colors.onSurfaceVariant, letterSpacing: 1.5 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.full },
  statusText: { ...Typography.labelSm, color: Colors.onSurface },
  playerTitle: { ...Typography.titleLg, color: Colors.onSurface, fontWeight: '700' },
  playerMeta: { ...Typography.labelMd, color: Colors.onSurfaceVariant },

  progressTrack: { height: 4, backgroundColor: Colors.surfaceContainerHighest, borderRadius: Radius.full, overflow: 'hidden', marginTop: Spacing.sm },
  progressFill: { width: '10%', height: '100%', backgroundColor: Colors.primary, borderRadius: Radius.full },
  progressTimes: { flexDirection: 'row', justifyContent: 'space-between' },
  progressTime: { ...Typography.labelSm, color: Colors.onSurfaceVariant },

  playerControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.lg, marginTop: Spacing.sm },
  controlBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  controlIcon: { fontSize: 24 },
  playBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  playBtnIcon: { fontSize: 28 },

  speedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexWrap: 'wrap', marginTop: 4 },
  speedLabel: { ...Typography.labelMd, color: Colors.onSurfaceVariant },
  speedBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.outlineVariant },
  speedBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  speedBtnText: { ...Typography.labelSm, color: Colors.onSurface },
  speedBtnTextActive: { color: Colors.onPrimary },

  sectionCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    gap: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionTitle: { ...Typography.titleMd, color: Colors.onSurface, fontWeight: '700', marginBottom: 4 },

  selectGroup: { gap: 4 },
  selectLabel: { ...Typography.labelMd, color: Colors.onSurfaceVariant },
  selectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: Colors.outlineVariant,
    borderRadius: Radius.DEFAULT,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    backgroundColor: Colors.surfaceContainerLow,
  },
  selectValue: { ...Typography.bodyLg, color: Colors.onSurface },
  selectArrow: { ...Typography.labelSm, color: Colors.onSurfaceVariant },

  genProgress: { gap: Spacing.sm, alignItems: 'center' },
  genStep: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
  genTrack: { width: '100%', height: 8, backgroundColor: Colors.surfaceContainerHighest, borderRadius: Radius.full, overflow: 'hidden' },
  genFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: Radius.full },
  genPct: { ...Typography.titleMd, color: Colors.primary, fontWeight: '700' },

  generateBtn: {
    height: 56, backgroundColor: Colors.primary, borderRadius: Radius.lg,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: Spacing.sm,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 4,
  },
  generateBtnDisabled: { opacity: 0.5 },
  generateBtnText: { ...Typography.labelLg, color: Colors.onPrimary, fontWeight: '700', fontSize: 16 },

  podcastCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.outlineVariant,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  podcastLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  podcastIcon: { fontSize: 28 },
  podcastInfo: { flex: 1 },
  podcastTitle: { ...Typography.labelMd, color: Colors.onSurface, fontWeight: '700' },
  podcastMeta: { ...Typography.labelSm, color: Colors.onSurfaceVariant, marginTop: 2 },
  podcastTime: { ...Typography.labelSm, color: Colors.outlineVariant },
  podcastActions: { flexDirection: 'row', gap: 4 },
  podcastActionBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  podcastActionIcon: { fontSize: 18 },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg,
    padding: Spacing.lg, maxHeight: '60%',
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.outlineVariant, alignSelf: 'center', marginBottom: Spacing.md },
  pickerTitle: { ...Typography.titleMd, color: Colors.onSurface, marginBottom: Spacing.md, textTransform: 'capitalize' },
  pickerOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant,
  },
  pickerOptionText: { ...Typography.bodyLg, color: Colors.onSurface },
});
