const lockerService = require("./lockerService");
const keyniusService = require("./keyniusService");
const supabase = require("../config/supabase");
const { capturePayment } = require("./stripeService");

const GRACE_PERIOD = 15 * 60 * 1000;
const PRICE_PER_HOUR = 3;
const MAX_PRICE = 15;
const LOCKER_TIMEOUT = 5 * 60 * 1000;
const CHECKOUT_DECISION_TIMEOUT_MS = Number(
  process.env.CHECKOUT_DECISION_TIMEOUT_MS || 180000
);

/**
 * Supabase columns for checkout workflow (run manually if missing):
 *
 * alter table bookings add column if not exists checkout_started_at timestamptz;
 * alter table bookings add column if not exists checkout_deadline_at timestamptz;
 * alter table bookings add column if not exists checkout_decision text;
 *
 * create index if not exists idx_bookings_checkout_deadline
 *   on bookings (checkout_deadline_at)
 *   where checkout_deadline_at is not null and status = 'active';
 */

function getCheckoutStartedAt(booking) {
  return booking.checkout_started_at || booking.checkoutStartedAt || null;
}

function getCheckoutDeadlineAt(booking) {
  return booking.checkout_deadline_at || booking.checkoutDeadlineAt || null;
}

function buildCheckoutWindow() {
  const startedAt = new Date();
  const deadlineAt = new Date(
    startedAt.getTime() + CHECKOUT_DECISION_TIMEOUT_MS
  );

  return {
    checkout_started_at: startedAt.toISOString(),
    checkout_deadline_at: deadlineAt.toISOString()
  };
}

const { generateQrToken, uploadQRCodeImage } = require("./qrService");
const { generatePin } = require("./pinService");
const { sendEmail } = require("./emailService");
const { sendSMS } = require("./smsService");

// CREATE BOOKING
async function saveBooking(data) {
  console.log("[DIAG] saveBooking called", {
    email: data?.email,
    status: data?.status || "pending"
  });

  const qrToken = generateQrToken();

  const bookingData = {
    ...data,
    locker_number: null,
    qrToken,
    status: data.status || "pending"
  };

  // 2. Sauvegarde en base
  const { data: booking, error } = await supabase
    .from("bookings")
    .insert([bookingData])
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return booking;
}

// FIND BOOKING BY TOKEN
async function findBookingByToken(token) {

  console.log("Token reçu pour recherche:", token);

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("qrToken", token)
    .maybeSingle();

  if (error) {
    console.error("Supabase error:", error);
    return null;
  }

  console.log("Booking trouvé:", data);

  return data;
}

async function findBookingByPin(pin) {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("pin", pin)
    .maybeSingle();

  if (error) {
    console.error("Supabase error:", error);
    return null;
  }

  return data;
}

