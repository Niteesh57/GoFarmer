import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Modal, Alert, PermissionsAndroid, Platform, Image, ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { launchImageLibrary } from 'react-native-image-picker';
import TopAppBar from '../components/TopAppBar';
import { Toast } from '../components/Toast';
import { Colors, Typography, Spacing, Radius } from '../theme/theme';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ScanResult {
  id: string;
  imagePath: string;
  plant: string;
  status: 'healthy' | 'diseased' | 'warning';
  disease?: string;
  confidence?: number;
  severity?: number;
  time: string;
  location: string;
  recommendations?: string[];
}

const MOCK_SCANS: ScanResult[] = [
  {
    id: '1', imagePath: '', plant: 'Tomato Plant',
    status: 'healthy', time: '2h ago', location: '17.3°N, 78.4°E',
  },
  {
    id: '2', imagePath: '', plant: 'Wheat Field',
    status: 'diseased', disease: 'Leaf Spot', confidence: 92, severity: 40,
    time: '1d ago', location: '17.2°N, 78.5°E',
    recommendations: ['Remove infected leaves', 'Apply fungicide weekly', 'Improve air circulation', 'Water at soil level'],
  },
  {
    id: '3', imagePath: '', plant: 'Corn Crop',
    status: 'healthy', time: '3d ago', location: '17.1°N, 78.3°E',
  },
  {
    id: '4', imagePath: '', plant: 'Rice Field',
    status: 'warning', disease: 'Pest Damage', confidence: 78, severity: 60,
    time: '2d ago', location: '17.4°N, 78.6°E',
    recommendations: ['Inspect field immediately', 'Apply pesticide', 'Set traps'],
  },
];

const MAP_MARKERS = [
  { top: '25%', left: '30%', status: 'healthy', label: 'Sector A' },
  { top: '45%', left: '65%', status: 'diseased', label: 'Sector C' },
  { top: '70%', left: '20%', status: 'warning', label: 'Sector B' },
];

// ─── Main Component ───────────────────────────────────────────────────────────
interface AIEyeScreenProps {
  llmComplete: (prompt: string, imagePath: string) => Promise<string>;
}

