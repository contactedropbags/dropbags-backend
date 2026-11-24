const { ensureLocalDev, devPost, logOk, saveState, getBookingId } = require("./common");

async function main() {
  ensureLocalDev();

  const bookingId = getBookingId();
  const result = await devPost(`/dev/continue/${bookingId}`);

  saveState({
    bookingId,
    status: result.booking?.status
  });

  logOk(`Continue OK — booking ${bookingId} remains active`);
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
