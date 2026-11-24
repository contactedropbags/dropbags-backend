const {
  ensureLocalDev,
  devPost,
  logOk,
  logFail,
  saveState,
  BASE_URL
} = require("./common");
const { runSimulateWebhook } = require("./simulate-webhook");

async function runStep(label, routePath) {
  process.stdout.write(`→ ${label}... `);
  const data = await devPost(routePath);
  console.log("✅");
  return data;
}

async function main() {
  ensureLocalDev();

  const startedAt = Date.now();
  const summary = { baseUrl: BASE_URL };

  console.log("\n🚀 DropBags dev flow\n");

  try {
    const reset = await runStep("reset", "/dev/reset");
    summary.deletedBookings = reset.deletedBookings ?? 0;

    const booking = await runStep("create booking", "/dev/create-booking");
    summary.bookingId = booking.bookingId;
    summary.email = booking.email;
    saveState({ bookingId: booking.bookingId, email: booking.email });

    const payment = await runStep(
      "payment intent",
      `/dev/payment-intent/${booking.bookingId}`
    );
    summary.paymentIntentId = payment.paymentIntentId;
    saveState({ paymentIntentId: payment.paymentIntentId });

    process.stdout.write("→ simulate webhook... ");
    const webhook = await runSimulateWebhook(booking.bookingId);
    console.log("✅");
    summary.bookingStatusAfterWebhook = webhook.booking?.status;
    saveState({ status: webhook.booking?.status });

    const activate = await runStep(
      "activate locker",
      `/dev/activate/${booking.bookingId}`
    );
    summary.locker = activate.locker;
    saveState({ locker: activate.locker });

    const pickup = await runStep("pickup", `/dev/pickup/${booking.bookingId}`);
    summary.checkoutDeadlineAt = pickup.checkoutDeadlineAt;

    const continued = await runStep(
      "continue",
      `/dev/continue/${booking.bookingId}`
    );
    summary.statusAfterContinue = continued.booking?.status;

    const finalized = await runStep(
      "finalize",
      `/dev/finalize/${booking.bookingId}`
    );
    summary.finalStatus = finalized.booking?.status;
    summary.finalPrice = finalized.booking?.price;

    const elapsedMs = Date.now() - startedAt;
    summary.elapsedMs = elapsedMs;
    summary.elapsedSeconds = (elapsedMs / 1000).toFixed(2);

    saveState(summary);

    console.log("\n────────────────────────────────────");
    console.log("📋 FLOW SUMMARY");
    console.log("────────────────────────────────────");
    console.log(`Booking ID      : ${summary.bookingId}`);
    console.log(`Email           : ${summary.email}`);
    console.log(`PaymentIntent   : ${summary.paymentIntentId}`);
    console.log(`Locker          : ${summary.locker}`);
    console.log(`Final status    : ${summary.finalStatus}`);
    console.log(`Final price     : ${summary.finalPrice}€`);
    console.log(`Duration        : ${summary.elapsedSeconds}s`);
    console.log("────────────────────────────────────\n");

    logOk(`Full flow completed in ${summary.elapsedSeconds}s`);
  } catch (error) {
    logFail(error.message);
    process.exit(1);
  }
}

main();
