import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Modal, Alert, PermissionsAndroid, Platform, Image, ActivityIndicator, FlatList
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Defs, RadialGradient, Stop, Circle as SvgCircle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { launchImageLibrary } from 'react-native-image-picker';
import TopAppBar from '../components/TopAppBar';
import { Toast } from '../components/Toast';
import { Colors, Typography, Spacing, Radius } from '../theme/theme';
import { getCurrentLocation } from '../services/InsightsService';

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
  rawLocation?: { lat: number; lng: number };
  recommendations?: string[];
  composition?: string;
  management?: string;
  source?: 'ai' | 'vector';
}

const MOCK_SCANS: ScanResult[] = [];

const MAP_MARKERS = [
  { top: '25%', left: '30%', status: 'healthy', label: 'Sector A' },
  { top: '45%', left: '65%', status: 'diseased', label: 'Sector C' },
  { top: '70%', left: '20%', status: 'warning', label: 'Sector B' },
];

// ─── Main Component ───────────────────────────────────────────────────────────
interface AIEyeScreenProps {
  llmComplete: (
    prompt: string,
    imagePath: string,
    callbacks: {
      onToken?: (tok: string) => void;
      onThinking?: (text: string) => void;
      onToolCall?: (name: string) => void;
    }
  ) => Promise<{ response: string; thinking?: string }>;
}

