/**
 * Quiz Buzzer — Phone client for the spec-bridge Voice Quiz Host demo.
 *
 * Screens: Join → Lobby → Loading → Question → Result → Scoreboard
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let bridge = null;
  let playerName = '';
  let myScore = 0;
  let questionStartTime = 0;
  let answered = false;
  let lockedOut = false;
  let timerInterval = null;
  let currentQuestionTime = 15000;

  // ---------------------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------------------

  const $ = (id) => document.getElementById(id);

  const screens = {
    join: $('screen-join'),
    lobby: $('screen-lobby'),
    loading: $('screen-loading'),
    question: $('screen-question'),
    result: $('screen-result'),
    scoreboard: $('screen-scoreboard'),
  };

  // ---------------------------------------------------------------------------
  // Screen management
  // ---------------------------------------------------------------------------

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  // ---------------------------------------------------------------------------
  // Join screen
  // ---------------------------------------------------------------------------

  $('join-form').addEventListener('submit', (e) => {
    e.preventDefault();

    const roomCode = $('room-code').value.trim().toUpperCase();
    playerName = $('player-name').value.trim();
    const errorEl = $('join-error');

    if (roomCode.length !== 4) {
      errorEl.textContent = 'Room code must be 4 characters.';
      errorEl.classList.remove('hidden');
      return;
    }
    if (!playerName) {
      errorEl.textContent = 'Please enter your name.';
      errorEl.classList.remove('hidden');
      return;
    }

    errorEl.classList.add('hidden');

    // Determine relay URL — use localhost for dev, production otherwise
    const relayUrl =
      location.hostname === 'localhost' || location.hostname === '127.0.0.1'
        ? 'ws://localhost:3000'
        : undefined; // falls back to default production URL

    bridge = SpecBridge.connect({
      roomCode: roomCode,
      role: 'player',
      playerName: playerName,
      relayUrl: relayUrl,
    });

    setupBridgeEvents();
    showScreen('lobby');
    $('lobby-room-code').textContent = roomCode;
  });

  // ---------------------------------------------------------------------------
  // Bridge events
  // ---------------------------------------------------------------------------

  function setupBridgeEvents() {
    bridge.on('welcome', (data) => {
      $('lobby-player-count').textContent = data.playerCount;
    });

    bridge.on('player_count', (data) => {
      $('lobby-player-count').textContent = data.count;
    });

    bridge.on('quiz_loading', (data) => {
      showScreen('loading');
      $('loading-msg').textContent = 'Quiz on: ' + sanitize(data.topic);
    });

    bridge.on('new_question', (data) => {
      showQuestion(data);
    });

    bridge.on('answer_result', (data) => {
      showResult(data);
    });

    bridge.on('question_result', (data) => {
      revealCorrectAnswer(data);
    });

    bridge.on('scoreboard_update', (data) => {
      // Brief scoreboard between questions — handled by next new_question
    });

    bridge.on('quiz_complete', (data) => {
      showFinalScoreboard(data.scores);
    });

    bridge.on('quiz_error', (data) => {
      showScreen('loading');
      $('loading-msg').textContent = sanitize(data.message);
    });

    bridge.on('disconnected', () => {
      // Show error on current screen
      const errorEl = $('join-error');
      if (errorEl) {
        errorEl.textContent = 'Disconnected from server. Reconnecting...';
        errorEl.classList.remove('hidden');
      }
    });

    bridge.on('connected', () => {
      const errorEl = $('join-error');
      if (errorEl) errorEl.classList.add('hidden');
    });

    bridge.on('connection_failed', () => {
      showScreen('join');
      const errorEl = $('join-error');
      errorEl.textContent = 'Could not connect. Check your room code and try again.';
      errorEl.classList.remove('hidden');
    });
  }

  // ---------------------------------------------------------------------------
  // Question screen
  // ---------------------------------------------------------------------------

  function showQuestion(data) {
    showScreen('question');
    answered = false;
    lockedOut = false;
    questionStartTime = Date.now();
    currentQuestionTime = data.timeMs || 15000;

    $('q-number').textContent = data.number + '/' + data.total;
    $('q-text').textContent = sanitize(data.text);
    $('q-feedback').classList.add('hidden');

    // Render choices
    const container = $('q-choices');
    container.innerHTML = '';
    const labels = ['A', 'B', 'C', 'D'];

    data.choices.forEach((choice, i) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.innerHTML =
        '<span class="choice-label">' + labels[i] + '</span>' + sanitize(choice);
      btn.addEventListener('click', () => submitAnswer(i, btn));
      container.appendChild(btn);
    });

    // Start timer bar
    startTimer(currentQuestionTime);
  }

  function submitAnswer(choiceIndex, btnEl) {
    if (answered || lockedOut) return;
    answered = true;

    const timeMs = Date.now() - questionStartTime;

    // Highlight selected
    btnEl.classList.add('selected');

    // Disable all buttons
    const buttons = $('q-choices').querySelectorAll('.choice-btn');
    buttons.forEach((b) => (b.disabled = true));

    bridge.send('answer_submitted', {
      playerId: bridge.getClientId(),
      choice: choiceIndex,
      timeMs: timeMs,
    });
  }

  function startTimer(durationMs) {
    const fill = $('timer-fill');
    fill.style.transition = 'none';
    fill.style.width = '100%';

    // Force reflow
    fill.offsetHeight;

    fill.style.transition = 'width ' + durationMs + 'ms linear';
    fill.style.width = '0%';

    clearInterval(timerInterval);
  }

  // ---------------------------------------------------------------------------
  // Result screen (between questions)
  // ---------------------------------------------------------------------------

  function showResult(data) {
    showScreen('result');

    const icon = $('result-icon');
    const msg = $('result-msg');
    const score = $('result-score');

    myScore = data.score;

    if (data.correct) {
      icon.className = 'result-icon correct';
      icon.textContent = '+';
      msg.textContent = 'Correct!';
      msg.style.color = 'var(--success)';
    } else {
      icon.className = 'result-icon wrong';
      icon.textContent = 'X';
      msg.textContent = 'Wrong!';
      msg.style.color = 'var(--danger)';
      lockedOut = data.lockedOut;
    }

    score.textContent = 'Score: ' + myScore + ' pts';
  }

  function revealCorrectAnswer(data) {
    // If still on question screen, highlight the correct answer
    if (screens.question.classList.contains('active')) {
      const buttons = $('q-choices').querySelectorAll('.choice-btn');
      buttons.forEach((b, i) => {
        b.disabled = true;
        if (i === data.correctIndex) {
          b.classList.add('correct');
        }
      });

      const feedback = $('q-feedback');
      feedback.textContent = sanitize(data.explanation);
      feedback.classList.remove('hidden');
    }
  }

  // ---------------------------------------------------------------------------
  // Final scoreboard
  // ---------------------------------------------------------------------------

  function showFinalScoreboard(scores) {
    showScreen('scoreboard');
    $('scoreboard-title').textContent = 'Final Scores';

    const list = $('scoreboard-list');
    list.innerHTML = '';

    scores.forEach((player, i) => {
      const li = document.createElement('li');
      const rank = i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : (i + 1) + 'th';
      li.innerHTML =
        '<span class="score-rank">' + rank + '</span>' +
        '<span class="score-name">' + sanitize(player.name) + '</span>' +
        '<span class="score-pts">' + player.score + ' pts</span>';
      list.appendChild(li);
    });

    const playAgainBtn = $('btn-play-again');
    playAgainBtn.classList.remove('hidden');
    playAgainBtn.onclick = () => {
      showScreen('lobby');
      playAgainBtn.classList.add('hidden');
    };
  }

  // ---------------------------------------------------------------------------
  // Utils
  // ---------------------------------------------------------------------------

  function sanitize(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
})();
