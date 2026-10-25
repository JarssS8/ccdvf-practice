-- One user, many devices. Every write carries updated_at + device_id; newest wins.

CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,              -- full | quick | repo-mock-N | drill | missed | ai | flagged
  feedback INTEGER NOT NULL,       -- 1 = practice (instant feedback), 0 = exam conditions
  question_ids TEXT NOT NULL,      -- JSON array, display order
  seed INTEGER NOT NULL,           -- option shuffle seed
  started_at INTEGER NOT NULL,     -- ms epoch
  deadline INTEGER,                -- ms epoch, null = untimed
  status TEXT NOT NULL,            -- active | submitted
  submitted_at INTEGER,
  result TEXT,                     -- JSON summary computed at submit
  lease_device TEXT,               -- device allowed to write answers
  label TEXT,                      -- e.g. the drilled domain
  updated_at INTEGER NOT NULL
);

CREATE TABLE answers (
  attempt_id TEXT NOT NULL,
  qid TEXT NOT NULL,
  choice TEXT NOT NULL,            -- JSON array of original option letters
  flagged INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  PRIMARY KEY (attempt_id, qid)
);

-- Append-only flashcard review log; scheduling state is replayed on the client.
CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  rating INTEGER NOT NULL,         -- 1 again, 2 hard, 3 good, 4 easy
  reviewed_at INTEGER NOT NULL,
  device_id TEXT NOT NULL
);

CREATE TABLE ai_questions (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  body TEXT NOT NULL,              -- JSON Question
  status TEXT NOT NULL DEFAULT 'active',  -- active | reported
  created_at INTEGER NOT NULL
);

CREATE TABLE ai_usage (
  day TEXT PRIMARY KEY,            -- YYYY-MM-DD UTC
  requests INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE login_failures (
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX login_failures_ip ON login_failures (ip, at);
