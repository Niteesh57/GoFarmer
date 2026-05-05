// GoFarmer Material Design 3 Design Tokens
export const Colors = {
  // Primary (Green – Growth)
  primary: '#006e1c',
  onPrimary: '#ffffff',
  primaryContainer: '#4caf50',
  onPrimaryContainer: '#003c0b',
  inversePrimary: '#78dc77',
  primaryFixed: '#94f990',
  primaryFixedDim: '#78dc77',
  onPrimaryFixed: '#002204',
  onPrimaryFixedVariant: '#005313',

  // Secondary (Brown – Earth)
  secondary: '#6f5a52',
  onSecondary: '#ffffff',
  secondaryContainer: '#fadcd2',
  onSecondaryContainer: '#766057',
  secondaryFixed: '#fadcd2',
  secondaryFixedDim: '#ddc1b7',
  onSecondaryFixed: '#271812',
  onSecondaryFixedVariant: '#56423b',

  // Tertiary (Blue – Sky/Water)
  tertiary: '#005faf',
  onTertiary: '#ffffff',
  tertiaryContainer: '#519dfb',
  onTertiaryContainer: '#003363',
  tertiaryFixed: '#d4e3ff',
  tertiaryFixedDim: '#a5c8ff',
  onTertiaryFixed: '#001c3a',
  onTertiaryFixedVariant: '#004786',

  // Error
  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',

  // Surface
  surface: '#f5fbef',
  surfaceDim: '#d6dcd0',
  surfaceBright: '#f5fbef',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f0f6ea',
  surfaceContainer: '#eaf0e4',
  surfaceContainerHigh: '#e4eade',
  surfaceContainerHighest: '#dee4d9',
  surfaceVariant: '#dee4d9',
  onSurface: '#171d16',
  onSurfaceVariant: '#3f4a3c',
  inverseSurface: '#2c322a',
  inverseOnSurface: '#edf3e7',
  surfaceTint: '#006e1c',

  // Outline
  outline: '#6f7a6b',
  outlineVariant: '#becab9',

  // Background
  background: '#f5fbef',
  onBackground: '#171d16',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  margin: 16,
  gutter: 16,
};

export const Radius = {
  sm: 4,
  DEFAULT: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const Typography = {
  displayLg: { fontFamily: 'Roboto', fontSize: 57, fontWeight: '400' as const, lineHeight: 64 },
  displayMd: { fontFamily: 'Roboto', fontSize: 45, fontWeight: '400' as const, lineHeight: 52 },
  displaySm: { fontFamily: 'Roboto', fontSize: 36, fontWeight: '400' as const, lineHeight: 44 },
  headlineLg: { fontFamily: 'Roboto', fontSize: 32, fontWeight: '400' as const, lineHeight: 40 },
  headlineMd: { fontFamily: 'Roboto', fontSize: 28, fontWeight: '400' as const, lineHeight: 36 },
  headlineSm: { fontFamily: 'Roboto', fontSize: 24, fontWeight: '400' as const, lineHeight: 32 },
  titleLg: { fontFamily: 'Roboto', fontSize: 22, fontWeight: '500' as const, lineHeight: 28 },
  titleMd: { fontFamily: 'Roboto', fontSize: 16, fontWeight: '500' as const, lineHeight: 24 },
  titleSm: { fontFamily: 'Roboto', fontSize: 14, fontWeight: '500' as const, lineHeight: 20 },
  bodyLg: { fontFamily: 'Roboto', fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  bodyMd: { fontFamily: 'Roboto', fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  bodySm: { fontFamily: 'Roboto', fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },
  labelLg: { fontFamily: 'Roboto', fontSize: 14, fontWeight: '500' as const, lineHeight: 20 },
  labelMd: { fontFamily: 'Roboto', fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
  labelSm: { fontFamily: 'Roboto', fontSize: 11, fontWeight: '500' as const, lineHeight: 16 },
};
