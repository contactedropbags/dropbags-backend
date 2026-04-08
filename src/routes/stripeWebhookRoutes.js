const express = require("express");
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const bookingService = require("../services/bookingService");
const pinService = require("../services/pinService");
const lockerService = require("../services/lockerService");

const router = express.Router();

router.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    console.log("📩 Stripe webhook received");

    const sig = req.headers["stripe-signature"];
    let event;

    // 🔐 Vérification signature Stripe
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

    // 🎯 Gestion du paiement
    if (event.type === "payment_intent.succeeded") {
      console.log("✅ Paiement validé");

      const paymentIntent = event.data.object;
      const email = paymentIntent.receipt_email || "test@dropbags.com";

      try {
        // 🔐 1. assigner locker (simulation pour l’instant)
        const locker = await lockerService.assignLocker();

        // 🔢 2. générer PIN sécurisé
        const pin = pinService.generatePin();

        // 📱 3. générer QR temporaire
        const qr = `QR-${Date.now()}`;

        // 💾 4. créer réservation en base (Supabase)
        const booking = await bookingService.saveBooking({
          payment_intent_id: paymentIntent.id,
          locker_number: locker,
          pin,
          qrToken: qr,
          email,
          status: "active",
        });

        console.log("🎯 Booking créé:");
        console.log(booking);

      } catch (error) {
        console.error("❌ Erreur création booking:", error);
      }
    }

    // ✅ réponse obligatoire à Stripe
    res.json({ received: true });
  }
);

module.exports = router;