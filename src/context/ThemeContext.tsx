import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useColorScheme, Appearance } from 'react-native';
import { Colors as BaseColors } from '../theme/theme';

type ThemeMode = 'light' | 'dark' | 'auto';

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  isDark: boolean;
  colors: typeof BaseColors;
}

const DarkColors: typeof BaseColors = {
  ...BaseColors,
  primary: '#78dc77',
  onPrimary: '#003909',
  primaryContainer: '#005313',
  onPrimaryContainer: '#94f990',
  
  secondary: '#ddc1b7',
  onSecondary: '#3e2d26',
  secondaryContainer: '#56423b',
  onSecondaryContainer: '#fadcd2',
  
  tertiary: '#a5c8ff',
  onTertiary: '#00315e',
  tertiaryContainer: '#004786',
  onTertiaryContainer: '#d4e3ff',
  
  error: '#ffb4ab',
  onError: '#690005',
  errorContainer: '#93000a',
  onErrorContainer: '#ffdad6',
  
  surface: '#11140e',
  surfaceDim: '#11140e',
  surfaceBright: '#373a33',
  surfaceContainerLowest: '#0c0f09',
  surfaceContainerLow: '#191c16',
  surfaceContainer: '#1d211a',
  surfaceContainerHigh: '#282b24',
  surfaceContainerHighest: '#33362e',
  surfaceVariant: '#42493f',
  onSurface: '#e1e3da',
  onSurfaceVariant: '#c2c8bc',
  inverseSurface: '#e1e3da',
  inverseOnSurface: '#2e312c',
  
  outline: '#8c9388',
  outlineVariant: '#42493f',
  
  background: '#11140e',
  onBackground: '#e1e3da',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [theme, setThemeState] = useState<ThemeMode>('light');

  useEffect(() => {
    // Load saved theme from storage if needed
  }, []);

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
  };

  const isDark = useMemo(() => {
    if (theme === 'auto') return systemColorScheme === 'dark';
    return theme === 'dark';
  }, [theme, systemColorScheme]);

  const colors = useMemo(() => (isDark ? DarkColors : BaseColors), [isDark]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};
