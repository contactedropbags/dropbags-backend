const express = require("express");
const router = express.Router();

const { generateAccess } = require("../controllers/accessController");
const { openDoor } = require("../controllers/accessControlController");
const bookingService = require("../services/bookingService");
const accessControlService = require("../services/accessControl/accessControlService");

function mapLockerDenialStatus(reason) {
  if (reason === "BOOKING_NOT_FOUND") return 404;
  if (
    reason === "BOOKING_EXPIRED" ||
    reason === "BOOKING_CLOSED" ||
    reason === "BOOKING_NOT_AUTHORIZED" ||
    reason === "BOOKING_NOT_PAID" ||
    reason === "INVALID_PIN"
  ) {
    return 403;
  }
  return 400;
}


/*
SCAN A L'ENTRÉE (porte)
→ vérifie simplement le booking
→ ne doit pas attribuer de casier
*/
router.post("/access", generateAccess);

/*
OUVERTURE PORTE (Akuvox)
→ accepte qrToken ou pin
→ valide le booking et déclenche le relais
*/
router.post("/open", openDoor);


/*
SCAN SUR LE CASIER (hardware)
→ QR/PIN ou bookingId
→ identification uniquement (pas d'ouverture hardware)
*/
router.post("/locker", async (req, res) => {
  try {
    const { bookingId, qrToken, pin, token } = req.body;

    if (qrToken || pin || token) {
      const validation = await accessControlService.validateAccess({
        qrToken: qrToken || token,
        pin
      });

      if (!validation.allowed) {
        return res.status(mapLockerDenialStatus(validation.reason)).json({
          access: "denied",
          reason: validation.reason,
          bookingId: validation.bookingId || null
        });
      }

      const result = await bookingService.getLockerTerminalState(validation.booking.id);

      if (result.error) {
        return res.status(400).json(result);
      }

      return res.json(result);
    }

    if (!bookingId) {
      return res.status(400).json({ error: "bookingId or qrToken/pin required" });
    }

    const result = await bookingService.getLockerTerminalState(bookingId);

    if (result.error) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {

    console.error(error);
    res.status(500).json({ error: "SERVER_ERROR" });

  }
});

/*
OPEN & STAY — ouvre le casier (assignation dynamique si besoin), sans checkout
*/
router.post("/stay", async (req, res) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: "bookingId is required" });
    }

    const result = await bookingService.openLockerForStay(bookingId);

    if (result.error) {
      return res.status(400).json(result);
    }

    if (result.access === "denied") {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});


/*
RÉCUPÉRATION BAGAGE — ouvre le casier, démarre la fenêtre de choix checkout
*/
router.post("/pickup", async (req, res) => {
  try {

    const { bookingId } = req.body;

    const result = await bookingService.pickupBooking(bookingId);

    if (result.error) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {

    console.error(error);
    res.status(500).json({ error: "SERVER_ERROR" });

  }
});

/*
CONTINUER LA RÉSERVATION (objet oublié)
*/
router.post("/continue", async (req, res) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: "bookingId is required" });
    }

    const result = await bookingService.continueReservation(bookingId);

    if (result.error) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

/*
CLÔTURE DÉFINITIVE
*/
router.post("/finalize", async (req, res) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: "bookingId is required" });
    }

    const booking = await bookingService.finalizeCheckout(bookingId, "finalized");

    res.json({
      success: true,
      message: "Booking finalized",
      booking
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Unable to finalize booking" });
  }
});

/*
ÉTAT CHECKOUT (terminal)
*/
router.get("/checkout-state/:bookingId", async (req, res) => {
  try {
    const { bookingId } = req.params;

    const result = await bookingService.getCheckoutState(bookingId);

    if (result.error) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

module.exports = router;