export default function AIEyeScreen({ llmComplete }: AIEyeScreenProps) {
  const { t, i18n } = useTranslation();
  const [scans, setScans] = useState<ScanResult[]>(MOCK_SCANS);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);

  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [anchorLocation, setAnchorLocation] = useState<{lat: number, lng: number} | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<ScanResult[] | null>(null);

  React.useEffect(() => {
    if (anchorLocation && currentLocation) {
      const dist = Math.sqrt(
        Math.pow(currentLocation.lat - anchorLocation.lat, 2) + 
        Math.pow(currentLocation.lng - anchorLocation.lng, 2)
      );
      // If moved more than ~500m (0.005 deg), move the static map anchor
      if (dist > 0.005) {
        setAnchorLocation(currentLocation);
        AsyncStorage.setItem('@gofarmer_ai_anchor', JSON.stringify(currentLocation));
      }
    }
  }, [currentLocation, anchorLocation]);

  React.useEffect(() => {
    AsyncStorage.getItem('@gofarmer_ai_scans').then(s => {
      if (s) setScans(JSON.parse(s));
    });
    AsyncStorage.getItem('@gofarmer_ai_anchor').then(a => {
      if (a) setAnchorLocation(JSON.parse(a));
    });

    const fetchLoc = () => getCurrentLocation().then(setCurrentLocation).catch(console.log);
    fetchLoc();
    const interval = setInterval(fetchLoc, 5000);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    if (scans.length > 0 && scans !== MOCK_SCANS) {
      AsyncStorage.setItem('@gofarmer_ai_scans', JSON.stringify(scans));
      
      // If no anchor yet, take the first (oldest) scan as anchor
      if (!anchorLocation) {
        const first = scans[scans.length - 1];
        if (first.rawLocation) {
          setAnchorLocation(first.rawLocation);
          AsyncStorage.setItem('@gofarmer_ai_anchor', JSON.stringify(first.rawLocation));
        }
      }
    }
  }, [scans, anchorLocation]);

  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as 'success' | 'error' | 'info' });

  const handleDeleteScan = (id: string) => {
    setScans(prev => prev.filter(s => s.id !== id));
    setResult(null);
    showToast('Scan deleted', 'success');
  };


  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ visible: true, message, type });
  };

  const getClusters = (allScans: ScanResult[]) => {
    const threshold = 0.00005; // ~5 meters
    const groups: ScanResult[][] = [];

    allScans.forEach(scan => {
      if (!scan.rawLocation) return;
      let found = false;
      for (const group of groups) {
        const center = group[0].rawLocation!;
        const d = Math.sqrt(
          Math.pow(scan.rawLocation.lat - center.lat, 2) + 
          Math.pow(scan.rawLocation.lng - center.lng, 2)
        );
        if (d < threshold) {
          group.push(scan);
          found = true;
          break;
        }
      }
      if (!found) groups.push([scan]);
    });
    return groups;
  };

  const handleScanPlant = useCallback(async (source: 'camera' | 'gallery') => {
    if (Platform.OS === 'android') {
      const perms = source === 'camera' 
        ? [PermissionsAndroid.PERMISSIONS.CAMERA]
        : [(PermissionsAndroid.PERMISSIONS as any).READ_MEDIA_IMAGES ?? PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE];
      
      for (const p of perms) {
        await PermissionsAndroid.request(p).catch(() => {});
      }
    }

    const picker = source === 'camera' ? require('react-native-image-picker').launchCamera : launchImageLibrary;

    picker({ mediaType: 'photo', quality: 0.85 }, async res => {
      const asset = res.assets?.[0];
      if (!asset?.uri) return;

      const imagePath = asset.uri.replace('file://', '');
      setScanning(true);

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

        const prompt =
          'You are an expert plant pathologist with access to a detailed agricultural database. ' +
          'Analyze the symptoms (color, spots, shape) on the leaf. ' +
          'Then, provide a diagnosis using the most accurate information from your RAG database. ' +
          'Specifically include the "Chemical Treatment / Composition" as the "composition" and the "Management" steps as "management". ' +
          `You MUST provide all the text values ENTIRELY in ${contentLangStr}. ` +
          'Respond ONLY in this exact JSON format:\n' +
          '{"plant":"<plant name>","status":"healthy|diseased|warning","disease":"<disease name or none>","confidence":<0-100>,"severity":<0-100>,"composition":"<initial chemical treatment>","management":"<how to stop the spread>","recommendations":["<tip1>","<tip2>","<tip3>"]}\n';

        const { response } = await llmComplete(prompt, imagePath, {});

        let parsed: any = {};
        try {
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        } catch {
          parsed = { 
            plant: 'Unknown Plant', 
            status: 'warning', 
            disease: 'Unable to detect', 
            confidence: 50, 
            severity: 30, 
            composition: 'N/A',
            management: 'Monitor symptoms',
            recommendations: ['Try scanning again with better lighting'] 
          };
        }

        // Fetch real-time location and time
        const coords = await getCurrentLocation();
        const lat = coords.latitude >= 0 ? `${coords.latitude.toFixed(2)}°N` : `${Math.abs(coords.latitude).toFixed(2)}°S`;
        const lng = coords.longitude >= 0 ? `${coords.longitude.toFixed(2)}°E` : `${Math.abs(coords.longitude).toFixed(2)}°W`;
        
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const newScan: ScanResult = {
          id: Date.now().toString(),
          imagePath: asset.uri,
          plant: parsed.plant || 'Unknown Plant',
          status: parsed.status || 'warning',
          disease: parsed.disease !== 'none' ? parsed.disease : undefined,
          confidence: parsed.confidence,
          severity: parsed.severity,
          time: timestamp,
          location: `${lat}, ${lng}`,
          rawLocation: coords,
          recommendations: parsed.recommendations,
          composition: parsed.composition,
          management: parsed.management,
          source: 'ai',
        };


        setScanning(false);
        setResult(newScan);
        if (newScan.status !== 'healthy') {
          setScans(prev => [newScan, ...prev]);
        }
        showToast(t('aieye.scan_success', {defaultValue: 'Scan successful'}), 'success');
      } catch (e: any) {
        setScanning(false);
        Alert.alert(t('aieye.scan_failed'), e?.message ?? 'Unable to analyze image');
      }
    });
  }, [llmComplete, t]);


  const statusColor = (status: string) =>
    status === 'healthy' ? Colors.primary :
    status === 'diseased' ? Colors.error :
    '#f9a825';

  const statusEmoji = (status: string) =>
    status === 'healthy' ? '✅' :
    status === 'diseased' ? '🔴' : '⚠️';

  return (
    <View style={styles.flex}>
      {/* MAIN AREA */}
      <View style={[styles.mapContainer, { backgroundColor: '#fdfdfd', flex: 1 }]}>
        <View style={{position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, backgroundColor: 'rgba(255,255,255,0.7)'}}>
          <TopAppBar title="GoFarmer" rightLabel={t('common.history')} />
        </View>
        
      {/* MAIN AREA */}
      <View style={[styles.mapContainer, { backgroundColor: '#fdfdfd', flex: 1, overflow: 'hidden' }]}>
        <View style={{position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, backgroundColor: 'rgba(255,255,255,0.7)'}}>
          <TopAppBar title="GoFarmer" rightLabel={t('common.history')} />
        </View>
        
        <View style={styles.staticMapArea}>
          <Image 
            source={require('../assets/offline_farm_map.png')} 
            style={styles.staticMapImage}
            resizeMode="cover"
          />

          {/* User Avatar - Plotted relative to Anchor (Center) */}
          {(() => {
            let left = 50;
            let top = 50;
            if (anchorLocation && currentLocation) {
              const dx = currentLocation.lng - anchorLocation.lng;
              const dy = currentLocation.lat - anchorLocation.lat;
              // Scale for static view: 10000 means 0.01 deg = 100% of screen width
              left = 50 + (dx * 10000);
              top = 50 - (dy * 10000);
            }
            
            return (
              <View style={[styles.marker, { top: `${top}%`, left: `${left}%`, transform: [{translateX: -15}, {translateY: -15}], zIndex: 50, alignItems: 'center' }]}>
                <View style={styles.userAvatarContainerSmall}>
                  <Text style={{fontSize: 20}}>👨‍🌾</Text>
                  <View style={styles.pulseDotSmall} />
                </View>
              </View>
            );
          })()}

          {/* Plotted Diseases (Clustered Snap Map Style Pins) */}
          {getClusters(scans).map((cluster, idx) => {
            const scan = cluster[0];
            if (!scan.rawLocation || !anchorLocation) return null;
            
            const dx = scan.rawLocation.lng - anchorLocation.lng;
            const dy = scan.rawLocation.lat - anchorLocation.lat;
            
            const left = 50 + (dx * 10000); 
            const top = 50 - (dy * 10000); 
            
            const color = cluster.some(s => s.status === 'diseased') ? '#ff1744' : '#ffeb3b';

            return (
              <TouchableOpacity 
                key={scan.id + idx} 
                style={[styles.marker, { top: `${top}%`, left: `${left}%`, zIndex: 10 } as any]}
                onPress={() => {
                  if (cluster.length > 1) setSelectedCluster(cluster);
                  else setResult(cluster[0]);
                }}
                activeOpacity={0.8}
              >
                {/* Heatmap Layer */}
                <View style={styles.heatmapLayerSmall}>
                  <Svg height="120" width="120">
                    <Defs>
                      <RadialGradient id={`grad-${scan.id}`} cx="50%" cy="50%" rx="50%" ry="50%" fx="50%" fy="50%">
                        <Stop offset="0%" stopColor={color} stopOpacity="0.8" />
                        <Stop offset="40%" stopColor={color} stopOpacity="0.3" />
                        <Stop offset="100%" stopColor={color} stopOpacity="0" />
                      </RadialGradient>
                    </Defs>
                    <SvgCircle cx="60" cy="60" r="60" fill={`url(#grad-${scan.id})`} />
                  </Svg>
                </View>

                {/* Snap Pin Layer (Small) */}
                <View style={styles.snapPinSmall}>
                  <View style={[styles.snapImageContainerSmall, { borderColor: color }]}>
                    {/* Stacked Images Effect for Clusters */}
                    {cluster.length > 1 && (
                      <>
                        <View style={[styles.snapImageStack, { left: 3, top: 3, zIndex: -1, transform: [{rotate: '-5deg'}] }]} />
                        <View style={[styles.snapImageStack, { left: 6, top: 6, zIndex: -2, transform: [{rotate: '5deg'}] }]} />
                      </>
                    )}
                    
                    {scan.imagePath ? (
                      <Image source={{ uri: scan.imagePath }} style={styles.snapImage} />
                    ) : (
                      <Text style={{fontSize: 12}}>🌿</Text>
                    )}
                    
                    {cluster.length > 1 && (
                      <View style={styles.clusterBadge}>
                        <Text style={styles.clusterBadgeText}>{cluster.length}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.snapLabelSmall}>
                    <Text style={styles.snapLabelTextSmall} numberOfLines={1}>
                      {cluster.length > 1 ? t('aieye.collection', {count: cluster.length, defaultValue: 'Collection'}) : (scan.disease || scan.plant)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      </View>

      {/* Segmented Control & View Button */}
      <View style={styles.bottomControls}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
          <View style={styles.toggleContainer}>
            <TouchableOpacity 
              style={[styles.toggleBtn, { paddingHorizontal: 20 }]} 
              onPress={() => handleScanPlant('camera')}
            >
              <Text style={styles.toggleText}>📷 {t('aieye.scan_plant', {defaultValue: 'Scan Plant'})}</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.toggleBtn, { paddingHorizontal: 20 }]} 
              onPress={() => handleScanPlant('gallery')}
            >
              <Text style={styles.toggleText}>🖼 {t('common.gallery', {defaultValue: 'Gallery'})}</Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity style={styles.viewBtn} onPress={() => setHistoryVisible(true)}>
            <Text style={{ fontSize: 24 }}>📄</Text>
          </TouchableOpacity>
        </View>
      </View>


      {/* Scanning progress modal */}
      <Modal visible={scanning} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.scanningModal, { alignItems: 'center', justifyContent: 'center', padding: Spacing.xl }]}>
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginBottom: Spacing.md }} />
            <Text style={styles.scanningTitle}>{t('aieye.analyzing_symptoms', {defaultValue: 'Scanning Plant...'})}</Text>
          </View>
        </View>
      </Modal>

      {/* History Modal */}
      <Modal visible={historyVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.resultSheet, { height: '80%' }]}>
             <View style={styles.scanningHeader}>
               <Text style={styles.scanningTitle}>{t('common.history', {defaultValue: 'History'})}</Text>
               <TouchableOpacity style={{marginLeft: 'auto'}} onPress={() => setHistoryVisible(false)}>
                 <Text style={{fontSize: 24, color: Colors.onSurfaceVariant}}>×</Text>
               </TouchableOpacity>
             </View>
             {scans.length === 0 ? (
               <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
                 <Text style={{color: Colors.onSurfaceVariant}}>{t('common.no_data', {defaultValue: 'No scans yet'})}</Text>
               </View>
             ) : (
               <FlatList
                 data={scans}
                 keyExtractor={item => item.id}
                 renderItem={({ item }) => (
                   <TouchableOpacity 
                     style={{
                       flexDirection: 'row', alignItems: 'center', padding: Spacing.sm,
                       borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant, gap: Spacing.md
                     }}
                     onPress={() => { setHistoryVisible(false); setResult(item); }}
                   >
                     <View style={[styles.scanThumb, { borderColor: statusColor(item.status) }]}>
                       {item.imagePath ? <Image source={{uri: item.imagePath}} style={styles.scanImage} /> : <Text>🌿</Text>}
                     </View>
                     <View style={{flex: 1}}>
                       <Text style={styles.scanPlant}>{item.plant}</Text>
                       <Text style={[styles.scanStatus, {color: statusColor(item.status)}]}>{statusEmoji(item.status)} {item.disease || 'Healthy'}</Text>
                       <Text style={styles.scanTime}>{item.time} • {item.location}</Text>
                     </View>
                   </TouchableOpacity>
                 )}
               />
             )}
          </View>
        </View>
      </Modal>

      {/* Result modal */}
      <Modal visible={!!result} transparent animationType="slide" onRequestClose={() => setResult(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.resultSheet}>
            <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm}}>
              <View style={[styles.modalHandle, {marginLeft: '40%'}]} />
              <TouchableOpacity 
                onPress={() => result && handleDeleteScan(result.id)}
                style={{ paddingHorizontal: 12, paddingVertical: 6 }}
              >
                <Text style={{fontSize: 16, color: Colors.error, fontWeight: '700'}}>{t('common.delete', {defaultValue: 'Delete'})}</Text>
              </TouchableOpacity>
            </View>
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

                  <View style={styles.sheetContent}>
                    <View style={styles.resultMeta}>
                      <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>{t('aieye.confidence', {defaultValue: 'Confidence'})}</Text>
                        <Text style={styles.metaValue}>{result.confidence}%</Text>
                      </View>
                      <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>{t('aieye.severity', {defaultValue: 'Severity'})}</Text>
                        <Text style={[styles.metaValue, { color: statusColor(result.status) }]}>{result.severity}%</Text>
                      </View>
                    </View>

                    {result.composition && (
                      <View style={styles.detailSection}>
                        <Text style={styles.sectionTitle}>🧪 {t('aieye.initial_composition', {defaultValue: 'Chemical Composition'})}</Text>
                        <Text style={styles.sectionText}>{result.composition}</Text>
                      </View>
                    )}

                    {result.management && (
                      <View style={styles.detailSection}>
                        <Text style={styles.sectionTitle}>🛡️ {t('aieye.management_plan', {defaultValue: 'Management Plan'})}</Text>
                        <Text style={styles.sectionText}>{result.management}</Text>
                      </View>
                    )}

                    <View style={styles.detailSection}>
                      <Text style={styles.sectionTitle}>📋 {t('aieye.recommendations', {defaultValue: 'Recommendations'})}</Text>
                      {result.recommendations?.map((rec, i) => (
                        <View key={i} style={styles.recItem}>
                          <Text style={styles.recDot}>•</Text>
                          <Text style={styles.recText}>{rec}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  <Text style={styles.resultRow}>📍 {t('aieye.location')}: <Text style={styles.resultValue}>{result.location}</Text></Text>
                  <Text style={styles.resultRow}>🕐 {t('aieye.time')}: <Text style={styles.resultValue}>{result.time}</Text></Text>
                  <Text style={styles.resultRow}>🔎 {t('aieye.source')}: <Text style={[styles.resultValue, { color: Colors.secondary }]}>GoFarmer AI</Text></Text>
                </View>

                <View style={styles.resultActions}>
                  <TouchableOpacity style={[styles.resultBtnSecondary, {borderColor: Colors.error}]} onPress={() => handleDeleteScan(result.id)}>
                    <Text style={[styles.resultBtnSecondaryText, {color: Colors.error}]}>{t('common.delete', {defaultValue: 'Delete'})}</Text>
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

      {/* Cluster Selection Modal */}
      <Modal visible={!!selectedCluster} transparent animationType="fade" onRequestClose={() => setSelectedCluster(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.resultSheet, { height: '60%' }]}>
            <View style={styles.scanningHeader}>
              <Text style={styles.scanningTitle}>{t('aieye.select_scan', {defaultValue: 'Select Scan'})}</Text>
              <TouchableOpacity style={{marginLeft: 'auto'}} onPress={() => setSelectedCluster(null)}>
                <Text style={{fontSize: 24, color: Colors.onSurfaceVariant}}>×</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={selectedCluster || []}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={{
                    flexDirection: 'row', alignItems: 'center', padding: Spacing.md,
                    borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant, gap: Spacing.md
                  }}
                  onPress={() => { setSelectedCluster(null); setResult(item); }}
                >
                  <View style={[styles.scanThumb, { borderColor: statusColor(item.status) }]}>
                    {item.imagePath ? <Image source={{uri: item.imagePath}} style={styles.scanImage} /> : <Text>🌿</Text>}
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={styles.scanPlant}>{item.plant}</Text>
                    <Text style={[styles.scanStatus, {color: statusColor(item.status)}]}>{statusEmoji(item.status)} {item.disease || 'Healthy'}</Text>
                    <Text style={styles.scanTime}>{item.time}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteScan(item.id)} style={{padding: Spacing.sm}}>
                    <Text style={{fontSize: 14, color: Colors.error, fontWeight: '600'}}>{t('common.delete', {defaultValue: 'Delete'})}</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
            />
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

  clusterBadge: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: Colors.primary,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#fff',
    zIndex: 10,
  },
  clusterBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

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
    padding: Spacing.md,
    width: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  scanningTitle: { ...Typography.titleMd, color: Colors.onSurface },
  
  bottomControls: {
    position: 'absolute', bottom: 30, left: 0, right: 0,
    alignItems: 'center', gap: Spacing.md, zIndex: 30,
  },
  toggleContainer: {
    flexDirection: 'row', backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.full, padding: 4, elevation: 4, shadowColor: '#000',
    shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.2, shadowRadius: 4,
  },
  toggleBtn: {
    paddingVertical: 10, borderRadius: Radius.full,
  },
  toggleText: { ...Typography.labelLg, color: Colors.primary, fontWeight: '700' },
  viewBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: '#000',
    shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.2, shadowRadius: 4,
  },
  
  fabRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: Spacing.sm,
  },
  fabSecondary: {
    width: 56, height: 56, borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceContainerHighest,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8,
    elevation: 4,
  },
  
  staticMapArea: {
    flex: 1,
    position: 'relative',
    alignItems: 'center', justifyContent: 'center',
  },
  staticMapImage: {
    width: '100%', height: '100%',
    position: 'absolute',
  },

  userAvatarContainerSmall: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: {width:0, height:3}, shadowOpacity: 0.2, shadowRadius: 4, elevation: 6
  },
  pulseDotSmall: {
    position: 'absolute', bottom: -2,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.primary,
    borderWidth: 1.5, borderColor: '#fff',
  },

  heatmapLayerSmall: {
    position: 'absolute',
    top: -60, left: -60,
    width: 120, height: 120,
    alignItems: 'center', justifyContent: 'center',
  },

  snapPinSmall: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  snapImageContainerSmall: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 2, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: {width:0, height:1}, shadowOpacity: 0.2, shadowRadius: 2, elevation: 3,
    zIndex: 2,
  },
  snapImageStack: {
    position: 'absolute',
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 2, borderColor: '#ddd',
    backgroundColor: '#eee',
  },
  snapLabelSmall: {
    marginLeft: -10,
    paddingLeft: 14, paddingRight: 8,
    paddingVertical: 4,
    backgroundColor: '#fff',
    borderRadius: Radius.full,
    shadowColor: '#000', shadowOffset: {width:0, height:1}, shadowOpacity: 0.1, shadowRadius: 2, elevation: 1,
    maxWidth: 90,
  },
  snapLabelTextSmall: { ...Typography.labelSm, fontSize: 10, color: Colors.onSurface, fontWeight: '700' },

  userAvatarContainer: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: {width:0, height:4}, shadowOpacity: 0.3, shadowRadius: 5, elevation: 8
  },
  pulseDot: {
    position: 'absolute', bottom: -5,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.primary,
    borderWidth: 2, borderColor: '#fff',
  },

  heatmapLayer: {
    position: 'absolute',
    top: -100, left: -100, // Center the 200x200 Svg
    width: 200, height: 200,
    alignItems: 'center', justifyContent: 'center',
  },

  snapPin: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  snapImageContainer: {
    width: 54, height: 54, borderRadius: 27,
    borderWidth: 3, backgroundColor: '#fff',
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
    zIndex: 2,
  },
  snapImage: { width: '100%', height: '100%' },
  snapLabel: {
    marginLeft: -15, // Overlap effect
    paddingLeft: 20, paddingRight: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderRadius: Radius.full,
    shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2,
    maxWidth: 120,
  },
  snapLabelText: { ...Typography.labelMd, color: Colors.onSurface, fontWeight: '700' },

  heatMapPoint: {
    // This is now replaced by SVG, but kept for fallback styles if needed
  },


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
  
  // New RAG UI Styles
  sheetContent: { gap: Spacing.lg, marginTop: Spacing.md },
  resultMeta: { flexDirection: 'row', gap: Spacing.md, backgroundColor: Colors.surfaceContainerHigh, padding: Spacing.md, borderRadius: Radius.md },
  metaItem: { flex: 1, alignItems: 'center' },
  metaLabel: { ...Typography.labelSm, color: Colors.onSurfaceVariant, marginBottom: 2 },
  metaValue: { ...Typography.titleMd, color: Colors.onSurface, fontWeight: '700' },
  detailSection: { backgroundColor: Colors.surfaceContainer, padding: Spacing.md, borderRadius: Radius.md, borderLeftWidth: 4, borderLeftColor: Colors.primary },
  sectionTitle: { ...Typography.titleSm, color: Colors.onSurface, marginBottom: Spacing.xs, fontWeight: '700' },
  sectionText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, lineHeight: 22 },
  recDot: { color: Colors.primary, marginRight: Spacing.sm, fontSize: 18 },
  recText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, flex: 1 },
});
