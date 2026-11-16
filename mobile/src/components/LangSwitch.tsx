import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Lang } from '../api/types';
import { useApp } from '../state/AppContext';
import { colors, font } from '../theme';

const LANGS: { code: Lang; label: string }[] = [
  { code: 'kz', label: 'Қаз' },
  { code: 'ru', label: 'Рус' },
];

/** Переключатель языка kz/ru. */
export function LangSwitch() {
  const { lang, setLang, t } = useApp();
  return (
    <View style={styles.wrap} accessibilityLabel={t('home.language')}>
      {LANGS.map((l) => {
        const on = l.code === lang;
        return (
          <Pressable
            key={l.code} onPress={() => setLang(l.code)} testID={`lang-${l.code}`}
            accessibilityRole="button" accessibilityState={{ selected: on }}
            style={[styles.item, on && styles.itemOn]}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{l.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 26, padding: 4,
    borderWidth: 1, borderColor: colors.line,
  },
  item: { minWidth: 64, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  itemOn: { backgroundColor: colors.primary },
  label: { fontSize: font.small + 1, fontWeight: '700', color: colors.primary },
  labelOn: { color: colors.onPrimary },
});
