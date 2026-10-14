// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

// baseline sha256: d7cdd48dc779d23bd3ab040b2cdfb1bff2c107bfd04642dd94ce2ede0e972cbc
// Metro caches the inlined SQL by this file's content, so a baseline edit must
// change this line too (migrations.test.ts checks it).

import journal from './meta/_journal.json';
import m0000 from './0000_baseline.sql';

export default {
  journal,
  migrations: {
    m0000,
  },
};
