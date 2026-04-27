/**
 * spec-bridge web client.
 *
 * Zero-dependency browser library for connecting phones/tablets/laptops
 * to Snap Spectacles experiences via the spec-bridge relay server.
 *
 * @example
 * ```js
 * const bridge = SpecBridge.connect({
 *   roomCode: 'QUIZ-A4F2',
 *   role: 'player',
 *   playerName: 'Tosin',
 * });
 *
 * bridge.on('new_question', (q) => renderQuestion(q));
 * bridge.send('answer_submitted', { choice: 2, timeMs: 3100 });
 * ```
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BridgeConfig {
  /** Room code to join (e.g., 'QUIZ-A4F2'). */
  roomCode: string;
  /** Role of this client. */
  role: 'host' | 'player';
  /** Display name (required for players). */
  playerName?: string;
  /** Relay server URL. Defaults to production endpoint. */
  relayUrl?: string;
}

interface BridgeMessage {
  type: string;
  from: string;
  to: string;
  payload: Record<string, any>;
  ts: number;
}

interface WelcomePayload {
  clientId: string;
  roomCode: string;
  role: string;
  playerCount: number;
}

type EventHandler = (payload: Record<string, any>) => void;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_RELAY_URL = 'wss://spec-bridge-relay.up.railway.app';
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 10;

// ---------------------------------------------------------------------------
// SpecBridge class
// ---------------------------------------------------------------------------

class SpecBridge {
  private config: Required<BridgeConfig>;
  private ws: WebSocket | null = null;
  private handlers: Map<string, EventHandler[]> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;
  private _clientId: string | null = null;
  private messageQueue: string[] = [];

  private constructor(config: BridgeConfig) {
    this.config = {
      relayUrl: DEFAULT_RELAY_URL,
      playerName: '',
      ...config,
    };
    this.connect();
  }

  /**
   * Create a new SpecBridge instance and connect to the relay.
   * This is the main entry point for the web client.
   */
  static connect(config: BridgeConfig): SpecBridge {
    return new SpecBridge(config);
  }

  /** Register a handler for a specific event type. */
  on(eventType: string, handler: EventHandler): SpecBridge {
    const list = this.handlers.get(eventType) || [];
    list.push(handler);
    this.handlers.set(eventType, list);
    return this;
  }

  /** Remove a handler for a specific event type. */
  off(eventType: string, handler: EventHandler): SpecBridge {
    const list = this.handlers.get(eventType);
    if (!list) return this;
    this.handlers.set(
      eventType,
      list.filter((h) => h !== handler)
    );
    return this;
  }

  /** Remove all handlers for an event type, or all handlers if no type given. */
  removeAllListeners(eventType?: string): SpecBridge {
    if (eventType) {
      this.handlers.delete(eventType);
    } else {
      this.handlers.clear();
    }
    return this;
  }

  /**
   * Send a message to connected clients via the relay.
   * Messages are queued if not yet connected and flushed on connect.
   */
  send(type: string, payload: Record<string, any> = {}, to = 'all'): void {
    const message: BridgeMessage = {
      type,
      from: this._clientId || this.config.playerName || this.config.role,
      to,
      payload,
      ts: Date.now(),
    };

    const raw = JSON.stringify(message);

    if (this.ws && this._connected) {
      this.ws.send(raw);
    } else {
      this.messageQueue.push(raw);
    }
  }

  /** Get the room code for this session. */
  getRoomCode(): string {
    return this.config.roomCode;
  }

  /** Get the client ID assigned by the relay server. */
  getClientId(): string | null {
    return this._clientId;
  }

  /** Whether the bridge is currently connected to the relay. */
  isConnected(): boolean {
    return this._connected;
  }

  /** Disconnect from the relay and stop reconnecting. */
  disconnect(): void {
    this.reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }

  // -------------------------------------------------------------------------
  // Connection management
  // -------------------------------------------------------------------------

  private connect(): void {
    const params = new URLSearchParams({
      room: this.config.roomCode,
      role: this.config.role,
      name: this.config.playerName,
    });

    const url = `${this.config.relayUrl}?${params.toString()}`;

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      console.error('[spec-bridge] WebSocket creation failed:', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('[spec-bridge] Connected to relay.');
      this._connected = true;
      this.reconnectAttempts = 0;
      this.flushQueue();
      this.emit('connected', {});
    };

    this.ws.onmessage = (event: MessageEvent) => {
      let msg: BridgeMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        console.warn('[spec-bridge] Failed to parse message:', event.data);
        return;
      }

      // Capture client ID from welcome message
      if (msg.type === 'welcome' && msg.payload) {
        const welcome = msg.payload as unknown as WelcomePayload;
        this._clientId = welcome.clientId;
      }

      this.emit(msg.type, msg.payload);
    };

    this.ws.onclose = (event: CloseEvent) => {
      console.log('[spec-bridge] Disconnected:', event.code, event.reason);
      this._connected = false;
      this.emit('disconnected', { code: event.code, reason: event.reason });

      // Don't reconnect if server rejected us
      if (event.code === 4000) return;

      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after this — no need to handle separately
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[spec-bridge] Max reconnect attempts reached.');
      this.emit('connection_failed', {
        attempts: this.reconnectAttempts,
      });
      return;
    }

    this.reconnectAttempts++;
    const delay = RECONNECT_DELAY_MS * Math.min(this.reconnectAttempts, 5);

    console.log(
      `[spec-bridge] Reconnecting in ${delay}ms ` +
        `(${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private flushQueue(): void {
    if (!this.ws || !this._connected) return;
    while (this.messageQueue.length > 0) {
      const raw = this.messageQueue.shift()!;
      this.ws.send(raw);
    }
  }

  private emit(eventType: string, payload: Record<string, any>): void {
    const list = this.handlers.get(eventType);
    if (!list) return;
    for (const handler of list) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[spec-bridge] Handler error for '${eventType}':`, err);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// UMD export — makes `SpecBridge` available as a global when loaded via <script>
// and as a module export when bundled.
// ---------------------------------------------------------------------------

// esbuild wraps this in an IIFE with --global-name=SpecBridgeLib,
// so we also attach to window for direct <script> usage.
if (typeof window !== 'undefined') {
  (window as any).SpecBridge = SpecBridge;
}

export { SpecBridge };
export type { BridgeConfig, BridgeMessage, EventHandler };
