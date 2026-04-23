const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function createTestPayment(req, res) {
  try {

    console.log("🔥 PAYMENT API CALLED");
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 1500,
      currency: "eur",
      capture_method: "manual",
      payment_method_types: ["card"]
    });

    const confirmed = await stripe.paymentIntents.confirm(
      paymentIntent.id,
      {
        payment_method: "pm_card_visa"
      }
    );

    res.json({
      paymentIntentId: confirmed.id,
      status: confirmed.status
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Payment creation failed" });
  }
}

module.exports = { createTestPayment };