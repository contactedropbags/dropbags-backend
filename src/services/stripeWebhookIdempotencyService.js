const supabase = require("../config/supabase");

const TABLE = "stripe_webhook_events";

/**
 * Claim Stripe event (insert-first). Returns false if already processed.
 * Requires Supabase table:
 *   create table stripe_webhook_events (
 *     id text primary key,
 *     event_type text not null,
 *     created_at timestamptz default now()
 *   );
 */
async function claimStripeEvent(eventId, eventType) {
  const { error } = await supabase.from(TABLE).insert({
    id: eventId,
    event_type: eventType
  });

  if (error) {
    if (error.code === "23505") {
      return { claimed: false };
    }
    throw new Error(`Stripe event claim failed: ${error.message}`);
  }

  return { claimed: true };
}

async function isStripeEventProcessed(eventId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throw new Error(`Stripe event lookup failed: ${error.message}`);
  }

  return Boolean(data);
}

async function releaseStripeEvent(eventId) {
  await supabase.from(TABLE).delete().eq("id", eventId);
}

module.exports = {
  claimStripeEvent,
  isStripeEventProcessed,
  releaseStripeEvent
};
