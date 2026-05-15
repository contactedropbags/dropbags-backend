/**
 * ==========================================
 * 📦 SMS SERVICE (BREVO)
 * ==========================================
 */

const SibApiV3Sdk = require("sib-api-v3-sdk");

const defaultClient = SibApiV3Sdk.ApiClient.instance;
defaultClient.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;

const smsApi = new SibApiV3Sdk.TransactionalSMSApi();

function formatFrenchPhone(phone) {
  const normalized = String(phone).replace(/\s/g, "");

  if (normalized.startsWith("+")) {
    return normalized;
  }

  if (normalized.startsWith("0")) {
    return "+33" + normalized.substring(1);
  }

  return normalized;
}

/**
 * 📱 Envoi SMS
 */
async function sendSMS({ phone, pin, qrUrl }) {
  if (!phone) {
    throw new Error("Numéro de téléphone manquant");
  }

  const formattedPhone = formatFrenchPhone(phone);

  console.log("SMS SEND →", { raw: phone, formatted: formattedPhone, pin, qrUrl });

  const message = `DROPBAGS 🔐
Consigne à bagages 24/7

Vos accès sécurisés :

📱 QR code : ${qrUrl}
     OU
🔑 PIN : ${pin}

👉 À utiliser pour la porte d'accès et les casiers

⏳ Vos accès sont valables jusqu'à la fin de votre réservation

Merci de votre confiance ✨`;

  try {
    return await smsApi.sendTransacSms({
      sender: "Dropbags",
      recipient: formattedPhone,
      content: message
    });
  } catch (err) {
    console.error(
      "SMS ERROR FULL:",
      err.response?.data || err.response?.body || err.message || err
    );
    throw err;
  }
}

module.exports = { sendSMS, formatFrenchPhone };
