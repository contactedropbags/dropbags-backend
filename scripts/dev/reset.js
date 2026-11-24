const { ensureLocalDev, devPost, logOk, saveState } = require("./common");

async function main() {
  ensureLocalDev();

  const result = await devPost("/dev/reset");
  saveState({
    bookingId: null,
    email: null,
    paymentIntentId: null,
    clientSecret: null,
    locker: null
  });

  logOk(`Reset OK (deleted bookings: ${result.deletedBookings ?? 0})`);
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
