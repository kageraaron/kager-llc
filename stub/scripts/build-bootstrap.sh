#!/usr/bin/env bash
# Regenerates supabase/bootstrap.sql from the migrations + seed, in order.
set -euo pipefail
cd "$(dirname "$0")/.."
{
  cat <<'HDR'
-- Stub — one-shot bootstrap.
--
-- Concatenation of supabase/migrations/*.sql (in order) followed by
-- supabase/seed.sql, for pasting into the Supabase SQL editor or running via
-- the Supabase MCP server in a single call.
--
-- This is a CONVENIENCE FILE, not the source of truth. The migrations directory
-- is authoritative — `supabase db push` and `supabase db reset` use those.
-- Regenerate with: npm run build:bootstrap
--
-- Idempotent and safe to re-run.
-- NEVER run against a database with real data.
HDR
  for f in $(ls supabase/migrations/*.sql | sort) supabase/seed.sql; do
    printf '\n-- ============================================================================\n'
    printf -- '-- %s\n' "$f"
    printf -- '-- ============================================================================\n\n'
    cat "$f"
  done
} > supabase/bootstrap.sql
echo "wrote supabase/bootstrap.sql ($(wc -l < supabase/bootstrap.sql) lines)"
