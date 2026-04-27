# Demo Lens — Voice Quiz Host

Lens Studio project for the Voice-Powered Quiz Host demo.

## Setup

1. Open Lens Studio 5.10.1+
2. Create a new Spectacles project
3. Copy the TypeScript files from `packages/spectacles/` into your project
4. Add `demo-lens/QuizHost.ts` as a script component
5. Wire up the ASR Module and RemoteServiceModule inputs
6. Build and deploy to Spectacles

## Scene Structure

- **QuizHost** — Main orchestrator script
- **VoiceListener** — ASR wrapper for topic capture
- **QuestionDisplay** — 3D floating question panel
- **PlayerScoreboard** — Live score display

See [quickstart.md](../docs/quickstart.md) for the full walkthrough.
