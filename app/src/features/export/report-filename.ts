import { localDayOf } from '@/features/dates/local-day';

const MAX_NAME_LENGTH = 60;

/**
 * "Precision-training-2026-10-12.pdf": the session's name, made safe for a
 * file system, then its local day. Letters outside ASCII (å, ä, ö) are kept.
 */
export function sessionReportFilename(name: string, startedAt: string): string {
  const slug = name
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_NAME_LENGTH)
    .replace(/-+$/, '');
  return `${slug || 'session'}-${localDayOf(startedAt)}.pdf`;
}
