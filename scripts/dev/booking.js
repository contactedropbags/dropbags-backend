const { ensureLocalDev, devPost, logOk, saveState } = require("./common");

async function main() {
  ensureLocalDev();

  const result = await devPost("/dev/create-booking");

  saveState({
    bookingId: result.bookingId,
    email: result.email,
    status: result.status,
    paymentIntentId: null,
    clientSecret: null,
    locker: null
  });

  logOk(`Booking created: ${result.bookingId} (${result.email})`);
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
