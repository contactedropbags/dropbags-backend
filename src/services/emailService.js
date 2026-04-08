/**
 * ==========================================
 * 📦 EMAIL SERVICE (RESEND)
 * ==========================================
 *
 * Ce service gère :
 * - l’envoi d’emails transactionnels
 * - avec QR code (image base64) + PIN
 *
 * ⚠️ Utilisé dans :
 * - bookingService
 */

const { Resend } = require("resend");

/**
 * 🔐 Initialisation Resend
 */
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * 📧 Envoi email avec QR + PIN
 */
async function sendEmail({ to, pin, qrToken }) {
  // 🔍 Debug utile
  console.log("EMAIL SEND →", to, pin);

  if (!to) {
    throw new Error("Email manquant");
  }

  /**
   * 🧾 Template HTML
   */
  const html = `
    <div style="font-family: Arial, sans-serif; text-align:center; padding:20px;">
      
      <h2 style="margin-bottom:10px;">DROPBAGS</h2>

      <p style="font-size:16px;">
        Scannez ce QR code pour accéder à votre casier :
      </p>

      <div style="margin:20px 0;">
        <img src="https://nonacquiescent-adelina-experimentally.ngrok-free.dev/qr?token=${qrToken}" width="200" height="200" />
      </div>

      <h3 style="margin-top:20px;">
        Code PIN : ${pin}
      </h3>

      <p style="font-size:14px; color:#555;">
        Utilisez ce code pour la porte et votre casier
      </p>

    </div>
  `;

  /**
   * 📤 Envoi via Resend
   */
  return await resend.emails.send({
    from: "Dropbags <noreply@dropbags.fr>",
    to,
    subject: "Votre accès Dropbags 🔐",
    html
  });
}

/**
 * 📤 Export
 */
module.exports = { sendEmail };