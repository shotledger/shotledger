// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

// baseline sha256: f13e0d3ab9d1625bbc150a85cf0b927333ace7359e15899fdbd275ca7adea757
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
