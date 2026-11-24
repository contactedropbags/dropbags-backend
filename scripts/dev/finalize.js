const { ensureLocalDev, devPost, logOk, saveState, getBookingId } = require("./common");

async function main() {
  ensureLocalDev();

  const bookingId = getBookingId();
  const result = await devPost(`/dev/finalize/${bookingId}`);

  saveState({
    bookingId,
    status: result.booking?.status,
    price: result.booking?.price
  });

  logOk(`Finalize OK — status ${result.booking?.status}, price ${result.booking?.price}€`);
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
