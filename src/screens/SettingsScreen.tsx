import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Modal, Alert, ActivityIndicator, Linking, Platform, TextInput
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import TopAppBar from '../components/TopAppBar';
import { Toast } from '../components/Toast';
import { Colors, Typography, Spacing, Radius } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import { getAppLangCode } from '../utils/langHelper';
import { getInsights } from '../services/InsightsService';
import { CROP_CATEGORIES } from '../utils/cropData';

// "?"?"? Types "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
interface ModelInfo {
  id: string;
  name: string;
  size: string;
  status: 'downloaded' | 'downloading' | 'not_downloaded';
  offline: boolean;
  version?: string;
  lastUsed?: string;
  progress?: number;
  description?: string;
}

const MODELS: ModelInfo[] = [
  { id: 'gemma4', name: 'Cactus-Compute/gemma-4-E2B-it', size: '4.5 GB', status: 'downloaded', offline: true, version: '1.0', lastUsed: 'Today' },
  { id: 'disease', name: 'Plant Disease Detection', size: '320 MB', status: 'not_downloaded', offline: false, description: 'Recommended for offline plant scanning' },
];

const APP_LANGUAGES = ['🇬🇧 English', '🇮🇳 हिंदी', '🇫🇷 Français', '🇪🇸 Español'];
const CONTENT_LANGUAGES = ['🇮🇳 Hindi', '🇬🇧 English', '🇫🇷 Français', '🇪🇸 Español'];
const TEMP_UNITS = ['°C Celsius', '°F Fahrenheit', 'K Kelvin'];

  export default function SettingsScreen() {
    const { t, i18n } = useTranslation();
    const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>('light');

  // Language & locale
  const [appLang, setAppLang] = useState(APP_LANGUAGES[0]);
  const [contentLang, setContentLang] = useState(CONTENT_LANGUAGES[0]);
  const [tempUnit, setTempUnit] = useState(TEMP_UNITS[0]);
  const [activeCrop, setActiveCrop] = useState<string>('Wheat');
  const [cropModalVisible, setCropModalVisible] = useState(false);

    useEffect(() => {
      AsyncStorage.getItem('@content_lang').then(lang => {
        if (lang) setContentLang(lang);
      });
      AsyncStorage.getItem('@gofarmer_app_lang_label').then(lang => {
        if (lang) setAppLang(lang);
      });
      AsyncStorage.getItem('@temp_unit').then(unit => {
        if (unit) setTempUnit(unit);
      });
      AsyncStorage.getItem('@active_crop').then(crop => {
        if (crop) setActiveCrop(crop);
      });
    }, []);

  // Notifications
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [weatherWarn, setWeatherWarn] = useState(true);

  // Models
  const [models, setModels] = useState<ModelInfo[]>(MODELS);

  // Picker modal
  const [pickerModal, setPickerModal] = useState<{ type: string; options: string[] } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as 'success' | 'error' | 'info' });

  const [isUpdatingInsights, setIsUpdatingInsights] = useState(false);

  // Storage State
  const [deviceTotal, setDeviceTotal] = useState(256); // GB
  const [appDataSize, setAppDataSize] = useState(12.4); // MB (Data/Logs)
  const [appImagesSize, setAppImagesSize] = useState(84.2); // MB (Scans)
  const [appModelsSize, setAppModelsSize] = useState(4.5); // GB (Gemma 4)

  // Auto-update insights daily on load
  useEffect(() => {
    getInsights(false).catch(err => console.log('Auto-update insights failed:', err));
    calculateStorage();
    checkModelFile();
  }, []);

  const checkModelFile = async () => {
    // Simulated check for /data/local/tmp/gemma-4-e2b-it
    // In a real app with react-native-fs, you'd use: const exists = await RNFS.exists('/data/local/tmp/gemma-4-e2b-it');
    const pathExists = true; // Simulated success for this demo
    
    setModels(prev => prev.map(m => {
      if (m.id === 'gemma4') {
        return {
          ...m,
          status: pathExists ? 'downloaded' : 'not_downloaded',
          offline: pathExists
        };
      }
      return m;
    }));
  };

  const calculateStorage = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      // Simple heuristic: ~10KB per key for data
      setAppDataSize(Math.min(keys.length * 12, 1024 * 50) / 1024); // MB
    } catch (e) {}
  };

  const handleOpenStorageSettings = () => {
    if (Platform.OS === 'android') {
      // Direct link to App Info is usually best for storage management
      Linking.openSettings();
    } else {
      Linking.openURL('app-settings:');
    }
  };

  const handleClearCache = () => {
    setConfirmModal({
      title: 'Clear Cache & Data',
      message: 'This will remove all saved crop suggestions, advisor history, and temporary cache files. Are you sure?',
      onConfirm: async () => {
        try {
          await AsyncStorage.multiRemove(['@user_crops', '@advisor_history_v2', '@advisor_history']);
          
          
          setConfirmModal(null);
          showToast(t('settings.cache_cleared'), 'success');
        } catch (e) {
          showToast(t('settings.failed_clear'), 'error');
        }
      }
    });
  };

  const handleUpdateInsights = async () => {
    setIsUpdatingInsights(true);
    try {
      await getInsights(true);
      showToast(t('common.insights_updated'), 'success');
    } catch (error) {
      showToast(t('common.failed_update'), 'error');
    } finally {
      setIsUpdatingInsights(false);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ visible: true, message, type });
  };

  const openPicker = (type: string, options: string[]) => setPickerModal({ type, options });

  const selectOption = (value: string) => {
    if (!pickerModal) return;
    switch (pickerModal.type) {
      case 'appLang': 
        setAppLang(value);
        AsyncStorage.setItem('@gofarmer_app_lang_label', value);
        const code = getAppLangCode(value);
        AsyncStorage.setItem('@gofarmer_language', code);
        i18n.changeLanguage(code);
        break;
      case 'contentLang': 
        setContentLang(value); 
        AsyncStorage.setItem('@content_lang', value);
        break;
      case 'tempUnit': 
        setTempUnit(value); 
        AsyncStorage.setItem('@temp_unit', value);
        break;
    }
    setPickerModal(null);
    showToast('Preference saved', 'success');
  };

  const handleSelectCrop = (crop: string) => {
    setActiveCrop(crop);
    AsyncStorage.setItem('@active_crop', crop);
    setCropModalVisible(false);
    showToast(`${t('settings.active_crop')} ${crop}`, 'success');
  };

  const handleModelAction = (model: ModelInfo, action: 'download' | 'delete' | 'pause') => {
    if (action === 'download') {
      setModels(prev => prev.map(m => m.id === model.id ? { ...m, status: 'downloading', progress: 0 } : m));
      showToast(`Downloading ${model.name}...`, 'info');
      // Simulate download
      let p = 0;
      const interval = setInterval(() => {
        p += 10;
        setModels(prev => prev.map(m => m.id === model.id ? { ...m, progress: p } : m));
        if (p >= 100) {
          clearInterval(interval);
          setModels(prev => prev.map(m => m.id === model.id ? { ...m, status: 'downloaded', offline: true, progress: undefined } : m));
          showToast(`${model.name} downloaded!`, 'success');
        }
      }, 500);
    } else if (action === 'delete') {
      setConfirmModal({
        title: 'Delete Model',
        message: `Delete ${model.name}? This will require re-downloading to use offline.`,
        onConfirm: () => {
          setModels(prev => prev.map(m => m.id === model.id ? { ...m, status: 'not_downloaded', offline: false, progress: undefined } : m));
          setConfirmModal(null);
          showToast(t('settings.model_deleted', { name: model.name }), 'info');
        },
      });
    } else if (action === 'pause') {
      setModels(prev => prev.map(m => m.id === model.id ? { ...m, status: 'not_downloaded', progress: undefined } : m));
      showToast(t('settings.download_paused'), 'info');
    }
  };

  const totalAppStorageGB = appModelsSize + (appDataSize / 1024) + (appImagesSize / 1024);
  const storagePct = (totalAppStorageGB / deviceTotal) * 100;

  return (
    <View style={[styles.flex, { backgroundColor: Colors.background }]}>
      <TopAppBar title="GoFarmer" />

      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Storage */}
        <View style={[styles.sectionCard, { backgroundColor: Colors.surfaceContainerLowest, borderColor: Colors.outlineVariant }]}>
          <View style={styles.storageHeader}>
            <Text style={[styles.sectionHeader, { color: Colors.onSurface }]}>📱 {t('settings.device_storage')}</Text>
            <View style={styles.deviceBadge}>
              <Text style={styles.deviceBadgeText}>{t('settings.device_badge', { total: deviceTotal })}</Text>
            </View>
          </View>

          <View style={styles.storageMain}>
            <Text style={[styles.storageLabel, { color: Colors.onSurface }]}>
              {t('settings.app_usage')} <Text style={{ fontWeight: '700', color: Colors.primary }}>{totalAppStorageGB.toFixed(2)} GB</Text>
            </Text>
            <View style={[styles.storageTrack, { backgroundColor: Colors.surfaceContainerHighest }]}>
              <View style={[styles.storageFill, { width: `${Math.max(storagePct, 2)}%`, backgroundColor: Colors.primary }]} />
            </View>
          </View>

            <View style={styles.storageBreakdown}>
              <View style={styles.breakdownItem}>
                <View style={[styles.breakdownIconContainer, { backgroundColor: Colors.primaryContainer + '22' }]}>
                  <Text style={styles.breakdownIcon}>🧠</Text>
                </View>
                <View style={styles.breakdownInfo}>
                  <Text style={[styles.breakdownTitle, { color: Colors.onSurface }]}>{t('settings.ai_models')}</Text>
                  <Text style={[styles.breakdownSize, { color: Colors.onSurfaceVariant }]}>{appModelsSize.toFixed(1)} GB</Text>
                </View>
              </View>
              <View style={styles.breakdownItem}>
                <View style={[styles.breakdownIconContainer, { backgroundColor: Colors.tertiaryContainer + '22' }]}>
                  <Text style={styles.breakdownIcon}>🖼️</Text>
                </View>
                <View style={styles.breakdownInfo}>
                  <Text style={[styles.breakdownTitle, { color: Colors.onSurface }]}>{t('settings.plant_scans')}</Text>
                  <Text style={[styles.breakdownSize, { color: Colors.onSurfaceVariant }]}>{appImagesSize.toFixed(1)} MB</Text>
                </View>
              </View>
              <View style={styles.breakdownItem}>
                <View style={[styles.breakdownIconContainer, { backgroundColor: Colors.secondaryContainer + '22' }]}>
                  <Text style={styles.breakdownIcon}>📊</Text>
                </View>
                <View style={styles.breakdownInfo}>
                  <Text style={[styles.breakdownTitle, { color: Colors.onSurface }]}>{t('settings.data_logs')}</Text>
                  <Text style={[styles.breakdownSize, { color: Colors.onSurfaceVariant }]}>{appDataSize.toFixed(2)} MB</Text>
                </View>
              </View>
            </View>

          <View style={styles.row}>
            <TouchableOpacity style={[styles.outlineBtn, { borderColor: Colors.outline }]} onPress={handleClearCache}>
              <Text style={[styles.outlineBtnText, { color: Colors.onSurface }]}>{t('settings.clear_cache')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.outlineBtn, { borderColor: Colors.primary, backgroundColor: Colors.primaryContainer + '11' }]} onPress={handleOpenStorageSettings}>
              <Text style={[styles.outlineBtnText, { color: Colors.primary, fontWeight: '700' }]}>{t('settings.storage_settings')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* AI Models */}
        <View style={styles.sectionCard}>
          <Text style={[styles.sectionHeader, { color: Colors.onSurface }]}>🤖 {t('settings.ai_models')}</Text>
          {models.map(model => (
            <View key={model.id} style={[styles.modelCard, { backgroundColor: Colors.surfaceContainerLow, borderColor: Colors.outlineVariant }]}>
              <View style={styles.modelTop}>
                <View style={styles.modelInfo}>
                  <Text style={[styles.modelName, { color: Colors.onSurface }]}>{model.name}</Text>
                  <Text style={[styles.modelSize, { color: Colors.onSurfaceVariant }]}>{model.size}</Text>
                </View>
                <View style={[styles.modelStatusBadge, {
                  backgroundColor:
                    model.status === 'downloaded' ? Colors.primaryContainer + '44' :
                    model.status === 'downloading' ? Colors.tertiaryContainer + '44' :
                    Colors.surfaceContainerHigh,
                }]}>
                  <Text style={[styles.modelStatusText, { color: Colors.onSurface }]}>
                    {model.status === 'downloaded' ? `✓ ${t('radio.downloaded')}` :
                     model.status === 'downloading' ? `⏳ ${t('settings.downloading')}` : `⭕ ${t('settings.not_downloaded')}`}
                  </Text>
                </View>
              </View>

              <View style={styles.modelMeta}>
                <Text style={[styles.modelMetaText, { color: Colors.onSurfaceVariant }]}>
                  {model.offline ? '📴 Offline: Yes' : '🌐 Requires internet'}
                </Text>
                {model.version && <Text style={[styles.modelMetaText, { color: Colors.onSurfaceVariant }]}>v{model.version} · Used {model.lastUsed}</Text>}
              </View>

              {model.status === 'downloading' && (
                <View style={styles.downloadProgress}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${model.progress ?? 0}%` }]} />
                  </View>
                  <Text style={styles.progressPct}>{model.progress ?? 0}%</Text>
                </View>
              )}

              {model.description && (
                <Text style={styles.modelDesc}>ℹ {model.description}</Text>
              )}

              <View style={styles.modelActions}>
                {model.status === 'downloaded' && (
                  <>
                    <TouchableOpacity style={styles.modelActionBtn} onPress={() => handleModelAction(model, 'delete')}>
                      <Text style={[styles.modelActionText, { color: Colors.error }]}>{t('settings.delete')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modelActionBtn}>
                      <Text style={styles.modelActionText}>{t('settings.reinstall')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modelActionBtn}>
                      <Text style={styles.modelActionText}>{t('settings.update')}</Text>
                    </TouchableOpacity>
                  </>
                )}
                {model.status === 'downloading' && (
                  <>
                    <TouchableOpacity style={styles.modelActionBtn} onPress={() => handleModelAction(model, 'pause')}>
                      <Text style={styles.modelActionText}>{t('settings.pause')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modelActionBtn} onPress={() => handleModelAction(model, 'pause')}>
                      <Text style={[styles.modelActionText, { color: Colors.error }]}>{t('settings.cancel_download')}</Text>
                    </TouchableOpacity>
                  </>
                )}
                {model.status === 'not_downloaded' && (
                  <TouchableOpacity style={[styles.modelActionBtn, styles.downloadBtn]} onPress={() => handleModelAction(model, 'download')}>
                    <Text style={[styles.modelActionText, { color: Colors.onPrimary }]}>⬇ {t('settings.download_btn')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* Farm Management */}
        <View style={styles.sectionCard}>
          <Text style={[styles.sectionHeader, { color: Colors.onSurface }]}>🚜 {t('settings.farm_management')}</Text>
          
          <View style={styles.preferenceItem}>
            <Text style={styles.prefLabel}>{t('settings.active_crop')}</Text>
            <TouchableOpacity style={styles.prefSelect} onPress={() => setCropModalVisible(true)}>
              <Text style={styles.prefValue}>{activeCrop}</Text>
              <Text style={styles.prefArrow}>▼</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.preferenceItem}>
            <Text style={styles.prefLabel}>{t('settings.custom_crop')}</Text>
            <View style={styles.customCropContainer}>
              <TextInput
                style={styles.customCropInput}
                placeholder={t('advisor.placeholder')}
                placeholderTextColor={Colors.onSurfaceVariant}
                value={activeCrop}
                onChangeText={(text) => {
                  setActiveCrop(text);
                  AsyncStorage.setItem('@active_crop', text);
                }}
              />
            </View>
          </View>
        </View>

        {/* Data Sync & Insights */}

        {/* Language */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>🌍 {t('settings.language_localization')}</Text>

          <View style={styles.preferenceItem}>
            <Text style={styles.prefLabel}>{t('settings.app_lang')}</Text>
            <TouchableOpacity style={styles.prefSelect} onPress={() => openPicker('appLang', APP_LANGUAGES)}>
              <Text style={styles.prefValue}>{appLang}</Text>
              <Text style={styles.prefArrow}>▼</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.preferenceItem}>
            <Text style={styles.prefLabel}>{t('settings.content_lang')}</Text>
            <TouchableOpacity style={styles.prefSelect} onPress={() => openPicker('contentLang', CONTENT_LANGUAGES)}>
              <Text style={styles.prefValue}>{contentLang}</Text>
              <Text style={styles.prefArrow}>▼</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.preferenceItem}>
            <Text style={styles.prefLabel}>{t('settings.temp_unit')}</Text>
            <TouchableOpacity style={styles.prefSelect} onPress={() => openPicker('tempUnit', TEMP_UNITS)}>
              <Text style={styles.prefValue}>{tempUnit}</Text>
              <Text style={styles.prefArrow}>▼</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Notifications */}
        <View style={[styles.sectionCard, { backgroundColor: Colors.surfaceContainerLowest, borderColor: Colors.outlineVariant }]}>
          <Text style={[styles.sectionHeader, { color: Colors.onSurface }]}>🔔 {t('settings.notifications_alerts')}</Text>

          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: Colors.onSurface }]}>{t('settings.enable_notif')}</Text>
            <Switch value={notifEnabled} onValueChange={setNotifEnabled} trackColor={{ true: Colors.primaryContainer, false: Colors.outlineVariant }} thumbColor={notifEnabled ? Colors.primary : '#f4f3f4'} />
          </View>

          {notifEnabled && (
            <View style={styles.subToggles}>
              {[
                { label: `⛈ ${t('settings.weather_warn')}`, val: weatherWarn, set: setWeatherWarn },
              ].map(({ label, val, set }) => (
                <View key={label} style={styles.toggleRow}>
                  <Text style={[styles.subToggleLabel, { color: Colors.onSurface }]}>{label}</Text>
                  <Switch
                    value={val}
                    onValueChange={set}
                    trackColor={{ true: Colors.primaryContainer, false: Colors.outlineVariant }}
                    thumbColor={val ? Colors.primary : '#f4f3f4'}
                    style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                  />
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Appearance - Hidden for now
        <View style={[styles.sectionCard, { backgroundColor: Colors.surfaceContainerLowest, borderColor: Colors.outlineVariant }]}>
          <Text style={[styles.sectionHeader, { color: Colors.onSurface }]}>🎨 Appearance</Text>
          <Text style={[styles.prefLabel, { color: Colors.onSurfaceVariant }]}>Theme Mode:</Text>
          <View style={styles.themeSelector}>
            {(['light', 'dark', 'auto'] as const).map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.themeBtn, theme === t && [styles.themeBtnActive, { borderColor: Colors.primary, backgroundColor: Colors.primaryContainer + '33' }]]}
                onPress={() => setTheme(t)}
              >
                <Text style={styles.themeIcon}>{t === 'light' ? '☀️' : t === 'dark' ? '🌙' : '⚙️'}</Text>
                <Text style={[styles.themeBtnText, { color: Colors.onSurfaceVariant }, theme === t && [styles.themeBtnTextActive, { color: Colors.primary }]]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        */}

        {/* About */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>ℹ {t('settings.about_support')}</Text>
          <Text style={styles.aboutText}>{t('settings.version')} 1.0.0  ·  Build: 20260503</Text>
          <Text style={styles.aboutText}>{t('settings.developer')} GoFarmer Team</Text>

          <View style={styles.aboutLinks}>
            {[`📖 ${t('settings.user_guide')}`].map(link => (
              <TouchableOpacity key={link} style={[styles.aboutLink, { borderBottomWidth: 0 }]}>
                <Text style={styles.aboutLinkText}>{link}</Text>
                <Text style={styles.aboutLinkArrow}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Picker modal */}
      <Modal visible={!!pickerModal} transparent animationType="slide" onRequestClose={() => setPickerModal(null)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.handle} />
            <Text style={styles.pickerTitle}>{t('common.select')} {pickerModal?.type === 'appLang' ? t('settings.app_lang') : pickerModal?.type === 'contentLang' ? t('settings.content_lang') : t('settings.temp_unit')}</Text>
            <ScrollView>
              {pickerModal?.options.map(opt => (
                <TouchableOpacity key={opt} style={styles.pickerOpt} onPress={() => selectOption(opt)}>
                  <Text style={styles.pickerOptText}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Confirm modal */}
      <Modal visible={!!confirmModal} transparent animationType="fade">
        <View style={styles.confirmOverlay}>
          <View style={[styles.confirmBox, { backgroundColor: Colors.surfaceContainerLowest }]}>
            <Text style={[styles.confirmTitle, { color: Colors.onSurface }]}>{confirmModal?.title}</Text>
            <Text style={[styles.confirmMsg, { color: Colors.onSurfaceVariant }]}>{confirmModal?.message}</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setConfirmModal(null)}>
                <Text style={[styles.cancelBtnText, { color: Colors.onSurface }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: Colors.primary }]} onPress={confirmModal?.onConfirm}>
                <Text style={[styles.confirmBtnText, { color: Colors.onPrimary }]}>{t('common.confirm')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Crop Picker Modal */}
      <Modal visible={cropModalVisible} transparent animationType="slide" onRequestClose={() => setCropModalVisible(false)}>
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerSheet, { maxHeight: '80%' }]}>
            <View style={styles.handle} />
            <View style={styles.pickerHeaderRow}>
              <Text style={styles.pickerTitle}>{t('settings.select_crop')}</Text>
              <TouchableOpacity onPress={() => setCropModalVisible(false)}>
                <Text style={{ color: Colors.primary, fontWeight: 'bold' }}>{t('common.done')}</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView showsVerticalScrollIndicator={false}>
              {Object.entries(CROP_CATEGORIES).map(([key, list]) => (
                <View key={key} style={styles.cropSection}>
                  <Text style={styles.cropCategoryHeader}>{t(`settings.${key}`)}</Text>
                  <View style={styles.cropGrid}>
                    {list.map(crop => (
                      <TouchableOpacity 
                        key={crop} 
                        style={[styles.cropChip, activeCrop === crop && styles.cropChipActive]} 
                        onPress={() => handleSelectCrop(crop)}
                      >
                        <Text style={[styles.cropChipText, activeCrop === crop && styles.cropChipTextActive]}>{crop}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={() => setToast(t => ({ ...t, visible: false }))} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.margin, paddingBottom: 100, gap: Spacing.lg },

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
  sectionHeader: { ...Typography.titleMd, color: Colors.onSurface, fontWeight: '700' },
  storageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  deviceBadge: { backgroundColor: Colors.surfaceContainerHigh, paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.sm },
  deviceBadgeText: { ...Typography.labelSm, color: Colors.onSurfaceVariant },
  storageMain: { gap: 8 },
  storageLabel: { ...Typography.bodyLg, color: Colors.onSurface },
  storageTrack: { height: 10, backgroundColor: Colors.surfaceContainerHighest, borderRadius: Radius.full, overflow: 'hidden' },
  storageFill: { height: '100%', borderRadius: Radius.full },
  storageBreakdown: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, flexWrap: 'wrap', gap: 12 },
  breakdownItem: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: '28%' },
  breakdownIconContainer: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  breakdownIcon: { fontSize: 18 },
  breakdownInfo: { gap: 1 },
  breakdownTitle: { ...Typography.labelSm, fontWeight: '700' },
  breakdownSize: { ...Typography.labelSm, fontSize: 11 },
  storageDetail: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
  row: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  outlineBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderRadius: Radius.DEFAULT,
    borderWidth: 1, borderColor: Colors.outline,
  },
  outlineBtnText: { ...Typography.labelLg, color: Colors.onSurface },

  modelCard: {
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.outlineVariant,
    padding: Spacing.md, gap: Spacing.sm,
    backgroundColor: Colors.surfaceContainerLow,
  },
  modelTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.sm },
  modelInfo: { flex: 1 },
  modelName: { ...Typography.titleSm, color: Colors.onSurface, fontWeight: '700' },
  modelSize: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
  modelStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  modelStatusText: { ...Typography.labelSm, color: Colors.onSurface },
  modelMeta: { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' },
  modelMetaText: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
  downloadProgress: { gap: 4 },
  progressTrack: { height: 6, backgroundColor: Colors.surfaceContainerHighest, borderRadius: Radius.full, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: Radius.full },
  progressPct: { ...Typography.labelMd, color: Colors.primary },
  modelDesc: { ...Typography.bodySm, color: Colors.onSurfaceVariant, fontStyle: 'italic' },
  modelActions: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  modelActionBtn: {
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
    borderRadius: Radius.DEFAULT,
    borderWidth: 1, borderColor: Colors.outlineVariant,
  },
  modelActionText: { ...Typography.labelMd, color: Colors.onSurface },
  downloadBtn: { backgroundColor: Colors.primary, borderColor: Colors.primary },

  preferenceItem: { gap: 4 },
  prefLabel: { ...Typography.labelMd, color: Colors.onSurfaceVariant },
  prefSelect: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: Colors.outlineVariant,
    borderRadius: Radius.DEFAULT,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    backgroundColor: Colors.surfaceContainerLow,
  },
  prefValue: { ...Typography.bodyLg, color: Colors.onSurface },
  prefArrow: { ...Typography.labelSm, color: Colors.onSurfaceVariant },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { ...Typography.bodyLg, color: Colors.onSurface },
  subToggles: { paddingLeft: Spacing.md, gap: Spacing.sm },
  subToggleLabel: { ...Typography.bodyMd, color: Colors.onSurface, flex: 1 },

  themeSelector: { flexDirection: 'row', gap: Spacing.sm },
  themeBtn: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.sm,
    borderRadius: Radius.DEFAULT,
    borderWidth: 1, borderColor: Colors.outlineVariant,
    gap: 4,
  },
  themeBtnActive: { backgroundColor: Colors.primaryContainer + '33', borderColor: Colors.primary },
  themeIcon: { fontSize: 22 },
  themeBtnText: { ...Typography.labelMd, color: Colors.onSurfaceVariant },
  themeBtnTextActive: { color: Colors.primary, fontWeight: '700' },

  aboutText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
  aboutLinks: { gap: 0 },
  aboutLink: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant,
  },
  aboutLinkText: { ...Typography.bodyLg, color: Colors.onSurface },
  aboutLinkArrow: { fontSize: 20, color: Colors.onSurfaceVariant },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg,
    padding: Spacing.lg, maxHeight: '50%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.outlineVariant, alignSelf: 'center', marginBottom: Spacing.md },
  pickerTitle: { ...Typography.titleMd, color: Colors.onSurface, marginBottom: Spacing.md },
  pickerOpt: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant },
  pickerOptText: { ...Typography.bodyLg, color: Colors.onSurface },

  confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  confirmBox: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    width: '100%', gap: Spacing.md,
  },
  confirmTitle: { ...Typography.titleMd, color: Colors.onSurface, fontWeight: '700' },
  confirmMsg: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
  confirmActions: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'flex-end' },
  cancelBtn: { paddingHorizontal: Spacing.md, paddingVertical: 10 },
  cancelBtnText: { ...Typography.labelLg, color: Colors.onSurface },
  confirmBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    backgroundColor: Colors.primary, borderRadius: Radius.DEFAULT,
  },
  confirmBtnText: { ...Typography.labelLg, color: Colors.onPrimary, fontWeight: '700' },

  customCropContainer: { marginTop: 4 },
  customCropInput: {
    backgroundColor: Colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    ...Typography.bodyLg,
    color: Colors.onSurface,
  },
  pickerHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  cropSection: { marginBottom: Spacing.lg },
  cropCategoryHeader: { ...Typography.labelLg, color: Colors.primary, fontWeight: '700', marginBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant, paddingBottom: 4 },
  cropGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cropChip: { 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: Radius.full, 
    backgroundColor: Colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: Colors.outlineVariant
  },
  cropChipActive: { backgroundColor: Colors.primaryContainer, borderColor: Colors.primary },
  cropChipText: { ...Typography.labelMd, color: Colors.onSurface },
  cropChipTextActive: { color: Colors.onPrimaryContainer, fontWeight: '700' },
});
