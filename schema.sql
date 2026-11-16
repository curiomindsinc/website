CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Sim launch counts: one row per sim per day (Singapore date). No visitor data.
-- functions/api/launch.js also creates this table on first use.
CREATE TABLE IF NOT EXISTS launches (
  sim TEXT NOT NULL,
  day TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sim, day)
);

-- "Notify me" sign-ups for coming-soon sims (private: no GET endpoint).
-- functions/api/notify.js also creates this table on first use.
CREATE TABLE IF NOT EXISTS notify (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sim TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (sim, email)
);
