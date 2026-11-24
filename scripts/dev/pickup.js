const { ensureLocalDev, devPost, logOk, saveState, getBookingId } = require("./common");

async function main() {
  ensureLocalDev();

  const bookingId = getBookingId();
  const result = await devPost(`/dev/pickup/${bookingId}`);

  saveState({
    bookingId,
    locker: result.locker,
    checkoutDeadlineAt: result.checkoutDeadlineAt
  });

  logOk(`Pickup OK — locker ${result.locker} (deadline: ${result.checkoutDeadlineAt})`);
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