export default function AIEyeScreen({ llmComplete }: AIEyeScreenProps) {
  const { t } = useTranslation();
  const [scans, setScans] = useState<ScanResult[]>(MOCK_SCANS);
  const [heatMap, setHeatMap] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStep, setScanStep] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as 'success' | 'error' | 'info' });

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ visible: true, message, type });
  };

  const handleScanPlant = useCallback(async () => {
    if (Platform.OS === 'android') {
      const perm =
        (PermissionsAndroid.PERMISSIONS as any).READ_MEDIA_IMAGES ??
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
      await PermissionsAndroid.request(perm).catch(() => {});
    }

    launchImageLibrary({ mediaType: 'photo', quality: 0.85 }, async res => {
      const asset = res.assets?.[0];
      if (!asset?.uri) return;

      const imagePath = asset.uri.replace('file://', '');
      setScanning(true);
      setScanProgress(0);

      const steps = [
        { label: t('aieye.uploading'), pct: 20 },
        { label: t('aieye.analyzing'), pct: 45 },
        { label: t('aieye.detecting'), pct: 70 },
        { label: t('aieye.generating'), pct: 90 },
      ];

      for (const step of steps) {
        setScanStep(step.label);
        setScanProgress(step.pct);
        await new Promise(r => setTimeout(r, 600));
      }

      try {
        const prompt =
          'You are an expert agricultural plant disease detection AI. Analyze this plant image and respond ONLY in this exact JSON format:\n' +
          '{"plant":"<plant name>","status":"healthy|diseased|warning","disease":"<disease name or none>","confidence":<0-100>,"severity":<0-100>,"recommendations":["<tip1>","<tip2>","<tip3>"]}\n' +
          'Be precise. If healthy, set disease to "none" and severity to 0.';

        const raw = await llmComplete(prompt, imagePath);

        setScanProgress(100);
        setScanStep('Done!');

        let parsed: any = {};
        try {
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        } catch {
          parsed = { plant: 'Unknown Plant', status: 'warning', disease: 'Unable to detect', confidence: 50, severity: 30, recommendations: ['Try scanning again with better lighting', 'Ensure full leaf is visible'] };
        }

        const newScan: ScanResult = {
          id: Date.now().toString(),
          imagePath: asset.uri,
          plant: parsed.plant || 'Unknown Plant',
          status: parsed.status || 'warning',
          disease: parsed.disease !== 'none' ? parsed.disease : undefined,
          confidence: parsed.confidence,
          severity: parsed.severity,
          time: 'Just now',
          location: '17.3°N, 78.4°E',
          recommendations: parsed.recommendations,
        };

        setScanning(false);
        setScans(prev => [newScan, ...prev]);
        setResult(newScan);
        showToast(t('aieye.scan_success'), 'success');
      } catch (e: any) {
        setScanning(false);
        Alert.alert(t('aieye.scan_failed'), e?.message ?? 'Unable to analyze image');
      }
    });
  }, [llmComplete]);

  const statusColor = (status: string) =>
    status === 'healthy' ? Colors.primary :
    status === 'diseased' ? Colors.error :
    '#f9a825';

  const statusEmoji = (status: string) =>
    status === 'healthy' ? '✅' :
    status === 'diseased' ? '🔴' : '⚠️';

  return (
    <View style={styles.flex}>
      <TopAppBar title="GoFarmer" rightLabel={t('common.history')} />

      {/* MAP AREA */}
      <View style={styles.mapContainer}>
        {/* Satellite-look background */}
        <View style={styles.mapBg}>
          {/* Grid pattern */}
          {[...Array(6)].map((_, i) => (
            <View key={`h${i}`} style={[styles.gridLineH, { top: `${i * 20}%` }]} />
          ))}
          {[...Array(6)].map((_, i) => (
            <View key={`v${i}`} style={[styles.gridLineV, { left: `${i * 20}%` }]} />
          ))}
          {/* Field patches */}
          <View style={[styles.fieldPatch, { top: '10%', left: '5%', width: '40%', height: '35%', backgroundColor: '#2e7d32' }]} />
          <View style={[styles.fieldPatch, { top: '55%', left: '5%', width: '30%', height: '30%', backgroundColor: '#388e3c' }]} />
          <View style={[styles.fieldPatch, { top: '10%', left: '55%', width: '38%', height: '30%', backgroundColor: '#827717' }]} />
          <View style={[styles.fieldPatch, { top: '50%', left: '45%', width: '50%', height: '40%', backgroundColor: '#33691e' }]} />
        </View>

        {/* Heat map overlay */}
        {heatMap && <View style={styles.heatMapOverlay} />}

        {/* Map markers */}
        {MAP_MARKERS.map((m, i) => (
          <View key={i} style={[styles.marker, { top: m.top, left: m.left } as any]}>
            <View style={[styles.markerBadge, { backgroundColor: statusColor(m.status) }]}>
              <Text style={styles.markerIcon}>
                {m.status === 'healthy' ? '🌿' : m.status === 'diseased' ? '🦠' : '⚠️'}
              </Text>
            </View>
            <View style={styles.markerLabel}>
              <Text style={styles.markerLabelText}>{m.label}</Text>
            </View>
          </View>
        ))}

        {/* Map controls */}
        <View style={styles.mapControls}>
          <TouchableOpacity style={styles.mapControlBtn} onPress={() => setHeatMap(!heatMap)}>
            <Text style={styles.mapControlIcon}>🗺</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.mapControlBtn}>
            <Text style={styles.mapControlIcon}>📍</Text>
          </TouchableOpacity>
        </View>

        {/* Heat map status */}
        {heatMap && (
          <View style={styles.heatMapBadge}>
            <Text style={styles.heatMapText}>🌡 {t('aieye.heat_map')}: ON</Text>
          </View>
        )}

        {/* Recent scans horizontal scroll */}
        <View style={styles.scansOverlay}>
          <View style={styles.scansHeader}>
            <Text style={styles.scansTitle}>{t('aieye.recent_scans')}</Text>
            <TouchableOpacity style={styles.viewAllBtn}>
              <Text style={styles.viewAllText}>{t('common.view_all')} →</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scansRow}
          >
            {scans.map(scan => (
              <TouchableOpacity
                key={scan.id}
                style={styles.scanCard}
                onPress={() => setResult(scan)}
                activeOpacity={0.85}
              >
                <View style={[styles.scanThumb, { borderColor: statusColor(scan.status) }]}>
                  {scan.imagePath ? (
                    <Image source={{ uri: scan.imagePath }} style={styles.scanImage} />
                  ) : (
                    <Text style={styles.scanPlaceholder}>🌿</Text>
                  )}
                  <View style={[styles.scanDot, { backgroundColor: statusColor(scan.status) }]} />
                </View>
                <View style={styles.scanInfo}>
                  <Text style={styles.scanPlant} numberOfLines={1}>{scan.plant}</Text>
                  <Text style={[styles.scanStatus, { color: statusColor(scan.status) }]}>
                    {statusEmoji(scan.status)} {scan.disease || 'Healthy'}
                  </Text>
                  <Text style={styles.scanTime}>{scan.time}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Scan FAB */}
      <TouchableOpacity style={styles.fab} onPress={handleScanPlant} activeOpacity={0.85}>
        <Text style={styles.fabIcon}>📷</Text>
        <Text style={styles.fabText}>{t('aieye.scan_plant')}</Text>
      </TouchableOpacity>

      {/* Scanning progress modal */}
      <Modal visible={scanning} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.scanningModal}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.scanningTitle}>{t('aieye.processing')}</Text>
            <View style={styles.scanProgressTrack}>
              <View style={[styles.scanProgressFill, { width: `${scanProgress}%` }]} />
            </View>
            <Text style={styles.scanProgressPct}>{scanProgress}%</Text>
            <Text style={styles.scanStep}>{scanStep}</Text>
          </View>
        </View>
      </Modal>

      {/* Result modal */}
      <Modal visible={!!result} transparent animationType="slide" onRequestClose={() => setResult(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.resultSheet}>
            <View style={styles.modalHandle} />
            {result && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {result.imagePath ? (
                  <Image source={{ uri: result.imagePath }} style={styles.resultImage} />
                ) : (
                  <View style={[styles.resultImagePlaceholder, { backgroundColor: statusColor(result.status) + '22' }]}>
                    <Text style={{ fontSize: 60 }}>{statusEmoji(result.status)}</Text>
                  </View>
                )}

                <View style={styles.resultBody}>
                  <Text style={styles.resultPlant}>{result.plant}</Text>
                  <View style={[styles.resultStatusBadge, { backgroundColor: statusColor(result.status) + '22', borderColor: statusColor(result.status) }]}>
                    <Text style={[styles.resultStatusText, { color: statusColor(result.status) }]}>
                      {statusEmoji(result.status)} {result.status.toUpperCase()}
                    </Text>
                  </View>

                  {result.disease && (
                    <>
                      <Text style={styles.resultRow}>🦠 {t('aieye.disease')}: <Text style={styles.resultValue}>{result.disease}</Text></Text>
                      {result.confidence != null && (
                        <Text style={styles.resultRow}>🎯 {t('aieye.confidence')}: <Text style={styles.resultValue}>{result.confidence}%</Text></Text>
                      )}
                      {result.severity != null && (
                        <Text style={styles.resultRow}>📊 {t('aieye.severity')}: <Text style={styles.resultValue}>{result.severity}%</Text></Text>
                      )}
                    </>
                  )}

                  <Text style={styles.resultRow}>📍 {t('aieye.location')}: <Text style={styles.resultValue}>{result.location}</Text></Text>
                  <Text style={styles.resultRow}>🕐 {t('aieye.time')}: <Text style={styles.resultValue}>{result.time}</Text></Text>

                  {result.recommendations && result.recommendations.length > 0 && (
                    <>
                      <View style={styles.divider} />
                      <Text style={styles.recTitle}>{t('aieye.treatment')}</Text>
                      {result.recommendations.map((r, i) => (
                        <Text key={i} style={styles.recItem}>• {r}</Text>
                      ))}
                    </>
                  )}
                </View>

                <View style={styles.resultActions}>
                  <TouchableOpacity style={styles.resultBtnSecondary} onPress={() => setResult(null)}>
                    <Text style={styles.resultBtnSecondaryText}>{t('common.scan_again')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.resultBtnPrimary} onPress={() => { setResult(null); showToast(t('common.done'), 'success'); }}>
                    <Text style={styles.resultBtnPrimaryText}>{t('common.done')} ✓</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
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

  // Map
  mapContainer: { flex: 1, position: 'relative' },
  mapBg: { flex: 1, backgroundColor: '#4a7c59', overflow: 'hidden' },
  gridLineH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  gridLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  fieldPatch: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', opacity: 0.85 },

  heatMapOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(186,26,26,0.2)',
  },

  marker: { position: 'absolute', alignItems: 'center', zIndex: 10 },
  markerBadge: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#ffffff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4,
    elevation: 4,
  },
  markerIcon: { fontSize: 18 },
  markerLabel: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, marginTop: 2,
  },
  markerLabelText: { ...Typography.labelSm, color: Colors.onSurface },

  mapControls: {
    position: 'absolute', top: Spacing.md, right: Spacing.md,
    gap: Spacing.sm, zIndex: 20,
  },
  mapControlBtn: {
    width: 44, height: 44, borderRadius: Radius.DEFAULT,
    backgroundColor: 'rgba(245,251,239,0.92)',
    borderWidth: 1, borderColor: Colors.outlineVariant + '80',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4,
    elevation: 2,
  },
  mapControlIcon: { fontSize: 20 },

  heatMapBadge: {
    position: 'absolute', top: Spacing.md, left: Spacing.md,
    backgroundColor: 'rgba(186,26,26,0.85)',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radius.full,
  },
  heatMapText: { ...Typography.labelSm, color: '#ffffff' },

  scansOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingBottom: 8,
  },
  scansHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, marginBottom: 8,
  },
  scansTitle: {
    ...Typography.titleSm,
    color: '#ffffff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  viewAllBtn: {
    backgroundColor: 'rgba(245,251,239,0.85)',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radius.full,
  },
  viewAllText: { ...Typography.labelSm, color: Colors.primary },
  scansRow: { paddingHorizontal: Spacing.md, gap: Spacing.md, paddingBottom: 4 },
  scanCard: {
    width: 220,
    backgroundColor: 'rgba(245,251,239,0.95)',
    borderRadius: Radius.md,
    padding: Spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(190,202,185,0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  scanThumb: {
    width: 50, height: 50, borderRadius: Radius.DEFAULT,
    backgroundColor: Colors.surfaceContainerHighest,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', borderWidth: 2, position: 'relative',
  },
  scanImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  scanPlaceholder: { fontSize: 26 },
  scanDot: {
    position: 'absolute', top: 2, right: 2,
    width: 10, height: 10, borderRadius: 5,
    borderWidth: 1.5, borderColor: '#ffffff',
  },
  scanInfo: { flex: 1 },
  scanPlant: { ...Typography.labelMd, color: Colors.onSurface, fontWeight: '700' },
  scanStatus: { ...Typography.bodySm, fontWeight: '500', marginTop: 2 },
  scanTime: { ...Typography.labelSm, color: Colors.onSurfaceVariant, marginTop: 1 },

  fab: {
    position: 'absolute',
    bottom: 96,
    alignSelf: 'center',
    backgroundColor: Colors.primaryContainer,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 30,
  },
  fabIcon: { fontSize: 22 },
  fabText: { ...Typography.labelLg, color: Colors.onPrimaryContainer, fontWeight: '700', letterSpacing: 1 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  scanningModal: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    width: 300,
    alignItems: 'center',
    gap: Spacing.md,
  },
  scanningTitle: { ...Typography.titleMd, color: Colors.onSurface, textAlign: 'center' },
  scanProgressTrack: {
    width: '100%', height: 8,
    backgroundColor: Colors.surfaceContainerHighest,
    borderRadius: Radius.full, overflow: 'hidden',
  },
  scanProgressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
  },
  scanProgressPct: { ...Typography.headlineSm, color: Colors.primary, fontWeight: '700' },
  scanStep: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center' },

  resultSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.surfaceContainerLowest,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: Spacing.md,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.outlineVariant,
    alignSelf: 'center', marginBottom: Spacing.md,
  },
  resultImage: { width: '100%', height: 200, borderRadius: Radius.md, resizeMode: 'cover', marginBottom: Spacing.md },
  resultImagePlaceholder: { height: 160, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  resultBody: { gap: Spacing.sm, paddingBottom: Spacing.md },
  resultPlant: { ...Typography.headlineSm, color: Colors.onSurface, fontWeight: '700' },
  resultStatusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1,
  },
  resultStatusText: { ...Typography.labelLg, fontWeight: '700', fontSize: 13 },
  resultRow: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
  resultValue: { color: Colors.onSurface, fontWeight: '600' },
  divider: { height: 1, backgroundColor: Colors.outlineVariant, marginVertical: Spacing.sm },
  recTitle: { ...Typography.titleSm, color: Colors.onSurface, marginBottom: 4 },
  recItem: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, lineHeight: 22, marginLeft: 4 },
  resultActions: { flexDirection: 'row', gap: Spacing.sm, paddingTop: Spacing.sm },
  resultBtnSecondary: {
    flex: 1, height: 48, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.outline,
    alignItems: 'center', justifyContent: 'center',
  },
  resultBtnSecondaryText: { ...Typography.labelLg, color: Colors.onSurface },
  resultBtnPrimary: {
    flex: 1, height: 48, borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  resultBtnPrimaryText: { ...Typography.labelLg, color: Colors.onPrimary, fontWeight: '700' },
});
