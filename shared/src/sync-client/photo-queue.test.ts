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
  type PhotoTaskOutcome,
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

  it('breaks a createdAt tie by queue order, so the pick is deterministic', () => {
    const first = entry({ id: 'first' });
    const second = entry({ id: 'second' });
    expect(selectNextPhotoTask([first, second])?.id).toBe('first');
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

  it('gives up on a permanent failure by spending every remaining attempt', () => {
    expect(
      applyPhotoTaskOutcome(entry(), { type: 'failed', retryable: false, error: 'too_large' }),
    ).toEqual({ type: 'giveUp', id: 'q1', attempts: MAX_PHOTO_ATTEMPTS, lastError: 'too_large' });
  });

  it('property: a give-up is never picked again', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_PHOTO_ATTEMPTS - 1 }),
        fc.boolean(),
        (attempts, retryable) => {
          const action = applyPhotoTaskOutcome(entry({ attempts }), {
            type: 'failed',
            retryable,
            error: 'e',
          });
          if (action.type !== 'giveUp') return;
          expect(selectNextPhotoTask([entry({ attempts: action.attempts })])).toBeNull();
        },
      ),
    );
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

/**
 * The runner's loop (app/src/features/sync/photo-queue-runner.ts) with the
 * I/O replaced by `run`: pick, run, apply, record. Returns how many times
 * each entry was attempted in this pass.
 */
function drainPass(
  queue: PhotoQueueEntry[],
  run: (entry: PhotoQueueEntry) => PhotoTaskOutcome,
  maxTasks = 10,
): Map<string, number> {
  const tries = new Map<string, number>();
  for (let i = 0; i < maxTasks; i += 1) {
    const next = selectNextPhotoTask(queue);
    if (next === null) break;
    tries.set(next.id, (tries.get(next.id) ?? 0) + 1);
    const action = applyPhotoTaskOutcome(next, run(next));
    const index = queue.findIndex((e) => e.id === action.id);
    if (action.type === 'remove') queue.splice(index, 1);
    else queue[index] = { ...next, attempts: action.attempts, lastError: action.lastError };
  }
  return tries;
}

describe('draining the queue', () => {
  it.each([
    ['a download that 404s', 'download', 'http_404'],
    ['an upload over quota', 'upload', 'http_413'],
    ['an upload with no local file', 'upload', 'no_local_file'],
    ['an upload over the size cap', 'upload', 'photo_too_large'],
  ] as const)('attempts %s once, then never picks it again', (_, kind, error) => {
    const queue = [entry({ kind })];
    const fail = (): PhotoTaskOutcome => ({ type: 'failed', retryable: false, error });

    expect(drainPass(queue, fail).get('q1')).toBe(1);
    expect(drainPass(queue, fail).size).toBe(0);
    expect(queue[0]?.lastError).toBe(error);
  });

  it('moves on to the next entry after giving up on the oldest', () => {
    const queue = [
      entry({ id: 'gone', kind: 'download', createdAt: '2026-09-01T00:00:00.000Z' }),
      entry({ id: 'ok', createdAt: '2026-09-02T00:00:00.000Z' }),
    ];
    const tries = drainPass(queue, (e) =>
      e.id === 'gone'
        ? { type: 'failed', retryable: false, error: 'http_404' }
        : { type: 'succeeded' },
    );
    expect([...tries]).toEqual([
      ['gone', 1],
      ['ok', 1],
    ]);
    expect(queue.map((e) => e.id)).toEqual(['gone']);
  });

  it('retries a retryable failure up to the cap and no further', () => {
    const queue = [entry()];
    const offline = (): PhotoTaskOutcome => ({ type: 'failed', retryable: true, error: 'network' });

    let total = 0;
    for (let pass = 0; pass < MAX_PHOTO_ATTEMPTS + 2; pass += 1) {
      total += drainPass(queue, offline).get('q1') ?? 0;
    }
    expect(total).toBe(MAX_PHOTO_ATTEMPTS);
    expect(queue[0]?.attempts).toBe(MAX_PHOTO_ATTEMPTS);
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
