import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from '@react-native-community/geolocation';
import { Alert, PermissionsAndroid, Platform } from 'react-native';
import { INSIGHTS_API_URL } from '@env';

const CACHE_KEY = '@insights_data';
const LAST_UPDATE_KEY = '@insights_last_update';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Requests native operating system permissions for high-accuracy location tracking.
 *
 * Silently handles UI container attachment lifecycle bounds on Android to prevent crashes.
 *
 * @return {Promise<boolean>} True if permissions are granted or implicitly authorized; false on denial or exception.
 */
export const requestLocationPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'ios') return true;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location Permission',
        message: 'This app needs access to your location to fetch farm insights and weather data.',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED || granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;
  } catch (err) {
    console.warn('Location permission error:', err);
    // If we fail due to "Tried to use permissions API while not attached to an Activity"
    // we can fallback to default locations safely.
    return false;
  }
};

/**
 * Retrieves the device's current global geographic coordinates.
 *
 * Executes zero-cache fine location polling via standard community location provider engines.
 * Immediately falls back to default regional coordinates upon query error or request denial.
 *
 * @return {Promise<Coordinates>} A resolved coordinate object containing latitude and longitude fields.
 */
export const getCurrentLocation = async (): Promise<Coordinates> => {
  try {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      console.warn('Location permission denied. Using fallback coordinates.');
      return { latitude: 17.3850, longitude: 78.4867 };
    }

    return await new Promise<Coordinates>((resolve) => {
      Geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          console.warn('Geolocation error:', error);
          // Fallback to a default coordinate (e.g. Hyderabad) instead of timing out and crashing
          resolve({ latitude: 17.3850, longitude: 78.4867 });
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    });
  } catch (err) {
    console.warn('getCurrentLocation exception:', err);
    return { latitude: 17.3850, longitude: 78.4867 };
  }
};

const getFormattedDate = (date: Date) => {
  return date.toISOString().split('T')[0];
};

/**
 * Executes direct network queries against the FastAPI backend insight engine.
 *
 * Resolves current user location, formulates a 15-day forward horizon metric matrix,
 * automatically redirects loopback addresses targeting Android emulators, and writes
 * fresh responses directly to persistent storage layer blocks.
 *
 * @return {Promise<any>} Raw JSON payload structured with daily timeseries arrays.
 */
export const fetchInsightsFromApi = async () => {
  try {
    const coords = await getCurrentLocation();
    
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + 15);

    const formatDate = (date: Date) => {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    };

    const payload = {
      coordinates: [
        {
          latitude: coords.latitude,
          longitude: coords.longitude,
        }
      ],
      start_date: formatDate(today),
      end_date: formatDate(endDate),
      temperature_unit: "celsius"
    };

    // Replace 127.0.0.1 with 10.0.2.2 if on Android emulator, but we will use the ENV variable directly.
    // If the ENV URL fails due to localhost on Android emulator, you might need to change .env to use 10.0.2.2.
    let url = INSIGHTS_API_URL || 'http://127.0.0.1:8000/api/v1/insights';
    
    // Automatically swap 127.0.0.1 to 10.0.2.2 for Android emulators to avoid Network request failed
    if (Platform.OS === 'android' && url.includes('127.0.0.1')) {
      url = url.replace('127.0.0.1', '10.0.2.2');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Cache the data and timestamp
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
      data,
      fetchedAt: new Date().toISOString(),
      endDate: getFormattedDate(endDate),
    }));
    await AsyncStorage.setItem(LAST_UPDATE_KEY, new Date().toISOString());

    return data;
  } catch (error: any) {
    if (__DEV__) console.info('Silenced network error:', error?.message);
    throw new Error(error?.message || 'Failed to fetch insights from network');
  }
};

/**
 * Retrieves weather and insight timeseries matrices utilizing a cache-first optimization layout.
 *
 * Validates storage freshness to limit unneeded network traffic. Automatically pivots to local
 * cache payloads if backend calls timeout or fail due to network disconnection.
 *
 * @param {boolean} [forceUpdate=false] Direct cache bypass directive triggering fresh downloads.
 * @return {Promise<any>} The multi-day aggregated insights structure object.
 */
export const getInsights = async (forceUpdate = false) => {
  try {
    const lastUpdateStr = await AsyncStorage.getItem(LAST_UPDATE_KEY);
    const cachedDataStr = await AsyncStorage.getItem(CACHE_KEY);
    
    const now = new Date();
    let needUpdate = forceUpdate;

    if (!needUpdate) {
      if (!lastUpdateStr || !cachedDataStr) {
        needUpdate = true; // No cache
      } else {
        const lastUpdate = new Date(lastUpdateStr);
        // Check if daily update is needed
        const isSameDay = lastUpdate.getDate() === now.getDate() && 
                          lastUpdate.getMonth() === now.getMonth() && 
                          lastUpdate.getFullYear() === now.getFullYear();
        if (!isSameDay) {
          needUpdate = true;
        }
      }
    }

    if (needUpdate) {
      try {
        // Try to update from API
        const data = await fetchInsightsFromApi();
        return data;
      } catch (error) {
        // If API fails (e.g., no internet), fallback to cache if available
        if (cachedDataStr) {
          const cachedPayload = JSON.parse(cachedDataStr);
          checkEndDateWarning(cachedPayload.endDate);
          return cachedPayload.data;
        } else {
          throw new Error('No internet and no cached data available.');
        }
      }
    } else {
      // Use cache
      const cachedPayload = JSON.parse(cachedDataStr!);
      checkEndDateWarning(cachedPayload.endDate);
      return cachedPayload.data;
    }
  } catch (error: any) {
    if (__DEV__) console.info('getInsights cache fallback note:', error?.message);
    throw error;
  }
};

/**
 * Validates cached insight timelines against present device wall-clock bounds.
 *
 * Triggers native feedback dialogue alerts reminding users to re-sync if cache validity has expired.
 *
 * @param {string} endDateStr Cached date boundary string serialized in ISO format.
 */
const checkEndDateWarning = (endDateStr: string) => {
  if (!endDateStr) return;
  const endDate = new Date(endDateStr);
  const now = new Date();
  
  if (now >= endDate) {
    Alert.alert(
      'Update Required',
      'Please update the weather/insights. The cached data has expired.',
      [{ text: 'OK' }]
    );
  }
};
