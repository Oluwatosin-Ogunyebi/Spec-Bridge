# spec-bridge

**Socket.io for Snap Spectacles.** Build asymmetric AR experiences between Spectacles and any web browser in just a few lines of code.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org)

<!-- ![spec-bridge demo](docs/assets/demo.gif) -->

---

## What is spec-bridge?

spec-bridge is an open-source toolkit that connects Snap Spectacles to phones, tablets, and laptops over WebSocket. It handles room management, message routing, and reconnection — so you can focus on building the experience.

**The headline demo: Voice-Powered Quiz Host**

1. Spectacles wearer speaks a topic ("Greek mythology", "JavaScript trivia")
2. AI generates 10 multiple-choice questions on the fly
3. Phone players join with a room code and buzz in with answers
4. Scores update in real-time across all devices

## 2-Minute Quickstart

### 1. Start the relay server

```bash
cd packages/relay-server
cp .env.example .env        # Add your Supabase credentials
npm install
npm start                   # Listening on :3000
```

### 2. Connect from Spectacles (TypeScript)

```typescript
import { SpecBridge } from './SpecBridge';

const bridge = new SpecBridge({
  roomCode: SpecBridge.generateRoomCode(),
  role: 'host',
});

bridge.on('player_joined', (data) => {
  print('Welcome ' + data.playerName);
});

bridge.send('new_question', {
  text: 'What is the capital of France?',
  choices: ['London', 'Paris', 'Berlin', 'Madrid'],
  correctIndex: 1,
});
```

### 3. Connect from a phone browser

```html
<script src="https://cdn.spec-bridge.dev/v1/spec-bridge.min.js"></script>
<script>
  const bridge = SpecBridge.connect({
    roomCode: 'QUIZ-A4F2',
    role: 'player',
    playerName: 'Tosin',
  });

  bridge.on('new_question', (q) => {
    console.log(q.text, q.choices);
  });

  function answer(choice) {
    bridge.send('answer_submitted', { choice, timeMs: 3200 });
  }
</script>
```

## Architecture

```
[Spectacles Lens] <──WebSocket──> [Relay Server] <──WebSocket──> [Phone Browser]
       │                                │
       │                                ▼
       │                       [Supabase Postgres]
       │                       (rooms + audit log)
       │
       ├──── ASR (voice → text) ──── on-device
       │
       └──── Remote Service Gateway ──► Claude API (quiz generation)
```

| Component | Tech | Location |
|-----------|------|----------|
| Spectacles module | TypeScript, Lens Studio 5.10.1+ | `packages/spectacles/` |
| Web client | TypeScript → UMD bundle, zero deps | `packages/web-client/` |
| Relay server | Node.js 20+, `ws`, Supabase | `packages/relay-server/` |
| Quiz AI | Claude via Remote Service Gateway | `packages/spectacles/QuizGenerator.ts` |

## How the AI Works

The `QuizGenerator` module takes a spoken topic and generates quiz questions using Claude (via Snap's Remote Service Gateway):

1. **Voice capture** — Spectacles ASR converts speech to text
2. **Prompt construction** — Topic, question count, and difficulty are injected into a structured prompt template
3. **JSON generation** — AI endpoint returns strict JSON with questions, choices, correct answers, and explanations
4. **Validation** — Response shape is validated before use; malformed JSON triggers one retry
5. **Caching** — Last 5 generations are cached in memory for instant replay

The AI provider is swappable — pass `provider: 'openai'` or `provider: 'gemini'` to `QuizGenerator` to use a different model.

## API Reference

### SpecBridge (Spectacles + Web)

| Method | Description |
|--------|-------------|
| `new SpecBridge(config)` | Create a bridge instance and connect to the relay |
| `bridge.on(event, handler)` | Listen for an event type |
| `bridge.off(event, handler)` | Remove an event listener |
| `bridge.send(type, payload, to?)` | Send a message (default: broadcast to all) |
| `bridge.disconnect()` | Close the connection |
| `bridge.isConnected()` | Check connection status |
| `bridge.getRoomCode()` | Get the current room code |
| `SpecBridge.generateRoomCode()` | Generate a random 4-char room code |

### QuizGenerator (Spectacles only)

| Method | Description |
|--------|-------------|
| `new QuizGenerator(config)` | Create with RemoteServiceModule + provider |
| `generator.generate({ topic, count, difficulty })` | Generate quiz questions via AI |

### Message Format

All messages follow this shape:

```json
{
  "type": "new_question",
  "from": "host",
  "to": "all",
  "payload": { "text": "...", "choices": ["..."] },
  "ts": 1714200000000
}
```

## Project Structure

```
spec-bridge/
├── packages/
│   ├── spectacles/          # TypeScript module for Lens Studio
│   ├── web-client/          # Browser library (UMD bundle)
│   └── relay-server/        # Node.js WebSocket relay + Supabase
├── demo-lens/               # Voice Quiz Host Lens project
├── demo-web/                # Quiz Buzzer phone client
└── docs/                    # Guides and API docs
```

## Built-in Patterns

spec-bridge isn't just for quizzes. The messaging layer supports any asymmetric AR pattern:

- **Voting** — Spectacles shows options, phones cast votes
- **Collaborative drawing** — Phone users draw, Spectacles renders in 3D
- **Raid boss** — Spectacles is the boss, phones are the party
- **Shared whiteboard** — Any device can contribute

See [recipes.md](docs/recipes.md) for implementation guides.

## Development

```bash
# Relay server
cd packages/relay-server && npm install && npm start

# Web client (watch mode)
cd packages/web-client && npm install && npm run dev
```

## Requirements

- **Spectacles**: Lens Studio 5.10.1+ with Spectacles target
- **Relay server**: Node.js 20+, Supabase account (free tier)
- **Web client**: Any modern browser with WebSocket support

## License

[MIT](LICENSE) — Oluwatosin Ogunyebi (Kiingot)

