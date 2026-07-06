-- ================================================================
-- Local Pocket Reader — Supabase Database Setup
-- Jalankan SQL ini dalam: Supabase Dashboard → SQL Editor → New query
-- ================================================================

-- 1. Table sync_data (incremental sync — satu row per data type + doc ID)
CREATE TABLE IF NOT EXISTS sync_data (
  user_id UUID REFERENCES auth.users NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  device_id TEXT,
  schema_version INTEGER DEFAULT 1,
  UNIQUE(user_id, key)
);

ALTER TABLE sync_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own data" ON sync_data;
CREATE POLICY "Users can manage own data" ON sync_data
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sync_data_user_key ON sync_data(user_id, key);
CREATE INDEX IF NOT EXISTS idx_sync_data_updated ON sync_data(user_id, updated_at DESC);

-- 2. Table backup_data (full JSON backup — satu row per user)
CREATE TABLE IF NOT EXISTS backup_data (
  user_id UUID REFERENCES auth.users PRIMARY KEY,
  backup_json TEXT NOT NULL,
  size_bytes INTEGER,
  exported_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE backup_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own backup" ON backup_data;
CREATE POLICY "Users can manage own backup" ON backup_data
  FOR ALL USING (auth.uid() = user_id);

-- 3. Add missing columns to sync_data (safe to run even if already exist)
ALTER TABLE sync_data ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE sync_data ADD COLUMN IF NOT EXISTS schema_version INTEGER DEFAULT 1;

-- Done! Tables are ready.
SELECT 'Setup complete!' as status;
