# @spec-bridge/spectacles

TypeScript module for Snap Spectacles (Lens Studio 5.10.1+).

Provides `SpecBridge` for real-time communication with web clients and `QuizGenerator` for AI-powered quiz generation via Remote Service Gateway.

## Usage

Import into your Lens Studio TypeScript component:

```typescript
import { SpecBridge } from './SpecBridge';

@component
export class MyLens extends BaseScriptComponent {
  private bridge: SpecBridge;

  onAwake() {
    this.bridge = new SpecBridge({
      roomCode: SpecBridge.generateRoomCode(),
      role: 'host',
    });

    this.bridge.on('player_joined', (data) => {
      print('Player joined: ' + data.playerName);
    });
  }
}
```

See the [API Reference](../../docs/api-reference.md) for full documentation.
