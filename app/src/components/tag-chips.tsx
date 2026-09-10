// A session's tags as chips. Wraps rather than truncates: a session with
// several tags is exactly the case the maintainer wanted visible on the list.
import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { Spacing } from '@/theme/tokens';

export interface TagChipsProps {
  names: readonly string[];
  testID?: string;
}

export function TagChips({ names, testID }: TagChipsProps) {
  if (names.length === 0) return null;

  return (
    <View style={styles.row} testID={testID}>
      {names.map((name) => (
        <Chip key={name} label={name} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    marginTop: Spacing.half,
  },
});
