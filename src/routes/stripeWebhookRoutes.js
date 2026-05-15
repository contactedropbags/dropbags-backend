const express = require("express");
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const bookingService = require("../services/bookingService");
const {
  claimStripeEvent,
  releaseStripeEvent
} = require("../services/stripeWebhookIdempotencyService");

const router = express.Router();

router.post("/", async (req, res) => {
  console.log("✅ Stripe webhook received");
  console.log("Webhook received");

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

  console.log("[DIAG] EVENT TYPE:", event.type);
  console.log("[DIAG] EVENT ID:", event.id);

  const claim = await claimStripeEvent(event.id, event.type);
  if (!claim.claimed) {
    console.log("Booking already processed");
    console.log("[DIAG] Stripe event already processed:", event.id);
    return res.json({ received: true, duplicate: true });
  }
  claimedEventId = event.id;

  if (event.type === "payment_intent.succeeded") {
    console.log("Payment succeeded");

    const paymentIntent = event.data.object;
    const bookingIdFromMetadata =
      paymentIntent.metadata?.bookingId || paymentIntent.metadata?.booking_id;

    try {
      let booking = null;

      if (bookingIdFromMetadata) {
        booking = await bookingService.findBookingById(bookingIdFromMetadata);
      }

      if (!booking) {
        booking = await bookingService.findBookingByPaymentIntentId(paymentIntent.id);
      }

      if (!booking) {
        console.error("CRITICAL: No booking found, stopping webhook", paymentIntent.id);
        await releaseStripeEvent(claimedEventId);
        return res.status(400).json({ error: "Booking not found" });
      }

      console.log("Booking found");

      if (booking.status !== "pending") {
        console.log("Booking already processed");
        return res.json({ received: true });
      }

      const result = await bookingService.markBookingPaidAndSendAccess(
        booking,
        paymentIntent.id
      );

      if (result.skipped) {
        console.log("Booking already processed");
      } else {
        console.log("🎯 Booking paid and access sent:", result.booking.id);
      }
    } catch (error) {
      console.error("❌ Erreur traitement booking webhook:", error);
      await releaseStripeEvent(claimedEventId);
      claimedEventId = null;
      processingFailed = true;
    }
  }

  if (processingFailed) {
    return res.status(500).json({ received: false });
  }

  res.json({ received: true });
});

module.exports = router;
