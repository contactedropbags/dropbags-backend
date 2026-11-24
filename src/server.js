// Charger les variables d'environnement (.env)
require("dotenv").config();

// Import des dépendances
const express = require("express");
const cors =require("cors");

// Import des routes
const accessRoutes = require("./routes/accessRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const stripeWebhook = require("./routes/stripeWebhookRoutes");
const accessControlRoutes = require("./routes/accessControlRoutes");

// Middleware de sécurité (API key)
const authMiddleware = require("./middleware/auth");
const { processExpiredCheckouts } = require("./services/bookingService");

const CHECKOUT_POLL_MS = 30000;

// Initialisation de l'app
const app = express();

app.use(cors());

/**
 * 🔥 IMPORTANT (Render / Production)
 * Render impose un port dynamique via process.env.PORT
 */
const PORT = process.env.PORT || 3000;

/**
 * ================================
 * 🏠 ROUTE RACINE (TEST SERVEUR)
 * ================================
 * Permet de vérifier que ton backend fonctionne
 */
app.get("/", (req, res) => {
  res.send("🚀 Dropbags backend is running !");
});

/**
 * ================================
 * 💳 WEBHOOK STRIPE
 * ================================
 * ⚠️ DOIT être AVANT express.json()
 * Stripe a besoin du body brut
 */
const stripeWebhookRawParser = express.raw({
  type: (req) => {
    const contentType = req.headers["content-type"] || "";
    return contentType.includes("application/json");
  }
});

// Route officielle Stripe Dashboard
app.use("/webhooks/stripe", stripeWebhookRawParser, stripeWebhook);
// Alias rétro-compat (ancienne config Stripe /webhook)
app.use("/webhook", stripeWebhookRawParser, stripeWebhook);

/**
 * ================================
 * 🧠 MIDDLEWARE GLOBAL
 * ================================
 */
app.use(express.json());

/**
 * ================================
 * 🌐 ROUTES PUBLIQUES
 * ================================
 * Pas besoin d'authentification
 */
app.use("/api", bookingRoutes);
app.use("/payment", paymentRoutes);

/**
 * ================================
 * 🚪 ACCESS CONTROL (porte / Akuvox)
 * ================================
 * Terminal physique → validation QR/PIN + ouverture relais
 */
app.use("/access", accessControlRoutes);

/**
 * ================================
 * 🔐 ROUTES PROTÉGÉES
 * ================================
 * Nécessitent une API_KEY
 */
app.use("/api/access", authMiddleware, accessRoutes);

/**
 * ================================
 * 🧪 ROUTES DEV (development only)
 * ================================
 */
if (process.env.NODE_ENV === "development") {
  const devRoutes = require("./routes/devRoutes");
  app.use("/dev", devRoutes);

  const simulatorRoutes = require("./routes/simulatorRoutes");
  app.use("/simulator", simulatorRoutes);
}

/**
 * ================================
 * 📄 ROUTE FRONT (QR CODE ACCESS)
 * ================================
 * Page HTML pour afficher QR + instructions
 */
app.get("/access", async (req, res) => {
  const { token } = req.query;

  res.send(`
    <html>
      <head>
        <title>Dropbags Access</title>
        <style>
          body {
            background: #000;
            color: #fff;
            text-align: center;
            font-family: Arial;
            padding-top: 50px;
          }
          img {
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <h1>DROPBAGS 🔐</h1>
        <p>Scannez ce QR code pour accéder</p>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${token}" />
        <p>Ou utilisez votre code PIN</p>
      </body>
    </html>
  `);
});

/**
 * ================================
 * ❌ ROUTE 404
 * ================================
 * Si aucune route ne correspond
 */
app.use((req, res) => {
  res.status(404).send("Route not found ❌");
});

/**
 * ================================
 * 🚀 LANCEMENT SERVEUR
 * ================================
 */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("Stripe webhook endpoints: POST /webhooks/stripe | POST /webhook");
  console.log("Access control endpoints: POST /access/validate | POST /api/access/open");
  console.log("Checkout endpoints: POST /api/access/pickup | /continue | /finalize | GET /checkout-state/:bookingId");
  console.log("CHECKOUT_DECISION_TIMEOUT_MS:", process.env.CHECKOUT_DECISION_TIMEOUT_MS || 180000);
  console.log("STRIPE_WEBHOOK_SECRET loaded:", Boolean(process.env.STRIPE_WEBHOOK_SECRET));
  const accessProvider = process.env.ACCESS_CONTROL_PROVIDER || "akuvox";
  const keyniusProvider = process.env.KEYNIUS_PROVIDER || "api";
  console.log("ACCESS_CONTROL_PROVIDER:", accessProvider);
  console.log("KEYNIUS_PROVIDER:", keyniusProvider);
  if (accessProvider === "mock") {
    console.log("Access control running in MOCK mode (no Akuvox HTTP calls)");
  }
  if (keyniusProvider === "mock") {
    console.log("Keynius running in MOCK mode (no Keynius HTTP calls)");
  }

  if (process.env.NODE_ENV === "development") {
    console.log("Dev routes enabled: POST /dev/reset | /dev/create-booking | /dev/authorize/:id | /dev/activate/:id | …");
    console.log("Access Control Simulator: http://localhost:" + PORT + "/simulator");
  }

  setInterval(async () => {
    try {
      await processExpiredCheckouts();
    } catch (error) {
      console.error("[checkout] processExpiredCheckouts failed:", error.message);
    }
  }, CHECKOUT_POLL_MS);
});