/**
 * spec-bridge relay server.
 *
 * Routes WebSocket messages between Spectacles (host) and web browsers (players).
 * Persists room state and quiz history to Supabase.
 *
 * Usage:
 *   cp .env.example .env   # fill in Supabase credentials
 *   npm install
 *   npm start
 */

import { WebSocketServer } from 'ws';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'http';
import { parse } from 'url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || '3000', 10);
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || '';

const supabase =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

if (!supabase) {
  console.warn(
    '[relay] Supabase credentials missing — running without persistence.'
  );
}

// ---------------------------------------------------------------------------
// Room state (in-memory)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Client
 * @property {import('ws').WebSocket} ws
 * @property {'host'|'player'} role
 * @property {string} name
 * @property {string} id
 */

/** @type {Map<string, Client[]>} roomCode → clients */
const rooms = new Map();

/** Generate a unique client ID. */
function makeClientId() {
  return Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------------------
// HTTP server + health check
// ---------------------------------------------------------------------------

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        rooms: rooms.size,
        uptime: process.uptime(),
      })
    );
    return;
  }

  // Simple landing page
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('spec-bridge relay server. Connect via WebSocket.');
});

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  const params = parse(req.url || '', true).query;
  const roomCode = /** @type {string} */ (params.room || '');
  const role = /** @type {'host'|'player'} */ (params.role || 'player');
  const name = /** @type {string} */ (params.name || 'Anonymous');

  if (!roomCode) {
    ws.close(4000, 'Missing room code');
    return;
  }

  const clientId = makeClientId();

  /** @type {Client} */
  const client = { ws, role, name, id: clientId };

  // Join room
  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, []);
    onRoomCreated(roomCode, role);
  }
  rooms.get(roomCode).push(client);

  console.log(
    `[relay] ${role}:${name} (${clientId}) joined room ${roomCode} ` +
      `(${rooms.get(roomCode).length} clients)`
  );

  // Notify host that a player joined
  if (role === 'player') {
    broadcastToRoom(roomCode, {
      type: 'player_joined',
      from: clientId,
      to: 'host',
      payload: { playerId: clientId, playerName: name },
      ts: Date.now(),
    });
  }

  // Send the client their assigned ID
  sendTo(ws, {
    type: 'welcome',
    from: 'server',
    to: clientId,
    payload: {
      clientId,
      roomCode,
      role,
      playerCount: rooms.get(roomCode).filter((c) => c.role === 'player')
        .length,
    },
    ts: Date.now(),
  });

  // Notify all clients of updated player count
  broadcastToRoom(roomCode, {
    type: 'player_count',
    from: 'server',
    to: 'all',
    payload: {
      count: rooms.get(roomCode).filter((c) => c.role === 'player').length,
    },
    ts: Date.now(),
  });

  // ---------------------------------------------------------------------------
  // Message handling
  // ---------------------------------------------------------------------------

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(
        JSON.stringify({
          type: 'error',
          from: 'server',
          to: clientId,
          payload: { message: 'Invalid JSON' },
          ts: Date.now(),
        })
      );
      return;
    }

    // Stamp sender info
    msg.from = clientId;
    msg.ts = Date.now();

    // Route the message
    if (msg.to === 'all') {
      broadcastToRoom(roomCode, msg, clientId);
    } else if (msg.to === 'host') {
      sendToRole(roomCode, 'host', msg);
    } else {
      // Send to specific client
      sendToClient(roomCode, msg.to, msg);
    }

    // Log to Supabase (fire and forget)
    logMessage(roomCode, msg);
  });

  // ---------------------------------------------------------------------------
  // Disconnect
  // ---------------------------------------------------------------------------

  ws.on('close', () => {
    const roomClients = rooms.get(roomCode);
    if (roomClients) {
      const idx = roomClients.findIndex((c) => c.id === clientId);
      if (idx !== -1) roomClients.splice(idx, 1);

      console.log(
        `[relay] ${role}:${name} (${clientId}) left room ${roomCode} ` +
          `(${roomClients.length} clients)`
      );

      // Notify remaining clients
      broadcastToRoom(roomCode, {
        type: 'player_left',
        from: clientId,
        to: 'all',
        payload: { playerId: clientId, playerName: name },
        ts: Date.now(),
      });

      // Update player count
      broadcastToRoom(roomCode, {
        type: 'player_count',
        from: 'server',
        to: 'all',
        payload: {
          count: roomClients.filter((c) => c.role === 'player').length,
        },
        ts: Date.now(),
      });

      // Clean up empty rooms
      if (roomClients.length === 0) {
        rooms.delete(roomCode);
        onRoomClosed(roomCode);
        console.log(`[relay] Room ${roomCode} closed (empty).`);
      }
    }
  });

  ws.on('error', (err) => {
    console.error(`[relay] WebSocket error for ${clientId}:`, err.message);
  });
});

