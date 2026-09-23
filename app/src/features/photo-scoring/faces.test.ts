import { isManualOnlyFace, isPhotoScoringSupported } from './faces';

it('supports the auto-locked and the corner-only faces, and nothing else', () => {
  for (const face of [
    'spsf-pistol-25m-precision',
    'issf-25m-precision',
    'spsf-snabbskjutning-25m',
    'issf-25m-rapid-fire',
    'issf-10m-air-pistol',
  ]) {
    expect(isPhotoScoringSupported(face)).toBe(true);
  }
  expect(isPhotoScoringSupported('generic-rings')).toBe(false);
  expect(isPhotoScoringSupported('')).toBe(false);
});

it('scores the rapid-fire and air-pistol faces by corners only', () => {
  expect(isManualOnlyFace('spsf-snabbskjutning-25m')).toBe(true);
  expect(isManualOnlyFace('issf-10m-air-pistol')).toBe(true);
  expect(isManualOnlyFace('spsf-pistol-25m-precision')).toBe(false);
});
