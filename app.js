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
const CYBERPUNK_PALETTE = Object.freeze({
  background: '#050014',
  grid: 'rgba(98, 0, 255, 0.18)',
  gridStrong: 'rgba(0, 245, 255, 0.2)',
  snakeHead: '#00f5ff',
  snakeBody: '#9b5cff',
  snakeCore: '#f5fbff',
  food: '#ff2bd6',
  foodCore: '#fff0fb',
});

export function foodOrbPresentation(timeMs, cellSize = CELL_SIZE) {
  const pulse = Math.sin((timeMs / 1000) * Math.PI * 2);
  const radius = Math.round(cellSize * 0.25 + pulse * cellSize * (1 / 12));
  const glowRadius = Math.round(cellSize * (5 / 12) + pulse * cellSize * (1 / 6));
  const glowAlpha = Math.round((0.55 + pulse * 0.3) * 100) / 100;

  return {
    centerOffset: cellSize / 2,
    radius,
    glowRadius,
    glowAlpha,
  };
}

function drawRoundedCell(context, x, y, size, radius) {
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, size, size, radius);
  } else {
    context.moveTo(x + radius, y);
    context.lineTo(x + size - radius, y);
    context.quadraticCurveTo(x + size, y, x + size, y + radius);
    context.lineTo(x + size, y + size - radius);
    context.quadraticCurveTo(x + size, y + size, x + size - radius, y + size);
    context.lineTo(x + radius, y + size);
    context.quadraticCurveTo(x, y + size, x, y + size - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
  }
  context.fill();
}

function drawGame(context, state, timeMs = 0) {
  const canvasSize = state.gridSize * CELL_SIZE;
  const backgroundGradient = context.createLinearGradient(0, 0, canvasSize, canvasSize);
  backgroundGradient.addColorStop(0, '#050014');
  backgroundGradient.addColorStop(0.55, '#07051f');
  backgroundGradient.addColorStop(1, '#130022');
  context.fillStyle = backgroundGradient;
  context.fillRect(0, 0, canvasSize, canvasSize);

  context.save();
  context.strokeStyle = CYBERPUNK_PALETTE.grid;
  context.lineWidth = 1;
  context.shadowColor = '#00f5ff';
  context.shadowBlur = 3;
  for (let line = 0; line <= state.gridSize; line += 1) {
    const position = line * CELL_SIZE + 0.5;
    context.strokeStyle = line % 5 === 0 ? CYBERPUNK_PALETTE.gridStrong : CYBERPUNK_PALETTE.grid;
    context.beginPath();
    context.moveTo(position, 0);
    context.lineTo(position, canvasSize);
    context.stroke();
    context.beginPath();
    context.moveTo(0, position);
    context.lineTo(canvasSize, position);
    context.stroke();
  }
  context.restore();

  if (state.food) {
    const orb = foodOrbPresentation(timeMs, CELL_SIZE);
    const centerX = state.food.x * CELL_SIZE + orb.centerOffset;
    const centerY = state.food.y * CELL_SIZE + orb.centerOffset;
    const foodGradient = context.createRadialGradient(centerX, centerY, 1, centerX, centerY, orb.glowRadius);
    foodGradient.addColorStop(0, CYBERPUNK_PALETTE.foodCore);
    foodGradient.addColorStop(0.34, CYBERPUNK_PALETTE.food);
    foodGradient.addColorStop(1, `rgba(255, 43, 214, ${orb.glowAlpha})`);

    context.save();
    context.shadowColor = CYBERPUNK_PALETTE.food;
    context.shadowBlur = 18;
    context.fillStyle = foodGradient;
    context.beginPath();
    context.arc(centerX, centerY, orb.radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  state.snake.forEach((segment, index) => {
    const inset = index === 0 ? 2 : 3;
    const size = CELL_SIZE - inset * 2;
    const x = segment.x * CELL_SIZE + inset;
    const y = segment.y * CELL_SIZE + inset;

    context.save();
    context.shadowColor = index === 0 ? CYBERPUNK_PALETTE.snakeHead : CYBERPUNK_PALETTE.snakeBody;
    context.shadowBlur = index === 0 ? 18 : 12;
    context.fillStyle = index === 0 ? CYBERPUNK_PALETTE.snakeHead : CYBERPUNK_PALETTE.snakeBody;
    drawRoundedCell(context, x, y, size, 6);

    context.shadowBlur = 0;
    context.fillStyle = index === 0 ? CYBERPUNK_PALETTE.snakeCore : 'rgba(255, 255, 255, 0.22)';
    drawRoundedCell(context, x + size * 0.22, y + size * 0.22, size * 0.28, 3);
    context.restore();
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

    const timeMs = typeof performance === 'undefined' ? 0 : performance.now();
    drawGame(context, game.state, timeMs);
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
