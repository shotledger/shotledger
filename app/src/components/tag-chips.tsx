// A session's tags as chips. Wraps rather than truncates: a session with
// several tags is exactly the case the maintainer wanted visible on the list.
//
// `namespace:value` tags are the app's own bookkeeping, not the shooter's
// labels, and an import writes two or three onto every session it creates.
// They are dropped here by default so they cannot crowd a list row out
// (#348); the session detail screen opts them back in, where there is room
// and where an import's explanation is worth reading.
import { StyleSheet, View } from 'react-native';
import { partitionTags } from '@shotledger/shared';

import { Chip } from '@/components/chip';
import { Spacing } from '@/theme/tokens';

export interface TagChipsProps {
  names: readonly string[];
  testID?: string;
  /** Also render the `namespace:value` bookkeeping tags. Default false. */
  includeMachine?: boolean;
}

export function TagChips({ names, testID, includeMachine = false }: TagChipsProps) {
  const { own, machine } = partitionTags(names);
  const shown = includeMachine ? [...own, ...machine] : own;
  if (shown.length === 0) return null;

  return (
    <View style={styles.row} testID={testID}>
      {shown.map((name) => (
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
