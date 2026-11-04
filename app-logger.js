const { DatabaseSync } = require("node:sqlite");

let database;
let logDatabasePath;
let insertLog;
let selectLogs;

function initializeLogDatabase(databasePath) {
  if (database) return;

  logDatabasePath = databasePath;
  database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS app_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      details TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS app_logs_timestamp_idx
      ON app_logs(timestamp DESC);
  `);
  insertLog = database.prepare(`
    INSERT INTO app_logs (timestamp, level, category, message, details)
    VALUES (?, ?, ?, ?, ?)
  `);
  selectLogs = database.prepare(`
    SELECT id, timestamp, level, category, message, details
    FROM app_logs
    ORDER BY id DESC
    LIMIT ?
  `);
}

function writeLog(level, category, message, details = {}) {
  if (!insertLog) throw new Error("The application log database is not ready.");
  insertLog.run(
    new Date().toISOString(),
    level,
    category,
    String(message),
    JSON.stringify(details),
  );
}

function getLogs(limit = 500) {
  if (!selectLogs)
    throw new Error("The application log database is not ready.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error("Log limit must be between 1 and 1000.");
  }
  return selectLogs.all(limit);
}

function getLogDatabasePath() {
  if (!logDatabasePath) {
    throw new Error("The application log database is not ready.");
  }
  return logDatabasePath;
}

function closeLogDatabase() {
  database?.close();
  database = undefined;
  logDatabasePath = undefined;
  insertLog = undefined;
  selectLogs = undefined;
}

module.exports = {
  closeLogDatabase,
  getLogs,
  getLogDatabasePath,
  initializeLogDatabase,
  writeLog,
};
