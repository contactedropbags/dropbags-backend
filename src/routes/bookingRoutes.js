const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");

router.post("/bookings", bookingController.createBooking);

const { closeLocker } = require("../services/bookingService");

router.post("/close-locker", async (req, res) => {

  try {

    const { booking } = req.body;

    const result = await closeLocker(booking);

    res.json({
      message: "Locker closed",
      booking: result
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Unable to close locker"
    });

  }

});

module.exports = router;