# @spec-bridge/relay-server

WebSocket relay server that routes messages between Spectacles and web clients.

## Setup

```bash
cp .env.example .env    # Add Supabase credentials
npm install
npm start               # Listening on :3000
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `SUPABASE_URL` | No | Supabase project URL |
| `SUPABASE_ANON_KEY` | No | Supabase anonymous API key |

Supabase is optional — the server runs fine without it, just without persistence.

## Health Check

```
GET /health
```

Returns `{ status: "ok", rooms: 2, uptime: 123.4 }`.

## WebSocket Protocol

Connect to `ws://localhost:3000?room=ABCD&role=host&name=Tosin`.

### Query Parameters

| Param | Required | Description |
|-------|----------|-------------|
| `room` | Yes | 4-character room code |
| `role` | No | `host` or `player` (default: `player`) |
| `name` | No | Display name (default: `Anonymous`) |

### Message Format

```json
{
  "type": "new_question",
  "from": "host",
  "to": "all",
  "payload": { ... },
  "ts": 1714200000000
}
```

### Routing

- `to: "all"` — broadcast to everyone in the room (except sender)
- `to: "host"` — send only to the host
- `to: "<clientId>"` — send to a specific client

## Database Schema

Run `supabase-schema.sql` in the Supabase SQL Editor to create the required tables.

## Deploy to Railway

Connect the GitHub repo and set the root directory to `packages/relay-server`.
Railway will detect the `package.json` and run `npm start` automatically.
