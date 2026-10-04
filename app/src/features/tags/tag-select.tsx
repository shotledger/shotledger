// Tag selection at session creation. Existing tags are pills to toggle; the
// text field adds a new one. Nothing is written to the database here — the
// screen owns that, after the session row exists.
import { TEXT_LIMITS } from '@shotledger/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

export interface TagSelectProps {
  /** Tag names already in the database, for one-tap selection. */
  known: readonly string[];
  /** Selected tag names, in selection order. */
  selected: readonly string[];
  onChange: (next: string[]) => void;
}

/** Case-insensitive membership, so "KM" and "km" never become two tags. */
function indexOfTag(names: readonly string[], name: string): number {
  const needle = name.toLocaleLowerCase();
  return names.findIndex((entry) => entry.toLocaleLowerCase() === needle);
}

export function TagSelect({ known, selected, onChange }: TagSelectProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [draft, setDraft] = useState('');

  const options = [...known];
  for (const name of selected) if (indexOfTag(options, name) === -1) options.push(name);

  function toggle(name: string) {
    const at = indexOfTag(selected, name);
    onChange(at === -1 ? [...selected, name] : selected.filter((_, i) => i !== at));
  }

  function commitDraft() {
    const name = draft.trim().replace(/\s+/g, ' ');
    setDraft('');
    if (name === '' || indexOfTag(selected, name) !== -1) return;
    // Reuse the existing tag's spelling when this only differs in case.
    const existing = known[indexOfTag(known, name)];
    onChange([...selected, existing ?? name]);
  }

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold">{t('session.tags')}</ThemedText>
      {options.length > 0 && (
        <View style={styles.row}>
          {options.map((name) => {
            const isSelected = indexOfTag(selected, name) !== -1;
            return (
              <Pressable
                key={name}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                testID={`tag-${name}`}
                onPress={() => toggle(name)}
                style={[
                  styles.pill,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  isSelected && {
                    borderColor: theme.primary,
                    backgroundColor: theme.backgroundSelected,
                  },
                ]}
              >
                <ThemedText type="small" themeColor={isSelected ? 'text' : 'textSecondary'}>
                  {name}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}
      <TextField
        value={draft}
        onChangeText={setDraft}
        maxLength={TEXT_LIMITS.tags.name}
        onSubmitEditing={commitDraft}
        onBlur={commitDraft}
        returnKeyType="done"
        placeholder={t('session.tagPlaceholder')}
        autoCapitalize="none"
        autoCorrect={false}
        testID="session-tag-input"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pill: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 2,
  },
});
