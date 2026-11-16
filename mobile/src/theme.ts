// Оформление Sabyr: спокойные «банковские» цвета, крупный текст, большие кнопки (аудитория 60+).
export const colors = {
  bg: '#F3F5F7',
  surface: '#FFFFFF',
  ink: '#14212E',
  inkSoft: '#445566',
  line: '#D5DCE3',
  primary: '#12355B',
  primarySoft: '#E4ECF5',
  onPrimary: '#FFFFFF',
  accent: '#1B6E66',
  accentSoft: '#E1F1EE',
  // Уровни риска: зелёный → янтарный → тёплый терракотовый. Без «тревожного» красного.
  low: '#1B6E66',
  lowSoft: '#E1F1EE',
  medium: '#8A5A00',
  mediumSoft: '#FBF0D9',
  high: '#9A4A1E',
  highSoft: '#F9E9DE',
  disabled: '#B4BEC8',
  disabledBg: '#E6EAEE',
};

export const font = {
  small: 16,
  body: 19,
  lead: 22,
  title: 28,
  huge: 40,
};

export const radius = { card: 20, button: 16, chip: 28 };
export const space = { xs: 6, sm: 10, md: 16, lg: 24, xl: 32 };

export const levelColor = {
  low: { fg: colors.low, bg: colors.lowSoft },
  medium: { fg: colors.medium, bg: colors.mediumSoft },
  high: { fg: colors.high, bg: colors.highSoft },
} as const;
