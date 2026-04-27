/**
 * QuestionDisplay — 3D floating panel for showing quiz content on Spectacles.
 *
 * Manages the visual state of the quiz HUD: room code, loading shimmer,
 * question text, answer reveals, and error messages.
 *
 * Wire this up in Lens Studio by assigning Text components to the inputs.
 */

@component
export class QuestionDisplay extends BaseScriptComponent {
  @input titleText: Text;
  @input bodyText: Text;
  @input subtitleText: Text;
  @input panelObject: SceneObject;

  onAwake() {
    this.clearAll();
  }

  /** Show the room code and "Say a topic" prompt in the lobby. */
  showRoomCode(code: string): void {
    this.setVisible(true);
    this.setTitle('Room: ' + code);
    this.setBody('Say a topic to begin!');
    this.setSubtitle('Pinch to listen');
  }

  /** Show a loading message while AI generates questions. */
  showLoading(message: string): void {
    this.setVisible(true);
    this.setTitle('');
    this.setBody(message);
    this.setSubtitle('');
  }

  /** Show a question with its number and total count. */
  showQuestion(text: string, number: number, total: number): void {
    this.setVisible(true);
    this.setTitle(`Question ${number} of ${total}`);
    this.setBody(this.sanitize(text));
    this.setSubtitle('');
  }

  /** Show the correct answer and explanation after a round. */
  showAnswer(correctAnswer: string, explanation: string): void {
    this.setVisible(true);
    this.setTitle('Correct Answer');
    this.setBody(this.sanitize(correctAnswer));
    this.setSubtitle(this.sanitize(explanation));
  }

  /** Show an error message. */
  showError(message: string): void {
    this.setVisible(true);
    this.setTitle('Oops!');
    this.setBody(message);
    this.setSubtitle('');
  }

  /** Show the "New Topic" prompt after quiz ends. */
  showNewTopicPrompt(): void {
    this.setVisible(true);
    this.setTitle('Quiz Complete!');
    this.setBody('Say a new topic to play again');
    this.setSubtitle('Pinch to listen');
  }

  /** Hide the display panel. */
  hide(): void {
    this.setVisible(false);
  }

  /** Clear all text fields. */
  private clearAll(): void {
    this.setTitle('');
    this.setBody('');
    this.setSubtitle('');
  }

  private setTitle(text: string): void {
    if (this.titleText) this.titleText.text = text;
  }

  private setBody(text: string): void {
    if (this.bodyText) this.bodyText.text = text;
  }

  private setSubtitle(text: string): void {
    if (this.subtitleText) this.subtitleText.text = text;
  }

  private setVisible(visible: boolean): void {
    if (this.panelObject) this.panelObject.enabled = visible;
  }

  /** Strip any potentially dangerous characters from AI-generated text. */
  private sanitize(text: string): string {
    return text.replace(/[<>"'&]/g, '').slice(0, 200);
  }
}
