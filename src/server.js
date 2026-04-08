// Charger les variables d'environnement (.env)
require("dotenv").config();

// Import des dépendances
const express = require("express");

// Import des routes
const accessRoutes = require("./routes/accessRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const stripeWebhook = require("./routes/stripeWebhookRoutes");

// Middleware de sécurité (API key)
const authMiddleware = require("./middleware/auth");

// Initialisation de l'app
const app = express();

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
app.use("/webhook", stripeWebhook);

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
 * 🔐 ROUTES PROTÉGÉES
 * ================================
 * Nécessitent une API_KEY
 */
app.use("/api/access", authMiddleware, accessRoutes);

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
});