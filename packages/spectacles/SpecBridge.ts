/**
 * SpecBridge — Networking core for Spectacles ↔ Web communication.
 *
 * Provides a simple event-based messaging layer over WebSocket,
 * designed to run inside Lens Studio on Snap Spectacles.
 *
 * @example
 * ```typescript
 * const bridge = new SpecBridge({ roomCode: 'QUIZ-A4F2', role: 'host' });
 * bridge.on('player_joined', (data) => print('Welcome ' + data.playerName));
 * bridge.send('quiz_loading', { topic: 'JavaScript' });
 * ```
 */

import { BridgeConfig, BridgeMessage } from './types';

const DEFAULT_RELAY_URL = 'wss://spec-bridge-production.up.railway.app';
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 5;

type EventHandler = (payload: Record<string, unknown>) => void;

export class SpecBridge {
  private config: Required<BridgeConfig>;
  private ws: WebSocket | null = null;
  private handlers: Map<string, EventHandler[]> = new Map();
  private reconnectAttempts = 0;
  private connected = false;

  constructor(config: BridgeConfig) {
    this.config = {
      relayUrl: DEFAULT_RELAY_URL,
      playerName: '',
      ...config,
    };
    this.connect();
  }

  /** Register a handler for a specific event type. */
  on(eventType: string, handler: EventHandler): void {
    const list = this.handlers.get(eventType) || [];
    list.push(handler);
    this.handlers.set(eventType, list);
  }

  /** Remove a handler for a specific event type. */
  off(eventType: string, handler: EventHandler): void {
    const list = this.handlers.get(eventType);
    if (!list) return;
    this.handlers.set(
      eventType,
      list.filter((h) => h !== handler)
    );
  }

  /** Send a message to connected clients. */
  send(type: string, payload: Record<string, unknown> = {}, to = 'all'): void {
    if (!this.ws || !this.connected) {
      print('[SpecBridge] Not connected — message queued locally.');
      return;
    }

    const message: BridgeMessage = {
      type,
      from: this.config.role === 'host' ? 'host' : this.config.playerName,
      to,
      payload,
      ts: Date.now(),
    };

    this.ws.send(JSON.stringify(message));
  }

  /** Get the current room code. */
  getRoomCode(): string {
    return this.config.roomCode;
  }

  /** Whether the bridge is currently connected. */
  isConnected(): boolean {
    return this.connected;
  }

  /** Disconnect and clean up. */
  disconnect(): void {
    this.reconnectAttempts = MAX_RECONNECT_ATTEMPTS; // prevent reconnect
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  /** Generate a random 4-character room code. */
  static generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private connect(): void {
    const url = `${this.config.relayUrl}?room=${this.config.roomCode}&role=${this.config.role}&name=${encodeURIComponent(this.config.playerName)}`;

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      print('[SpecBridge] WebSocket creation failed: ' + err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      print('[SpecBridge] Connected to relay.');
      this.connected = true;
      this.reconnectAttempts = 0;
      this.emit('connected', {});
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg: BridgeMessage = JSON.parse(event.data as string);
        this.emit(msg.type, msg.payload);
      } catch (err) {
        print('[SpecBridge] Failed to parse message: ' + err);
      }
    };

    this.ws.onclose = () => {
      print('[SpecBridge] Disconnected from relay.');
      this.connected = false;
      this.emit('disconnected', {});
      this.scheduleReconnect();
    };

    this.ws.onerror = (err: Event) => {
      print('[SpecBridge] WebSocket error: ' + err);
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      print('[SpecBridge] Max reconnect attempts reached.');
      this.emit('connection_failed', {});
      return;
    }
    this.reconnectAttempts++;
    print(
      `[SpecBridge] Reconnecting (${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`
    );
    setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
  }

  private emit(eventType: string, payload: Record<string, unknown>): void {
    const list = this.handlers.get(eventType);
    if (!list) return;
    for (const handler of list) {
      try {
        handler(payload);
      } catch (err) {
        print(`[SpecBridge] Handler error for '${eventType}': ${err}`);
      }
    }
  }
}
