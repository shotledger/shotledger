// Stable per-row reference (docs/specs/shotlog-import-spec.md §4). Written by
// hand because the workspace has no hash dependency and `crypto.subtle` is
// async and unavailable in the React Native runtime; 64 bits over 277-row
// files is ample, and a collision only ever costs a spurious
// "already imported" verdict the user can override.
import type { ShotlogRow } from './types';

const FNV_PRIME = 0x01000193;
const OFFSET_A = 0x811c9dc5;
const OFFSET_B = 0x01000193;

function fnv1a(text: string, offset: number): number {
  let hash = offset;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i) & 0xff;
    hash = Math.imul(hash, FNV_PRIME);
    // A code point above U+00FF contributes both bytes, so names differing
    // only in a non-ASCII character still hash apart.
    const high = text.charCodeAt(i) >>> 8;
    if (high !== 0) {
      hash ^= high;
      hash = Math.imul(hash, FNV_PRIME);
    }
  }
  return hash >>> 0;
}

function hex8(value: number): string {
  return value.toString(16).padStart(8, '0');
}

/** `shotlog:<16 hex>` over datetime + name + total score. */
export function buildShotlogRef(row: Pick<ShotlogRow, 'datetime' | 'name' | 'totalScore'>): string {
  const material = `${row.datetime} ${row.name} ${row.totalScore}`;
  return `shotlog:${hex8(fnv1a(material, OFFSET_A))}${hex8(fnv1a(material, OFFSET_B))}`;
}
