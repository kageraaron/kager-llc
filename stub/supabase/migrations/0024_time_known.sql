-- Shows you remember the date of, but not the time.
--
-- Backfilling history is a first-class path in a memory app: you know you saw
-- Alvvays at the Fillmore in May, you do not know that doors were at 8. The
-- manual form required a time anyway, so the only way to log that show was to
-- invent one — and an invented time is indistinguishable from a real one
-- afterwards, which quietly corrupts the archive it was meant to record.
--
-- `starts_at` stays `timestamptz not null`: every read, sort, index and
-- timezone conversion in the app depends on it, and making it nullable to
-- express "no time" would be a far larger change than this is worth. Instead a
-- time-unknown show is stored at 20:00 **local to the venue** and flagged here.
--
-- ## Why 20:00 local and not midnight
--
-- Midnight is the obvious sentinel and it is wrong. `yearOf` and the archive's
-- grouping compute the calendar year in the VENUE's zone, so a show stored at
-- 00:00 UTC for a San Francisco venue reads as the previous day — and on 1
-- January, the previous YEAR. That is the exact New Year's Eve fault already
-- documented in `format.ts` and `archive/page.tsx`. An evening hour keeps the
-- instant on the right calendar day in every zone the app renders in.
--
-- Consumers must check this flag rather than the time: `false` means the 20:00
-- is a placeholder and no clock time should be displayed, exported to a
-- calendar, or sent to a display.

alter table events
  add column if not exists time_known boolean not null default true;

comment on column events.time_known is
  'False when only the date is known; starts_at then holds 20:00 venue-local as a placeholder and no time should be rendered.';
