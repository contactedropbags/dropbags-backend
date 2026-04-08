const express = require("express");

const { createPaymentIntent } = require("../services/stripeService");

const { createTestPayment } = require("../controllers/paymentController");

const router = express.Router();

/*
CREATION DE L'EMPREINTE BANCAIRE
Stripe bloque 15€ mais ne débite rien
*/

router.post("/intent", async (req, res) => {

  try {

    const { email } = req.body;

    const paymentIntent = await createPaymentIntent(email);

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

