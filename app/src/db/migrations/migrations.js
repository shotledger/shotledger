// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_chilly_scream.sql';
import m0001 from './0001_fixed_multiple_man.sql';
import m0002 from './0002_young_hardball.sql';
import m0003 from './0003_soft_hemingway.sql';
import m0004 from './0004_motionless_the_fury.sql';
import m0005 from './0005_parallel_northstar.sql';
import m0006 from './0006_session_kind.sql';
import m0007 from './0007_polite_texas_twister.sql';
import m0008 from './0008_ammo_velocity.sql';
import m0009 from './0009_caliber_load_system_presets.sql';
import m0010 from './0010_series_entry_mode.sql';
import m0011 from './0011_training_samples.sql';
import m0012 from './0012_session_ten_counters.sql';

export default {
  journal,
  migrations: {
    m0000,
    m0001,
    m0002,
    m0003,
    m0004,
    m0005,
    m0006,
    m0007,
    m0008,
    m0009,
    m0010,
    m0011,
    m0012,
  },
};
