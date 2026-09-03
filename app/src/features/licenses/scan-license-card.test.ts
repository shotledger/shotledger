import {
  countRecognizedFields,
  licenseFormValues,
  scanLicenseCard,
  settleScannedLicenseImage,
  type ScanLicenseCardDeps,
  type SettleScannedLicenseImageDeps,
} from './scan-license-card';
import type { ParsedLicenseCard } from '@shotledger/shared';

// Synthetic card text only (hard rule 7).
const CARD_TEXT = [
  'POLISMYNDIGHETEN',
  'Tillståndsnummer: A000.000/2026-01',
  'Ändamål: Målskjutning',
  'Beslutsdatum: 2026-01-15',
  'Giltigt t.o.m.: Tills vidare',
].join('\n');

function deps(overrides: Partial<ScanLicenseCardDeps> = {}) {
  const deleted: string[] = [];
  const base: ScanLicenseCardDeps = {
    pickFromCamera: async () => 'file:///cache/card.jpg',
    pickFromLibrary: async () => 'file:///cache/picked.jpg',
    recognize: async () => ({ status: 'ok', text: CARD_TEXT }),
    deleteImage: async (uri) => {
      deleted.push(uri);
    },
    ...overrides,
  };
  return { deps: base, deleted };
}

const EMPTY_PARSE: ParsedLicenseCard = {
  licenseNumber: null,
  purpose: null,
  decidedOn: null,
  validUntil: null,
  validUntilIndefinite: false,
  conditions: null,
  authority: null,
  make: null,
  model: null,
  caliber: null,
  vapenId: null,
};

describe('scanLicenseCard', () => {
  it('recognises a card from the camera and keeps the image for the vault choice', async () => {
    const { deps: d, deleted } = deps();
    const result = await scanLicenseCard('camera', d);

    expect(result).toMatchObject({ status: 'scanned', imageUri: 'file:///cache/card.jpg' });
    if (result.status !== 'scanned') throw new Error('unreachable');
    expect(result.parsed.licenseNumber).toBe('A000.000/2026-01');
    expect(deleted).toEqual([]);
  });

  it('uses the library picker for the library source', async () => {
    const { deps: d } = deps();
    const result = await scanLicenseCard('library', d);
    expect(result).toMatchObject({ imageUri: 'file:///cache/picked.jpg' });
  });

  it('reports a cancelled pick without touching the recogniser', async () => {
    let recognised = false;
    const { deps: d } = deps({
      pickFromCamera: async () => null,
      recognize: async () => {
        recognised = true;
        return { status: 'ok', text: '' };
      },
    });
    expect(await scanLicenseCard('camera', d)).toEqual({ status: 'cancelled' });
    expect(recognised).toBe(false);
  });

  it('reports a denied permission', async () => {
    const { deps: d } = deps({ pickFromLibrary: async () => 'denied' });
    expect(await scanLicenseCard('library', d)).toEqual({ status: 'denied' });
  });

  it('deletes the image when recognition fails', async () => {
    const { deps: d, deleted } = deps({ recognize: async () => ({ status: 'failed' }) });
    expect(await scanLicenseCard('camera', d)).toEqual({ status: 'failed' });
    expect(deleted).toEqual(['file:///cache/card.jpg']);
  });

  it('deletes the image when the platform has no OCR engine', async () => {
    const { deps: d, deleted } = deps({ recognize: async () => ({ status: 'unsupported' }) });
    expect(await scanLicenseCard('camera', d)).toEqual({ status: 'unsupported' });
    expect(deleted).toEqual(['file:///cache/card.jpg']);
  });
});

describe('countRecognizedFields', () => {
  it('counts nothing for an empty parse', () => {
    expect(countRecognizedFields(EMPTY_PARSE)).toBe(0);
  });

  it('counts "tills vidare" as a recognised valid-until', () => {
    expect(countRecognizedFields({ ...EMPTY_PARSE, validUntilIndefinite: true })).toBe(1);
  });

  it('counts every non-null field', () => {
    expect(
      countRecognizedFields({
        ...EMPTY_PARSE,
        licenseNumber: 'A000.000/2026-01',
        purpose: 'Målskjutning',
        decidedOn: '2026-01-15',
        validUntilIndefinite: true,
        authority: 'Polismyndigheten',
        make: 'Testmake',
        model: 'Testmodel',
        caliber: '.22 LR',
        vapenId: 'SE1234567',
      }),
    ).toBe(9);
  });
});

