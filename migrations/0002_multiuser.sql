-- Public, multi-user app. The single-user data of 0001 is dropped (fresh start).
-- Every app row belongs to a Better Auth user and goes away with it (right to erasure).

DROP TABLE IF EXISTS answers;
DROP TABLE IF EXISTS attempts;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS ai_questions;
DROP TABLE IF EXISTS ai_usage;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS login_failures;

-- ---------- Better Auth 1.7.14 (generated with `npx auth generate`) ----------

create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null, "acceptedTermsAt" integer, "aiConsentAt" integer);
create table "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);
create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);
create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);
create table "rateLimit" ("id" text not null primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null);
create index "session_userId_idx" on "session" ("userId");
create index "account_userId_idx" on "account" ("userId");
create index "verification_identifier_idx" on "verification" ("identifier");

-- ---------- app ----------
-- Every write carries updated_at + device_id; newest wins.

CREATE TABLE attempts (
  user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  mode TEXT NOT NULL,              -- full | quick | repo-mock-N | guide | drill | missed | ai | flagged
  label TEXT,                      -- drilled domain, or from:<mode>
  lang TEXT NOT NULL DEFAULT 'en', -- language the attempt is shown in (exam modes: always en)
  feedback INTEGER NOT NULL,       -- 1 = practice (instant feedback), 0 = exam conditions
  question_ids TEXT NOT NULL,      -- JSON array, display order
  seed INTEGER NOT NULL,           -- option shuffle seed
  started_at INTEGER NOT NULL,     -- ms epoch
  deadline INTEGER,                -- ms epoch, null = untimed
  status TEXT NOT NULL,            -- active | submitted | discarded
  submitted_at INTEGER,
  result TEXT,                     -- JSON summary computed at submit
  lease_device TEXT,               -- device allowed to write answers
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE answers (
  user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL,
  qid TEXT NOT NULL,
  choice TEXT NOT NULL,            -- JSON array of original option letters
  flagged INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  PRIMARY KEY (user_id, attempt_id, qid)
);

-- Append-only flashcard review log; scheduling state is replayed on the client.
CREATE TABLE reviews (
  user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  rating INTEGER NOT NULL,         -- 0 added by hand, 1 again, 2 hard, 3 good, 4 easy
  reviewed_at INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE settings (
  user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE ai_questions (
  user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  domain TEXT NOT NULL,
  body TEXT NOT NULL,              -- JSON Question
  status TEXT NOT NULL DEFAULT 'active',  -- active | reported
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE ai_usage (
  user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  day TEXT NOT NULL,               -- YYYY-MM-DD UTC
  requests INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- Whole-app daily budget (DeepSeek is paid by the owner)
CREATE TABLE ai_usage_global (
  day TEXT PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0
);
