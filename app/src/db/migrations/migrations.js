// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

// baseline sha256: 5ab2e39fb5f2ab013ed0b0ee04b5a76806d0423e8ee8ef0bcfb25f926101c234
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
