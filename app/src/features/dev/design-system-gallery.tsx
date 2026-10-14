// The #822 design-system components, shown together at the top of
// /dev/components with a theme switch, so both themes can be checked and
// screenshot without leaving the page. Every value here is synthetic.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import type { EntryShot } from '@shotledger/shared';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChartCaption, YAxisGrid } from '@/components/chart-kit/axis';
import { chartColors, linearAxis, seriesColor } from '@/components/chart-kit/chart-kit';
import { ChoiceChips } from '@/components/choice-chips';
import { FilterBar, type ActiveFilter } from '@/components/filter-bar';
import { Header } from '@/components/header';
import { SegmentedControl } from '@/components/segmented-control';
import { ShotCell } from '@/components/shot-cell';
import { Stat } from '@/components/stat';
import { StatusLine } from '@/components/status-line';
import { ThemedText } from '@/components/themed-text';
import { useResolvedThemeName } from '@/hooks/use-theme';
import { useAppSettings, type ThemeSetting } from '@/state/app-settings';
import { Spacing, Typography } from '@/theme/tokens';

const SAMPLE_SHOTS: readonly (EntryShot | null)[] = [
  { valueTenths: 100, isInnerTen: true },
  { valueTenths: 90, isInnerTen: false },
  { valueTenths: 100, isInnerTen: false },
  null,
  null,
];

const SAMPLE_TOTALS = [41, 44, 43, 47, 45, 48, 46, 49];

const CHART_WIDTH = 320;
const CHART_HEIGHT = 140;
const PLOT = { left: 36, right: CHART_WIDTH - 8, top: 8, bottom: CHART_HEIGHT - 8 };

type Category = 'men' | 'women' | 'open' | 'openJunior';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {children}
    </View>
  );
}

function SampleChart() {
  const { i18n } = useTranslation();
  const colors = chartColors(useResolvedThemeName());
  const axis = linearAxis(
    Math.min(...SAMPLE_TOTALS),
    Math.max(...SAMPLE_TOTALS),
    PLOT.bottom - PLOT.top,
    {
      invert: true,
    },
  );
  const slot = (PLOT.right - PLOT.left) / SAMPLE_TOTALS.length;
  const bar = seriesColor(colors, 0) ?? colors.value;
  return (
    <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
      <YAxisGrid
        axis={axis}
        colors={colors}
        left={PLOT.left}
        right={PLOT.right}
        top={PLOT.top}
        locale={i18n.language}
      />
      {SAMPLE_TOTALS.map((total, i) => {
        const y = PLOT.top + axis.scale(total);
        return (
          <Rect
            key={i}
            x={PLOT.left + i * slot + slot * 0.2}
            y={y}
            width={slot * 0.6}
            height={PLOT.bottom - y}
            rx={2}
            fill={bar}
          />
        );
      })}
    </Svg>
  );
}

