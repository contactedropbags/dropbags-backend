const { ensureLocalDev, devPost, logOk, saveState, getBookingId } = require("./common");

async function main() {
  ensureLocalDev();

  const bookingId = getBookingId();
  const result = await devPost(`/dev/payment-intent/${bookingId}`);

  saveState({
    bookingId,
    paymentIntentId: result.paymentIntentId,
    clientSecret: result.clientSecret
  });

  logOk(`PaymentIntent: ${result.paymentIntentId}`);
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
