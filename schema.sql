CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
