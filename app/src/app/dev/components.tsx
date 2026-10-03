// Component gallery (§4 M2) — every design-system component demonstrated in
// isolation so an agent (or developer) can screenshot it without seeding data.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScreenTitle } from '@/components/screen-title';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { DrillDownRow } from '@/components/drill-down-row';
import { FAB } from '@/components/fab';
import { InfoButton } from '@/components/info-button';
import { ListRow } from '@/components/list-row';
import { MarkCanvas } from '@/components/mark-canvas';
import { PrimaryButton } from '@/components/primary-button';
import { ScoreKeypad } from '@/components/score-keypad';
import type { Celebration } from '@/components/series-celebration';
import { SeriesTotalPill } from '@/components/series-total-pill';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { StatTile } from '@/components/stat-tile';
import { Stepper } from '@/components/stepper';
import {
  CALIBER_MM,
  createKeypadState,
  SPSF_PISTOL_25M_PRECISION,
  type KeypadState,
} from '@shotledger/shared';
import { ThemedText } from '@/components/themed-text';
import type { Mark } from '@/features/photo-scoring/marks';
import { scoreMarks } from '@/features/photo-scoring/marks';
import type { CelebrationTier } from '@/features/session/celebration';
import type { TargetTransform } from '@/features/photo-scoring/transform';
import { Spacing } from '@/theme/tokens';

// Closes the "rendering unverified" gap on the edge-call marker style
// (photo-scoring-phase1-spec.md §2.5): three synthetic marks, scored by the
// real `scoreMarks` pipeline, placed to exercise every state MarkCanvas
// draws differently — no photo capture or geometry pipeline required.
const EDGE_CALL_PREVIEW_CALIBER = CALIBER_MM['.22'] as number;
const EDGE_CALL_PREVIEW_TARGET = SPSF_PISTOL_25M_PRECISION;
const EDGE_CALL_PREVIEW_IMAGE_SIZE = 520;

// mm <-> px, target center at the image center. No rotation/perspective —
// the overlay only needs a valid TargetTransform, not a real photo lock.
const EDGE_CALL_PREVIEW_TRANSFORM: TargetTransform = {
  toImage: (p) => ({
    x: p.x + EDGE_CALL_PREVIEW_IMAGE_SIZE / 2,
    y: p.y + EDGE_CALL_PREVIEW_IMAGE_SIZE / 2,
  }),
  toMm: (p) => ({
    x: p.x - EDGE_CALL_PREVIEW_IMAGE_SIZE / 2,
    y: p.y - EDGE_CALL_PREVIEW_IMAGE_SIZE / 2,
  }),
  source: 'auto',
};

// Dark-gray 4x4 placeholder — MarkCanvas always needs a photoUri, but the
// rings/marks it draws don't depend on the photo's content.
const EDGE_CALL_PREVIEW_PHOTO_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGOwsXGAIwbiOAArAwuBhSJKUwAAAABJRU5ErkJggg==';

const EDGE_CALL_PREVIEW_MARKS: readonly Mark[] = [
  {
    id: 'center',
    xMm: 0,
    yMm: 0,
    caliberMm: EDGE_CALL_PREVIEW_CALIBER,
    isInnerTen: false,
    calledRingLabel: null,
    moved: false,
    suggested: false,
  },
  {
    id: 'mid-ring',
    xMm: -90,
    yMm: 0,
    caliberMm: EDGE_CALL_PREVIEW_CALIBER,
    isInnerTen: false,
    calledRingLabel: null,
    moved: false,
    suggested: false,
  },
  // Ring 9's boundary is radius 50mm; near-edge = radius - caliber/2, so
  // 52.3mm out puts the near-edge 0.5mm inside it — under the 1mm
  // EDGE_CALL_THRESHOLD_MM, so scoreHole reports edgeCall: true (spec §2.5).
  {
    id: 'edge-call',
    xMm: 52.3,
    yMm: 0,
    caliberMm: EDGE_CALL_PREVIEW_CALIBER,
    isInnerTen: false,
    calledRingLabel: null,
    moved: false,
    suggested: false,
  },
];

