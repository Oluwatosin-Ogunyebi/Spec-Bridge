/**
 * Smoke test: connects a host and a player to the relay,
 * exchanges messages, and verifies the round-trip.
 *
 * Usage: node test-smoke.mjs  (with relay already running on :3000)
 */

import WebSocket from 'ws';

const RELAY = 'ws://localhost:3000';
const ROOM = 'TEST';
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  FAIL: ${label}`);
    failed++;
  }
}

async function waitForMessage(ws, type, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for '${type}'`)), timeoutMs);
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === type) {
        clearTimeout(timer);
        ws.removeListener('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

function connectWs(params) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${RELAY}?${new URLSearchParams(params)}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

async function run() {
  console.log('Smoke test: relay server message exchange\n');

  // 1. Connect host
  console.log('1. Connecting host...');
  const host = await connectWs({ room: ROOM, role: 'host', name: 'Host' });
  const hostWelcome = await waitForMessage(host, 'welcome');
  assert(hostWelcome.payload.role === 'host', 'Host gets welcome with role=host');
  assert(hostWelcome.payload.roomCode === ROOM, 'Host welcome has correct room code');

  // 2. Connect player — start listening for player_joined BEFORE connecting
  console.log('2. Connecting player...');
  const joinedPromise = waitForMessage(host, 'player_joined');
  const player = await connectWs({ room: ROOM, role: 'player', name: 'Tosin' });
  const playerWelcome = await waitForMessage(player, 'welcome');
  assert(playerWelcome.payload.role === 'player', 'Player gets welcome with role=player');
  assert(playerWelcome.payload.playerCount === 1, 'Player count is 1');

  // 3. Host should have received player_joined
  const joined = await joinedPromise;
  assert(joined.payload.playerName === 'Tosin', 'Host receives player_joined with name');

  // 4. Host sends a question to all
  console.log('3. Host broadcasting a question...');
  host.send(JSON.stringify({
    type: 'new_question',
    to: 'all',
    payload: { text: 'What is 2+2?', choices: ['3', '4', '5', '6'], correctIndex: 1 },
  }));

  const question = await waitForMessage(player, 'new_question');
  assert(question.payload.text === 'What is 2+2?', 'Player receives the question');
  assert(question.payload.choices.length === 4, 'Question has 4 choices');

  // 5. Player sends answer to host
  console.log('4. Player sending answer...');
  player.send(JSON.stringify({
    type: 'answer_submitted',
    to: 'host',
    payload: { choice: 1, timeMs: 2500 },
  }));

  const answer = await waitForMessage(host, 'answer_submitted');
  assert(answer.payload.choice === 1, 'Host receives correct choice');
  assert(answer.payload.timeMs === 2500, 'Host receives correct timeMs');

  // 6. Disconnect player, host should get player_left
  console.log('5. Player disconnecting...');
  player.close();
  const left = await waitForMessage(host, 'player_left');
  assert(left.payload.playerName === 'Tosin', 'Host receives player_left');

  // Cleanup
  host.close();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
