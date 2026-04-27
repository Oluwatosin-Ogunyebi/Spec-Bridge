/**
 * VoiceListener — ASR wrapper for capturing spoken topics on Spectacles.
 *
 * Uses Snap's ASR (Automatic Speech Recognition) API to convert speech to text.
 * Provides a simple callback interface for the QuizHost orchestrator.
 *
 * @example
 * ```typescript
 * const listener = new VoiceListener(asrModule);
 * listener.onResult((text) => print('User said: ' + text));
 * listener.startListening();
 * ```
 */

type ResultCallback = (transcript: string) => void;

export class VoiceListener {
  private asrModule: any;
  private callback: ResultCallback | null = null;
  private listening = false;

  constructor(asrModule: any) {
    this.asrModule = asrModule;
    this.setupCallbacks();
  }

  /** Register a callback for when speech is recognized. */
  onResult(callback: ResultCallback): void {
    this.callback = callback;
  }

  /** Start listening for speech input. */
  startListening(): void {
    if (this.listening) return;

    try {
      this.asrModule.start();
      this.listening = true;
      print('[VoiceListener] Listening started.');
    } catch (err) {
      print('[VoiceListener] Failed to start ASR: ' + err);
    }
  }

  /** Stop listening for speech input. */
  stopListening(): void {
    if (!this.listening) return;

    try {
      this.asrModule.stop();
      this.listening = false;
      print('[VoiceListener] Listening stopped.');
    } catch (err) {
      print('[VoiceListener] Failed to stop ASR: ' + err);
    }
  }

  /** Whether the listener is currently active. */
  isListening(): boolean {
    return this.listening;
  }

  /** Wire up ASR module event handlers. */
  private setupCallbacks(): void {
    if (!this.asrModule) {
      print('[VoiceListener] No ASR module provided.');
      return;
    }

    // Snap ASR API callback for final transcription result
    this.asrModule.onTranscriptionCompleted.add((result: any) => {
      const transcript = this.sanitize(result.text || '');
      if (transcript.length > 0 && this.callback) {
        print('[VoiceListener] Recognized: ' + transcript);
        this.callback(transcript);
      }
      this.listening = false;
    });

    // Handle ASR errors gracefully
    this.asrModule.onError.add((error: any) => {
      print('[VoiceListener] ASR error: ' + error);
      this.listening = false;
    });
  }

  /** Sanitize transcript — trim whitespace, strip special characters. */
  private sanitize(text: string): string {
    return text
      .trim()
      .replace(/[<>"'&]/g, '')  // strip HTML-sensitive chars
      .slice(0, 200);            // cap length
  }
}
