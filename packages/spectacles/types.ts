/**
 * Core types for spec-bridge Spectacles module.
 */

/** Message format used across the spec-bridge protocol. */
export interface BridgeMessage {
  /** Event type identifier (e.g., 'player_joined', 'new_question'). */
  type: string;
  /** Sender identifier — 'host' or a player ID. */
  from: string;
  /** Target — 'all', 'host', or a specific player ID. */
  to: string;
  /** Arbitrary event payload. */
  payload: Record<string, unknown>;
  /** Unix timestamp in milliseconds. */
  ts: number;
}

/** Configuration for creating a SpecBridge instance. */
export interface BridgeConfig {
  /** Room code for this session (e.g., 'QUIZ-A4F2'). */
  roomCode: string;
  /** Role of this client. */
  role: 'host' | 'player';
  /** Display name (required for players). */
  playerName?: string;
  /** Relay server URL. Defaults to production endpoint. */
  relayUrl?: string;
}

/** A single quiz question. */
export interface QuizQuestion {
  /** 1-based question ID. */
  id: number;
  /** The question text (max 120 chars). */
  text: string;
  /** Exactly 4 answer choices. */
  choices: [string, string, string, string];
  /** 0-based index of the correct choice. */
  correctIndex: number;
  /** Brief explanation of the correct answer. */
  explanation: string;
}

/** Full quiz payload returned by QuizGenerator. */
export interface QuizPayload {
  /** The topic that was requested. */
  topic: string;
  /** Array of generated questions. */
  questions: QuizQuestion[];
}

/** Configuration for QuizGenerator. */
export interface QuizGeneratorConfig {
  /** RemoteServiceModule reference from Lens Studio. */
  remoteService: any;
  /** AI provider to use. */
  provider: 'claude' | 'openai' | 'gemini';
}

/** Parameters for a quiz generation request. */
export interface GenerateParams {
  /** Topic to generate questions about. */
  topic: string;
  /** Number of questions to generate. */
  count: number;
  /** Difficulty level. */
  difficulty: 'easy' | 'medium' | 'hard';
}

/** Player info tracked by the host. */
export interface PlayerInfo {
  /** Unique player ID (assigned by relay). */
  id: string;
  /** Display name chosen by the player. */
  name: string;
  /** Current score. */
  score: number;
  /** Whether the player is locked out for the current question. */
  lockedOut: boolean;
}

/** Answer submission from a player. */
export interface AnswerSubmission {
  /** Player who submitted. */
  playerId: string;
  /** 0-based index of chosen answer. */
  choice: number;
  /** Time in ms from question display to answer. */
  timeMs: number;
}

/** Typed error for quiz generation failures. */
export class QuizGenerationError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'QuizGenerationError';
  }
}
