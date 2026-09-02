export type VaultDocumentKind = 'license' | 'membershipCard' | 'doorCode' | 'other';
export type VaultContentType = 'image' | 'text';

export interface VaultDocumentMeta {
  id: string;
  kind: VaultDocumentKind;
  contentType: VaultContentType;
  label: string;
  addedAt: string; // ISO 8601
}

export interface VaultIndex {
  documents: VaultDocumentMeta[];
}

export const EMPTY_VAULT_INDEX: VaultIndex = { documents: [] };