async function findBookingById(id) {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function findBookingByPaymentIntentId(paymentIntentId) {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function linkPaymentIntentToBooking(bookingId, paymentIntentId) {
  const { data, error } = await supabase
    .from("bookings")
    .update({ payment_intent_id: paymentIntentId })
    .eq("id", bookingId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function markBookingPaidAndSendAccess(booking, paymentIntentId) {
  if (!booking) {
    throw new Error("Booking not found");
  }

  if (booking.status === "authorized" || booking.status === "paid" || booking.status === "active") {
    return { booking, skipped: true, reason: "already_processed" };
  }

  const pin = booking.pin || generatePin();
  const qrUrl = booking.qr_url || await uploadQRCodeImage(booking.qrToken);
  console.log("QR generated", { bookingId: booking.id, qrUrl });

  const { data: accessPreparedBooking, error: prepareError } = await supabase
    .from("bookings")
    .update({
      pin,
      qr_url: qrUrl,
      payment_intent_id: paymentIntentId
    })
    .eq("id", booking.id)
    .eq("status", "pending")
    .select()
    .single();

  if (prepareError || !accessPreparedBooking) {
    const { data: current } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", booking.id)
      .maybeSingle();

    if (current && current.status !== "pending") {
      return { booking: current, skipped: true, reason: "already_processed" };
    }

    throw new Error(prepareError?.message || "Booking update failed");
  }

  const emailResult = await Promise.allSettled([
    sendEmail({
      to: accessPreparedBooking.email,
      pin,
      qrUrl
    })
  ]);

  if (emailResult[0].status === "rejected") {
    console.error("Email delivery failed:", emailResult[0].reason);
    throw new Error("Email delivery failed");
  }

  let smsResult = { status: "skipped", reason: "no_phone" };
  if (accessPreparedBooking.phone) {
    try {
      await sendSMS({
        phone: accessPreparedBooking.phone,
        pin,
        qrUrl
      });
      smsResult = { status: "fulfilled" };
      console.log("SMS sent", {
        bookingId: booking.id,
        phone: accessPreparedBooking.phone
      });
    } catch (err) {
      console.error(
        "SMS ERROR FULL:",
        err.response?.data || err.response?.body || err.message || err
      );
      smsResult = { status: "rejected", reason: err };
    }
  }

  const notificationResults = [emailResult[0], smsResult];

  const { data: updatedBooking, error: paidError } = await supabase
    .from("bookings")
    .update({ status: "authorized" })
    .eq("id", booking.id)
    .select()
    .single();

  if (paidError) {
    throw new Error(paidError.message);
  }

  console.log("booking updated", { bookingId: updatedBooking.id, status: updatedBooking.status });

  return { booking: updatedBooking, notifications: notificationResults };
}

async function markBookingCaptured(booking) {
  if (!booking) {
    throw new Error("Booking not found");
  }

  if (booking.status === "paid") {
    return { booking, skipped: true, reason: "already_paid" };
  }

  const { data: updatedBooking, error } = await supabase
    .from("bookings")
    .update({ status: "paid" })
    .eq("id", booking.id)
    .in("status", ["authorized", "active", "closed"])
    .select()
    .single();

  if (error || !updatedBooking) {
    const { data: current } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", booking.id)
      .maybeSingle();

    if (current?.status === "paid") {
      return { booking: current, skipped: true, reason: "already_paid" };
    }

    throw new Error(error?.message || "Booking capture update failed");
  }

  console.log("booking updated", { bookingId: updatedBooking.id, status: updatedBooking.status });

  return { booking: updatedBooking };
}


// VERIFY PIN
async function verifyBookingByPin(pin) {

  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("pin", pin)
    .single();

  if (!booking) {
    return { valid: false, reason: "NOT_FOUND" };
  }

  const bookingExpiry = booking.expiresAt || booking.expires_at;
  if (bookingExpiry && new Date() > new Date(bookingExpiry)) {
    return { valid: false, reason: "EXPIRED" };
  }

  return { valid: true, booking };
}

async function recordCheckInIfFirst(bookingId) {
  const booking = await findBookingById(bookingId);
  const existing = booking?.checkInTime || booking?.check_in_time;

  if (existing) {
    return { checkInRecorded: false, checkInTime: existing };
  }

  const checkInTime = new Date().toISOString();

  const { data, error } = await supabase
    .from("bookings")
    .update({ checkInTime })
    .eq("id", bookingId)
    .select()
    .single();

  if (error) {
    console.error("[checkIn] persist failed:", error.message);
    return { checkInRecorded: false, error: error.message };
  }

  console.log("[checkIn] recorded", { bookingId, checkInTime });

  return {
    checkInRecorded: true,
    checkInTime: data.checkInTime || data.check_in_time || checkInTime
  };
}

async function getLockerTerminalState(bookingId) {
  const booking = await findBookingById(bookingId);

  if (!booking) {
    return { error: "Booking not found" };
  }

  const checkoutStartedAt = getCheckoutStartedAt(booking);
  const checkoutDeadlineAt = getCheckoutDeadlineAt(booking);
  const checkoutPending = Boolean(checkoutStartedAt);

  return {
    access: "granted",
    identified: true,
    lockerOpened: false,
    bookingId: booking.id,
    status: booking.status,
    locker: booking.locker_number || null,
    checkInTime: booking.checkInTime || booking.check_in_time || null,
    checkoutPending,
    checkoutStartedAt,
    checkoutDeadlineAt,
    actions: checkoutPending ? ["continue", "finalize"] : ["stay", "leave"]
  };
}

// Open locker for deposit / stay — assign if needed, preserve existing checkInTime
async function openLockerForStay(bookingId) {
  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .single();

  if (!booking) {
    return { error: "Booking not found" };
  }

  if (booking.status === "expired") {
    return { error: "Booking expired" };
  }

  if (booking.locker_number && booking.status === "active") {
    const openResult = await keyniusService.openLocker(booking.locker_number);

    if (!openResult.success) {
      return {
        access: "denied",
        error: "LOCKER_OPEN_FAILED",
        warning: "Locker already assigned but hardware open failed",
        locker: booking.locker_number
      };
    }

    const checkIn = await recordCheckInIfFirst(bookingId);

    return {
      success: true,
      access: "granted",
      lockerOpened: true,
      locker: booking.locker_number,
      ...checkIn
    };
  }

  const locker = lockerService.assignLocker();

  if (!locker) {
    return { error: "No locker available" };
  }

  await supabase
    .from("bookings")
    .update({
      locker_number: locker,
      status: "active"
    })
    .eq("id", bookingId);

  const openResult = await keyniusService.openLocker(locker);

  if (!openResult.success) {
    return {
      access: "denied",
      error: "LOCKER_OPEN_FAILED",
      warning: "Locker assigned but hardware open failed",
      locker
    };
  }

  const checkIn = await recordCheckInIfFirst(bookingId);

  return {
    success: true,
    access: "granted",
    lockerOpened: true,
    locker,
    ...checkIn
  };
}

// Dev shortcut — opens locker immediately (not used by locker terminal QR scan)
async function scanBooking(bookingId) {
  return openLockerForStay(bookingId);
}


// CLOSE LOCKER / PAYMENT — unique definitive checkout (Stripe + invalidate + release)
async function closeLocker(bookingInput, options = {}) {
  const bookingId = bookingInput?.id;
  const checkoutDecision = options.checkoutDecision || "finalized";

  if (!bookingId) {
    throw new Error("Booking id is required");
  }

  const booking = await findBookingById(bookingId);

  if (!booking) {
    throw new Error("Booking not found");
  }

  const paymentCapturedAt =
    booking.paymentCapturedAt || booking.payment_captured_at;

  if (booking.status === "closed" && paymentCapturedAt) {
    return booking;
  }

  const CLOSABLE_STATUSES = new Set(["active"]);

  if (!CLOSABLE_STATUSES.has(booking.status)) {
    throw new Error(`Booking cannot be closed (status: ${booking.status})`);
  }

  const checkInRaw = booking.checkInTime || booking.check_in_time;

  if (!checkInRaw) {
    throw new Error("checkInTime is required to close booking");
  }

  const paymentIntentId =
    booking.payment_intent_id || booking.paymentIntentId;

  if (!paymentIntentId) {
    throw new Error("payment_intent_id is required");
  }

  const checkInTime = new Date(checkInRaw);

  if (Number.isNaN(checkInTime.getTime())) {
    throw new Error("checkInTime is invalid");
  }

  const lockerNumber = booking.locker_number;
  const checkOutTime = new Date();
  const duration = checkOutTime.getTime() - checkInTime.getTime();
  const billableDuration = Math.max(0, duration - GRACE_PERIOD);
  const hours = Math.ceil(billableDuration / (60 * 60 * 1000));
  const price = Math.min(Math.max(hours, 0) * PRICE_PER_HOUR, MAX_PRICE);
  const amountInCents = price * 100;

  const closePayload = {
    status: "closed",
    checkOutTime: checkOutTime.toISOString(),
    duration,
    price,
    qrToken: null,
    pin: null,
    locker_number: null,
    checkout_started_at: null,
    checkout_deadline_at: null,
    checkout_decision: checkoutDecision
  };

  const { data: closedBooking, error: closeError } = await supabase
    .from("bookings")
    .update(closePayload)
    .eq("id", bookingId)
    .eq("status", "active")
    .select()
    .single();

  if (closeError || !closedBooking) {
    throw new Error(closeError?.message || "Booking close update failed");
  }

  let stripePayment;

  try {
    stripePayment = await capturePayment(paymentIntentId, amountInCents);
  } catch (stripeError) {
    const { error: rollbackError } = await supabase
      .from("bookings")
      .update({
        status: booking.status,
        checkOutTime: booking.checkOutTime || booking.check_out_time || null,
        duration: booking.duration ?? null,
        price: booking.price ?? null,
        qrToken: booking.qrToken,
        pin: booking.pin,
        locker_number: booking.locker_number,
        checkout_started_at: getCheckoutStartedAt(booking),
        checkout_deadline_at: getCheckoutDeadlineAt(booking),
        checkout_decision: booking.checkout_decision || booking.checkoutDecision || null
      })
      .eq("id", bookingId);

    if (rollbackError) {
      console.error("[closeLocker] rollback failed:", rollbackError.message);
    }

    throw stripeError;
  }

  const capturedAt = new Date().toISOString();

  const { data: finalBooking, error: capturePersistError } = await supabase
    .from("bookings")
    .update({ paymentCapturedAt: capturedAt })
    .eq("id", bookingId)
    .eq("status", "closed")
    .select()
    .single();

  if (capturePersistError || !finalBooking) {
    console.error(
      "[closeLocker] payment captured but Supabase persist failed:",
      capturePersistError?.message
    );

    throw new Error(
      capturePersistError?.message ||
        "Payment captured but paymentCapturedAt persist failed"
    );
  }

  if (lockerNumber) {
    lockerService.releaseLocker(lockerNumber);
  }

  console.log("[closeLocker] booking closed", {
    bookingId: finalBooking.id,
    duration,
    price,
    amountInCents,
    checkoutDecision,
    stripePaymentId: stripePayment?.id
  });

  return finalBooking;
}

async function finalizeCheckout(bookingId, checkoutDecision = "finalized") {
  const booking = await findBookingById(bookingId);

  if (!booking) {
    throw new Error("Booking not found");
  }

  if (booking.status !== "active") {
    throw new Error(`Booking cannot be finalized (status: ${booking.status})`);
  }

  return closeLocker({ id: bookingId }, { checkoutDecision });
}

async function continueReservation(bookingId) {
  const now = new Date().toISOString();

  const { data: booking, error } = await supabase
    .from("bookings")
    .update({
      checkout_started_at: null,
      checkout_deadline_at: null,
      checkout_decision: "continued"
    })
    .eq("id", bookingId)
    .eq("status", "active")
    .not("checkout_started_at", "is", null)
    .gt("checkout_deadline_at", now)
    .select()
    .single();

  if (error || !booking) {
    return { error: "Cannot continue reservation" };
  }

  return {
    success: true,
    booking
  };
}

async function getCheckoutState(bookingId) {
  const booking = await findBookingById(bookingId);

  if (!booking) {
    return { error: "Booking not found" };
  }

  const checkoutStartedAt = getCheckoutStartedAt(booking);
  const checkoutDeadlineAt = getCheckoutDeadlineAt(booking);
  const checkoutPending = Boolean(checkoutStartedAt);

  return {
    bookingId: booking.id,
    status: booking.status,
    checkoutPending,
    checkoutStartedAt,
    checkoutDeadlineAt,
    lockerNumber: booking.locker_number,
    actions: checkoutPending ? ["continue", "finalize"] : []
  };
}

async function processExpiredCheckouts() {
  const now = new Date().toISOString();

  const { data: expiredBookings, error } = await supabase
    .from("bookings")
    .select("id")
    .eq("status", "active")
    .not("checkout_deadline_at", "is", null)
    .lt("checkout_deadline_at", now);

  if (error) {
    throw new Error(`Expired checkout lookup failed: ${error.message}`);
  }

  if (!expiredBookings?.length) {
    return { processed: 0 };
  }

  let processed = 0;

  for (const row of expiredBookings) {
    try {
      await finalizeCheckout(row.id, "auto_finalized");
      processed += 1;
    } catch (err) {
      console.error("[processExpiredCheckouts] failed:", row.id, err.message);
    }
  }

  if (processed > 0) {
    console.log("[processExpiredCheckouts] auto-closed bookings:", processed);
  }

  return { processed };
}

// PICKUP BAG — open locker for retrieval, start checkout decision window
async function pickupBooking(bookingId) {
  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .single();

  if (!booking) {
    return { error: "Booking not found" };
  }

  if (booking.status !== "active") {
    return { error: "Booking is not active" };
  }

  if (!booking.locker_number) {
    return { error: "No locker assigned to this booking" };
  }

  const openResult = await keyniusService.openLocker(booking.locker_number);

  if (!openResult.success) {
    return { error: "Impossible d'ouvrir le locker" };
  }

  const checkoutWindow = buildCheckoutWindow();

  const { data: updatedBooking, error: updateError } = await supabase
    .from("bookings")
    .update({
      ...checkoutWindow,
      checkout_decision: null
    })
    .eq("id", bookingId)
    .eq("status", "active")
    .select()
    .single();

  if (updateError || !updatedBooking) {
    return { error: "Unable to start checkout window" };
  }

  return {
    success: true,
    message: "Locker opened — choose continue or finalize",
    locker: booking.locker_number,
    checkoutStartedAt: checkoutWindow.checkout_started_at,
    checkoutDeadlineAt: checkoutWindow.checkout_deadline_at,
    actions: ["continue", "finalize"]
  };
}


module.exports = {
  saveBooking,
  findBookingByToken,
  findBookingByPin,
  findBookingById,
  findBookingByPaymentIntentId,
  linkPaymentIntentToBooking,
  markBookingPaidAndSendAccess,
  markBookingCaptured,
  verifyBookingByPin,
  getLockerTerminalState,
  openLockerForStay,
  scanBooking,
  closeLocker,
  pickupBooking,
  continueReservation,
  finalizeCheckout,
  getCheckoutState,
  processExpiredCheckouts
};