export function DesignSystemGallery() {
  const { t } = useTranslation();
  const { theme, setTheme } = useAppSettings();
  const [kind, setKind] = useState<'training' | 'competition'>('training');
  const [single, setSingle] = useState<Category[]>(['open']);
  const [multi, setMulti] = useState<Category[]>(['men', 'women']);
  const [current, setCurrent] = useState(3);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filterKinds, setFilterKinds] = useState<('training' | 'competition')[]>(['competition']);

  const categories = (['men', 'women', 'open', 'openJunior'] as const).map((value) => ({
    value,
    label: t(`eventCategory.${value}`),
  }));
  const kinds = (['training', 'competition'] as const).map((value) => ({
    value,
    label: t(`sessionType.${value}`),
  }));
  const activeFilters: ActiveFilter[] = filterKinds.map((value) => ({
    key: value,
    label: t(`sessionType.${value}`),
  }));

  return (
    <View style={styles.root} testID="design-system-gallery">
      <Section title={t('dev.galleryDesignSystem')}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('dev.galleryDesignSystemBody')}
        </ThemedText>
        <SegmentedControl<ThemeSetting>
          accessibilityLabel={t('settings.theme')}
          options={[
            { value: 'system', label: t('settings.themeSystem') },
            { value: 'light', label: t('settings.themeLight') },
            { value: 'dark', label: t('settings.themeDark') },
          ]}
          value={theme}
          onChange={setTheme}
          testID="gallery-theme"
        />
      </Section>

      <Section title={t('dev.galleryHeader')}>
        <Header
          title={t('tabs.stats')}
          subtitle={t('dev.galleryHeaderSubtitle')}
          trailing={<Button variant="text" label={t('common.edit')} onPress={() => {}} />}
        />
      </Section>

      <Section title={t('dev.galleryTypeScale')}>
        <Card>
          <ThemedText type="score">587</ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            {t('dev.galleryTypeScore')}
          </ThemedText>
          <ThemedText style={Typography.title}>{t('dev.galleryTypeTitle')}</ThemedText>
          <ThemedText type="headline">{t('dev.galleryTypeHeadline')}</ThemedText>
          <ThemedText>{t('dev.galleryTypeBody')}</ThemedText>
          <ThemedText type="small">{t('dev.galleryTypeLabel')}</ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            {t('dev.galleryTypeCaption')}
          </ThemedText>
        </Card>
      </Section>

      <Section title={t('dev.galleryButtons')}>
        <Button variant="primary" label={t('dev.galleryButtonPrimary')} onPress={() => {}} />
        <View style={styles.wrapRow}>
          <Button variant="secondary" label={t('dev.galleryButtonSecondary')} onPress={() => {}} />
          <Button variant="tonal" label={t('dev.galleryButtonTonal')} onPress={() => {}} />
          <Button variant="text" label={t('dev.galleryButtonText')} onPress={() => {}} />
        </View>
        <View style={styles.wrapRow}>
          <Button
            variant="destructive"
            label={t('dev.galleryButtonDestructive')}
            onPress={() => {}}
          />
          <Button variant="tonal" label={t('dev.galleryButtonDisabled')} disabled />
        </View>
      </Section>

      <Section title={t('dev.gallerySegmented')}>
        <SegmentedControl options={kinds} value={kind} onChange={setKind} />
      </Section>

      <Section title={t('dev.galleryChoiceChips')}>
        <ThemedText type="caption" themeColor="textSecondary">
          {t('dev.galleryChoiceSingle')}
        </ThemedText>
        <ChoiceChips options={categories} value={single} onChange={setSingle} />
        <ThemedText type="caption" themeColor="textSecondary">
          {t('dev.galleryChoiceMulti')}
        </ThemedText>
        <ChoiceChips options={categories} value={multi} onChange={setMulti} mode="multi" />
      </Section>

      <Section title={t('dev.galleryShotCells')}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('dev.galleryShotCellsBody')}
        </ThemedText>
        <View style={styles.wrapRow}>
          {SAMPLE_SHOTS.map((shot, index) => (
            <ShotCell
              key={index}
              shot={shot}
              mode="integer"
              index={index}
              current={index === current}
              onPress={() => setCurrent(index)}
            />
          ))}
        </View>
      </Section>

      <Section title={t('dev.galleryStat')}>
        <View style={styles.row}>
          <Stat label={t('home.shotsLoggedTotal')} value="12 845" />
          <Stat label={t('home.competitionsTotal')} value="38" />
        </View>
        <Stat label={t('dev.galleryTypeScore')} value="587" unit="/ 600" size="score" />
      </Section>

      <Section title={t('dev.galleryFilterBar')}>
        <FilterBar
          filters={activeFilters}
          onRemove={(key) => setFilterKinds((k) => k.filter((v) => v !== key))}
          sheetOpen={sheetOpen}
          onOpenSheet={() => setSheetOpen(true)}
          onCloseSheet={() => setSheetOpen(false)}
          onClearAll={() => setFilterKinds([])}
          testID="gallery-filter-bar"
        >
          <ChoiceChips options={kinds} value={filterKinds} onChange={setFilterKinds} mode="multi" />
        </FilterBar>
      </Section>

      <Section title={t('dev.galleryChartKit')}>
        <Card>
          <SampleChart />
          <ChartCaption>{t('dev.galleryChartCaption')}</ChartCaption>
        </Card>
      </Section>

      <Section title={t('dev.galleryStatusLine')}>
        <Card>
          <StatusLine status="valid" detail={t('dev.galleryStatusUntil', { date: '2029-03-01' })} />
          <StatusLine
            status="expiringSoon"
            detail={t('dev.galleryStatusUntil', { date: '2026-11-30' })}
          />
          <StatusLine status="expired" />
          <StatusLine status="none" />
        </Card>
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Spacing.four,
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
});
