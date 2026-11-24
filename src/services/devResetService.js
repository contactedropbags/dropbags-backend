const supabase = require("../config/supabase");
const lockerService = require("./lockerService");
const mockAkuvox = require("./accessControl/providers/mockProvider");
const keyniusService = require("./keyniusService");

const TOTAL_LOCKERS = 28;
const DEV_EMAIL_PREFIX = "dev-test-";

async function resetDevEnvironment() {
  for (let i = 1; i <= TOTAL_LOCKERS; i++) {
    lockerService.releaseLocker(i);
  }

  mockAkuvox.resetDoor();
  keyniusService.getMockProvider()?.resetAll();

  const { error, count } = await supabase
    .from("bookings")
    .delete({ count: "exact" })
    .like("email", `${DEV_EMAIL_PREFIX}%`);

  if (error) {
    throw new Error(error.message);
  }

  return {
    success: true,
    message: "Dev environment reset",
    deletedBookings: count ?? 0
  };
}

module.exports = {
  resetDevEnvironment,
  DEV_EMAIL_PREFIX
};
