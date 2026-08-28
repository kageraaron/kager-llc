-- Ratings and short reviews on attendances.
--
-- Deliberately DISTINCT from `notes`:
--
--   notes   owner-only, never shared, no friend path in RLS. Where you write
--           "Marisol has the tickets, meet at 7".
--   review  travels with the attendance row, so accepted friends see it when
--           visibility = 'friends'. Where you write "best show of the year".
--
-- No new policies are needed: both columns live on `attendances`, which already
-- has the owner-plus-accepted-friends read rule.

alter table attendances
  add column if not exists rating smallint
    check (rating is null or (rating between 1 and 5)),
  add column if not exists review text
    check (review is null or char_length(review) <= 1000),
  add column if not exists rated_at timestamptz;

-- Rating a show only makes sense once it has happened; enforced in the UI
-- rather than the schema, since `starts_at` lives on `events`.
create index if not exists attendances_rated on attendances (user_id, rating)
  where rating is not null;
