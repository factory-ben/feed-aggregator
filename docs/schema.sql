-- Factory Feed Supabase Schema
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- Posts table (scraped content)
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  author TEXT NOT NULL,
  content TEXT,
  url TEXT,
  timestamp TIMESTAMPTZ NOT NULL,
  category TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_posts_timestamp ON posts(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_posts_source ON posts(source);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);

-- User-specific post states (archived, bookmarked, etc.)
CREATE TABLE IF NOT EXISTS post_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  is_archived BOOLEAN DEFAULT FALSE,
  is_bookmarked BOOLEAN DEFAULT FALSE,
  is_read BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  bookmarked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);

-- Index for user queries
CREATE INDEX IF NOT EXISTS idx_post_states_user ON post_states(user_id);
CREATE INDEX IF NOT EXISTS idx_post_states_archived ON post_states(user_id, is_archived) WHERE is_archived = TRUE;
CREATE INDEX IF NOT EXISTS idx_post_states_bookmarked ON post_states(user_id, is_bookmarked) WHERE is_bookmarked = TRUE;

-- Enable Row Level Security
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_states ENABLE ROW LEVEL SECURITY;

-- Posts are readable by authenticated users only
CREATE POLICY "Authenticated users can read posts" ON posts
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Service role can insert/update posts (for scraper)
CREATE POLICY "Service role can manage posts" ON posts
  FOR ALL
  USING (auth.role() = 'service_role');

-- Users can only see and manage their own post states
CREATE POLICY "Users can read own post states" ON post_states
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own post states" ON post_states
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own post states" ON post_states
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own post states" ON post_states
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on post_states
DROP TRIGGER IF EXISTS update_post_states_updated_at ON post_states;
CREATE TRIGGER update_post_states_updated_at
  BEFORE UPDATE ON post_states
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable realtime for post_states (for cross-device sync)
ALTER PUBLICATION supabase_realtime ADD TABLE post_states;
