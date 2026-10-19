-- KB-003: articles suggested before a ticket is filed, and the asker's outcome. No question text is kept.
CREATE TABLE work_knowledge_suggestions(
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  asker_id TEXT NOT NULL,
  articles_json TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('suggested','confirmed','filed')),
  article_id TEXT,
  article_revision INTEGER,
  work_id TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX work_knowledge_suggestions_range ON work_knowledge_suggestions(workspace_id,created_at);
