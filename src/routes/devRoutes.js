const express = require("express");
const router = express.Router();

const { resetDevEnvironment, DEV_EMAIL_PREFIX } = require("../services/devResetService");
const {
  saveBooking,
  findBookingById,
  linkPaymentIntentToBooking,
  markBookingPaidAndSendAccess,
  scanBooking,
  pickupBooking,
  continueReservation,
  finalizeCheckout
} = require("../services/bookingService");
const { createPaymentIntent } = require("../services/stripeService");

router.use((req, res, next) => {
  if (process.env.NODE_ENV !== "development") {
    return res.status(404).json({ error: "Not found" });
  }

  next();
});

router.post("/reset", async (req, res) => {
  try {
    const result = await resetDevEnvironment();
    res.json(result);
  } catch (error) {
    console.error("[dev] reset failed:", error);
    res.status(500).json({ error: error.message || "Reset failed" });
  }
});

router.post("/create-booking", async (req, res) => {
  try {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const booking = await saveBooking({
      email: `${DEV_EMAIL_PREFIX}${Date.now()}@dropbags.local`,
      phone: "+33600000000",
      first_name: "Dev",
      last_name: "Test",
      expiresAt,
      status: "pending"
    });

    res.status(201).json({
      bookingId: booking.id,
      email: booking.email,
      status: booking.status
    });
  } catch (error) {
    console.error("[dev] create-booking failed:", error);
    res.status(500).json({ error: error.message || "Unable to create test booking" });
  }
});

router.post("/payment-intent/:bookingId", async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await findBookingById(bookingId);
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const paymentIntent = await createPaymentIntent(booking.email, bookingId);
    await linkPaymentIntentToBooking(bookingId, paymentIntent.id);

    res.json({
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret
    });
  } catch (error) {
    console.error("[dev] payment-intent failed:", error);
    res.status(500).json({ error: error.message || "Unable to create payment intent" });
  }
});

router.post("/simulate-webhook/:bookingId", async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await findBookingById(bookingId);
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const paymentIntentId =
      booking.payment_intent_id || booking.paymentIntentId;

    if (!paymentIntentId) {
      return res.status(400).json({ error: "payment_intent_id is required" });
    }

    const result = await markBookingPaidAndSendAccess(booking, paymentIntentId);

    res.json({
      success: true,
      paymentIntentId,
      booking: result.booking,
      skipped: result.skipped || false
    });
  } catch (error) {
    console.error("[dev] simulate-webhook failed:", error);
    res.status(500).json({ error: error.message || "Webhook simulation failed" });
  }
});

router.post("/authorize/:bookingId", async (req, res) => {
  try {
    const { bookingId } = req.params;
    const booking = await findBookingById(bookingId);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const paymentIntentId =
      booking.payment_intent_id || booking.paymentIntentId;

    if (!paymentIntentId) {
      return res.status(400).json({ error: "payment_intent_id is required" });
    }

    const result = await markBookingPaidAndSendAccess(booking, paymentIntentId);

    res.json({
      success: true,
      paymentIntentId,
      booking: result.booking,
      skipped: result.skipped || false
    });
  } catch (error) {
    console.error("[dev] authorize failed:", error);
    res.status(500).json({ error: error.message || "Authorize failed" });
  }
});

router.get("/booking/:bookingId", async (req, res) => {
  try {
    const booking = await findBookingById(req.params.bookingId);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    res.json({
      bookingId: booking.id,
      email: booking.email,
      status: booking.status,
      lockerNumber: booking.locker_number,
      paymentIntentId: booking.payment_intent_id || booking.paymentIntentId,
      hasQrToken: Boolean(booking.qrToken),
      hasPin: Boolean(booking.pin),
      pinMasked: booking.pin ? `****${String(booking.pin).slice(-1)}` : null,
      qrTokenMasked: booking.qrToken
        ? `${String(booking.qrToken).slice(0, 4)}…${String(booking.qrToken).slice(-4)}`
        : null,
      checkInTime: booking.checkInTime || booking.check_in_time || null,
      checkOutTime: booking.checkOutTime || booking.check_out_time || null,
      expiresAt: booking.expiresAt || booking.expires_at || null
    });
  } catch (error) {
    console.error("[dev] booking lookup failed:", error);
    res.status(500).json({ error: error.message || "Lookup failed" });
  }
});

router.post("/activate/:bookingId", async (req, res) => {
  try {
    const { bookingId } = req.params;

    const result = await scanBooking(bookingId);

    if (result.error) {
      return res.status(400).json(result);
    }

    if (result.access === "denied") {
      return res.status(400).json(result);
    }

    const booking = await findBookingById(bookingId);

    res.json({
      success: true,
      locker: result.locker,
      warning: result.warning || null,
      checkInTime: result.checkInTime || booking?.checkInTime || booking?.check_in_time || null,
      checkInRecorded: result.checkInRecorded || false,
      booking
    });
  } catch (error) {
    console.error("[dev] activate failed:", error);
    res.status(500).json({ error: error.message || "Activation failed" });
  }
});

router.post("/pickup/:bookingId", async (req, res) => {
  try {
    const result = await pickupBooking(req.params.bookingId);

    if (result.error) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error("[dev] pickup failed:", error);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

router.post("/continue/:bookingId", async (req, res) => {
  try {
    const result = await continueReservation(req.params.bookingId);

    if (result.error) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error("[dev] continue failed:", error);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

router.post("/finalize/:bookingId", async (req, res) => {
  try {
    const booking = await finalizeCheckout(req.params.bookingId, "finalized");

    res.json({
      success: true,
      message: "Booking finalized",
      booking
    });
  } catch (error) {
    console.error("[dev] finalize failed:", error);
    res.status(500).json({ error: error.message || "Unable to finalize booking" });
  }
});

module.exports = router;
