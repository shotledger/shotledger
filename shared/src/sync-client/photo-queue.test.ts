import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  applyPhotoTaskOutcome,
  fitsPhotoSizeCap,
  photoFailureForStatus,
  MAX_PHOTO_ATTEMPTS,
  PHOTO_MAX_BYTES,
  selectNextPhotoTask,
  type PhotoFailure,
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

describe('photoFailureForStatus', () => {
  it('counts throttling and server faults as transient', () => {
    expect(photoFailureForStatus(408)).toBe('transient');
    expect(photoFailureForStatus(429)).toBe('transient');
    expect(photoFailureForStatus(500)).toBe('transient');
    expect(photoFailureForStatus(503)).toBe('transient');
  });

  it('sets 401 apart: a sign-in problem, not the photo', () => {
    expect(photoFailureForStatus(401)).toBe('unauthenticated');
  });

  it('treats every other status as permanent', () => {
    for (const status of [201, 400, 402, 403, 404, 407, 409, 413, 428, 430, 499]) {
      expect(photoFailureForStatus(status)).toBe('permanent');
    }
  });
});

function failed(failure: PhotoFailure, error = 'e'): PhotoTaskOutcome {
  return { type: 'failed', failure, error };
}

describe('applyPhotoTaskOutcome', () => {
  it('removes the entry on success and carries on with the pass', () => {
    expect(applyPhotoTaskOutcome(entry(), { type: 'succeeded' })).toEqual({
      type: 'remove',
      id: 'q1',
      endPass: false,
    });
  });

  it('spends one attempt on a transient failure and ends the pass', () => {
    expect(applyPhotoTaskOutcome(entry({ attempts: 1 }), failed('transient', 'http_503'))).toEqual({
      type: 'retry',
      id: 'q1',
      attempts: 2,
      lastError: 'http_503',
      endPass: true,
    });
  });

  it.each(['unreachable', 'unauthenticated'] as const)(
    'spends no attempt when %s, and ends the pass',
    (failure) => {
      expect(applyPhotoTaskOutcome(entry({ attempts: 3 }), failed(failure, 'network'))).toEqual({
        type: 'retry',
        id: 'q1',
        attempts: 3,
        lastError: 'network',
        endPass: true,
      });
    },
  );

  it('gives up on a permanent failure by spending every remaining attempt, and carries on', () => {
    expect(applyPhotoTaskOutcome(entry(), failed('permanent', 'too_large'))).toEqual({
      type: 'giveUp',
      id: 'q1',
      attempts: MAX_PHOTO_ATTEMPTS,
      lastError: 'too_large',
      endPass: false,
    });
  });

  it('gives up once a transient failure reaches the cap, and ends the pass', () => {
    const action = applyPhotoTaskOutcome(
      entry({ attempts: MAX_PHOTO_ATTEMPTS - 1 }),
      failed('transient', 'http_500'),
    );
    expect(action).toEqual({
      type: 'giveUp',
      id: 'q1',
      attempts: MAX_PHOTO_ATTEMPTS,
      lastError: 'http_500',
      endPass: true,
    });
  });

  const failures = fc.constantFrom<PhotoFailure>(
    'permanent',
    'transient',
    'unreachable',
    'unauthenticated',
  );

  it('property: a give-up is never picked again', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_PHOTO_ATTEMPTS - 1 }),
        failures,
        (attempts, failure) => {
          const action = applyPhotoTaskOutcome(entry({ attempts }), failed(failure));
          if (action.type !== 'giveUp') return;
          expect(selectNextPhotoTask([entry({ attempts: action.attempts })])).toBeNull();
        },
      ),
    );
  });

  it('property: a retry stays under the cap and never lowers the count', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_PHOTO_ATTEMPTS + 5 }),
        failures,
        (attempts, failure) => {
          const action = applyPhotoTaskOutcome(entry({ attempts }), failed(failure));
          if (action.type !== 'retry') return;
          expect(action.attempts).toBeLessThan(MAX_PHOTO_ATTEMPTS);
          expect(action.attempts).toBeGreaterThanOrEqual(attempts);
        },
      ),
    );
  });

  it('property: only a permanent failure lets the pass carry on', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_PHOTO_ATTEMPTS - 1 }), failures, (a, failure) => {
        expect(applyPhotoTaskOutcome(entry({ attempts: a }), failed(failure)).endPass).toBe(
          failure !== 'permanent',
        );
      }),
    );
  });
});

/**
 * The runner's loop (app/src/features/sync/photo-queue-runner.ts) with the
 * I/O replaced by `run`: pick, run, apply, record, stop when told to.
 * Returns how many times each entry was attempted in this pass.
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
    if (action.endPass) break;
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
    const fail = (): PhotoTaskOutcome => failed('permanent', error);

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
      e.id === 'gone' ? failed('permanent', 'http_404') : { type: 'succeeded' },
    );
    expect([...tries]).toEqual([
      ['gone', 1],
      ['ok', 1],
    ]);
    expect(queue.map((e) => e.id)).toEqual(['gone']);
  });

  it('tries a transient failure once per pass, reaching the cap only across passes', () => {
    const queue = [entry()];
    const serverDown = (): PhotoTaskOutcome => failed('transient', 'http_503');

    for (let pass = 1; pass <= MAX_PHOTO_ATTEMPTS; pass += 1) {
      expect(drainPass(queue, serverDown).get('q1')).toBe(1);
      expect(queue[0]?.attempts).toBe(pass);
    }
    expect(drainPass(queue, serverDown).size).toBe(0);
  });

  it('never wears out an entry while the device is offline', () => {
    const queue = [entry()];
    const offline = (): PhotoTaskOutcome => failed('unreachable', 'network');

    for (let pass = 0; pass < MAX_PHOTO_ATTEMPTS * 3; pass += 1) {
      expect(drainPass(queue, offline).get('q1')).toBe(1);
    }
    expect(queue[0]?.attempts).toBe(0);
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
