import { reduceFolderState } from './folder-state';

describe('reduceFolderState', () => {
  it('starts unset and remembers the folder after a successful pick', () => {
    expect(reduceFolderState(null, { type: 'pick-succeeded', folderUri: 'content://a' })).toBe(
      'content://a',
    );
  });

  it('leaves the folder unset when a pick is cancelled', () => {
    expect(reduceFolderState(null, { type: 'pick-cancelled' })).toBeNull();
  });

  it('keeps an already-remembered folder when a later pick is cancelled', () => {
    expect(reduceFolderState('content://a', { type: 'pick-cancelled' })).toBe('content://a');
  });

  it('keeps the remembered folder after a successful write', () => {
    expect(reduceFolderState('content://a', { type: 'write-succeeded' })).toBe('content://a');
  });

  it('forgets the folder after a failed write, so the next attempt re-prompts', () => {
    expect(reduceFolderState('content://a', { type: 'write-failed' })).toBeNull();
  });

  it('forgets the folder on an explicit forget', () => {
    expect(reduceFolderState('content://a', { type: 'forget' })).toBeNull();
  });

  it('picking a new folder replaces a previously remembered one', () => {
    expect(
      reduceFolderState('content://old', { type: 'pick-succeeded', folderUri: 'content://new' }),
    ).toBe('content://new');
  });
});
