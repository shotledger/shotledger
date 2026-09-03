import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  applyPhotoTaskOutcome,
  fitsPhotoSizeCap,
  isRetryablePhotoStatus,
  MAX_PHOTO_ATTEMPTS,
  PHOTO_MAX_BYTES,
  selectNextPhotoTask,
  type PhotoQueueEntry,
} from './photo-queue';

function entry(over: Partial<PhotoQueueEntry> = {}): PhotoQueueEntry {
  return {
    id: 'q1',
    kind: 'upload',
    photoId: 'p1',
    localUri: 'file:///photo.jpg',
    attempts: 0,
    lastError: null,
    createdAt: '2026-09-02T10:00:00.000Z',
    ...over,
  };
}

describe('selectNextPhotoTask', () => {
  it('returns null for an empty queue', () => {
    expect(selectNextPhotoTask([])).toBeNull();
  });

  it('takes the oldest entry so a burst cannot starve an older photo', () => {
    const older = entry({ id: 'old', createdAt: '2026-09-01T00:00:00.000Z' });
    const newer = entry({ id: 'new', createdAt: '2026-09-02T00:00:00.000Z' });
    expect(selectNextPhotoTask([newer, older])?.id).toBe('old');
  });

  it('keeps the oldest when a newer entry follows it', () => {
    // The mirror of the case above: there the second entry displaces the
    // first, here it must not. Without both orders the "already have an
    // older one" branch never runs.
    const older = entry({ id: 'old', createdAt: '2026-09-01T00:00:00.000Z' });
    const newer = entry({ id: 'new', createdAt: '2026-09-02T00:00:00.000Z' });
    expect(selectNextPhotoTask([older, newer])?.id).toBe('old');
  });

  it('skips entries that have exhausted their attempts', () => {
    const dead = entry({ id: 'dead', attempts: MAX_PHOTO_ATTEMPTS, createdAt: '2026-01-01' });
    const live = entry({ id: 'live', createdAt: '2026-02-01' });
    expect(selectNextPhotoTask([dead, live])?.id).toBe('live');
  });

  it('returns null when every entry is exhausted', () => {
    expect(selectNextPhotoTask([entry({ attempts: MAX_PHOTO_ATTEMPTS })])).toBeNull();
  });
});

describe('isRetryablePhotoStatus', () => {
  it('retries throttling and server faults', () => {
    expect(isRetryablePhotoStatus(429)).toBe(true);
    expect(isRetryablePhotoStatus(408)).toBe(true);
    expect(isRetryablePhotoStatus(500)).toBe(true);
    expect(isRetryablePhotoStatus(503)).toBe(true);
  });

  it('does not retry a photo the server will always refuse', () => {
    expect(isRetryablePhotoStatus(413)).toBe(false);
    expect(isRetryablePhotoStatus(404)).toBe(false);
    expect(isRetryablePhotoStatus(401)).toBe(false);
    expect(isRetryablePhotoStatus(400)).toBe(false);
    expect(isRetryablePhotoStatus(201)).toBe(false);
  });
});

describe('applyPhotoTaskOutcome', () => {
  it('removes the entry on success', () => {
    expect(applyPhotoTaskOutcome(entry(), { type: 'succeeded' })).toEqual({
      type: 'remove',
      id: 'q1',
    });
  });

  it('increments the attempt count on a retryable failure', () => {
    expect(
      applyPhotoTaskOutcome(entry({ attempts: 1 }), {
        type: 'failed',
        retryable: true,
        error: 'offline',
      }),
    ).toEqual({ type: 'retry', id: 'q1', attempts: 2, lastError: 'offline' });
  });

  it('gives up immediately on a permanent failure', () => {
    expect(
      applyPhotoTaskOutcome(entry(), { type: 'failed', retryable: false, error: 'too_large' }),
    ).toEqual({ type: 'giveUp', id: 'q1', attempts: 1, lastError: 'too_large' });
  });

  it('gives up once the attempt cap is reached', () => {
    const action = applyPhotoTaskOutcome(entry({ attempts: MAX_PHOTO_ATTEMPTS - 1 }), {
      type: 'failed',
      retryable: true,
      error: 'offline',
    });
    expect(action).toEqual({
      type: 'giveUp',
      id: 'q1',
      attempts: MAX_PHOTO_ATTEMPTS,
      lastError: 'offline',
    });
  });

  it('property: a retryable failure never exceeds the attempt cap', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_PHOTO_ATTEMPTS + 5 }), (attempts) => {
        const action = applyPhotoTaskOutcome(entry({ attempts }), {
          type: 'failed',
          retryable: true,
          error: 'e',
        });
        if (action.type === 'retry') expect(action.attempts).toBeLessThan(MAX_PHOTO_ATTEMPTS);
      }),
    );
  });
});

describe('fitsPhotoSizeCap', () => {
  it('admits a photo landing exactly on the cap', () => {
    expect(fitsPhotoSizeCap(PHOTO_MAX_BYTES)).toBe(true);
  });

  it('rejects one byte over', () => {
    expect(fitsPhotoSizeCap(PHOTO_MAX_BYTES + 1)).toBe(false);
  });
});
