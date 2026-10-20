import { describe, expect, it } from 'vitest';

import {
  androidOrigin,
  AppAssociationError,
  appleAppSiteAssociation,
  appleTeamId,
  assetLinks,
  signingFingerprints,
} from './app-association';

// Synthetic: 0x00..0x1F, not any real key.
const FP = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase()).join(
  ':',
);

describe('signing fingerprints', () => {
  it('reads a comma-separated list, upper-cased, without duplicates or blanks', () => {
    expect(signingFingerprints(` ${FP.toLowerCase()}, ,${FP}`)).toEqual([FP]);
  });

  it.each([undefined, '', ' , '])('reads %j as no Android app', (value) => {
    expect(signingFingerprints(value)).toEqual([]);
  });

  it.each(['REPLACE_ME', FP.slice(3), `${FP}:00`, FP.replace(/:/g, ''), FP.replace('00', 'G0')])(
    'refuses %s',
    (value) => {
      expect(() => signingFingerprints(value)).toThrow(AppAssociationError);
    },
  );
});

describe('the Android origin', () => {
  it('is the base64url of the fingerprint bytes, unpadded', () => {
    expect(androidOrigin(FP)).toBe(
      'android:apk-key-hash:AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
    );
  });

  it('uses the url-safe alphabet', () => {
    const high = Array.from({ length: 32 }, () => 'FB').join(':');
    expect(androidOrigin(high)).toBe(`android:apk-key-hash:${'-_v7'.repeat(10)}-_s`);
  });
});

describe('the association files', () => {
  it('assetlinks lets the app handle links and use the login credentials', () => {
    expect(assetLinks([FP])).toEqual([
      {
        relation: [
          'delegate_permission/common.handle_all_urls',
          'delegate_permission/common.get_login_creds',
        ],
        target: {
          namespace: 'android_app',
          package_name: 'app.shotledger',
          sha256_cert_fingerprints: [FP],
        },
      },
    ]);
  });

  it('the Apple file names the team and bundle for webcredentials', () => {
    expect(appleAppSiteAssociation('ABCDE12345')).toEqual({
      webcredentials: { apps: ['ABCDE12345.app.shotledger'] },
    });
  });

  it.each([
    [undefined, null],
    ['', null],
    [' abcde12345 ', 'ABCDE12345'],
  ])('APPLE_TEAM_ID %j is %j', (value, expected) => {
    expect(appleTeamId(value)).toBe(expected);
  });

  it.each(['REPLACE_ME', 'ABCDE1234', 'ABCDE-1234'])('refuses the Team ID %s', (value) => {
    expect(() => appleTeamId(value)).toThrow(AppAssociationError);
  });
});
