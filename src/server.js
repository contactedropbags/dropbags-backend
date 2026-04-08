require("dotenv").config();
console.log("SUPABASE URL:", process.env.SUPABASE_URL);
const express = require("express");
const accessRoutes = require("./routes/accessRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const stripeWebhook = require("./routes/stripeWebhookRoutes");

// Middleware de sécurité
const authMiddleware = require('./middleware/auth');

const app = express();
const PORT = 3000;

// webhook stripe
app.use("/", stripeWebhook);

app.use(express.json());

// Brancher les routes API
app.use("/api", accessRoutes);
app.use("/api", bookingRoutes);
app.use("/payment", paymentRoutes);



app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


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
        <img src="/qr?token=${token}" width="250" />
        <p>Ou utilisez votre code PIN</p>
      </body>
    </html>
  `);
});

/**
 * ROUTES PUBLIQUES
 * Ces routes restent accessibles sans authentification
 * (ex : création de booking, paiement)
 */
app.use("/api", bookingRoutes);
app.use("/payment", paymentRoutes);

/**
 * ROUTES PROTÉGÉES
 * Ces routes nécessitent une clé API valide
 * (ex : ouverture de porte, gestion interne)
 */
app.use("/api/access", authMiddleware, accessRoutes);