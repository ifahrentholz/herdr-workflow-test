export const directions = Object.freeze({
  UP: Object.freeze({ x: 0, y: -1 }),
  DOWN: Object.freeze({ x: 0, y: 1 }),
  LEFT: Object.freeze({ x: -1, y: 0 }),
  RIGHT: Object.freeze({ x: 1, y: 0 }),
});

const keyDirections = new Map([
  ['ArrowUp', directions.UP],
  ['w', directions.UP],
  ['W', directions.UP],
  ['ArrowDown', directions.DOWN],
  ['s', directions.DOWN],
  ['S', directions.DOWN],
  ['ArrowLeft', directions.LEFT],
  ['a', directions.LEFT],
  ['A', directions.LEFT],
  ['ArrowRight', directions.RIGHT],
  ['d', directions.RIGHT],
  ['D', directions.RIGHT],
]);

const gridSize = 20;
const cellSize = 24;
const moveDelayMs = 160;

export function directionFromKey(key) {
  return keyDirections.get(key) ?? null;
}

export function isStartKey(event) {
  return event.key === 'Enter' || event.code === 'Enter';
}

export function isPauseKey(event) {
  return event.key === ' ' || event.code === 'Space';
}

function defaultSnake() {
  return [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ];
}

function isOpposite(firstDirection, secondDirection) {
  return firstDirection.x + secondDirection.x === 0 && firstDirection.y + secondDirection.y === 0;
}

function sameDirection(firstDirection, secondDirection) {
  return firstDirection.x === secondDirection.x && firstDirection.y === secondDirection.y;
}

function wrappedPosition(value) {
  return (value + gridSize) % gridSize;
}

export function createSnakeShellGame() {
  const state = {
    gridSize,
    cellSize,
    snake: defaultSnake(),
    direction: directions.RIGHT,
    score: 0,
    highscore: 0,
    status: 'ready',
  };

  let turnAlreadyQueued = false;

  return {
    state,

    start() {
      if (state.status !== 'ready') {
        return false;
      }

      state.status = 'playing';
      return true;
    },

    turn(nextDirection) {
      if (state.status !== 'playing' || !nextDirection || turnAlreadyQueued) {
        return false;
      }

      if (sameDirection(nextDirection, state.direction) || isOpposite(nextDirection, state.direction)) {
        return false;
      }

      state.direction = nextDirection;
      turnAlreadyQueued = true;
      return true;
    },

    togglePause() {
      if (state.status === 'playing') {
        state.status = 'paused';
        return state.status;
      }

      if (state.status === 'paused') {
        state.status = 'playing';
        return state.status;
      }

      return state.status;
    },

    step() {
      if (state.status !== 'playing') {
        return state;
      }

      const head = state.snake[0];
      const nextHead = {
        x: wrappedPosition(head.x + state.direction.x),
        y: wrappedPosition(head.y + state.direction.y),
      };

      state.snake.unshift(nextHead);
      state.snake.pop();
      turnAlreadyQueued = false;
      return state;
    },
  };
}

function statusText(state) {
  if (state.status === 'ready') {
    return 'Press Start or Enter to begin. Use Arrow keys or WASD to steer.';
  }

  if (state.status === 'paused') {
    return 'Paused — press Space to resume.';
  }

  return 'Playing — press Space to pause.';
}

function drawBoard(context, state) {
  const boardSize = state.gridSize * state.cellSize;

  context.fillStyle = '#06110a';
  context.fillRect(0, 0, boardSize, boardSize);

  context.strokeStyle = '#12351e';
  context.lineWidth = 1;
  for (let line = 0; line <= state.gridSize; line += 1) {
    const position = line * state.cellSize + 0.5;
    context.beginPath();
    context.moveTo(position, 0);
    context.lineTo(position, boardSize);
    context.stroke();
    context.beginPath();
    context.moveTo(0, position);
    context.lineTo(boardSize, position);
    context.stroke();
  }

  state.snake.forEach((part, index) => {
    context.fillStyle = index === 0 ? '#d7ffd9' : '#48d46f';
    context.fillRect(
      part.x * state.cellSize + 2,
      part.y * state.cellSize + 2,
      state.cellSize - 4,
      state.cellSize - 4,
    );
  });
}

function startBrowserGame() {
  const canvas = document.querySelector('[data-board]');
  const score = document.querySelector('[data-score]');
  const highscore = document.querySelector('[data-highscore]');
  const status = document.querySelector('[data-status]');
  const startButton = document.querySelector('[data-start-button]');

  if (!canvas || !score || !highscore || !status || !startButton) {
    return;
  }

  const game = createSnakeShellGame();
  const context = canvas.getContext('2d');
  canvas.width = game.state.gridSize * game.state.cellSize;
  canvas.height = game.state.gridSize * game.state.cellSize;

  function render() {
    score.textContent = String(game.state.score);
    highscore.textContent = String(game.state.highscore);
    status.textContent = statusText(game.state);
    startButton.disabled = game.state.status !== 'ready';
    drawBoard(context, game.state);
  }

  function startGame() {
    game.start();
    render();
  }

  startButton.addEventListener('click', startGame);

  window.addEventListener('keydown', (event) => {
    if (isStartKey(event)) {
      event.preventDefault();
      startGame();
      return;
    }

    if (isPauseKey(event)) {
      event.preventDefault();
      game.togglePause();
      render();
      return;
    }

    const direction = directionFromKey(event.key);
    if (direction) {
      event.preventDefault();
      game.turn(direction);
      render();
    }
  });

  window.setInterval(() => {
    game.step();
    render();
  }, moveDelayMs);

  render();
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', startBrowserGame);
}
