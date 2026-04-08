require("dotenv").config();

const Stripe = require("stripe");

console.log("Stripe key:", process.env.STRIPE_SECRET_KEY);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);


/*
-----------------------------------------
DROPBAGS PAYMENT FLOW
-----------------------------------------

1. Stripe bloque 15€ sur la carte (empreinte bancaire)
2. Le client utilise le casier
3. On calcule la durée réelle
4. Stripe capture uniquement le montant dû

Tarif :
3€ / heure
maximum 15€
-----------------------------------------
*/


// Création de l'empreinte bancaire
async function createPaymentIntent(email) {

  try {

    const paymentIntent = await stripe.paymentIntents.create({
      amount: 1500, // 15€ maximum
      currency: "eur",
      capture_method: "manual",
      receipt_email: email,
      metadata: {
        service: "dropbags"
      }
    });

    return paymentIntent;

  } catch (error) {

    console.error("Stripe PaymentIntent error:", error);
    throw error;

  }

}


// Calcul du prix réel
function calculatePrice(checkInTime, checkOutTime) {

  const diffMs = new Date(checkOutTime) - new Date(checkInTime);

  const hours = Math.ceil(diffMs / (1000 * 60 * 60));

  const price = Math.min(hours * 3, 15);

  return price * 100; // Stripe travaille en centimes

}


// Capture du paiement final
async function capturePayment(paymentIntentId, amount) {

  try {

    const payment = await stripe.paymentIntents.capture(
      paymentIntentId,
      {
        amount_to_capture: amount
      }
    );

    return payment;

  } catch (error) {

    console.error("Stripe capture error:", error);
    throw error;

  }

}


// Export des fonctions
module.exports = {
  createPaymentIntent,
  calculatePrice,
  capturePayment
};