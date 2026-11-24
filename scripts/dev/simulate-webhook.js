require("dotenv").config();

const {
  ensureLocalDev,
  getBookingId,
  logOk,
  saveState,
  fail
} = require("./common");
const {
  findBookingById,
  markBookingPaidAndSendAccess
} = require("../../src/services/bookingService");

async function runSimulateWebhook(bookingId) {
  const booking = await findBookingById(bookingId);

  if (!booking) {
    fail("Booking not found");
  }

  const paymentIntentId =
    booking.payment_intent_id || booking.paymentIntentId;

  if (!paymentIntentId) {
    fail("payment_intent_id missing — run: npm run payment");
  }

  const result = await markBookingPaidAndSendAccess(booking, paymentIntentId);

  return {
    paymentIntentId,
    booking: result.booking,
    skipped: result.skipped || false
  };
}

async function main() {
  ensureLocalDev();

  const bookingId = getBookingId();
  const result = await runSimulateWebhook(bookingId);

  saveState({
    bookingId,
    paymentIntentId: result.paymentIntentId,
    status: result.booking?.status
  });

  logOk(
    `Webhook simulated (no Stripe confirm) — status ${result.booking?.status}`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}

module.exports = { runSimulateWebhook };
