const express = require("express");
const router = express.Router();

const { generateAccess } = require("../controllers/accessController");
const bookingService = require("../services/bookingService");


/*
SCAN A L'ENTRÉE (porte)
→ vérifie simplement le booking
→ ne doit pas attribuer de casier
*/
router.post("/access", generateAccess);


/*
SCAN SUR LE CASIER (hardware)
→ attribue un casier
→ ouvre le casier
*/
router.post("/locker", async (req, res) => {
  try {

    const { bookingId } = req.body;

    const result = await bookingService.scanBooking(bookingId);

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
RÉCUPÉRATION BAGAGE
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

module.exports = router;