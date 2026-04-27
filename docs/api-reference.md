# API Reference

Complete documentation for all spec-bridge classes, methods, and events.

---

## SpecBridge (Spectacles + Web)

The core networking class. Same API on both Spectacles and web.

### Constructor

```typescript
new SpecBridge(config: BridgeConfig)
```

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `roomCode` | `string` | Yes | 4-character room code |
| `role` | `'host' \| 'player'` | Yes | Client role |
| `playerName` | `string` | No | Display name (required for players) |
| `relayUrl` | `string` | No | Relay server URL (defaults to production) |

### Static Methods

#### `SpecBridge.connect(config)` (Web only)

Factory method for web clients. Returns a new `SpecBridge` instance.

```javascript
const bridge = SpecBridge.connect({ roomCode: 'ABCD', role: 'player', playerName: 'Tosin' });
```

#### `SpecBridge.generateRoomCode()`

Generate a random 4-character room code. Uses `A-Z` (excluding I, O) and `2-9` (excluding 0, 1) to avoid ambiguity.

```typescript
const code = SpecBridge.generateRoomCode(); // e.g., 'K7R3'
```

### Instance Methods

#### `bridge.on(eventType, handler)`

Register a handler for an event type. Returns `this` (web) for chaining.

```typescript
bridge.on('new_question', (payload) => { ... });
```

#### `bridge.off(eventType, handler)`

Remove a specific event handler.

#### `bridge.removeAllListeners(eventType?)`

Remove all handlers for an event type, or all handlers if no type given. Web client only.

#### `bridge.send(type, payload?, to?)`

Send a message through the relay.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `type` | `string` | — | Event type |
| `payload` | `object` | `{}` | Data payload |
| `to` | `string` | `'all'` | Target: `'all'`, `'host'`, or a client ID |

```typescript
bridge.send('answer_submitted', { choice: 2, timeMs: 3100 });
bridge.send('kick_player', { reason: 'afk' }, 'abc123'); // to specific client
```

#### `bridge.disconnect()`

Close the connection and stop reconnection attempts.

#### `bridge.isConnected()`

Returns `true` if currently connected to the relay.

#### `bridge.getRoomCode()`

Returns the room code for this session.

#### `bridge.getClientId()` (Web only)

Returns the client ID assigned by the relay server, or `null` before connection.

### Events

Events emitted by the bridge (listen with `bridge.on(...)`):

| Event | Payload | Description |
|-------|---------|-------------|
| `connected` | `{}` | Successfully connected to relay |
| `disconnected` | `{ code, reason }` | Disconnected from relay |
| `connection_failed` | `{ attempts }` | All reconnect attempts exhausted |
| `welcome` | `{ clientId, roomCode, role, playerCount }` | Server acknowledgement |
| `player_joined` | `{ playerId, playerName }` | A player joined the room |
| `player_left` | `{ playerId, playerName }` | A player left the room |
| `player_count` | `{ count }` | Updated player count |

Any custom event type sent via `bridge.send()` can be listened to with `bridge.on()`.

---

## QuizGenerator (Spectacles only)

AI-powered quiz question generation via Remote Service Gateway.

### Constructor

```typescript
new QuizGenerator(config: QuizGeneratorConfig)
```

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `remoteService` | `any` | Yes | Lens Studio RemoteServiceModule reference |
| `provider` | `'claude' \| 'openai' \| 'gemini'` | Yes | AI provider |

### Methods

#### `generator.generate(params)`

Generate quiz questions. Returns a `Promise<QuizPayload>`.

| Param | Type | Description |
|-------|------|-------------|
| `topic` | `string` | Topic to generate questions about |
| `count` | `number` | Number of questions (typically 10) |
| `difficulty` | `'easy' \| 'medium' \| 'hard'` | Difficulty level |

```typescript
const quiz = await generator.generate({
  topic: 'Greek mythology',
  count: 10,
  difficulty: 'medium',
});
```

Returns:

```typescript
{
  topic: 'Greek mythology',
  questions: [
    {
      id: 1,
      text: 'Who is the Greek god of the sea?',
      choices: ['Zeus', 'Poseidon', 'Hades', 'Apollo'],
      correctIndex: 1,
      explanation: 'Poseidon is the god of the sea in Greek mythology.'
    },
    // ... 9 more
  ]
}
```

Behavior:
- Caches the last 5 unique generations (key: `topic|count|difficulty`)
- Retries once on malformed JSON
- Throws `QuizGenerationError` after all attempts fail
- Times out after 10 seconds

#### `generator.clearCache()`

Clear the in-memory generation cache.

---

## Types

### BridgeMessage

```typescript
interface BridgeMessage {
  type: string;        // Event type identifier
  from: string;        // Sender ID
  to: string;          // 'all', 'host', or client ID
  payload: object;     // Event data
  ts: number;          // Unix timestamp (ms)
}
```

### QuizQuestion

```typescript
interface QuizQuestion {
  id: number;                              // 1-based
  text: string;                            // Max 120 chars
  choices: [string, string, string, string]; // Exactly 4
  correctIndex: number;                    // 0-3
  explanation: string;                     // One sentence
}
```

### QuizPayload

```typescript
interface QuizPayload {
  topic: string;
  questions: QuizQuestion[];
}
```

### PlayerInfo

```typescript
interface PlayerInfo {
  id: string;
  name: string;
  score: number;
  lockedOut: boolean;
}
```

### QuizGenerationError

```typescript
class QuizGenerationError extends Error {
  cause?: unknown;     // Original error
}
```

---

## Relay Server

### Health Check

```
GET /health
→ { "status": "ok", "rooms": 2, "uptime": 123.4 }
```

### WebSocket Connection

```
ws://host:port?room=ABCD&role=host&name=Tosin
```

| Param | Required | Description |
|-------|----------|-------------|
| `room` | Yes | Room code |
| `role` | No | `host` or `player` (default: `player`) |
| `name` | No | Display name (default: `Anonymous`) |

### Server-Sent Events

| Event | Payload | When |
|-------|---------|------|
| `welcome` | `{ clientId, roomCode, role, playerCount }` | On connect |
| `player_joined` | `{ playerId, playerName }` | Player connects |
| `player_left` | `{ playerId, playerName }` | Player disconnects |
| `player_count` | `{ count }` | Player count changes |
| `error` | `{ message }` | Invalid message format |

### Message Routing

| `to` value | Behavior |
|------------|----------|
| `'all'` | Broadcast to all clients except sender |
| `'host'` | Send only to the host |
| `'<clientId>'` | Send to a specific client |
