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

const HIGHSCORE_KEY = 'snakeHighscore';

function safeBrowserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createHighscoreStore(storage = safeBrowserStorage()) {
  return {
    load() {
      if (!storage) {
        return 0;
      }

      try {
        const storedValue = storage.getItem(HIGHSCORE_KEY);
        const parsedValue = Number(storedValue);

        if (!Number.isSafeInteger(parsedValue) || parsedValue < 0) {
          return 0;
        }

        return parsedValue;
      } catch {
        return 0;
      }
    },

    save(score) {
      if (!storage || !Number.isSafeInteger(score) || score < 0) {
        return false;
      }

      try {
        storage.setItem(HIGHSCORE_KEY, String(score));
        return true;
      } catch {
        return false;
      }
    },
  };
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
  const initialSnake = cloneCells(options.initialSnake ?? defaultSnake(gridSize));
  const initialDirection = options.initialDirection ?? directions.RIGHT;
  const initialFood = options.initialFood ? { ...options.initialFood } : null;
  const highscoreStore = options.highscoreStore ?? createHighscoreStore();

  let hasQueuedTurn = false;

  const state = {
    gridSize,
    snake: [],
    direction: directions.RIGHT,
    food: null,
    score: 0,
    highscore: highscoreStore.load(),
    status: 'ready',
  };

  function reset({ useProvidedInitialState = false } = {}) {
    const snake = cloneCells(useProvidedInitialState ? initialSnake : defaultSnake(gridSize));
    state.snake = snake;
    state.direction = useProvidedInitialState ? initialDirection : directions.RIGHT;
    state.food = useProvidedInitialState && initialFood
      ? { ...initialFood }
      : placeFood(gridSize, snake, random);
    state.score = 0;
    state.status = 'ready';
    hasQueuedTurn = false;
  }

  reset({ useProvidedInitialState: true });

  return {
    state,

    start() {
      if (state.status !== 'ready') {
        return false;
      }

      state.status = 'playing';
      return true;
    },

    restart() {
      if (state.status !== 'game-over') {
        return false;
      }

      reset();
      return true;
    },

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
        if (state.score > state.highscore) {
          state.highscore = state.score;
          highscoreStore.save(state.highscore);
        }
        state.food = placeFood(gridSize, state.snake, random);
      } else {
        state.snake.pop();
      }

      return state;
    },
  };
}

export function statusMessage(state) {
  if (state.status === 'ready') {
    return 'Press Start or Space to play. Use Arrow Keys or WASD to steer.';
  }

  if (state.status === 'game-over') {
    return `Game Over — Final Score ${state.score}. Press Restart or Space to play again.`;
  }

  return 'Playing — use Arrow Keys or WASD';
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
  const highscore = document.querySelector('[data-highscore]');
  const status = document.querySelector('[data-status]');
  const action = document.querySelector('[data-game-action]');

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
    if (event.code === 'Space' || event.key === ' ') {
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

  render();
  window.setInterval(() => {
    game.step();
    render();
  }, TICK_MS);
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', bootstrap);
}