// ---------------------------------------------------------------------------
// Message routing helpers
// ---------------------------------------------------------------------------

/**
 * Send a message object to a single WebSocket.
 * @param {import('ws').WebSocket} ws
 * @param {object} msg
 */
function sendTo(ws, msg) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/**
 * Broadcast a message to all clients in a room, optionally excluding a sender.
 * @param {string} roomCode
 * @param {object} msg
 * @param {string} [excludeId]
 */
function broadcastToRoom(roomCode, msg, excludeId) {
  const clients = rooms.get(roomCode);
  if (!clients) return;
  for (const client of clients) {
    if (client.id !== excludeId) {
      sendTo(client.ws, msg);
    }
  }
}

/**
 * Send a message to all clients with a specific role in a room.
 * @param {string} roomCode
 * @param {'host'|'player'} role
 * @param {object} msg
 */
function sendToRole(roomCode, role, msg) {
  const clients = rooms.get(roomCode);
  if (!clients) return;
  for (const client of clients) {
    if (client.role === role) {
      sendTo(client.ws, msg);
    }
  }
}

/**
 * Send a message to a specific client by ID.
 * @param {string} roomCode
 * @param {string} targetId
 * @param {object} msg
 */
function sendToClient(roomCode, targetId, msg) {
  const clients = rooms.get(roomCode);
  if (!clients) return;
  const target = clients.find((c) => c.id === targetId);
  if (target) {
    sendTo(target.ws, msg);
  }
}

// ---------------------------------------------------------------------------
// Supabase persistence (optional, fire-and-forget)
// ---------------------------------------------------------------------------

/**
 * Record room creation in Supabase.
 * @param {string} roomCode
 * @param {string} createdByRole
 */
async function onRoomCreated(roomCode, createdByRole) {
  if (!supabase) return;
  try {
    await supabase.from('rooms').insert({
      room_code: roomCode,
      created_by_role: createdByRole,
      status: 'active',
    });
  } catch (err) {
    console.error('[relay] Supabase room insert failed:', err.message);
  }
}

/**
 * Mark a room as closed in Supabase.
 * @param {string} roomCode
 */
async function onRoomClosed(roomCode) {
  if (!supabase) return;
  try {
    await supabase
      .from('rooms')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('room_code', roomCode);
  } catch (err) {
    console.error('[relay] Supabase room update failed:', err.message);
  }
}

/**
 * Log a message to Supabase for audit/debugging.
 * @param {string} roomCode
 * @param {object} msg
 */
async function logMessage(roomCode, msg) {
  if (!supabase) return;
  try {
    await supabase.from('message_log').insert({
      room_code: roomCode,
      message_type: msg.type,
      from_id: msg.from,
      to_target: msg.to,
      payload: msg.payload,
    });
  } catch (err) {
    // Silently drop — logging should never break the server
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown() {
  console.log('[relay] Shutting down...');
  wss.clients.forEach((ws) => ws.close(1001, 'Server shutting down'));
  httpServer.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

httpServer.listen(PORT, () => {
  console.log(`[relay] spec-bridge relay server listening on :${PORT}`);
  console.log(`[relay] Health check: http://localhost:${PORT}/health`);
  console.log(
    `[relay] Supabase: ${supabase ? 'connected' : 'disabled (no credentials)'}`
  );
});
