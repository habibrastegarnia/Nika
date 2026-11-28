-- 0014: public user messages, immutable role snapshots, comments and reactions
ALTER TABLE requests ADD COLUMN author_name TEXT;
ALTER TABLE requests ADD COLUMN author_role TEXT;
ALTER TABLE requests ADD COLUMN author_label TEXT;

ALTER TABLE notices ADD COLUMN source_request_id TEXT REFERENCES requests(id) ON DELETE SET NULL;
ALTER TABLE notices ADD COLUMN author_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE notices ADD COLUMN author_name TEXT;
ALTER TABLE notices ADD COLUMN author_role TEXT;
ALTER TABLE notices ADD COLUMN author_label TEXT;

CREATE INDEX IF NOT EXISTS idx_notices_public_source ON notices(audience,source_request_id,created_at);

CREATE TABLE IF NOT EXISTS notice_comments (
  id TEXT PRIMARY KEY,
  notice_id TEXT NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  author_label TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notice_comments_notice ON notice_comments(notice_id,created_at);

CREATE TABLE IF NOT EXISTS notice_reactions (
  id TEXT PRIMARY KEY,
  notice_id TEXT NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK(reaction IN ('like','heart','support','celebrate')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(notice_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_notice_reactions_notice ON notice_reactions(notice_id,reaction);
