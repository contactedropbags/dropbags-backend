/**
 * ==========================================
 * 📦 QR SERVICE
 * ==========================================
 *
 * Ce service gère :
 * - la génération d’un token sécurisé (unique par booking)
 * - la génération d’un QR code (base64) pour affichage email
 *
 * ⚠️ Utilisation :
 * - bookingService (création réservation)
 */

const QRCode = require("qrcode");
const crypto = require("crypto");
const supabase = require("../config/supabase");

/**
 * 🔐 Génère un token sécurisé unique
 *
 * → utilisé dans l’URL d’accès :
 * https://dropbags.fr/access?token=XXX
 */
function generateQrToken() {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * 🧾 Génère un QR code (format base64 image)
 *
 * → utilisé uniquement pour l’email
 * → permet affichage direct dans <img src="">
 */
async function generateQRCode(token) {
  const url = `https://dropbags.fr/access?token=${token}`;

  // Debug utile (tu peux le garder)
  console.log("QR URL:", url);

  // Génération image base64
  const qr = await QRCode.toDataURL(url);

  // Debug léger (évite spam énorme)
  console.log("QR GENERATED:", qr.substring(0, 50));

  return qr;
}

async function uploadQRCodeImage(token) {
  const bucket = process.env.SUPABASE_QR_BUCKET;
  if (!bucket) {
    throw new Error("SUPABASE_QR_BUCKET is not configured");
  }

  const filePath = `qrcodes/${token}.png`;
  const url = `https://dropbags.fr/access?token=${token}`;
  const qrBuffer = await QRCode.toBuffer(url, {
    type: "png",
    width: 300,
    errorCorrectionLevel: "H"
  });

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, qrBuffer, {
      contentType: "image/png",
      cacheControl: "3600",
      upsert: true
    });

  if (uploadError) {
    throw new Error(`QR upload failed: ${uploadError.message}`);
  }

  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);

  if (!data || !data.publicUrl) {
    throw new Error("Unable to resolve public QR URL");
  }

  return data.publicUrl;
}

/**
 * 📤 Export des fonctions
 */
module.exports = {
  generateQrToken,
  generateQRCode,
  uploadQRCodeImage
};