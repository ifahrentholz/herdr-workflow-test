import { createGame, directionFromKey } from './snake-core.js';

export function statusMessage(state) {
  if (state.status === 'ready') {
    return 'Press Enter or Space to start. Use Arrow Keys or WASD to steer.';
  }

  if (state.status === 'game-over') {
    return `Game Over — Final Score ${state.score}. Press Enter or Space to restart.`;
  }

  return 'Playing — use Arrow Keys or WASD';
}

export function gameFlowScreen(state) {
  if (state.status === 'ready') {
    return {
      screen: 'start',
      title: 'Ready to play?',
      message: 'Use Arrow Keys or WASD to steer the snake.',
      instruction: 'Press Enter or Space to start.',
      isOverlayVisible: true,
    };
  }

  if (state.status === 'game-over') {
    return {
      screen: 'game-over',
      title: 'Game Over',
      message: `Final Score: ${state.score}`,
      instruction: 'Press Enter or Space to restart.',
      isOverlayVisible: true,
    };
  }

  return {
    screen: 'game',
    title: '',
    message: '',
    instruction: '',
    isOverlayVisible: false,
  };
}

export function isStartOrRestartKey(event) {
  return (
    event.code === 'Enter'
    || event.key === 'Enter'
    || event.code === 'Space'
    || event.key === ' '
  );
}

export function primaryActionLabel(state) {
  if (state.status === 'game-over') {
    return 'Restart Game';
  }

  if (state.status === 'playing') {
    return 'Playing';
  }

  return 'Start Game';
}

const CELL_SIZE = 24;

function drawGame(context, state) {
  const canvasSize = state.gridSize * CELL_SIZE;
  context.fillStyle = '#071108';
  context.fillRect(0, 0, canvasSize, canvasSize);

  context.strokeStyle = 'rgba(85, 255, 107, 0.08)';
  context.lineWidth = 1;
  for (let line = 0; line <= state.gridSize; line += 1) {
    const position = line * CELL_SIZE + 0.5;
    context.beginPath();
    context.moveTo(position, 0);
    context.lineTo(position, canvasSize);
    context.stroke();
    context.beginPath();
    context.moveTo(0, position);
    context.lineTo(canvasSize, position);
    context.stroke();
  }

  if (state.food) {
    context.fillStyle = '#ff3b30';
    context.fillRect(
      state.food.x * CELL_SIZE + 3,
      state.food.y * CELL_SIZE + 3,
      CELL_SIZE - 6,
      CELL_SIZE - 6,
    );
  }

  state.snake.forEach((segment, index) => {
    context.fillStyle = index === 0 ? '#9dff7a' : '#35d04f';
    context.fillRect(
      segment.x * CELL_SIZE + 2,
      segment.y * CELL_SIZE + 2,
      CELL_SIZE - 4,
      CELL_SIZE - 4,
    );
  });
}

function bootstrap() {
  const canvas = document.querySelector('[data-game-canvas]');
  const score = document.querySelector('[data-score]');
  const highscore = document.querySelector('[data-highscore]');
  const status = document.querySelector('[data-status]');
  const action = document.querySelector('[data-game-action]');
  const flowOverlay = document.querySelector('[data-flow-overlay]');
  const flowTitle = document.querySelector('[data-flow-title]');
  const flowMessage = document.querySelector('[data-flow-message]');
  const flowInstruction = document.querySelector('[data-flow-instruction]');

  if (!canvas || !score || !highscore || !status || !action) {
    return;
  }

  const game = createGame();
  const context = canvas.getContext('2d');

  canvas.width = game.state.gridSize * CELL_SIZE;
  canvas.height = game.state.gridSize * CELL_SIZE;

  function render() {
    score.textContent = String(game.state.score);
    highscore.textContent = String(game.state.highscore);
    status.textContent = statusMessage(game.state);
    action.textContent = primaryActionLabel(game.state);
    action.disabled = game.state.status === 'playing';

    const flowScreen = gameFlowScreen(game.state);
    if (flowOverlay && flowTitle && flowMessage && flowInstruction) {
      flowOverlay.hidden = !flowScreen.isOverlayVisible;
      flowOverlay.dataset.screen = flowScreen.screen;
      flowTitle.textContent = flowScreen.title;
      flowMessage.textContent = flowScreen.message;
      flowInstruction.textContent = flowScreen.instruction;
    }

    drawGame(context, game.state);
  }

  function runPrimaryAction() {
    if (game.state.status === 'ready') {
      game.start();
    } else if (game.state.status === 'game-over') {
      game.restart();
      game.start();
    }
    render();
  }

  action.addEventListener('click', runPrimaryAction);

  window.addEventListener('keydown', (event) => {
    if (isStartOrRestartKey(event)) {
      event.preventDefault();
      runPrimaryAction();
      return;
    }

    const direction = directionFromKey(event.key);
    if (direction) {
      event.preventDefault();
      game.turn(direction);
      render();
    }
  });

  function scheduleNextTick() {
    window.setTimeout(() => {
      game.step();
      render();
      scheduleNextTick();
    }, game.state.moveDelayMs);
  }

  render();
  scheduleNextTick();
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', bootstrap);
}
