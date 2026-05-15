const lockerService = require("./lockerService");
const keyniusService = require("./keyniusService");
const supabase = require("../config/supabase");
const { capturePayment } = require("./stripeService");

const GRACE_PERIOD = 15 * 60 * 1000;
const PRICE_PER_HOUR = 3;
const MAX_PRICE = 15;
const LOCKER_TIMEOUT = 5 * 60 * 1000;

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


  // SCAN QR → OPEN LOCKER
async function scanBooking(bookingId) {

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

  const locker = lockerService.assignLocker();

  if (!locker) {
    return { error: "No locker available" };
  }

  // ON MET À JOUR LA DB AVANT LE HARDWARE
  await supabase
    .from("bookings")
    .update({
      locker_number: locker,
      status: "active"
    })
    .eq("id", bookingId);

  // ensuite on essaye d'ouvrir
  const openResult = await keyniusService.openLocker(locker);

  if (!openResult.success) {
    return {
      warning: "Locker assigned but hardware open failed",
      locker
    };
  }

  return {
    success: true,
    locker
  };
}


// CLOSE LOCKER / PAYMENT
async function closeLocker(booking) {

  const checkInTime = new Date(booking.checkInTime);
  const checkOutTime = new Date();

  const duration = checkOutTime - checkInTime;
  const billableDuration = Math.max(0, duration - GRACE_PERIOD);

  const hours = Math.ceil(billableDuration / (60 * 60 * 1000));

  const price = Math.min(hours * PRICE_PER_HOUR, MAX_PRICE);
  const amountInCents = price * 100;

  await capturePayment(booking.payment_intent_id || booking.paymentIntentId, amountInCents);

  booking.status = "closed";
  booking.checkOutTime = checkOutTime;
  booking.price = price;

  return booking;
}


// PICKUP BAG
async function pickupBooking(bookingId) {

  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .single();

  if (!booking) {
    return { error: "Booking not found" };
  }

  // sécurité : vérifier qu'un casier est bien assigné
  if (!booking.locker_number) {
    return { error: "No locker assigned to this booking" };
  }

  // ouvrir le casier pour récupérer le bagage
  const openResult = await keyniusService.openLocker(booking.locker_number);

  if (!openResult.success) {
    return { error: "Impossible d'ouvrir le locker" };
  }

  // libérer le casier dans le système
  lockerService.releaseLocker(booking.locker_number);

  // mettre à jour le booking dans Supabase
  await supabase
    .from("bookings")
    .update({
      status: "completed"
    })
    .eq("id", bookingId);

  return {
    success: true,
    message: "Locker opened and released",
    locker: booking.locker_number
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
  scanBooking,
  closeLocker,
  pickupBooking
};