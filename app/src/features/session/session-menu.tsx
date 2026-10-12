// Session-level actions, moved off the header into an overflow menu (§4 fix
// batch, 2026-09-09) — the header row had run out of room. Session view only:
// the shot-entry screen carries none of this, since nothing here is done
// while entering shots.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet } from 'react-native';
import { ActionSheetRows, type ActionSheetAction } from '@/components/action-sheet';
import { BottomSheet } from '@/components/bottom-sheet';
import { ConfirmContent } from '@/components/confirm-sheet';
import { OverflowIcon } from '@/components/icons';
import { db } from '@/db/client';
// Not softDeleteSession: deleting a session must also drop its series and back
// the fired rounds out of the firearm's counter, which feeds the FAP 551-3
// activity log. Same entry point Home's swipe-to-delete uses.
import { deleteSessionAndSeries } from '@/db/queries/round-count';
import { getSession } from '@/db/queries/sessions';
import { sessionReportFilename } from '@/features/export/report-filename';
import { buildSessionReportHtmlFor } from '@/features/export/session-report';
import { useTheme } from '@/hooks/use-theme';
import { exportHtmlAsPdf } from '@/platform/pdf-export';

export interface SessionMenuProps {
  sessionId: string;
  /** False for fält (hits on figures, no rings) and rounds-only sessions. */
  reportAvailable?: boolean;
  onDeleted?: () => void;
}

export function SessionMenu({ sessionId, reportAvailable = false, onDeleted }: SessionMenuProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  // The confirmation replaces the actions inside the same sheet.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function close() {
    setOpen(false);
    setConfirmingDelete(false);
  }

  function onConfirmDelete() {
    close();
    deleteSessionAndSeries(db, sessionId);
    onDeleted?.();
    router.replace('/');
  }

  async function onReport() {
    const html = buildSessionReportHtmlFor(t, i18n.language, sessionId);
    const session = getSession(db, sessionId);
    const filename = session ? sessionReportFilename(session.name, session.startedAt) : '';
    if (!html || !(await exportHtmlAsPdf(html, filename))) Alert.alert(t('session.reportFailed'));
  }

  // Sights is not here any more: it moved to a button on the session view
  // itself (2026-09-12). Adjusting a sight setting happens between series,
  // at the firing point, and a menu was the wrong depth for something done
  // that often.
  const actions: ActionSheetAction[] = [
    {
      key: 'edit',
      label: t('session.menuEdit'),
      onPress: () => router.push(`/session/${sessionId}/edit`),
    },
    {
      key: 'share',
      label: t('session.menuShare'),
      onPress: () => router.push(`/session/${sessionId}/share`),
    },
    ...(reportAvailable
      ? [{ key: 'report', label: t('session.menuReport'), onPress: () => void onReport() }]
      : []),
    {
      key: 'delete',
      label: t('common.deleteSession'),
      destructive: true,
      keepOpen: true,
      onPress: () => setConfirmingDelete(true),
    },
  ];

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('session.menuLabel')}
        testID="session-menu"
        onPress={() => setOpen(true)}
        style={styles.trigger}
      >
        <OverflowIcon color={theme.primary} />
      </Pressable>
      <BottomSheet visible={open} onClose={close} testID="action-sheet">
        {confirmingDelete ? (
          <ConfirmContent
            title={t('common.deleteSessionConfirmTitle')}
            body={t('common.deleteSessionConfirmBody')}
            confirmLabel={t('common.deleteSession')}
            cancelLabel={t('common.cancel')}
            onConfirm={onConfirmDelete}
            onCancel={close}
            destructive
            testID="delete-session-confirm"
          />
        ) : (
          <ActionSheetRows actions={actions} onClose={close} />
        )}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    // Material's 48dp touch-target floor, not a spacing value.
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
