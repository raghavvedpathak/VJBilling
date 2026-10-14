// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_phase1_core.sql';
import m0001 from './0001_phase2_inventory.sql';
import m0002 from './0002_phase3_billing.sql';
import m0006 from './0006_phase4_gold_intelligence.sql';

export default {
  journal,
  migrations: {
    m0000,
    m0001,
    m0002,
    m0003: m0006,
    m0006,
  },
};

  