// One finished series per tier, so each celebration can be replayed on demand.
const CELEBRATION_DEMOS: readonly { tier: CelebrationTier; label: string; values: number[] }[] = [
  { tier: 'gold', label: 'Gold (47)', values: [100, 100, 90, 90, 90] },
  { tier: 'fullScore', label: 'Full Score (5×10)', values: [100, 100, 100, 100, 100] },
  { tier: 'perfect', label: 'Perfect (5×X)', values: [100, 100, 100, 100, 100] },
];

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
  const [clicks, setClicks] = useState<number | null>(null);
  const [keypad, setKeypad] = useState<KeypadState>(() =>
    createKeypadState({ mode: 'integer', seriesLength: 5 }),
  );
  const [celebrationKeypad, setCelebrationKeypad] = useState<KeypadState>(() =>
    createKeypadState({ mode: 'integer', seriesLength: 5 }),
  );
  const [celebration, setCelebration] = useState<Celebration | null>(null);

  function playCelebration(demo: (typeof CELEBRATION_DEMOS)[number]) {
    setCelebrationKeypad(
      createKeypadState({
        mode: 'integer',
        seriesLength: 5,
        shots: demo.values.map((valueTenths) => ({
          valueTenths,
          isInnerTen: demo.tier === 'perfect',
        })),
      }),
    );
    setCelebration((prev) => ({ tier: demo.tier, id: (prev?.id ?? 0) + 1 }));
  }

  return (
    <Screen fab={<FAB label="New session" onPress={() => {}} />}>
      <ScreenTitle>Components</ScreenTitle>

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

      <Section title="Stepper — signed integer, nullable">
        <ThemedText type="small" themeColor="textSecondary">
          Starts &quot;not recorded&quot; (null); the first press of either button enters the range
          at 0. Bounded to ±20 here.
        </ThemedText>
        <Stepper
          value={clicks}
          onChange={setClicks}
          min={-20}
          max={20}
          decrementLabel="Decrease Elevation"
          incrementLabel="Increase Elevation"
          clearLabel="Clear"
          format={(value) =>
            value === null ? 'Not recorded' : value > 0 ? `+${value}` : `${value}`
          }
          testID="gallery-stepper"
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

      <Section title="DrillDownRow">
        <Card>
          <DrillDownRow title="Account & Sync" subtitle="Not signed in" onPress={() => {}} />
          <DrillDownRow title="Shot Detection" value="12 dB over the room" onPress={() => {}} />
        </Card>
      </Section>

      <Section title="InfoButton">
        <Card>
          <View style={styles.headerRow}>
            <ThemedText type="smallBold">Trigger Level</ThemedText>
            <InfoButton
              title="Trigger Level"
              body={
                'Higher sensitivity picks up quieter shots, but also more background noise.' +
                '\n\nTry High for .22 or indoors, Low next to a busy firing line.'
              }
              testID="gallery-info"
            />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            The paragraph that used to sit here lives behind the [i].
          </ThemedText>
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

      <Section title="Series celebration — tiers (#482)">
        <View style={styles.wrapRow}>
          {CELEBRATION_DEMOS.map((demo) => (
            <PrimaryButton
              key={demo.tier}
              label={demo.label}
              onPress={() => playCelebration(demo)}
              testID={`celebrate-${demo.tier}`}
            />
          ))}
        </View>
        <Card>
          <ScoreKeypad
            state={celebrationKeypad}
            onChange={setCelebrationKeypad}
            celebration={celebration}
            highlightTotal={celebration !== null}
          />
        </Card>
      </Section>

      <Section title="SeriesTotalPill (#482)">
        <View style={styles.wrapRow}>
          <SeriesTotalPill label="50" tier="fullScore" />
          <SeriesTotalPill label="50" tier="perfect" />
        </View>
      </Section>

      <Section title="PrimaryButton">
        <PrimaryButton label="Save" onPress={() => {}} />
      </Section>

      <Section title="MarkCanvas — edge call (dead center, mid-ring, edge call)">
        <ThemedText type="small" themeColor="textSecondary">
          The amber-ringed mark is 0.5mm inside ring 9&apos;s boundary — an edge call. The other two
          are not.
        </ThemedText>
        <MarkCanvas
          testID="edge-call-preview"
          style={styles.canvas}
          photoUri={EDGE_CALL_PREVIEW_PHOTO_URI}
          imageWidth={EDGE_CALL_PREVIEW_IMAGE_SIZE}
          imageHeight={EDGE_CALL_PREVIEW_IMAGE_SIZE}
          transform={EDGE_CALL_PREVIEW_TRANSFORM}
          target={EDGE_CALL_PREVIEW_TARGET}
          marks={EDGE_CALL_PREVIEW_MARKS}
          scores={scoreMarks(EDGE_CALL_PREVIEW_MARKS, EDGE_CALL_PREVIEW_TARGET)}
          selectedId={null}
          readOnly
        />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  canvas: {
    height: 360,
  },
  section: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  noGap: {
    gap: 0,
    padding: 0,
  },
});
