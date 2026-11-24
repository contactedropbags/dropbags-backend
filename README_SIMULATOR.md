# DropBags — Access Control Simulator V1

## Prérequis (.env)

```env
NODE_ENV=development
ACCESS_CONTROL_PROVIDER=mock
KEYNIUS_PROVIDER=mock
API_KEY=your-dev-api-key
MOCK_DOOR_AUTO_CLOSE_MS=5000
```

## Lancer

```bash
# Terminal 1
npm run dev

# Terminal 2 — navigateur
open http://localhost:3000/simulator
```

Le simulateur **refuse de démarrer** si `ACCESS_CONTROL_PROVIDER` ou `KEYNIUS_PROVIDER` ≠ `mock`.

## Architecture

```
Webcam → QR Scanner (browser)
       → POST /access/validate  (backend réel)
       → accessControlService.validateAndOpenDoor()
       → mockProvider.openRelay()
       → Door UI (poll /simulator/api/hardware-state)

PIN keypad → même endpoint /access/validate

Locker → POST /api/access/locker (API key)
       → bookingService.scanBooking()
       → mockKeynius.openLocker()
```

## Endpoints utilisés (backend réel)

| Action | Endpoint |
|--------|----------|
| Porte QR/PIN | `POST /access/validate` |
| Assigner/ouvrir casier | `POST /api/access/locker` |
| Pickup / Continue / Finalize | `POST /api/access/*` |
| Setup test | `POST /dev/*` |
| État hardware mock | `GET /simulator/api/hardware-state` |

## Test manuel rapide

1. `npm run dev` + ouvrir `/simulator`
2. **Run full simulation** — parcours automatisé
3. Ou : reset → booking dev → authorize → activer caméra → scanner QR email

## Post-checkout

Après finalize, rescanner QR/PIN → `ACCESS DENIED` (`BOOKING_CLOSED` / `BOOKING_NOT_FOUND`).

## Éléments mockés vs réels

| Mock | Réel |
|------|------|
| Akuvox relay | accessControlService, bookingService, Supabase |
| Keynius open | Stripe capture (finalize) |
| Door/Locker UI state | access_logs (si table existe) |
