const express = require("express");

const { createPaymentIntent } = require("../services/stripeService");
const { findBookingById, linkPaymentIntentToBooking } = require("../services/bookingService");

const { createTestPayment } = require("../controllers/paymentController");

const router = express.Router();

/*
CREATION DE L'EMPREINTE BANCAIRE
Stripe bloque 15€ mais ne débite rien
*/

router.post("/intent", async (req, res) => {

  try {
    console.log("[DIAG] PAYMENT INTENT API called", {
      bookingId: req.body?.bookingId,
      email: req.body?.email
    });

    const { email, bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: "bookingId is required" });
    }

    const booking = await findBookingById(bookingId);
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }
    if (booking.status && booking.status !== "pending") {
      return res.status(409).json({ error: "Booking is not payable" });
    }

    const paymentIntent = await createPaymentIntent(email || booking.email, bookingId);
    await linkPaymentIntentToBooking(bookingId, paymentIntent.id);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Unable to create payment intent"
    });

  }

});

router.post("/create-test-payment", createTestPayment);

module.exports = router;

