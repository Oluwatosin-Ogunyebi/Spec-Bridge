# @spec-bridge/web-client

Vanilla JavaScript/TypeScript library for connecting web browsers to spec-bridge rooms.

Zero dependencies. Ships as a single minified UMD bundle.

## Quick Start

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

  bridge.send('answer_submitted', { choice: 2, timeMs: 3400 });
</script>
```

## Build from Source

```bash
npm install
npm run build
```

See the [API Reference](../../docs/api-reference.md) for full documentation.
