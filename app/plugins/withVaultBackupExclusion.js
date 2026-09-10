// Excludes the document vault's directory (files/vault/, i.e.
// `Paths.document` + "vault" — see app/src/platform/vault-fs.ts) from
// Android's app-controlled backups: Auto Backup for Apps (cloud, API 23+)
// and the device-to-device transfer flow (API 31+). Files there are already
// AES-256-GCM encrypted at rest (docs/specs/document-vault-spec.md), but the
// vault must never be synced by anything the app controls — Android's own
// backup mechanism counts.
//
// No `expo-*` module exposes this as a config option; it requires two
// native pieces the Expo config-plugin system (`expo/config-plugins`,
// already available via the `expo` package — no new dependency) can inject
// into the generated Android project at prebuild time:
//
// 1. `android:fullBackupContent`/`android:dataExtractionRules` attributes on
//    <application> in AndroidManifest.xml, pointing at...
// 2. ...two XML resource files under res/xml/ that each exclude `vault/`.
//
// `dataExtractionRules` (API 31+) covers both cloud backup and device
// transfer; `fullBackupContent` is the pre-31 equivalent still read by
// Android when `dataExtractionRules` handles the modern path — Android
// requires both attributes to be present together (a lint/manifest-merger
// warning otherwise), so both files are written even though a lower-API
// device only consults `backup_rules.xml`.
//
// iOS has no plugin here: no current Expo module exposes
// `NSURLIsExcludedFromBackupKey` for a directory without a small custom
// native module or a `withDangerousMod` Xcode-project edit — flagged as a
// follow-up in docs/specs/document-vault-evidence.md.
//
// Also folds in expo-secure-store's own backup exclusion (its
// `plugin/build/withSecureStore.js` excludes `sharedpref`/"SecureStore" —
// the EncryptedSharedPreferences file holding the vault's AES key, among
// any other secure-store values) rather than letting the two plugins race
// over the single `fullBackupContent`/`dataExtractionRules` manifest
// attributes (only one plugin's XML files can be referenced; whichever
// plugin's `withAndroidManifest` mod runs last wins, and the other prints a
// "backup rules are already present" warning and is silently dropped).
// Excluding the key's own preferences file is redundant with Keystore's own
// device-binding (a restored SharedPreferences blob wouldn't decrypt on a
// different device's Keystore anyway) but costs nothing and matches
// expo-secure-store's documented recommendation.
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const DATA_EXTRACTION_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
        <exclude domain="file" path="vault/" />
        <exclude domain="sharedpref" path="SecureStore" />
    </cloud-backup>
    <device-transfer>
        <exclude domain="file" path="vault/" />
        <exclude domain="sharedpref" path="SecureStore" />
    </device-transfer>
</data-extraction-rules>
`;

const BACKUP_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
    <exclude domain="file" path="vault/" />
    <exclude domain="sharedpref" path="SecureStore" />
</full-backup-content>
`;

function withVaultBackupExclusion(config) {
  config = withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:fullBackupContent'] = '@xml/backup_rules';
      application.$['android:dataExtractionRules'] = '@xml/data_extraction_rules';
    }
    return config;
  });

  config = withDangerousMod(config, [
    'android',
    (config) => {
      const xmlDir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, 'data_extraction_rules.xml'), DATA_EXTRACTION_RULES_XML);
      fs.writeFileSync(path.join(xmlDir, 'backup_rules.xml'), BACKUP_RULES_XML);
      return config;
    },
  ]);

  return config;
}

module.exports = withVaultBackupExclusion;
