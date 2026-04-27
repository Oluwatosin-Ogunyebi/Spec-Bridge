/**
 * QuizHost — Main orchestrator for the Voice-Powered Quiz Host demo.
 *
 * Wires together SpecBridge (networking), QuizGenerator (AI),
 * VoiceListener (ASR), QuestionDisplay (3D UI), and PlayerScoreboard.
 */

import { SpecBridge } from '../packages/spectacles/SpecBridge';
import { QuizGenerator } from '../packages/spectacles/QuizGenerator';
import { PlayerInfo, QuizQuestion, AnswerSubmission } from '../packages/spectacles/types';

const QUESTION_TIME_MS = 15000;
const SCOREBOARD_DISPLAY_MS = 3000;
const SPEED_BONUS_THRESHOLD_MS = 5000;
const POINTS_CORRECT = 100;
const POINTS_SPEED_BONUS = 50;

@component
export class QuizHost extends BaseScriptComponent {
  @input asrModule: any;
  @input remoteService: any;
  @input questionDisplay: QuestionDisplay;
  @input scoreboard: PlayerScoreboard;

  private bridge: SpecBridge;
  private quizGen: QuizGenerator;
  private voiceListener: VoiceListener;
  private players: Map<string, PlayerInfo> = new Map();
  private currentQuestion: QuizQuestion | null = null;
  private questionStartTime = 0;
  private answeredThisRound: Set<string> = new Set();
  private isQuizActive = false;

  onAwake() {
    const roomCode = SpecBridge.generateRoomCode();

    this.bridge = new SpecBridge({
      roomCode,
      role: 'host',
    });

    this.quizGen = new QuizGenerator({
      remoteService: this.remoteService,
      provider: 'claude',
    });

    this.voiceListener = new VoiceListener(this.asrModule);

    this.setupNetworking();
    this.setupVoice();

    print('[QuizHost] Room code: ' + roomCode);
    this.questionDisplay.showRoomCode(roomCode);
  }

  /** Wire up all network event handlers. */
  private setupNetworking(): void {
    this.bridge.on('player_joined', (data) => {
      const player: PlayerInfo = {
        id: data.playerId as string,
        name: data.playerName as string,
        score: 0,
        lockedOut: false,
      };
      this.players.set(player.id, player);
      print('[QuizHost] Player joined: ' + player.name);
      this.scoreboard.updatePlayers(this.getPlayerArray());
    });

    this.bridge.on('player_left', (data) => {
      this.players.delete(data.playerId as string);
      this.scoreboard.updatePlayers(this.getPlayerArray());
    });

    this.bridge.on('answer_submitted', (data) => {
      this.handleAnswer({
        playerId: data.playerId as string,
        choice: data.choice as number,
        timeMs: data.timeMs as number,
      });
    });
  }

  /** Set up voice listening for topic capture. */
  private setupVoice(): void {
    this.voiceListener.onResult((transcript: string) => {
      if (!this.isQuizActive && transcript.length > 0) {
        print('[QuizHost] Topic captured: ' + transcript);
        this.startQuiz(transcript);
      }
    });
  }

  /** Generate questions and run the quiz loop. */
  async startQuiz(topic: string): Promise<void> {
    if (this.isQuizActive) return;
    this.isQuizActive = true;

    // Reset scores
    for (const player of this.players.values()) {
      player.score = 0;
      player.lockedOut = false;
    }

    // Notify players quiz is loading
    this.bridge.send('quiz_loading', { topic });
    this.questionDisplay.showLoading('Brewing your quiz...');

    try {
      const quiz = await this.quizGen.generate({
        topic,
        count: 10,
        difficulty: 'medium',
      });

      for (let i = 0; i < quiz.questions.length; i++) {
        await this.runQuestion(quiz.questions[i], i + 1, quiz.questions.length);
        await this.showScoreboardBreak();
      }

      // Final scoreboard
      const scores = this.getScoresSorted();
      this.bridge.send('quiz_complete', { scores });
      this.scoreboard.showFinal(scores);
      this.questionDisplay.showNewTopicPrompt();
    } catch (err) {
      print('[QuizHost] Quiz generation failed: ' + err);
      this.bridge.send('quiz_error', {
        message: 'Failed to generate quiz. Try another topic!',
      });
      this.questionDisplay.showError('Quiz generation failed. Say a new topic!');
    }

    this.isQuizActive = false;
  }

  /** Run a single question round. */
  private async runQuestion(
    question: QuizQuestion,
    number: number,
    total: number
  ): Promise<void> {
    this.currentQuestion = question;
    this.questionStartTime = Date.now();
    this.answeredThisRound.clear();

    // Reset lockouts
    for (const player of this.players.values()) {
      player.lockedOut = false;
    }

    // Send question to all players
    this.bridge.send('new_question', {
      id: question.id,
      text: question.text,
      choices: question.choices,
      number,
      total,
      timeMs: QUESTION_TIME_MS,
    });

    // Display on Spectacles
    this.questionDisplay.showQuestion(question.text, number, total);

    // Wait for question timer
    await this.wait(QUESTION_TIME_MS);

    // Send correct answer reveal
    this.bridge.send('question_result', {
      id: question.id,
      correctIndex: question.correctIndex,
      explanation: question.explanation,
    });

    this.questionDisplay.showAnswer(
      question.choices[question.correctIndex],
      question.explanation
    );

    this.currentQuestion = null;
  }

  /** Handle an answer submission from a player. */
  private handleAnswer(submission: AnswerSubmission): void {
    if (!this.currentQuestion) return;

    const player = this.players.get(submission.playerId);
    if (!player || player.lockedOut) return;
    if (this.answeredThisRound.has(submission.playerId)) return;

    this.answeredThisRound.add(submission.playerId);

    const isCorrect = submission.choice === this.currentQuestion.correctIndex;

    if (isCorrect) {
      player.score += POINTS_CORRECT;
      if (submission.timeMs < SPEED_BONUS_THRESHOLD_MS) {
        player.score += POINTS_SPEED_BONUS;
      }
    } else {
      player.lockedOut = true;
    }

    // Send result back to the specific player
    this.bridge.send(
      'answer_result',
      {
        correct: isCorrect,
        score: player.score,
        lockedOut: player.lockedOut,
      },
      submission.playerId
    );

    this.scoreboard.updatePlayers(this.getPlayerArray());
  }

  /** Show the scoreboard for a few seconds between questions. */
  private async showScoreboardBreak(): Promise<void> {
    const top3 = this.getScoresSorted().slice(0, 3);
    this.bridge.send('scoreboard_update', { scores: top3 });
    this.scoreboard.showTop3(top3);
    await this.wait(SCOREBOARD_DISPLAY_MS);
  }

  /** Get all players sorted by score descending. */
  private getScoresSorted(): PlayerInfo[] {
    return this.getPlayerArray().sort((a, b) => b.score - a.score);
  }

  /** Get players as an array. */
  private getPlayerArray(): PlayerInfo[] {
    return Array.from(this.players.values());
  }

  /** Promise-based delay. */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const event = this.createEvent('DelayedCallbackEvent');
      event.bind(() => resolve());
      this.getSceneObject()
        .getTransform()
        .getWorldPosition(); // keep alive
      setTimeout(() => resolve(), ms);
    });
  }
}
