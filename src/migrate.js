const { db } = require('./db');
const { getMigrationState, runMigrations } = require('./migrations');

// Simple CLI runner to apply migrations then print state
(() => {
  runMigrations(db);
  const state = getMigrationState(db);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ status: 'ok', applied: state.applied, pending: state.pending }, null, 2));
})();
