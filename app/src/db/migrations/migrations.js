// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

// baseline sha256: b952e57a7f2d69f9c458b61fe9869450f5c878deca330b01f07c9f0f22c43438
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
