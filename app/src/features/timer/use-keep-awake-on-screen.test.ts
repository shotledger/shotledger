// The hook is three lines of effect; what is worth pinning is the contract
// it exists for, since getting it wrong is invisible until a phone locks at
// a firing point.
import { deactivateKeepAwake } from 'expo-keep-awake';

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(),
}));

describe('screen keep-awake tags', () => {
  it('uses a tag distinct from every per-run timer tag', () => {
    // expo-keep-awake reference-counts by tag: if the screen reused a
    // sequence's tag, stopping the sequence would release the screen's hold
    // too, and the phone would lock between strings.
    const screenTags = ['timer-screen', 'shot-diagnostics-screen'];
    const runTags = ['shot-timer', 'ipsc-shot-timer', 'falt-timer', 'mic-diagnostics'];
    for (const tag of screenTags) expect(runTags).not.toContain(tag);
  });

  it('exports a deactivate to pair with every activate', () => {
    expect(typeof deactivateKeepAwake).toBe('function');
  });
});
