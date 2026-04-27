/**
 * PlayerScoreboard — Live score display for Spectacles.
 *
 * Shows current player scores, top-3 breakdowns between questions,
 * and the final leaderboard at quiz end.
 *
 * Wire up in Lens Studio by assigning Text components for each score slot.
 */

import { PlayerInfo } from '../packages/spectacles/types';

const MAX_DISPLAY_SLOTS = 5;

@component
export class PlayerScoreboard extends BaseScriptComponent {
  @input headerText: Text;
  @input slot1Text: Text;
  @input slot2Text: Text;
  @input slot3Text: Text;
  @input slot4Text: Text;
  @input slot5Text: Text;
  @input panelObject: SceneObject;

  private slots: Text[] = [];

  onAwake() {
    this.slots = [
      this.slot1Text,
      this.slot2Text,
      this.slot3Text,
      this.slot4Text,
      this.slot5Text,
    ].filter((s) => s != null);

    this.clearAll();
  }

  /** Update the full player list (sorted by score). */
  updatePlayers(players: PlayerInfo[]): void {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    this.setHeader(`Players: ${players.length}`);
    this.renderSlots(sorted);
    this.setVisible(true);
  }

  /** Show the top 3 players between questions. */
  showTop3(players: PlayerInfo[]): void {
    this.setHeader('Top 3');
    this.renderSlots(players.slice(0, 3));
    this.setVisible(true);
  }

  /** Show the final scoreboard at quiz end. */
  showFinal(players: PlayerInfo[]): void {
    this.setHeader('Final Scores');
    this.renderSlots(players);
    this.setVisible(true);
  }

  /** Hide the scoreboard panel. */
  hide(): void {
    this.setVisible(false);
  }

  /** Render players into the available text slots. */
  private renderSlots(players: PlayerInfo[]): void {
    for (let i = 0; i < this.slots.length; i++) {
      if (i < players.length) {
        const p = players[i];
        const medal = i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}th`;
        this.slots[i].text = `${medal}  ${this.sanitize(p.name)}  ${p.score}pts`;
      } else {
        this.slots[i].text = '';
      }
    }
  }

  private setHeader(text: string): void {
    if (this.headerText) this.headerText.text = text;
  }

  private setVisible(visible: boolean): void {
    if (this.panelObject) this.panelObject.enabled = visible;
  }

  private clearAll(): void {
    this.setHeader('');
    for (const slot of this.slots) {
      slot.text = '';
    }
  }

  /** Strip dangerous characters from player names. */
  private sanitize(text: string): string {
    return text.replace(/[<>"'&]/g, '').slice(0, 30);
  }
}
