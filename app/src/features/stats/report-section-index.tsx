// The Statistics report's table of contents (#588): one row per section the
// report holds, each naming the question it answers; tapping scrolls to it.
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/card';
import { DrillDownRow } from '@/components/drill-down-row';
import { ThemedText } from '@/components/themed-text';
import { disciplineLabel } from '@/features/session/labels';
import type { ReportSectionKey } from '@/features/stats/report-sections';

export function ReportSectionIndex({
  sections,
  onJump,
}: {
  sections: readonly ReportSectionKey[];
  onJump: (key: ReportSectionKey) => void;
}) {
  const { t } = useTranslation();
  // Literal keys, so the i18n check can see every one is used.
  const labels: Record<ReportSectionKey, { title: string; question: string }> = {
    shots: {
      title: t('stats.crossSessionTitle'),
      question: t('stats.sectionQuestion.shots'),
    },
    records: { title: t('stats.summaryTitle'), question: t('stats.sectionQuestion.records') },
    totals: { title: t('stats.sumTitle'), question: t('stats.sectionQuestion.totals') },
    falt: { title: disciplineLabel(t, 'spsf-falt'), question: t('stats.sectionQuestion.falt') },
    typeComparison: {
      title: t('stats.typeComparisonTitle'),
      question: t('stats.sectionQuestion.typeComparison'),
    },
    sighter: {
      title: t('stats.sighterRelationTitle'),
      question: t('stats.sectionQuestion.sighter'),
    },
    charts: { title: t('stats.sectionCharts'), question: t('stats.sectionQuestion.charts') },
    distribution: {
      title: t('stats.distributionTitle'),
      question: t('stats.sectionQuestion.distribution'),
    },
    export: { title: t('stats.export'), question: t('stats.sectionQuestion.export') },
  };

  return (
    <Card testID="stats-section-index">
      <ThemedText type="smallBold">{t('stats.sectionIndexTitle')}</ThemedText>
      {sections.map((key) => (
        <DrillDownRow
          key={key}
          testID={`stats-jump-${key}`}
          title={labels[key].title}
          subtitle={labels[key].question}
          onPress={() => onJump(key)}
        />
      ))}
    </Card>
  );
}
