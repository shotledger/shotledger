// docs/specs/sync-discard-refused-spec.md §2.3: the list re-reads when the
// counts move, and Discard records a failure under its row until it succeeds.
import { act, renderHook } from '@testing-library/react-native';
import { initialSyncStatus, type BadRow, type DiscardOutcome } from '@shotledger/shared';

const mockRows: { value: BadRow[] } = { value: [] };
jest.mock('@/db/client', () => ({ db: { tag: 'db' } }));
jest.mock('@/db/queries/sync-store', () => ({ readBadRows: () => mockRows.value }));
const mockRequestDiscard = jest.fn<Promise<DiscardOutcome>, unknown[]>();
jest.mock('./sync-controller', () => ({
  requestDiscard: (...args: unknown[]) => mockRequestDiscard(...args),
}));

import { useRefusedChanges } from './use-refused-changes';

const T2: BadRow = {
  tableName: 'shots',
  rowId: 'T2',
  waiting: 0,
  held: true,
  root: null,
  context: null,
  role: 'member',
};

it('re-reads the rows when the counts move', async () => {
  mockRows.value = [];
  const { result, rerender } = await renderHook(
    ({ status }: { status: typeof initialSyncStatus }) => useRefusedChanges(status),
    { initialProps: { status: initialSyncStatus } },
  );
  expect(result.current.rows).toEqual([]);
  mockRows.value = [T2];
  await rerender({ status: { ...initialSyncStatus, refusedCount: 1 } });
  expect(result.current.rows).toEqual([T2]);
});

it('marks a failed discard, is busy while it runs, and clears the mark on success', async () => {
  mockRows.value = [T2];
  const { result } = await renderHook(() => useRefusedChanges(initialSyncStatus));

  let finish!: (o: DiscardOutcome) => void;
  mockRequestDiscard.mockImplementationOnce(() => new Promise((r) => (finish = r)));
  await act(async () => result.current.discard(T2));
  expect(mockRequestDiscard).toHaveBeenCalledWith({ tableName: 'shots', rowId: 'T2' });
  expect(result.current.busy).toBe('shots:T2');
  await act(async () => finish({ kind: 'failed', error: 'network' }));
  expect(result.current.busy).toBeNull();
  expect(result.current.failed).toEqual(['shots:T2']);

  mockRows.value = [];
  mockRequestDiscard.mockResolvedValueOnce({ kind: 'discarded', arrival: 7 });
  await act(async () => result.current.discard(T2));
  expect(result.current.failed).toEqual([]);
  expect(result.current.rows).toEqual([]);
});
