-- When a store purchase can still be returned. Separate from deadline_at (the
-- price-adjustment window): Target adjusts prices for 14 days but takes returns
-- for 90, and a return is the fallback when a price drops after the adjustment
-- window has closed. Null when the store sets no limit, or it isn't a store.
alter table refund.purchases add column return_by timestamptz;
