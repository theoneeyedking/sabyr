import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Lang } from '../api/types';
import { useApp } from '../state/AppContext';
import { colors, font, fonts, shadow } from '../theme';

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
  wrap: { flexDirection: 'row', backgroundColor: 'rgba(15,27,42,0.06)', borderRadius: 24, padding: 4 },
  item: { minWidth: 60, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  itemOn: { backgroundColor: colors.surface, ...shadow.card },
  label: { fontFamily: fonts.semibold, fontSize: font.small, color: colors.inkSoft },
  labelOn: { color: colors.ink },
});
