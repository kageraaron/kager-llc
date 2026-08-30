-- Re-scanning a mailbox after the heuristics improve, without re-asking the
-- user about mail they already dealt with.
--
-- ## The problem
--
-- `ingest_messages` is unique on (user_id, content_hash), which makes ingestion
-- idempotent — and also means a message read once is skipped forever. So when
-- an extractor bug is fixed, the emails it got wrong can never be revisited.
-- The only remedy was deleting the rows, which throws away the record of what
-- the user already confirmed or rejected and re-surfaces all of it.
--
-- ## The fix
--
-- Record WHICH version of the extractors read each message. A re-scan then
-- reprocesses only messages read by an older version, and skips any message the
-- user has already acted on regardless of version — a confirmed or rejected
-- candidate is a decision, and improving a regex does not reopen it.

alter table ingest_messages
  add column if not exists extractor_version integer not null default 0;

-- The re-scan predicate: old version first, so the index is useful even once
-- most rows are current.
create index if not exists ingest_messages_rescan
  on ingest_messages (user_id, extractor_version);

/*
 * Candidate deduplication.
 *
 * One show routinely produces several emails — a purchase receipt, then a
 * "your tickets are ready" delivery notice, then sometimes a reminder. Each is
 * a distinct message with its own content hash, so each became its own review
 * card and the user saw the same gig two or three times.
 *
 * `dedupe_key` is a coarse fingerprint of the SHOW (normalized act + calendar
 * date), letting the pipeline recognise that a second email describes something
 * already queued. Nullable, because a candidate with no name or no date cannot
 * be fingerprinted and must still be allowed through.
 *
 * Not a unique constraint: two genuinely different candidates can collide (two
 * nights of a residency parse to the same act and, if one date is missing, the
 * same key). The pipeline merges on it deliberately rather than the database
 * refusing the write.
 */
alter table ingest_candidates
  add column if not exists dedupe_key text;

/*
 * A status for "this is a real ticket email, but for a show already queued".
 *
 * Distinct from 'ignored' (not a ticket at all) so the Inbox's "read but
 * yielded nothing" list stays honest — these DID yield something, it was just
 * already known. Added as an enum value rather than free text so the existing
 * status checks keep their guarantees.
 */
alter type ingest_status add value if not exists 'duplicate_event';

create index if not exists ingest_candidates_dedupe
  on ingest_candidates (user_id, dedupe_key)
  where dedupe_key is not null;

/*
 * Backfill the key for candidates already stored, so deduplication applies to
 * the queue as it stands rather than only to new mail.
 *
 * Mirrors `dedupe.ts`: lowercase, strip everything but letters and digits, and
 * take the calendar DATE (not the time — a receipt and a delivery notice
 * routinely disagree about the hour while agreeing on the night).
 */
update ingest_candidates
set dedupe_key =
  regexp_replace(
    lower(coalesce(parsed->>'artistName', parsed->>'eventName')),
    '[^a-z0-9]', '', 'g'
  ) || ':' || left(parsed->>'startsAt', 10)
where dedupe_key is null
  and coalesce(parsed->>'artistName', parsed->>'eventName') is not null
  and parsed->>'startsAt' ~ '^\\d{4}-\\d{2}-\\d{2}'
  and length(regexp_replace(lower(coalesce(parsed->>'artistName', parsed->>'eventName')),
      '[^a-z0-9]', '', 'g')) >= 2;
