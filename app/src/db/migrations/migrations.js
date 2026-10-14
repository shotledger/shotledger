// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

// baseline sha256: ade85fcd7aadb8b0e0f5f8799b8332318c33a00484dbdaf425bf1d0b9e5224f3
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
