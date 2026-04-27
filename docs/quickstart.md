# Quickstart

Get the Voice-Powered Quiz Host running end-to-end in under 5 minutes.

## Prerequisites

- Node.js 20+
- Lens Studio 5.10.1+ with Spectacles target
- Supabase account (free tier — optional for local dev)

## 1. Clone and install

```bash
git clone https://github.com/kiingot/spec-bridge.git
cd spec-bridge
```

## 2. Start the relay server

```bash
cd packages/relay-server
cp .env.example .env        # fill in Supabase creds (optional)
npm install
npm start
```

You should see:

```
[relay] spec-bridge relay server listening on :3000
[relay] Health check: http://localhost:3000/health
```

## 3. Build the web client

```bash
cd packages/web-client
npm install
npm run build
```

This produces `dist/spec-bridge.min.js` (3kb).

## 4. Open the Quiz Buzzer

Open `demo-web/index.html` in your phone browser (or use a local server):

```bash
# From the repo root
npx serve demo-web -p 8080
```

Visit `http://localhost:8080` on your phone.

## 5. Set up the Spectacles Lens

1. Open Lens Studio and create a new Spectacles project
2. Copy all files from `packages/spectacles/` into your project's Script folder
3. Copy `demo-lens/QuizHost.ts` and the other demo scripts into Script
4. Create a new Script Component on a SceneObject, assign `QuizHost.ts`
5. Wire the inputs:
   - `asrModule` → your ASR Module asset
   - `remoteService` → your RemoteServiceModule asset
   - `questionDisplay` → a SceneObject with the `QuestionDisplay` component
   - `scoreboard` → a SceneObject with the `PlayerScoreboard` component
6. For `QuestionDisplay`, create 3 Text objects (title, body, subtitle) and assign them
7. For `PlayerScoreboard`, create a header Text and up to 5 slot Texts

## 6. Configure Remote Service Gateway

In Lens Studio:

1. Add a RemoteServiceModule to your scene
2. Configure it with Claude as the AI provider
3. The endpoint and auth are managed by Snap's gateway — no API key needed in the Lens

Reference: [Remote Service Gateway docs](https://developers.snap.com/spectacles/about-spectacles-features/apis/remoteservice-gateway)

## 7. Run it!

1. Build and push the Lens to your Spectacles
2. The Lens shows a room code (e.g., `QUIZ-A4F2`)
3. On your phone, enter the room code and your name
4. On Spectacles, pinch to listen and say a topic
5. Quiz questions appear on both Spectacles and phone
6. Tap answers on the phone — scores update in real-time

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Could not connect" on phone | Make sure relay server is running and accessible |
| ASR not working | Check that ASR Module is properly added in Lens Studio |
| Quiz generation fails | Verify RemoteServiceModule is configured for Claude |
| Timer doesn't start | Check WebSocket connection in browser dev tools |

## Next steps

- Read the [API Reference](api-reference.md) for full class documentation
- Check [Recipes](recipes.md) for other experience patterns (voting, drawing, raid boss)
- Deploy the relay to Railway — see `packages/relay-server/README.md`
