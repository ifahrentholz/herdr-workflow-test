export const directions = Object.freeze({
  UP: Object.freeze({ x: 0, y: -1 }),
  DOWN: Object.freeze({ x: 0, y: 1 }),
  LEFT: Object.freeze({ x: -1, y: 0 }),
  RIGHT: Object.freeze({ x: 1, y: 0 }),
});

const KEY_DIRECTIONS = new Map([
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

export function directionFromKey(key) {
  return KEY_DIRECTIONS.get(key) ?? null;
}

function sameCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

function isOpposite(a, b) {
  return a.x + b.x === 0 && a.y + b.y === 0;
}

function cloneCells(cells) {
  return cells.map((cell) => ({ ...cell }));
}

function defaultSnake(gridSize) {
  const center = Math.floor(gridSize / 2);
  return [
    { x: center, y: center },
    { x: center - 1, y: center },
    { x: center - 2, y: center },
  ];
}

function wrap(value, gridSize) {
  return (value + gridSize) % gridSize;
}

function nextHead(head, direction, gridSize) {
  return {
    x: wrap(head.x + direction.x, gridSize),
    y: wrap(head.y + direction.y, gridSize),
  };
}

function placeFood(gridSize, snake, random) {
  const freeCells = [];

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const cell = { x, y };
      if (!snake.some((segment) => sameCell(segment, cell))) {
        freeCells.push(cell);
      }
    }
  }

  if (freeCells.length === 0) {
    return null;
  }

  const index = Math.min(Math.floor(random() * freeCells.length), freeCells.length - 1);
  return { ...freeCells[index] };
}

export function createGame(options = {}) {
  const gridSize = options.gridSize ?? 20;
  const random = options.random ?? Math.random;
  const snake = cloneCells(options.initialSnake ?? defaultSnake(gridSize));
  const direction = options.initialDirection ?? directions.RIGHT;

  let hasQueuedTurn = false;

  const state = {
    gridSize,
    snake,
    direction,
    food: options.initialFood ? { ...options.initialFood } : placeFood(gridSize, snake, random),
    score: 0,
    status: 'playing',
  };

  return {
    state,

    turn(nextDirection) {
      if (
        state.status !== 'playing'
        || !nextDirection
        || hasQueuedTurn
        || isOpposite(nextDirection, state.direction)
      ) {
        return false;
      }

      state.direction = nextDirection;
      hasQueuedTurn = true;
      return true;
    },

    step() {
      if (state.status !== 'playing') {
        return state;
      }

      hasQueuedTurn = false;

      const head = nextHead(state.snake[0], state.direction, gridSize);
      const isEating = state.food && sameCell(head, state.food);
      const collisionBody = isEating ? state.snake : state.snake.slice(0, -1);

      if (collisionBody.some((segment) => sameCell(segment, head))) {
        state.status = 'game-over';
        return state;
      }

      state.snake.unshift(head);

      if (isEating) {
        state.score += 1;
        state.food = placeFood(gridSize, state.snake, random);
      } else {
        state.snake.pop();
      }

      return state;
    },
  };
}

const CELL_SIZE = 24;
const TICK_MS = 140;

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
  const status = document.querySelector('[data-status]');

  if (!canvas || !score || !status) {
    return;
  }

  const game = createGame();
  const context = canvas.getContext('2d');

  canvas.width = game.state.gridSize * CELL_SIZE;
  canvas.height = game.state.gridSize * CELL_SIZE;

  function render() {
    score.textContent = String(game.state.score);
    status.textContent = game.state.status === 'game-over'
      ? `Game Over — Score ${game.state.score}`
      : 'Playing — use Arrow Keys or WASD';
    drawGame(context, game.state);
  }

  window.addEventListener('keydown', (event) => {
    const direction = directionFromKey(event.key);
    if (direction) {
      event.preventDefault();
      game.turn(direction);
      render();
    }
  });

  render();
  window.setInterval(() => {
    game.step();
    render();
  }, TICK_MS);
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', bootstrap);
}
