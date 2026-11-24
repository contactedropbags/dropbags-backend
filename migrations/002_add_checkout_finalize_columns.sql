-- DropBags — migration finalize checkout (Open & Leave / Checkout)
--
-- Adds columns required by closeLocker() / finalizeCheckout() in bookingService.js.
-- Does NOT alter existing columns (arrival_time, checkInTime, checkout_*, etc.).
--
-- Naming note: business "checkout time" is stored as "checkOutTime" (camelCase),
-- matching checkInTime and the Supabase JS client payloads in the backend.

-- 1/4 — real checkout timestamp at finalize
alter table public.bookings
  add column if not exists "checkOutTime" timestamptz null;

-- 2/4 — stay duration in milliseconds (checkOutTime - checkInTime)
alter table public.bookings
  add column if not exists duration bigint null;

-- 3/4 — billable amount in whole euros
alter table public.bookings
  add column if not exists price integer null;

-- 4/4 — Stripe capture confirmation timestamp (after successful finalize)
alter table public.bookings
  add column if not exists "paymentCapturedAt" timestamptz null;

comment on column public.bookings."checkOutTime" is
  'Real checkout timestamp at finalize (Open & Leave). Distinct from checkInTime and arrival_time.';

comment on column public.bookings.duration is
  'Total stay duration in ms at finalize (checkOutTime - checkInTime).';

comment on column public.bookings.price is
  'Billable amount in whole euros at finalize, before Stripe capture.';

comment on column public.bookings."paymentCapturedAt" is
  'Set after successful Stripe capture on finalize (Open & Leave / Checkout). NULL until then.';
