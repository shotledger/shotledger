// Path-construction wiring only — real read/write/delete against the device
// filesystem is exercised on-device (emulator screenshot flow), not under
// jest-expo (see docs/specs/document-vault-evidence.md).
import { Directory, File, Paths } from 'expo-file-system';

jest.mock('expo-file-system');

import { documentFile, indexFile, vaultDirectory } from './vault-fs';

describe('vault-fs paths', () => {
  it('vaultDirectory is a "vault" subdirectory of the document directory', () => {
    vaultDirectory();
    expect(Directory).toHaveBeenCalledWith(Paths.document, 'vault');
  });

  it('indexFile is index.enc inside the vault directory', () => {
    indexFile();
    const dirArg = (File as unknown as jest.Mock).mock.calls[0]?.[0];
    expect(dirArg).toBeInstanceOf(Directory);
    expect((File as unknown as jest.Mock).mock.calls[0]?.[1]).toBe('index.enc');
  });

  it('documentFile names the blob by document id', () => {
    documentFile('abc-123');
    const call = (File as unknown as jest.Mock).mock.calls.find((c) => c[1] === 'abc-123.enc');
    expect(call).toBeDefined();
  });
});
