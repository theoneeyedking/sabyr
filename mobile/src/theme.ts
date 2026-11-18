import { Platform } from 'react-native';

// Оформление Sabyr: тёплая «бумага», глубокий чернильно-синий, один акцент — спокойный изумрудный.
// Крупный текст и большие кнопки (аудитория 60+), без «тревожного» красного.
export const colors = {
  bg: '#F3F1EC',
  surface: '#FFFFFF',
  surfaceSoft: '#F7F6F2',
  ink: '#0F1B2A',
  inkSoft: '#56616F',
  inkFaint: '#8C95A1',
  line: 'rgba(15,27,42,0.08)',
  lineStrong: 'rgba(15,27,42,0.16)',
  primary: '#0F2742',
  primaryDeep: '#091A2E',
  primaryLift: '#1D4670',
  primarySoft: '#E7EDF4',
  onPrimary: '#FFFFFF',
  onPrimarySoft: 'rgba(255,255,255,0.72)',
  accent: '#0C7A68',
  accentSoft: '#DDF1EB',
  accentGlow: '#4FD6BB',
  // Уровни риска: изумрудный → янтарный → терракотовый.
  low: '#0C7A68',
  lowSoft: '#DDF1EB',
  lowVivid: '#1FA88F',
  medium: '#8A5A00',
  mediumSoft: '#FBF0D6',
  mediumVivid: '#E2A52B',
  high: '#A4461C',
  highSoft: '#FBE9DE',
  highVivid: '#DD6B38',
  disabled: '#C5CBD3',
  disabledBg: 'rgba(15,27,42,0.05)',
};

/** Семейство Onest: у него есть казахские буквы и знак тенге. Вес задаётся отдельным файлом шрифта. */
export const fonts = {
  regular: 'Onest_400Regular',
  medium: 'Onest_500Medium',
  semibold: 'Onest_600SemiBold',
  bold: 'Onest_700Bold',
  extra: 'Onest_800ExtraBold',
} as const;

export const font = {
  caption: 14,
  small: 16,
  body: 18,
  lead: 21,
  title: 28,
  huge: 42,
};

export const radius = { card: 26, button: 20, chip: 999, inner: 16 };
export const space = { xs: 6, sm: 10, md: 16, lg: 24, xl: 32 };

/** Мягкие тени с оттенком основного цвета — вместо рамок у карточек. */
export const shadow = {
  card: { boxShadow: '0 1px 2px rgba(15,39,66,0.04), 0 10px 28px rgba(15,39,66,0.07)' },
  raised: { boxShadow: '0 2px 4px rgba(15,39,66,0.06), 0 18px 40px rgba(15,39,66,0.14)' },
  button: { boxShadow: '0 8px 20px rgba(15,39,66,0.22)' },
} as const;

export const levelColor = {
  low: { fg: colors.low, bg: colors.lowSoft, vivid: colors.lowVivid },
  medium: { fg: colors.medium, bg: colors.mediumSoft, vivid: colors.mediumVivid },
  high: { fg: colors.high, bg: colors.highSoft, vivid: colors.highVivid },
} as const;

/** На web убирает системную рамку фокуса у полей ввода — фокус показывает рамка самой карточки. */
export const noOutline: object = Platform.OS === 'web' ? { outlineStyle: 'none' } : {};
