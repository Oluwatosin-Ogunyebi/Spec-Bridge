-- spec-bridge Supabase schema
-- Run this in the Supabase SQL Editor to set up the database.

-- =========================================================================
-- Rooms table — tracks active and closed rooms
-- =========================================================================

CREATE TABLE IF NOT EXISTS rooms (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_code     TEXT NOT NULL,
  created_by_role TEXT NOT NULL DEFAULT 'host',
  status        TEXT NOT NULL DEFAULT 'active',    -- 'active' | 'closed'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at     TIMESTAMPTZ
);

-- Index for looking up active rooms by code
CREATE INDEX IF NOT EXISTS idx_rooms_code_status
  ON rooms (room_code, status);

-- =========================================================================
-- Quiz history — stores generated quizzes for replay/analytics
-- =========================================================================

CREATE TABLE IF NOT EXISTS quiz_history (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_code     TEXT NOT NULL,
  topic         TEXT NOT NULL,
  difficulty    TEXT NOT NULL DEFAULT 'medium',
  question_count INT NOT NULL DEFAULT 10,
  questions     JSONB NOT NULL,                    -- full quiz payload
  provider      TEXT NOT NULL DEFAULT 'claude',    -- 'claude' | 'openai' | 'gemini'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_history_room
  ON quiz_history (room_code);

-- =========================================================================
-- Message log — audit trail of all messages routed through the relay
-- =========================================================================

CREATE TABLE IF NOT EXISTS message_log (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_code     TEXT NOT NULL,
  message_type  TEXT NOT NULL,
  from_id       TEXT NOT NULL,
  to_target     TEXT NOT NULL,                     -- 'all' | 'host' | client ID
  payload       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_log_room
  ON message_log (room_code);

-- Partition-friendly index for time-based queries
CREATE INDEX IF NOT EXISTS idx_message_log_created
  ON message_log (created_at);

-- =========================================================================
-- Row-Level Security (RLS) — lock down access
-- =========================================================================

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_log ENABLE ROW LEVEL SECURITY;

-- Allow the relay server (using anon key) full access.
-- In production, use a service_role key or custom JWT claims.

CREATE POLICY "relay_rooms_all" ON rooms
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "relay_quiz_history_all" ON quiz_history
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "relay_message_log_all" ON message_log
  FOR ALL USING (true) WITH CHECK (true);

-- =========================================================================
-- Cleanup: auto-delete message logs older than 7 days (optional cron)
-- =========================================================================
-- If using Supabase pg_cron extension:
--
-- SELECT cron.schedule(
--   'cleanup-old-messages',
--   '0 3 * * *',  -- daily at 3am UTC
--   $$DELETE FROM message_log WHERE created_at < now() - interval '7 days'$$
-- );
