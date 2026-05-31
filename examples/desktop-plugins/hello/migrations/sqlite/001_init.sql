CREATE TABLE IF NOT EXISTS plugin_hello_state (
  key TEXT NOT NULL PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
