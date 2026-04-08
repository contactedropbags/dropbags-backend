/**
 * ==========================================
 * 📦 SMS SERVICE (BREVO)
 * ==========================================
 *
 * Ce service gère :
 * - l’envoi de SMS transactionnels via Brevo
 *
 * Contenu du SMS :
 * - lien d’accès (QR version URL)
 * - code PIN
 *
 * ⚠️ Utilisé dans :
 * - bookingService
 */

const SibApiV3Sdk = require("sib-api-v3-sdk");

/**
 * 🔐 Configuration Brevo (API Key)
 */
const defaultClient = SibApiV3Sdk.ApiClient.instance;
defaultClient.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;

/**
 * 📡 Instance API SMS
 */
const smsApi = new SibApiV3Sdk.TransactionalSMSApi();

/**
 * 📱 Envoi SMS
 */
async function sendSMS({ phone, pin, qrUrl }) {
  // 🔍 Debug utile
  console.log("SMS SEND →", phone, pin, qrUrl);

  if (!phone) {
    throw new Error("Numéro de téléphone manquant");
  }

  /**
   * 🧾 Contenu du message
   */
 const message = `DROPBAGS 🔐
Consigne à bagages 24/7

Vos accès sécurisés :

📱 QR code : ${qrUrl}
     OU
🔑 PIN : ${pin}

👉 À utiliser pour la porte d’accès et les casiers

⏳ Vos accès sont valables jusqu’à la fin de votre réservation

Merci de votre confiance ✨`;

  /**
   * 📤 Envoi via Brevo
   */
  return await smsApi.sendTransacSms({
    sender: "Dropbags",
    recipient: phone,
    content: message
  });
}

/**
 * 📤 Export
 */
module.exports = { sendSMS };