-- ─────────────────────────────────────────────────────────────
--  HTML Gallery — Supabase setup
--  Run this once in the Supabase SQL Editor (Database → SQL Editor).
-- ─────────────────────────────────────────────────────────────

-- 1. TABLE
CREATE TABLE IF NOT EXISTS uploads (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  uploader     text        NOT NULL,
  date         timestamptz NOT NULL DEFAULT now(),
  tags         text[],
  type         text,
  summary      text,
  html_content text
);

-- 2. ROW LEVEL SECURITY
--    Enabled so that the policies below control access.
--    The anon key (used by the browser) gets read + insert + delete.
--    No authentication is required.
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read"
  ON uploads
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Public insert"
  ON uploads
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Public delete"
  ON uploads
  FOR DELETE
  TO anon
  USING (true);

-- 3. REALTIME
--    Add the table to the realtime publication so that INSERT and
--    DELETE events are broadcast to all connected browsers instantly.
--    (The publication already exists in every Supabase project.)
ALTER PUBLICATION supabase_realtime ADD TABLE uploads;
