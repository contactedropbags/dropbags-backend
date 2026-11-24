-- Real locker check-in timestamp (distinct from arrival_time = planned arrival).
alter table public.bookings
  add column if not exists "checkInTime" timestamptz null;

comment on column public.bookings."checkInTime" is
  'Real first check-in at locker terminal (first successful open). NULL until then. Door access must not set this.';
