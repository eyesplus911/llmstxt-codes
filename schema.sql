-- llmstxt-codes D1 schema
-- Version: 1

CREATE TABLE IF NOT EXISTS scans (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  score INTEGER CHECK(score IS NULL OR (score >= 0 AND score <= 100)),
  llms_txt_score INTEGER,
  robots_txt_score INTEGER,
  ai_txt_score INTEGER,
  sitemap_score INTEGER,
  meta_score INTEGER,
  headers_score INTEGER,
  score_version INTEGER NOT NULL DEFAULT 1,
  results_r2_key TEXT,
  scanned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  schema_version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scans_domain_day ON scans(domain, substr(scanned_at, 1, 10));
CREATE INDEX IF NOT EXISTS idx_scans_domain ON scans(domain);
CREATE INDEX IF NOT EXISTS idx_scans_scanned_at ON scans(scanned_at);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  domain TEXT NOT NULL,
  alert_type TEXT DEFAULT 'changes',
  verified INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_alerts_email ON alerts(email);
CREATE INDEX IF NOT EXISTS idx_alerts_domain ON alerts(domain);

CREATE TABLE IF NOT EXISTS scan_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  total_scans INTEGER,
  success_count INTEGER,
  error_count INTEGER,
  avg_latency_ms INTEGER
);

CREATE TABLE IF NOT EXISTS directory (
  domain TEXT PRIMARY KEY,
  llms_txt_url TEXT,
  score INTEGER,
  last_checked TEXT,
  submitted_by TEXT
);
