const express = require("express");
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const bookingService = require("../services/bookingService");
const {
  claimStripeEvent,
  releaseStripeEvent
} = require("../services/stripeWebhookIdempotencyService");

const router = express.Router();

const ACCESS_GRANT_EVENTS = new Set([
  "payment_intent.amount_capturable_updated",
  "charge.succeeded"
]);

const CAPTURE_FINALIZED_EVENTS = new Set([
  "payment_intent.succeeded"
]);

function isPreauthorizedPaymentIntent(paymentIntent) {
  return (
    paymentIntent.status === "requires_capture" &&
    paymentIntent.amount_capturable > 0
  );
}

async function resolveBookingFromPaymentIntent(paymentIntent) {
  const bookingId =
    paymentIntent.metadata?.bookingId || paymentIntent.metadata?.booking_id;

  if (bookingId) {
    const byId = await bookingService.findBookingById(bookingId);
    if (byId) return byId;
  }

  return bookingService.findBookingByPaymentIntentId(paymentIntent.id);
}

async function resolveBookingFromCharge(charge) {
  if (!charge.payment_intent) {
    return null;
  }

  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent.id;

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  return resolveBookingFromPaymentIntent(paymentIntent);
}

async function grantAccessAfterPreauth(booking, paymentIntentId) {
  if (booking.status !== "pending") {
    console.log("Booking already processed", { bookingId: booking.id, status: booking.status });
    return { skipped: true };
  }

  const result = await bookingService.markBookingPaidAndSendAccess(booking, paymentIntentId);
  if (!result.skipped) {
    console.log("Access granted after pre-authorization", { bookingId: result.booking.id });
  }
  return result;
}

router.post("/", async (req, res) => {
  console.log("✅ Stripe webhook received");

  let processingFailed = false;
  let claimedEventId = null;

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.log("❌ Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log("EVENT TYPE:", event.type);
  console.log("EVENT ID:", event.id);

  const claim = await claimStripeEvent(event.id, event.type);
  if (!claim.claimed) {
    console.log("Stripe event already processed:", event.id);
    return res.json({ received: true, duplicate: true });
  }
  claimedEventId = event.id;

  try {
  if (ACCESS_GRANT_EVENTS.has(event.type)) {
    let paymentIntent = null;
    let booking = null;

    if (event.type === "payment_intent.amount_capturable_updated") {
      paymentIntent = event.data.object;

      if (!isPreauthorizedPaymentIntent(paymentIntent)) {
        console.log("Pre-auth not ready, skipping", {
          status: paymentIntent.status,
          amount_capturable: paymentIntent.amount_capturable
        });
        return res.json({ received: true, skipped: true });
      }

      booking = await resolveBookingFromPaymentIntent(paymentIntent);
    }

    if (event.type === "charge.succeeded") {
      const charge = event.data.object;

      if (charge.captured) {
        console.log("charge.succeeded (captured) — handled by payment_intent.succeeded");
        return res.json({ received: true, skipped: true });
      }

      paymentIntent = await stripe.paymentIntents.retrieve(
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent.id
      );

      if (!isPreauthorizedPaymentIntent(paymentIntent)) {
        return res.json({ received: true, skipped: true });
      }

      booking = await resolveBookingFromCharge(charge);
    }

    if (!booking) {
      console.error("CRITICAL: No booking found for pre-authorization", paymentIntent?.id);
      await releaseStripeEvent(claimedEventId);
      return res.status(400).json({ error: "Booking not found" });
    }

    console.log("Booking found", { bookingId: booking.id, status: booking.status });
    await grantAccessAfterPreauth(booking, paymentIntent.id);
  }

  if (CAPTURE_FINALIZED_EVENTS.has(event.type)) {
    console.log("Payment capture finalized");

    const paymentIntent = event.data.object;
    const booking = await resolveBookingFromPaymentIntent(paymentIntent);

    if (!booking) {
      console.error("CRITICAL: No booking found for capture", paymentIntent.id);
      await releaseStripeEvent(claimedEventId);
      return res.status(400).json({ error: "Booking not found" });
    }

    console.log("Booking found", { bookingId: booking.id, status: booking.status });

    const result = await bookingService.markBookingCaptured(booking);
    if (result.skipped) {
      console.log("Booking already paid", { bookingId: booking.id });
    }
  }
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    await releaseStripeEvent(claimedEventId);
    claimedEventId = null;
    processingFailed = true;
  }

  if (processingFailed) {
    return res.status(500).json({ received: false });
  }

  res.json({ received: true });
});

module.exports = router;
