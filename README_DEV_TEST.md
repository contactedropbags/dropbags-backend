# DropBags — Tests dev rapides (< 1 minute)

Environnement réservé au développement local. Les routes `/dev/*` sont **désactivées** sauf si `NODE_ENV=development`.

## Ultra rapide (< 10 secondes)

Terminal 1 — serveur :

```bash
npm run dev
```

Terminal 2 — parcours complet automatique :

```bash
npm run flow
```

## Scripts npm (sans curl)

| Script | Action |
|--------|--------|
| `npm run reset` | `POST /dev/reset` |
| `npm run booking` | `POST /dev/create-booking` → sauvegarde `.dev-state.json` |
| `npm run payment` | `POST /dev/payment-intent/:bookingId` (dernier booking) |
| `npm run webhook` | Simule le webhook Stripe **sans** `confirm()` — appelle `markBookingPaidAndSendAccess` |
| `npm run pickup` | `POST /dev/pickup/:bookingId` |
| `npm run continue` | `POST /dev/continue/:bookingId` |
| `npm run finalize` | `POST /dev/finalize/:bookingId` |
| `npm run flow` | reset → booking → payment → webhook → activate → pickup → continue → finalize |

Le `bookingId` est lu automatiquement depuis `.dev-state.json` (ou passé en argument : `npm run pickup -- BOOKING_UUID`).

## Prérequis

```bash
cp .env.example .env   # si besoin
# .env minimum :
# SUPABASE_URL, SUPABASE_SERVICE_KEY
# STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
# ACCESS_CONTROL_PROVIDER=mock
# KEYNIUS_API, KEYNIUS_TOKEN (ou laisser — pickup échouera sans Keynius)
```

## Démarrer

```bash
NODE_ENV=development npm run dev
```

Vérifier dans les logs : `Dev routes enabled`.

---

## Workflow complet (curl)

Remplacez `BASE=http://localhost:3000` et `API_KEY` si vous utilisez les routes métier protégées.

### 0. Reset (état propre)

```bash
curl -X POST $BASE/dev/reset
```

Supprime les bookings `dev-test-*@dropbags.local` et libère les casiers en mémoire.

### 1. Créer une réservation test

```bash
curl -X POST $BASE/dev/create-booking
# → { "bookingId", "email", "status": "pending" }
```

### 2. Créer le PaymentIntent Stripe

```bash
curl -X POST $BASE/dev/payment-intent/BOOKING_ID
# → { "paymentIntentId", "clientSecret" }
```

### 3. Confirmer le paiement (Stripe test)

```bash
stripe payment_intents confirm pi_XXXX --payment-method pm_card_visa
```

Le webhook Stripe (`payment_intent.amount_capturable_updated`) passe le booking en `authorized` et envoie email/SMS.

> **Astuce locale** : lancer `stripe listen --forward-to localhost:3000/webhooks/stripe` dans un autre terminal.

### 4. Activer le booking + casier (route métier existante)

```bash
curl -X POST $BASE/api/access/locker \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"bookingId":"BOOKING_ID"}'
```

Met le booking en `active` et assigne un casier.

> Pour tester sans Keynius, ignorer l’erreur hardware si le casier est quand même assigné en DB.

Définir `checkInTime` en Supabase si vous testez `finalize` :

```sql
update bookings set "checkInTime" = now() where id = 'BOOKING_ID';
```

### 5. Ouvrir le casier (début checkout)

```bash
curl -X POST $BASE/dev/pickup/BOOKING_ID
# → checkoutDeadlineAt, actions: ["continue","finalize"]
```

### 6a. Continuer la réservation

```bash
curl -X POST $BASE/dev/continue/BOOKING_ID
# → booking reste active, QR/PIN/casier conservés
```

### 6b. Ou fermer définitivement

```bash
curl -X POST $BASE/dev/finalize/BOOKING_ID
# → closed, capture Stripe, QR/PIN invalidés, casier libéré
```

---

## Chaîne minimale checkout (booking déjà active)

```bash
export BASE=http://localhost:3000
export BOOKING_ID=your-uuid

curl -X POST $BASE/dev/pickup/$BOOKING_ID
curl -X POST $BASE/dev/continue/$BOOKING_ID   # ou /dev/finalize/$BOOKING_ID
```

---

## Sécurité

| Environnement | `/dev/*` |
|---------------|----------|
| `NODE_ENV=development` | ✅ Actif |
| Production / `NODE_ENV=production` | ❌ 404 (routes non montées + garde middleware) |

Aucune logique métier dupliquée : les routes dev appellent `saveBooking`, `createPaymentIntent`, `pickupBooking`, `continueReservation`, `finalizeCheckout`.

---

## Dépannage

| Problème | Cause probable |
|----------|----------------|
| 404 sur `/dev/*` | `NODE_ENV` ≠ `development` |
| Booking reste `pending` | Webhook Stripe non reçu |
| `finalize` échoue | `checkInTime` ou `payment_intent_id` manquant |
| `pickup` échoue | Booking pas `active` ou pas de `locker_number` |
| Email bloque le webhook | Vérifier Resend ou logs webhook |
