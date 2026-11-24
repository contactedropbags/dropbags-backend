const supabase = require("../config/supabase");

const TABLE = "access_logs";

/**
 * Supabase table (create manually if missing):
 *
 * create table access_logs (
 *   id uuid primary key default gen_random_uuid(),
 *   booking_id uuid references bookings(id),
 *   method text not null,
 *   allowed boolean not null,
 *   reason text,
 *   door_opened boolean not null default false,
 *   source text not null default 'api',
 *   created_at timestamptz not null default now()
 * );
 */

function resolveMethod({ qrToken, pin }) {
  if (qrToken) return "qr";
  if (pin) return "pin";
  return "unknown";
}

async function logAccessAttempt({
  bookingId = null,
  method,
  allowed,
  reason = null,
  doorOpened = false,
  source = "api"
}) {
  const { error } = await supabase.from(TABLE).insert({
    booking_id: bookingId,
    method,
    allowed,
    reason,
    door_opened: doorOpened,
    source
  });

  if (error) {
    console.error("[AccessLog] insert failed:", error.message);
  }
}

module.exports = {
  logAccessAttempt,
  resolveMethod
};
