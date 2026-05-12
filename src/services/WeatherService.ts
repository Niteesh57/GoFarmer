import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = '@insights_data';

/**
 * Retrieves cached agricultural weather data and formats a 7-day forward horizon metrics table.
 *
 * Filters timeseries metrics starting strictly from current device date to exclude stale historical
 * records. Compiles maximum/minimum temperature bounds, rainfall prediction metrics, reference
 * evapotranspiration (ET0/soil evaporation), and atmospheric wind speeds into a standard markdown table.
 *
 * @return {Promise<string>} Formatted multi-column markdown table summary string.
 */
export const getFormattedWeatherSummary = async (): Promise<string> => {
  try {
    const cachedDataStr = await AsyncStorage.getItem(CACHE_KEY);
    if (!cachedDataStr) {
      return 'No cached weather data available.';
    }

    const cachedPayload = JSON.parse(cachedDataStr);
    const weatherData = cachedPayload?.data;
    const timeseries = weatherData?.timeseries?.daily;

    if (!timeseries || !timeseries.dates || !Array.isArray(timeseries.dates)) {
      return 'Weather timeseries structure is missing or malformed.';
    }

    const dates: string[] = timeseries.dates;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Locate the index corresponding precisely to today's date, or first active sliding window index
    let todayIndex = dates.indexOf(todayStr);
    if (todayIndex === -1) {
      todayIndex = dates.findIndex((d) => d >= todayStr);
      if (todayIndex === -1) {
        todayIndex = 0;
      }
    }

    // Extract a precise 7-day sliding window horizon
    const targetIndices: number[] = [];
    for (let i = 0; i < 7; i++) {
      const idx = todayIndex + i;
      if (idx < dates.length) {
        targetIndices.push(idx);
      }
    }

    if (targetIndices.length === 0) {
      return 'No active weather forecast dates found matching the requested timeframe.';
    }

    // Construct Markdown Table Header
    let tableOutput = '| Date | High Temp (°C) | Low Temp (°C) | Rainfall (mm) | Soil Evap (ET0 mm) | Wind Speed (km/h) |\n';
    tableOutput += '| :--- | :---: | :---: | :---: | :---: | :---: |\n';

    // Populate rows corresponding to target sliding window timeframe
    for (const idx of targetIndices) {
      const dateVal = dates[idx] || 'N/A';
      const maxTemp = timeseries.temp_max?.[idx] !== undefined ? `${timeseries.temp_max[idx]}` : '--';
      const minTemp = timeseries.temp_min?.[idx] !== undefined ? `${timeseries.temp_min[idx]}` : '--';
      const rainfall = timeseries.rainfall?.[idx] !== undefined ? `${timeseries.rainfall[idx]}` : '0';
      const et0 = timeseries.et0?.[idx] !== undefined ? `${timeseries.et0[idx]}` : '--';
      const windSpeed = timeseries.wind_speed?.[idx] !== undefined ? `${timeseries.wind_speed[idx]}` : '--';

      tableOutput += `| ${dateVal} | ${maxTemp} | ${minTemp} | ${rainfall} | ${et0} | ${windSpeed} |\n`;
    }

    return tableOutput.trim();
  } catch (error) {
    console.error('[WeatherService] Error generating formatted summary table:', error);
    return 'Failed to compute formatted weather summary.';
  }
};
