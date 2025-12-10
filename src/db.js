const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { DB_PATH } = require('./config');
const { runMigrations } = require('./migrations');

const ensureDatabase = () => {
  const dir = path.dirname(DB_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const database = new DatabaseSync(DB_PATH);
  database.exec('PRAGMA foreign_keys = ON;');
  return database;
};

const db = ensureDatabase();
runMigrations(db);

module.exports = { db };
