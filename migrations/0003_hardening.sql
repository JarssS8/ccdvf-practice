-- Security audit run-1: per-IP AI allowance (one person cannot multiply the per-user cap with free accounts)
-- and an index so the rate-limit prune does not scan the whole table.

CREATE TABLE ai_usage_ip (
  ip TEXT NOT NULL,                -- client IP (IPv6 reduced to its /64)
  day TEXT NOT NULL,               -- YYYY-MM-DD UTC
  requests INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, day)
);

CREATE INDEX "rateLimit_lastRequest_idx" ON "rateLimit" ("lastRequest");
