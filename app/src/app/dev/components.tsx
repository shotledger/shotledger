// Component gallery (§4 M2) — every design-system component demonstrated in
// isolation so an agent (or developer) can screenshot it without seeding data.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { FAB } from '@/components/fab';
import { ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { ScoreKeypad } from '@/components/score-keypad';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { StatTile } from '@/components/stat-tile';
import { createKeypadState, type KeypadState } from '@shotledger/shared';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/theme/tokens';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {children}
    </View>
  );
}

export default function ComponentsGalleryScreen() {
  const [segment, setSegment] = useState<'a' | 'b' | 'c'>('a');
  const [keypad, setKeypad] = useState<KeypadState>(() =>
    createKeypadState({ mode: 'integer', seriesLength: 5 }),
  );

  return (
    <Screen>
      <ThemedText type="title" style={styles.title}>
        Components
      </ThemedText>

      <Section title="Card">
        <Card>
          <ThemedText>Card content</ThemedText>
        </Card>
      </Section>

      <Section title="StatTile">
        <View style={styles.row}>
          <StatTile label="Shots logged" value="1 284" />
          <StatTile label="Sessions" value="42" />
        </View>
      </Section>

      <Section title="Chip">
        <View style={styles.row}>
          <Chip label="Training" />
          <Chip label="Competition" tone="primary" />
        </View>
      </Section>

      <Section title="SegmentedControl">
        <SegmentedControl
          options={[
            { value: 'a', label: 'System' },
            { value: 'b', label: 'Light' },
            { value: 'c', label: 'Dark' },
          ]}
          value={segment}
          onChange={setSegment}
        />
      </Section>

      <Section title="ListRow">
        <Card style={styles.noGap}>
          <ListRow
            title="Precision — 2026-08-30"
            subtitle="47.2 · Training"
            trailing={<Chip label="Training" />}
          />
          <ListRow
            title="Milsnabb — 2026-08-25"
            subtitle="580 · Competition"
            trailing={<Chip label="Competition" tone="primary" />}
            onPress={() => {}}
          />
        </Card>
      </Section>

      <Section title="EmptyState">
        <Card>
          <EmptyState
            title="No sessions yet"
            body="Log your first training or competition session to see it here."
            ctaLabel="Log your first session"
            onPressCta={() => {}}
          />
        </Card>
      </Section>

      <Section title="ScoreKeypad">
        <Card>
          <ScoreKeypad state={keypad} onChange={setKeypad} />
        </Card>
      </Section>

      <Section title="PrimaryButton">
        <PrimaryButton label="Save" onPress={() => {}} />
      </Section>
      <View style={styles.fabSpacer} />
      <FAB label="New session" onPress={() => {}} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  section: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  noGap: {
    gap: 0,
    padding: 0,
  },
  fabSpacer: {
    height: Spacing.six,
  },
});
