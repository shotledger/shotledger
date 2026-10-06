import { describe, expect, it } from 'vitest';

import { deviceLabel } from './device-label';

describe('deviceLabel', () => {
  it.each([
    ['okhttp/4.12.0', { kind: 'app', os: 'Android' }],
    ['ShotLedger/1 CFNetwork/1498.700.2 Darwin/24.0.0', { kind: 'app', os: 'iOS' }],
    [
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      { kind: 'browser', browser: 'Chrome', os: 'Linux' },
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
      { kind: 'browser', browser: 'Edge', os: 'Windows' },
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0',
      { kind: 'browser', browser: 'Firefox', os: 'macOS' },
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
      { kind: 'browser', browser: 'Safari', os: 'macOS' },
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
      { kind: 'browser', browser: 'Safari', os: 'iOS' },
    ],
    [
      'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
      { kind: 'browser', browser: 'Chrome', os: 'Android' },
    ],
    ['curl/8.5.0', { kind: 'unknown' }],
    [null, { kind: 'unknown' }],
  ])('%s', (ua, expected) => {
    expect(deviceLabel(ua)).toEqual(expected);
  });
});
