/**
 * ==========================================
 * 📦 ACCESS CONTROLLER
 * ==========================================
 *
 * - generateAccess → validation accès (PIN / QR)
 * - getQRCodeImage → génération QR code image (email / page)
 */

const { findBookingByToken, findBookingByPin } = require("../services/bookingService");
const QRCode = require("qrcode");


// ==========================================
// 🔐 ACCESS (EXISTANT — INCHANGÉ)
// ==========================================

const generateAccess = async (req, res) => {
  try {
    const { qrToken, pin } = req.body;

    let booking;

    if (qrToken) {
      booking = await findBookingByToken(qrToken);
    }

    if (!booking && pin) {
      booking = await findBookingByPin(pin);
    }

    if (!booking) {
      return res.status(404).json({
        error: "BOOKING_NOT_FOUND"
      });
    }

    const now = new Date();

    if (new Date(booking.expiresAt) < now) {
      return res.status(403).json({
        error: "BOOKING_EXPIRED"
      });
    }

    res.json({
      access: "granted",
      booking
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "SERVER_ERROR"
    });
  }
};


// ==========================================
// 📸 QR CODE IMAGE (NOUVEAU)
// ==========================================

const getQRCodeImage = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).send("Token manquant");
    }

    // 🔥 URL encodée dans le QR
    const url = `https://dropbags.fr/access?token=${token}`;

    // 🧠 Génération image QR (buffer)
    const qrBuffer = await QRCode.toBuffer(url, {
      width: 300,
      errorCorrectionLevel: "H"
    });

    // 📦 Retour image
    res.setHeader("Content-Type", "image/png");
    res.send(qrBuffer);

  } catch (err) {
    console.error("QR ERROR:", err);
    res.status(500).send("Erreur génération QR");
  }
};


// ==========================================
// 📦 EXPORTS
// ==========================================

module.exports = {
  generateAccess,
  getQRCodeImage
};