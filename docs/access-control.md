# Contrôle d'accès

## Modes

### Mode production

```env
ACCESS_CONTROL_PROVIDER=akuvox
```

Utilise le provider Akuvox réel et appelle l'API `relay/trig` sur le contrôleur physique.

Variables requises :

```env
AKUVOX_BASE_URL=http://{device-ip}
AKUVOX_USERNAME=
AKUVOX_PASSWORD=
AKUVOX_RELAY_MODE=1
AKUVOX_RELAY_NUM=1
AKUVOX_RELAY_LEVEL=1
AKUVOX_RELAY_DELAY=5
```

### Mode développement

```env
ACCESS_CONTROL_PROVIDER=mock
```

Aucune requête HTTP externe n'est effectuée. L'ouverture de porte est simulée en console :

```
[AccessControl][MOCK] Door opened
```

Le mode MOCK permet de tester :

- QR Token
- PIN
- Validation réservation
- Expiration réservation
- Logs d'accès
- Endpoint `POST /api/access/open`

sans matériel Akuvox connecté.

Le comportement est identique au mode réel à l'exception de l'ouverture physique de la porte.

## Endpoints

| Route | Auth | Description |
|-------|------|-------------|
| `POST /access/validate` | Non | Terminal Akuvox — valide QR/PIN et ouvre la porte |
| `POST /api/access/open` | `x-api-key` | API interne — même logique, avec journalisation |

Body accepté :

```json
{ "qrToken": "..." }
```

ou

```json
{ "pin": "1234" }
```
