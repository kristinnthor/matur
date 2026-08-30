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

CREATE INDEX IF NOT EXISTS favourites_by_user ON favourites (user_sub);
CREATE INDEX IF NOT EXISTS notes_by_user ON notes (user_sub);
