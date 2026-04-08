const lockerService = require("./lockerService");
const keyniusService = require("./keyniusService");
const supabase = require("../config/supabase");
const { capturePayment } = require("./stripeService");

const GRACE_PERIOD = 15 * 60 * 1000;
const PRICE_PER_HOUR = 3;
const MAX_PRICE = 15;
const LOCKER_TIMEOUT = 5 * 60 * 1000;

const { generateQrToken, generateQRCode } = require("./qrService");
const { generatePin } = require("./pinService");
const { sendEmail } = require("./emailService");
const { sendSMS } = require("./smsService");

// CREATE BOOKING
async function saveBooking(data) {

  // 1. Génération PIN + TOKEN
  const qrToken = generateQrToken();
  const pin = generatePin();

  // 
console.log("📱 PHONE DATA:", data.phone);

  const bookingData = {
    ...data,
    locker_number: null,
    qrToken,
    pin
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

  // 3.2 Génération QR code (image pour email)
  const qrCode = await generateQRCode(qrToken);

  // ==========================
// UPLOAD QR SUR SUPABASE
// ==========================

const fileName = `qr-${qrToken}.png`;

const base64Data = qrCode.replace(/^data:image\/png;base64,/, "");
const buffer = Buffer.from(base64Data, "base64");

const { error: uploadError } = await supabase.storage
  .from("qrcodes")
  .upload(fileName, buffer, {
    contentType: "image/png",
    upsert: true
  });

if (uploadError) {
  console.error("UPLOAD ERROR:", uploadError);
}

// URL publique
const { data: publicData } = supabase.storage
  .from("qrcodes")
  .getPublicUrl(fileName);

const qrUrl = publicData.publicUrl;

  // 4. 📩 Envoi EMAIL + SMS (non bloquant mais sécurisé)
  try {
    console.log("QR CODE ===>", qrCode.substring(0, 50));

await Promise.all([
  sendEmail({
    to: data.email,
    pin,
    qrUrl
  }),

  sendSMS({
    phone: data.phone,
    pin,
    qrUrl: `https://nonacquiescent-adelina-experimentally.ngrok-free.dev/access?token=${qrToken}`
  })
]);

  } catch (err) {
    console.error("Erreur envoi email/SMS:", err);
    // 👉 IMPORTANT : on bloque pas le booking
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

  if (new Date() > new Date(booking.expires_at)) {
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

  await capturePayment(booking.paymentIntentId, amountInCents);

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
  verifyBookingByPin,
  scanBooking,
  closeLocker,
  pickupBooking
};