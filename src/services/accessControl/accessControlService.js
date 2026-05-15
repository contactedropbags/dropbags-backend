const {
  findBookingByToken,
  findBookingByPin
} = require("../bookingService");

const providers = {
  akuvox: () => require("./providers/akuvoxProvider")
};

function getProviderName() {
  return (process.env.ACCESS_CONTROL_PROVIDER || "akuvox").toLowerCase();
}

function getProvider() {
  const name = getProviderName();
  const factory = providers[name];

  if (!factory) {
    throw new Error(`Unsupported access control provider: ${name}`);
  }

  return factory();
}

function isBookingExpired(booking) {
  const bookingExpiry = booking.expiresAt || booking.expires_at;
  if (!bookingExpiry) return false;
  return new Date(bookingExpiry) < new Date();
}

function isAccessAllowedStatus(status) {
  return status === "authorized" || status === "active";
}

async function resolveBooking({ qrToken, pin }) {
  let booking = null;

  if (qrToken) {
    booking = await findBookingByToken(qrToken);
  }

  if (!booking && pin) {
    booking = await findBookingByPin(pin);
  }

  return booking;
}

async function validateAccess({ qrToken, pin }) {
  console.log("[AccessControl] validate", {
    hasQrToken: Boolean(qrToken),
    hasPin: Boolean(pin)
  });

  if (!qrToken && !pin) {
    return { allowed: false, reason: "CREDENTIAL_REQUIRED" };
  }

  const booking = await resolveBooking({ qrToken, pin });

  if (!booking) {
    console.log("[AccessControl] booking not found");
    return { allowed: false, reason: "BOOKING_NOT_FOUND" };
  }

  console.log("[AccessControl] booking found", {
    bookingId: booking.id,
    status: booking.status
  });

  if (!isAccessAllowedStatus(booking.status)) {
    console.log("[AccessControl] invalid status", { status: booking.status });
    return { allowed: false, reason: "BOOKING_NOT_AUTHORIZED", bookingId: booking.id };
  }

  if (isBookingExpired(booking)) {
    console.log("[AccessControl] booking expired", { bookingId: booking.id });
    return { allowed: false, reason: "BOOKING_EXPIRED", bookingId: booking.id };
  }

  if (pin && booking.pin && String(booking.pin) !== String(pin)) {
    console.log("[AccessControl] invalid pin", { bookingId: booking.id });
    return { allowed: false, reason: "INVALID_PIN", bookingId: booking.id };
  }

  return { allowed: true, booking };
}

async function validateAndOpenDoor(credentials) {
  const validation = await validateAccess(credentials);

  if (!validation.allowed) {
    return validation;
  }

  const provider = getProvider();

  try {
    await provider.openRelay();
  } catch (error) {
    console.error("[AccessControl] door open failed:", error.akuvox || error.message || error);
    return {
      allowed: false,
      reason: "DOOR_OPEN_FAILED",
      bookingId: validation.booking.id,
      error: error.message
    };
  }

  console.log("[AccessControl] door opened", { bookingId: validation.booking.id });

  return {
    allowed: true,
    doorOpened: true,
    bookingId: validation.booking.id,
    provider: getProviderName()
  };
}

module.exports = {
  validateAccess,
  validateAndOpenDoor,
  getProviderName
};
