-- Personal data for signed-in family members.
--
-- This lives in D1 and NOWHERE else. Photos commit to a public GitHub repo;
-- notes must never take that path, or a private remark about someone's cooking
-- becomes permanently world-readable.
--
-- Apply with:
--   npx wrangler d1 execute matur --remote --file=worker/schema.sql

CREATE TABLE IF NOT EXISTS favourites (
  user_sub TEXT NOT NULL,
  slug     TEXT NOT NULL,
  created  INTEGER NOT NULL,
  PRIMARY KEY (user_sub, slug)
);

CREATE TABLE IF NOT EXISTS notes (
  user_sub TEXT NOT NULL,
  slug     TEXT NOT NULL,
  body     TEXT NOT NULL,
  updated  INTEGER NOT NULL,
  PRIMARY KEY (user_sub, slug)
);

-- Links the family wants turned into recipes. Unlike notes this is a shared
-- queue: everyone signed in sees it, because the point is to hand it to whoever
-- is doing the converting.
CREATE TABLE IF NOT EXISTS suggestions (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_sub  TEXT NOT NULL,
  user_name TEXT NOT NULL,
  url       TEXT NOT NULL UNIQUE,
  note      TEXT NOT NULL DEFAULT '',
  status    TEXT NOT NULL DEFAULT 'nytt',
  slug      TEXT,
  created   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS favourites_by_user ON favourites (user_sub);
CREATE INDEX IF NOT EXISTS notes_by_user ON notes (user_sub);
CREATE INDEX IF NOT EXISTS suggestions_by_status ON suggestions (status, created);