describe('settleScannedLicenseImage', () => {
  function settleDeps(overrides: Partial<SettleScannedLicenseImageDeps> = {}) {
    const deleted: string[] = [];
    const stored: string[] = [];
    const base: SettleScannedLicenseImageDeps = {
      requestVaultAccess: async () => ({ granted: true, deviceUnsecured: false }),
      addPhotoDocument: async (sourceUri) => {
        stored.push(sourceUri);
        return {
          id: 'doc-1',
          kind: 'license',
          contentType: 'image',
          label: 'A000.000/2026-01',
          addedAt: '2026-01-15T00:00:00.000Z',
        };
      },
      deleteImage: async (uri) => {
        deleted.push(uri);
      },
      ...overrides,
    };
    return { deps: base, deleted, stored };
  }

  it('keeps the image by default: gates, encrypts into the vault, then clears the cache copy', async () => {
    const { deps, deleted, stored } = settleDeps();
    const result = await settleScannedLicenseImage(
      'file:///cache/card.jpg',
      { store: true, label: 'A000.000/2026-01', promptMessage: 'Unlock vault' },
      deps,
    );
    expect(result).toEqual({ status: 'stored', documentId: 'doc-1' });
    expect(stored).toEqual(['file:///cache/card.jpg']);
    expect(deleted).toEqual(['file:///cache/card.jpg']);
  });

  it('opt-out (store: false) never gates and just deletes the cache copy', async () => {
    let gated = false;
    const { deps, deleted, stored } = settleDeps({
      requestVaultAccess: async () => {
        gated = true;
        return { granted: true, deviceUnsecured: false };
      },
    });
    const result = await settleScannedLicenseImage(
      'file:///cache/card.jpg',
      { store: false, label: 'A000.000/2026-01', promptMessage: 'Unlock vault' },
      deps,
    );
    expect(result).toEqual({ status: 'discarded' });
    expect(gated).toBe(false);
    expect(stored).toEqual([]);
    expect(deleted).toEqual(['file:///cache/card.jpg']);
  });

  it('a refused vault gate loses the copy rather than leaving it in the cache', async () => {
    const { deps, deleted, stored } = settleDeps({
      requestVaultAccess: async () => ({ granted: false, deviceUnsecured: false }),
    });
    const result = await settleScannedLicenseImage(
      'file:///cache/card.jpg',
      { store: true, label: 'A000.000/2026-01', promptMessage: 'Unlock vault' },
      deps,
    );
    expect(result).toEqual({ status: 'vaultDenied' });
    expect(stored).toEqual([]);
    expect(deleted).toEqual(['file:///cache/card.jpg']);
  });
});

describe('licenseFormValues', () => {
  const current = {
    licenseNumber: 'typed',
    purpose: 'typed',
    decidedOn: 'typed',
    validUntil: 'typed',
    conditions: 'typed',
    authority: 'typed',
  };

  it('keeps what the user typed for fields the parse missed', () => {
    expect(licenseFormValues(EMPTY_PARSE, current)).toEqual(current);
  });

  it('overwrites with recognised values', () => {
    expect(
      licenseFormValues(
        { ...EMPTY_PARSE, licenseNumber: 'A000.000/2026-01', validUntil: '2031-01-15' },
        current,
      ),
    ).toMatchObject({
      licenseNumber: 'A000.000/2026-01',
      validUntil: '2031-01-15',
      purpose: 'typed',
    });
  });

  it('clears valid-until when the card says tills vidare', () => {
    expect(
      licenseFormValues({ ...EMPTY_PARSE, validUntilIndefinite: true }, current),
    ).toMatchObject({ validUntil: '' });
  });
});
