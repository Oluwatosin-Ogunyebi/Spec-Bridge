# Recipes

Patterns for building asymmetric AR experiences with spec-bridge. Each recipe shows the Spectacles (host) side and the web (player) side.

---

## Live Voting / Polling

The Spectacles wearer presents options, phone users vote in real-time, results appear floating in AR.

### Spectacles (Host)

```typescript
import { SpecBridge } from './SpecBridge';

@component
export class VotingHost extends BaseScriptComponent {
  private bridge: SpecBridge;
  private votes: Map<string, number> = new Map();

  onAwake() {
    this.bridge = new SpecBridge({
      roomCode: SpecBridge.generateRoomCode(),
      role: 'host',
    });

    this.bridge.on('vote_cast', (data) => {
      const option = data.option as string;
      this.votes.set(option, (this.votes.get(option) || 0) + 1);
      this.broadcastResults();
    });
  }

  startPoll(question: string, options: string[]) {
    this.votes.clear();
    options.forEach((o) => this.votes.set(o, 0));

    this.bridge.send('new_poll', { question, options });
  }

  private broadcastResults() {
    const results = Object.fromEntries(this.votes);
    this.bridge.send('vote_results', { results });
  }
}
```

### Web (Player)

```javascript
bridge.on('new_poll', (data) => {
  showPoll(data.question, data.options);
});

function castVote(option) {
  bridge.send('vote_cast', { option });
}

bridge.on('vote_results', (data) => {
  updateChart(data.results); // bar chart, pie chart, etc.
});
```

---

## Collaborative Drawing

Phone users draw on a canvas, strokes appear in 3D space on Spectacles.

### Spectacles (Host)

```typescript
this.bridge.on('stroke', (data) => {
  // data.points = [{x, y}, {x, y}, ...]
  // data.color = '#ff0000'
  // data.playerId = 'abc123'
  this.render3DStroke(data.points, data.color);
});

this.bridge.on('clear_canvas', () => {
  this.clearAll3DStrokes();
});
```

### Web (Player)

```javascript
const canvas = document.getElementById('draw-canvas');
const ctx = canvas.getContext('2d');
let drawing = false;
let points = [];

canvas.addEventListener('pointerdown', (e) => {
  drawing = true;
  points = [{ x: e.offsetX, y: e.offsetY }];
});

canvas.addEventListener('pointermove', (e) => {
  if (!drawing) return;
  points.push({ x: e.offsetX, y: e.offsetY });
  drawLocal(points);
});

canvas.addEventListener('pointerup', () => {
  drawing = false;
  bridge.send('stroke', { points, color: selectedColor });
  points = [];
});
```

---

## Raid Boss

Spectacles wearer is the boss with a health bar. Phone players are the party — they tap to attack, use abilities, and coordinate.

### Spectacles (Host)

```typescript
@component
export class RaidBoss extends BaseScriptComponent {
  private bridge: SpecBridge;
  private bossHP = 10000;
  private maxHP = 10000;

  onAwake() {
    this.bridge = new SpecBridge({
      roomCode: SpecBridge.generateRoomCode(),
      role: 'host',
    });

    this.bridge.on('attack', (data) => {
      const damage = this.calculateDamage(data.ability as string);
      this.bossHP = Math.max(0, this.bossHP - damage);

      this.bridge.send('boss_status', {
        hp: this.bossHP,
        maxHP: this.maxHP,
        lastHit: { playerId: data.playerId, damage },
      });

      if (this.bossHP <= 0) {
        this.bridge.send('boss_defeated', { message: 'Victory!' });
      }
    });
  }

  private calculateDamage(ability: string): number {
    const base = { slash: 100, fireball: 250, heal: -150 };
    return (base[ability] || 50) + Math.floor(Math.random() * 50);
  }
}
```

### Web (Player)

```javascript
bridge.on('boss_status', (data) => {
  updateHealthBar(data.hp, data.maxHP);
  showDamageNumber(data.lastHit.damage);
});

function useAbility(ability) {
  bridge.send('attack', {
    playerId: bridge.getClientId(),
    ability: ability,
  });
}

bridge.on('boss_defeated', (data) => {
  showVictoryScreen(data.message);
});
```

---

## Shared Whiteboard

Any device (Spectacles or phone) can add elements. Useful for brainstorming, planning, or collaborative games.

### Both Sides

```javascript
// Anyone can add a note
function addNote(text, x, y) {
  bridge.send('note_added', { text, x, y, author: myName });
}

// Anyone can move a note
function moveNote(noteId, x, y) {
  bridge.send('note_moved', { noteId, x, y });
}

// Listen for changes from others
bridge.on('note_added', (data) => renderNote(data));
bridge.on('note_moved', (data) => updateNotePosition(data));
bridge.on('note_deleted', (data) => removeNote(data.noteId));
```

---

## Tips for Custom Experiences

1. **Keep messages small.** Send IDs and deltas, not full state. The relay doesn't compress.

2. **Use roles wisely.** The host (Spectacles) should own game state. Players send intents, not state changes.

3. **Handle disconnects.** Players will drop and rejoin. Send a state snapshot on `player_joined` so reconnected players catch up.

4. **Rate limit inputs.** On phone, debounce rapid taps. On Spectacles, validate that incoming messages are reasonable.

5. **Sanitize everything.** Any text from players or AI that you display should be stripped of HTML/script content.

```javascript
function sanitize(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
```
